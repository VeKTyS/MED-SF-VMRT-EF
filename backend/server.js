const express = require('express');
const cors = require('cors');
const conn = require('./V2/config');
const bodyParser = require('body-parser');
require('dotenv').config();
const { createGraph, Djikstra, kruskal_acpm, connexite, bfsTree, getConnectedComponents } = require('./algorithms/graph');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

function timeToSeconds(t) {
  if (!t) return 0;
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

async function queryDB(sql) {
  return new Promise((resolve, reject) => {
    conn.query(sql, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

async function loadPosPointsFromDB() {
  const results = await queryDB('SELECT stop_id, stop_lon, stop_lat, stop_name FROM stops');
  return results.map(row => ({
    id: row.stop_id,
    x: parseFloat(row.stop_lon),
    y: parseFloat(row.stop_lat),
    name: row.stop_name ? row.stop_name.trim() : ''
  }));
}

async function loadMetroDataFromDB() {
  try {
    console.log('🔄 Chargement des données GTFS...');
    const [stopsResults, tripsResults, stopTimesResults, routesResults, pathwaysResults] = await Promise.all([
      queryDB('SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops'),
      queryDB('SELECT trip_id, route_id FROM trips'),
      queryDB('SELECT trip_id, arrival_time, departure_time, stop_id, stop_sequence FROM stop_times'),
      queryDB('SELECT route_id, route_short_name, route_long_name, route_type FROM routes'),
      queryDB('SELECT pathway_id, from_stop_id, to_stop_id, pathway_mode, is_bidirectional, length, traversal_time FROM pathways')
    ]);

    // Indexes
    const stopToTrips = {};
    stopTimesResults.forEach(st => {
      if (!stopToTrips[st.stop_id]) stopToTrips[st.stop_id] = new Set();
      stopToTrips[st.stop_id].add(st.trip_id);
    });
    const tripToRoute = {};
    tripsResults.forEach(trip => { tripToRoute[trip.trip_id] = trip.route_id; });
    const routeIdToShortName = {};
    routesResults.forEach(route => { routeIdToShortName[route.route_id] = route.route_short_name; });

    // Stations
    const stationMap = new Map();
    stopsResults.forEach(stop => {
      if (!stationMap.has(stop.stop_id)) {
        const tripIds = stopToTrips[stop.stop_id] ? Array.from(stopToTrips[stop.stop_id]) : [];
        const routeIds = [...new Set(tripIds.map(tripId => tripToRoute[tripId]).filter(Boolean))];
        const lineNumbers = [...new Set(routeIds.map(routeId => routeIdToShortName[routeId]).filter(Boolean))];
        stationMap.set(stop.stop_id, {
          id: stop.stop_id,
          name: stop.stop_name,
          lat: parseFloat(stop.stop_lat),
          lon: parseFloat(stop.stop_lon),
          lineNumbers
        });
      }
    });
    const stations = Array.from(stationMap.values());

    // Filtrer pour ne garder que Métro/RER
    const allowedLine = line => (/^\d+$/.test(line) || /^[A-E]$/.test(line));
    const forbiddenPattern = /(TER|TRAM|BUS|Noctilien|T[0-9]|N[0-9])/i;
    const station_shown = stations.filter(station =>
      station.lineNumbers &&
      station.lineNumbers.length > 0 &&
      station.lineNumbers.every(line => allowedLine(line) && !forbiddenPattern.test(line))
    );

    // Links (trips + pathways)
    let links = [];
    const tripsById = {};
    stopTimesResults.forEach(st => {
      if (!tripsById[st.trip_id]) tripsById[st.trip_id] = [];
      tripsById[st.trip_id].push(st);
    });
    Object.values(tripsById).forEach(stopsSeq => {
      stopsSeq.sort((a, b) => a.stop_sequence - b.stop_sequence);
      for (let i = 0; i < stopsSeq.length - 1; i++) {
        links.push({
          from: stopsSeq[i].stop_id,
          to: stopsSeq[i + 1].stop_id,
          trip_id: stopsSeq[i].trip_id,
          departure: stopsSeq[i].departure_time,
          arrival: stopsSeq[i + 1].arrival_time,
          traveling_time_in_sec: timeToSeconds(stopsSeq[i + 1].arrival_time) - timeToSeconds(stopsSeq[i].departure_time),
          sequence: stopsSeq[i + 1].stop_sequence,
          type: 'trip'
        });
      }
    });
    pathwaysResults.forEach(pathway => {
      let weight = 1;
      if (pathway.traversal_time && parseInt(pathway.traversal_time, 10) > 0) {
        weight = parseInt(pathway.traversal_time, 10);
      } else if (pathway.length && parseFloat(pathway.length) > 0) {
        weight = parseFloat(pathway.length);
      }
      links.push({
        from: pathway.from_stop_id,
        to: pathway.to_stop_id,
        pathway_id: pathway.pathway_id,
        pathway_mode: pathway.pathway_mode,
        is_bidirectional: pathway.is_bidirectional === '1' || pathway.is_bidirectional === 1,
        length: pathway.length ? parseFloat(pathway.length) : null,
        traversal_time: pathway.traversal_time ? parseInt(pathway.traversal_time, 10) : null,
        weight,
        type: 'pathway'
      });
      if (pathway.is_bidirectional === '1' || pathway.is_bidirectional === 1) {
        links.push({
          from: pathway.to_stop_id,
          to: pathway.from_stop_id,
          pathway_id: pathway.pathway_id,
          pathway_mode: pathway.pathway_mode,
          is_bidirectional: true,
          length: pathway.length ? parseFloat(pathway.length) : null,
          traversal_time: pathway.traversal_time ? parseInt(pathway.traversal_time, 10) : null,
          weight,
          type: 'pathway'
        });
      }
    });

    const graph = createGraph(stations, links);

    console.log('✅ Données chargées.');
    return { stations, station_shown, links, graph };
  } catch (err) {
    console.error('❌ Erreur lors du chargement des données :', err);
    throw err;
  }
}

let stations = [], station_shown = [], links = [], graph = {};
(async () => {
  const data = await loadMetroDataFromDB();
  stations = data.stations;
  station_shown = data.station_shown;
  links = data.links;
  graph = data.graph;
})();

app.get('/api/stations', (req, res) => res.json(station_shown));

app.get('/api/links', (req, res) => {
  const page = parseInt(req.query.page) || 2;
  const pageSize = parseInt(req.query.pageSize) || 1000;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  res.json({
    total: links.length,
    page,
    pageSize,
    links: links.slice(start, end)
  });
});

app.get('/api/pospointsmap', async (req, res) => {
  try {
    const posPoints = await loadPosPointsFromDB();
    const posPointsMap = {};
    posPoints.forEach(p => { posPointsMap[p.name] = p; });
    res.json(posPointsMap);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err });
  }
});

app.get('/api/pospoints', async (req, res) => {
  try {
    const posPoints = await loadPosPointsFromDB();
    res.json(posPoints);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err });
  }
});

app.get('/api/graph', (req, res) => res.json(graph));

app.get('/api/djikstra', (req, res) => {
  const { startId, endId } = req.query;
  if (!startId || !graph[startId]) {
    return res.status(400).json({ error: 'Invalid start station ID' });
  }
  if (endId && !graph[endId]) {
    return res.status(400).json({ error: 'Invalid end station ID' });
  }
  const result = Djikstra(graph, startId, endId);
  if (endId) {
    return res.json({
      path: result.path,
      totalDistance: result.totalDistance
    });
  }
  res.json(result);
});

app.get('/api/journey', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "'from' and 'to' station IDs are required" });
  }
  const fromStation = stations.find(s => s.id === from);
  const toStation = stations.find(s => s.id === to);
  if (!fromStation || !toStation) {
    return res.status(404).json({ error: 'One or both station IDs could not be found.' });
  }
  const result = Djikstra(graph, fromStation.id);
  if (!result.distances[toStation.id] || result.distances[toStation.id] === Infinity) {
    return res.status(404).json({ error: 'No valid path found between the specified stations.' });
  }
  let path = [];
  let currentStationId = toStation.id;
  while (currentStationId) {
    const station = stations.find(station => station.id === currentStationId);
    if (!station) break;
    path.unshift({
      id: station.id,
      name: station.name,
      lineNumbers: station.lineNumbers,
      distance: result.distances[currentStationId]
    });
    currentStationId = result.previous[currentStationId];
  }
  const validStationIds = new Set(station_shown.map(st => st.id));
  path = path.filter(st => validStationIds.has(st.id));
  if (path.length === 0 || path[0].id !== fromStation.id) {
    return res.status(400).json({ error: 'No valid path found' });
  }
  res.json({
    from: fromStation,
    to: toStation,
    path,
    totalDistance: result.distances[toStation.id]
  });
});

