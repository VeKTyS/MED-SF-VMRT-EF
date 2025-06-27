const express = require('express');
const cors = require('cors');
const fs = require('fs');
const conn = require('./V2/config');
const bodyParser = require('body-parser');
require('dotenv').config();

const path = require('path');
const { createGraph, Djikstra, kruskal_acpm, prim_acpm, connexite} = require('./algorithms/graph');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function timeToSeconds(t) {
  if (!t) return 0;
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

// Charger et parser pospoints.txt
async function loadPosPointsFromDB() {
  return new Promise((resolve, reject) => {
    conn.query('SELECT stop_lon, stop_lat, stop_name FROM stops', (err, results) => {
      if (err) return reject(err);
      const points = results.map(row => ({
        x: parseFloat(row.stop_lon),
        y: parseFloat(row.stop_lat),
        name: row.stop_name ? row.stop_name.trim() : ''
      }));
      resolve(points);
    });
  });
}

async function loadMetroDataFromDB() {
  const query = (sql) =>
    new Promise((resolve, reject) => {
      conn.query(sql, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

  try {
    console.log('🔄 Chargement des données GTFS...');

    const [stopsResults, tripsResults, stopTimesResults, routesResults, pathwaysResults] = await Promise.all([
      query('SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops'),
      query('SELECT trip_id, route_id FROM trips'),
      query('SELECT trip_id, arrival_time, departure_time, stop_id, stop_sequence FROM stop_times'),
      query('SELECT route_id, route_short_name, route_long_name, route_type FROM routes'),
      query('SELECT pathway_id, from_stop_id, to_stop_id, pathway_mode, is_bidirectional, length, traversal_time FROM pathways')
    ]);

    // --- OPTIMIZED INDEXES ---
    // stop_id -> Set of trip_ids
    const stopToTrips = {};
    stopTimesResults.forEach(st => {
      if (!stopToTrips[st.stop_id]) stopToTrips[st.stop_id] = new Set();
      stopToTrips[st.stop_id].add(st.trip_id);
    });

    // trip_id -> route_id
    const tripToRoute = {};
    tripsResults.forEach(trip => {
      tripToRoute[trip.trip_id] = trip.route_id;
    });

    // route_id -> route_short_name
    const routeIdToShortName = {};
    routesResults.forEach(route => {
      routeIdToShortName[route.route_id] = route.route_short_name;
    });

    // --- BUILD STATIONS FAST ---
    stations = stopsResults.map(stop => {
      const tripIds = stopToTrips[stop.stop_id] ? Array.from(stopToTrips[stop.stop_id]) : [];
      const routeIds = [...new Set(tripIds.map(tripId => tripToRoute[tripId]).filter(Boolean))];
      const lineNumbers = [...new Set(routeIds.map(routeId => routeIdToShortName[routeId]).filter(Boolean))];

      return {
        id: stop.stop_id,
        name: stop.stop_name,
        lat: parseFloat(stop.stop_lat),
        lon: parseFloat(stop.stop_lon),
        lineNumbers
      };
    });

    // --- BUILD LINKS (trips + pathways) ---
    links = [];
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

    // --- ADD PATHWAYS AS LINKS ---
    pathwaysResults.forEach(pathway => {
      // Use traversal_time as weight if available, else fallback to length or 1
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

      // If bidirectional, add the reverse link
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

    // --- BUILD GRAPH ---
    graph = createGraph(stations, links);

    console.log('✅ Données chargées.');
    return { stopsResults, tripsResults, stopTimesResults, routesResults, stations, links, graph };

  } catch (err) {
    console.error('❌ Erreur lors du chargement des données :', err);
    throw err;
  }
}

let stations = [];
let links = [];
let graph = {};

loadMetroDataFromDB();

app.get('/api/stations', (req, res) => {
  res.json(stations);
});

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

app.get('/api/graph', (req, res) => {
  res.json(graph);
});

app.get('/api/djikstra', (req, res) => {
  const { startId, endId } = req.query;
  if (!startId || !graph[startId]) {
    return res.status(400).json({ error: 'Invalid start station ID' });
  }
  if (endId && !graph[endId]) {
    return res.status(400).json({ error: 'Invalid end station ID' });
  }

  const result = Djikstra(graph, startId, endId);

  // If endId is provided, return only the path and totalDistance
  if (endId) {
    return res.json({
      path: result.path,
      totalDistance: result.totalDistance
    });
  }

  // Otherwise, return all distances and previous
  res.json(result);
});

app.get('/api/journey', (req, res) => {
  const { from, to } = req.query;

  // Normalize input names (trim and convert to lowercase)
  const normalizedFrom = from?.trim().toLowerCase();
  const normalizedTo = to?.trim().toLowerCase();

  // Find the stations by normalized name
  const fromStation = stations.find(station => station.name.toLowerCase() === normalizedFrom);
  const toStation = stations.find(station => station.name.toLowerCase() === normalizedTo);

  if (!fromStation || !toStation) {
    return res.status(404).json({ error: 'Station not found' });
  }

  // Run Dijkstra's algorithm to calculate the shortest path
  const result = Djikstra(graph, fromStation.id);

  // Extract the full path to the destination station
  const path = [];
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

// Helper to get station name from ID
function getStationNameById(id) {
  const st = stations.find(s => s.id === id);
  return st ? st.name : null;
}

app.get('/api/kruskal', (req, res) => {
  const mst = kruskal_acpm(graph);
  const mstEdges = mst.map(edge => ({
    from: getStationNameById(edge.from),
    to: getStationNameById(edge.to),
    weight: edge.weight
  })).filter(e => e.from && e.to);
  res.json(mstEdges);
});

app.get('/api/prim', (req, res) => {
  const mst = prim_acpm(graph);
  const mstEdges = mst.map(edge => ({
    from: getStationNameById(edge.from),
    to: getStationNameById(edge.to),
    weight: edge.weight
  })).filter(e => e.from && e.to);
  res.json(mstEdges);
});


app.get('/api/connexite', (req, res) => {
  const stationIds = Object.keys(graph).filter(id => (graph[id] || []).length > 0);
  if (stationIds.length === 0) return res.json({ connexe: true });

  const visited = new Set();
  const queue = [stationIds[0]];

  while (queue.length) {
    const current = queue.shift();
    visited.add(current);
    const neighbors = Array.isArray(graph[current]) ? graph[current] : [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
        visited.add(neighbor);
      }
    }
  }

  const connexe = visited.size === stationIds.length;
  console.log('Visited:', visited.size, 'Total:', stationIds.length);
  res.json({ connexe });
});


app.get('/api/metrodata', async (req, res) => {
  try {
    const { stops, trips, stop_times, routes, graph  } = await loadMetroDataFromDB();
    res.json({ stops, trips, stop_times, routes, graph  });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err });
  }
});

app.get('/api/metro/graph', async (req, res) => {
  try {
    const graph = await getMetroGraph();
    res.json(graph);
  } catch (err) {
    console.error('❌ Erreur API /api/metro/graph :', err);
    res.status(500).json({ error: 'Erreur serveur lors de la génération du graphe.' });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
