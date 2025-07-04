const express = require('express');
const cors = require('cors');
const conn = require('./V2/config');
const bodyParser = require('body-parser');
const apicache = require('apicache');
require('dotenv').config();
const { createGraph, Djikstra, kruskal_acpm, connexite, bfsTree, getConnectedComponents } = require('./algorithms/graph');
const { calculerEmpreinteCO2 } = require('./V2/co2');

const app = express();
const PORT = process.env.PORT || 3000;
const cache = apicache.middleware;

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/api', cache('5 minutes'));

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
    const [stopsResults, tripsResults, stopTimesResults, routesResults, pathwaysResults, transfersResults] = await Promise.all([
      queryDB('SELECT stop_id, stop_name, stop_lat, stop_lon, wheelchair_boarding FROM stops'),
      queryDB('SELECT trip_id, route_id, trip_headsign FROM trips'),
      queryDB('SELECT trip_id, arrival_time, departure_time, stop_id, stop_sequence FROM stop_times'),
      queryDB('SELECT route_id, route_short_name, route_long_name, route_type FROM routes'),
      queryDB('SELECT pathway_id, from_stop_id, to_stop_id, pathway_mode, is_bidirectional, length, traversal_time FROM pathways'),
      queryDB('SELECT from_stop_id, to_stop_id, transfer_type, min_transfer_time FROM transfers'),
      queryDB('SELECT service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date FROM calendar'),
      queryDB('SELECT service_id, date, exception_type FROM calendar_dates')
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
          lineNumbers,
          wheelchair_boarding: stop.wheelchair_boarding !== undefined ? stop.wheelchair_boarding : null
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
    // Ajout des correspondances (transfers) comme liens
    transfersResults.forEach(transfer => {
      // min_transfer_time en secondes si dispo, sinon 60s par défaut
      let weight = 60;
      if (transfer.min_transfer_time && !isNaN(transfer.min_transfer_time)) {
        weight = parseInt(transfer.min_transfer_time, 10);
      }
      links.push({
        from: transfer.from_stop_id,
        to: transfer.to_stop_id,
        weight,
        type: 'transfer',
        transfer_type: transfer.transfer_type,
        min_transfer_time: transfer.min_transfer_time ? parseInt(transfer.min_transfer_time, 10) : null
      });
      // Si bidirectionnel (optionnel, GTFS n'impose pas, mais souvent pertinent)
      if (transfer.from_stop_id !== transfer.to_stop_id) {
        links.push({
          from: transfer.to_stop_id,
          to: transfer.from_stop_id,
          weight,
          type: 'transfer',
          transfer_type: transfer.transfer_type,
          min_transfer_time: transfer.min_transfer_time ? parseInt(transfer.min_transfer_time, 10) : null
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
let tripsResults = [];
(async () => {
  const data = await loadMetroDataFromDB();
  stations = data.stations;
  station_shown = data.station_shown;
  links = data.links;
  graph = data.graph;
  // Charger tripsResults globalement
  // On recharge uniquement tripsResults ici
  try {
    const trips = await queryDB('SELECT trip_id, route_id, trip_headsign FROM trips');
    tripsResults = trips;
  } catch (err) {
    console.error('❌ Erreur lors du chargement de tripsResults :', err);
    tripsResults = [];
  }
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

app.get('/api/journey', async (req, res) => {
  const { from, to, departure_time, date } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "'from' and 'to' station IDs are required" });
  }
  const fromStation = stations.find(s => s.id === from);
  const toStation = stations.find(s => s.id === to);
  if (!fromStation || !toStation) {
    return res.status(404).json({ error: 'One or both station IDs could not be found.' });
  }

  // --- Filtrage des services actifs selon la date ---
  let activeServiceIds = null;
  if (date) {
    // date attendue au format YYYY-MM-DD
    const inputDate = new Date(date);
    if (!isNaN(inputDate)) {
      const yyyy = inputDate.getFullYear();
      const mm = String(inputDate.getMonth() + 1).padStart(2, '0');
      const dd = String(inputDate.getDate()).padStart(2, '0');
      const yyyymmdd = `${yyyy}${mm}${dd}`;
      const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][inputDate.getDay()];
      // Charger la table calendar
      const calendarResults = await queryDB('SELECT service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date FROM calendar');
      activeServiceIds = calendarResults.filter(row => {
        return row[dayOfWeek] === 1 && yyyymmdd >= row.start_date && yyyymmdd <= row.end_date;
      }).map(row => row.service_id);
    }
  }

  // Utilise Dijkstra avec early exit (endId)
  const result = Djikstra(graph, fromStation.id, toStation.id);
  if (!result || !result.path || !result.path.length || result.totalDistance === Infinity) {
    return res.status(404).json({ error: 'No valid path found between the specified stations.' });
  }

  // Enrichir le chemin avec les horaires GTFS si possible
  let currentTime = departure_time && /^\d{2}:\d{2}/.test(departure_time)
    ? timeToSeconds(departure_time)
    : null;
  const enrichedPath = [];
  let noService = false;
  for (let i = 0; i < result.path.length; i++) {
    const st = result.path[i];
    const prev = i > 0 ? result.path[i-1] : null;
    let arrival_time = null, departure_time_step = null, trip_id = null, route_id = null;
    if (prev) {
      let possibleLinks = links.filter(l => l.from === prev.id && l.to === st.id);
      // Filtrer les trips selon les services actifs
      if (activeServiceIds) {
        possibleLinks = possibleLinks.filter(l => {
          if (l.type === 'trip' && l.service_id) {
            return activeServiceIds.includes(l.service_id);
          }
          return true; // pathways/transfers non filtrés
        });
      }
      let bestLink = null;
      if (possibleLinks.length) {
        if (currentTime && possibleLinks.some(l => l.type === 'trip')) {
          const tripLinks = possibleLinks.filter(l => l.type === 'trip' && l.departure);
          const validTrips = tripLinks.filter(l => timeToSeconds(l.departure) >= currentTime)
            .sort((a, b) => timeToSeconds(a.departure) - timeToSeconds(b.departure));
          if (validTrips.length > 0) {
            bestLink = validTrips[0];
            const waitTime = timeToSeconds(bestLink.departure) - currentTime;
            if (waitTime > 4 * 3600) {
              noService = true;
            }
          } else {
            noService = true;
          }
        } else {
          bestLink = possibleLinks[0];
        }
        if (bestLink && !noService) {
          if (bestLink.type === 'trip') {
            arrival_time = bestLink.arrival;
            departure_time_step = bestLink.departure;
            trip_id = bestLink.trip_id;
            if (bestLink.arrival) currentTime = timeToSeconds(bestLink.arrival);
          } else if (bestLink.type === 'transfer' || bestLink.type === 'pathway') {
            if (currentTime && bestLink.weight) {
              arrival_time = departure_time_step = currentTime + bestLink.weight;
              currentTime = arrival_time;
            }
          }
        }
      } else if (currentTime) {
        departure_time_step = arrival_time = currentTime;
      }
    }
    if (trip_id) {
      const trip = tripsResults && tripsResults.length ? tripsResults.find(tr => tr.trip_id === trip_id) : links.find(l => l.trip_id === trip_id);
      if (trip && trip.route_id) route_id = trip.route_id;
      var trip_headsign = trip && trip.trip_headsign ? trip.trip_headsign : null;
    }
    enrichedPath.push({
      id: st.id,
      name: st.name,
      lineNumbers: (stations.find(s => s.id === st.id) || {}).lineNumbers,
      distance: st.distance,
      arrival_time,
      departure_time: departure_time_step,
      trip_id,
      route_id,
      trip_headsign
    });
    if (noService) break;
  }

  if (noService) {
    return res.status(200).json({
      from: fromStation,
      to: toStation,
      path: enrichedPath,
      totalDistance: result.totalDistance,
      warning: 'Aucun service disponible après l\'heure courante pour une ou plusieurs étapes.'
    });
  }

  res.json({
    from: fromStation,
    to: toStation,
    path: enrichedPath,
    totalDistance: result.totalDistance
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

// Route pour calculer l'empreinte carbone d'un trajet
app.post('/api/co2', (req, res) => {
  const segments = req.body.segments;
  if (!Array.isArray(segments)) return res.status(400).json({ error: 'Segments manquants' });
  const result = calculerEmpreinteCO2(segments);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