function getStationNameById(id) {
  const st = stations.find(s => s.id === id);
  return st ? st.name : null;
}

app.get('/api/kruskal', (req, res) => {
  const allowedLine = line => (/^\d+$/.test(line) || /^[A-E]$/.test(line));
  const forbiddenPattern = /(TER|TRAM|BUS|Noctilien|T[0-9]|N[0-9])/i;
  const metroStations = stations.filter(station =>
    station.lineNumbers &&
    station.lineNumbers.length > 0 &&
    station.lineNumbers.every(line => allowedLine(line) && !forbiddenPattern.test(line))
  );
  const metroStationIds = new Set(metroStations.map(st => st.id));
  const metroLinks = links.filter(link =>
    metroStationIds.has(link.from) && metroStationIds.has(link.to)
  );
  const metroGraph = createGraph(metroStations, metroLinks);
  const mst = kruskal_acpm(metroGraph);
  const mstEdges = mst.map(edge => ({
    from: getStationNameById(edge.from),
    to: getStationNameById(edge.to),
    fromId: edge.from,
    toId: edge.to,
    weight: edge.weight
  })).filter(e => e.from && e.to);
  res.json({ edges: mstEdges });
});

app.get('/api/prim', (req, res) => {
  const mst = prim_acpm(graph);
  const mstEdges = mst.map(edge => ({
    from: getStationNameById(edge.from),
    to: getStationNameById(edge.to),
    fromId: edge.from,
    toId: edge.to,
    weight: edge.weight
  })).filter(e => e.from && e.to);
  res.json({ edges: mstEdges }); // <-- wrap in { edges: ... }
});

app.get('/api/connexite', (req, res) => {
  const allowedLine = line => (/^\d+$/.test(line) || /^[A-E]$/.test(line));
  const forbiddenPattern = /(TER|TRAM|BUS|Noctilien|T[0-9]|N[0-9])/i;
  const metroStations = stations.filter(station =>
    station.lineNumbers &&
    station.lineNumbers.length > 0 &&
    station.lineNumbers.every(line => allowedLine(line) && !forbiddenPattern.test(line))
  );
  const metroStationIds = new Set(metroStations.map(st => st.id));
  const metroLinks = links.filter(link =>
    metroStationIds.has(link.from) && metroStationIds.has(link.to)
  );
  const metroGraph = createGraph(metroStations, metroLinks);
  const connexe = connexite(metroGraph);
  const tree = bfsTree(metroGraph);
  const components = getConnectedComponents(metroGraph);
  res.json({ connexe, tree, components });
});

app.get('/api/metrodata', async (req, res) => {
  try {
    const data = await loadMetroDataFromDB();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
