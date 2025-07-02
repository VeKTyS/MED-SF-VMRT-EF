const express = require('express');
const cors = require('cors');
const conn = require('./V2/config');
const bodyParser = require('body-parser');
const apicache = require('apicache');
require('dotenv').config();
const { createGraph, Djikstra, kruskal_acpm, connexite, bfsTree, getConnectedComponents } = require('./algorithms/graph');

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
    const [stopsResults, tripsResults, stopTimesResults, routesResults, pathwaysResults, calendarResults, calendarDatesResults, transfersResults] = await Promise.all([
      queryDB('SELECT stop_id, stop_name, stop_lat, stop_lon, wheelchair_boarding FROM stops'),
      queryDB('SELECT trip_id, route_id, wheelchair_accessible, bikes_allowed, service_id FROM trips'),
      queryDB('SELECT trip_id, arrival_time, departure_time, stop_id, stop_sequence FROM stop_times'),
      queryDB('SELECT route_id, route_short_name, route_long_name, route_type FROM routes'),
      queryDB('SELECT pathway_id, from_stop_id, to_stop_id, pathway_mode, is_bidirectional, length, traversal_time FROM pathways'),
      queryDB('SELECT * FROM calendar'),
      queryDB('SELECT * FROM calendar_dates'),
      queryDB('SELECT * FROM transfers')
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
          wheelchair_boarding: stop.wheelchair_boarding === '1' || stop.wheelchair_boarding === 1,
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
    return { stations, station_shown, links, graph, calendar: calendarResults, calendarDates: calendarDatesResults, transfers: transfersResults, stopTimesResults };
  } catch (err) {
    console.error('❌ Erreur lors du chargement des données :', err);
    throw err;
  }
}

// Variables globales pour les données calendrier/correspondances
let stations = [], station_shown = [], links = [], graph = {}, tripsResults = [], tripIdToTrip = {}, calendar = [], calendarDates = [], transfers = [], stopTimesResults = [];
(async () => {
  const data = await loadMetroDataFromDB();
  stations = data.stations;
  station_shown = data.station_shown;
  links = data.links;
  graph = data.graph;
  calendar = data.calendar;
  calendarDates = data.calendarDates;
  transfers = data.transfers;
  stopTimesResults = data.stopTimesResults = data.stopTimesResults || [];
  // Ajout : charger tripsResults globalement
  const [ , trips ] = await Promise.all([
    Promise.resolve(),
    queryDB('SELECT trip_id, route_id, wheelchair_accessible, bikes_allowed, service_id FROM trips')
  ]);
  tripsResults = trips;
  // Création d'un index pour accès rapide par trip_id
  tripIdToTrip = {};
  tripsResults.forEach(trip => { tripIdToTrip[trip.trip_id] = trip; });
})();

app.get('/api/stations', (req, res) => {
  // On renvoie aussi wheelchair_boarding pour chaque station
  res.json(station_shown.map(st => {
    const full = stations.find(s => s.id === st.id);
    return {
      ...st,
      wheelchair_boarding: full ? full.wheelchair_boarding : undefined
    };
  }));
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

// Utilitaires pour GTFS
function isServiceRunning(serviceId, date, calendar, calendarDates) {
  // date: AAAAMMJJ string
  // calendar: array of calendar.txt objects
  // calendarDates: array of calendar_dates.txt objects
  const y = date.substring(0, 4), m = date.substring(4, 6), d = date.substring(6, 8);
  const jsDate = new Date(`${y}-${m}-${d}`);
  const dayOfWeek = jsDate.getDay(); // 0=dimanche, 1=lundi...
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const cal = calendar.find(c => c.service_id === serviceId);
  if (!cal) return false;
  if (date < cal.start_date || date > cal.end_date) return false;
  if (cal[dayNames[dayOfWeek]] !== '1') return false;
  // Exceptions
  const ex = calendarDates.find(e => e.service_id === serviceId && e.date === date);
  if (ex) {
    if (ex.exception_type === '1') return true;
    if (ex.exception_type === '2') return false;
  }
  return true;
}

function getTransferTime(from_stop_id, to_stop_id, transfers) {
  const t = transfers.find(tr => tr.from_stop_id === from_stop_id && tr.to_stop_id === to_stop_id);
  return t ? parseInt(t.min_transfer_time, 10) || 0 : 0;
}

app.get('/api/journey', (req, res) => {
  const { from, to, pmr, bike, departureDateTime } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "'from' and 'to' station IDs are required" });
  }
  const fromStation = stations.find(s => s.id === from);
  const toStation = stations.find(s => s.id === to);
  if (!fromStation || !toStation) {
    return res.status(404).json({ error: 'One or both station IDs could not be found.' });
  }

  // Recherche avancée avec horaires si date/heure fournie
  if (departureDateTime) {
    const journey = findEarliestArrivalJourney({
      fromId: fromStation.id,
      toId: toStation.id,
      departureDateTime,
      stations,
      stopTimes: global.stopTimesResults || [],
      trips: tripsResults,
      calendar,
      calendarDates
    });
    if (!journey || journey.length < 2) {
      return res.status(404).json({ error: 'No valid path found between the specified stations at this time.' });
    }
    // Calcul du temps total et du temps d'attente
    const totalWait = journey.reduce((sum, step) => sum + (step.waitTime || 0), 0);
    const totalTravel = timeToSeconds(journey[journey.length-1].arrival_time) - timeToSeconds(journey[0].arrival_time);
    return res.json({
      from: fromStation,
      to: toStation,
      path: journey,
      totalWait,
      totalTravel,
      arrivalTime: journey[journey.length-1].arrival_time
    });
  }

  // Filtrage des liens selon PMR et vélo (optimisé avec tripIdToTrip)
  let filteredLinks = links;
  if (pmr === '1' || bike === '1') {
    filteredLinks = links.filter(link => {
      if (link.type === 'trip') {
        const tripObj = link.trip_id && tripIdToTrip[link.trip_id] ? tripIdToTrip[link.trip_id] : null;
        if (pmr === '1' && tripObj && tripObj.wheelchair_accessible !== 1 && tripObj.wheelchair_accessible !== '1') return false;
        if (bike === '1' && tripObj && tripObj.bikes_allowed !== 1 && tripObj.bikes_allowed !== '1') return false;
      }
      return true;
    });
  }

  // Prendre en compte la date/heure de départ et les horaires de service
  let journeyDate = null;
  let journeyTimeSec = null;
  if (departureDateTime) {
    // Format attendu: YYYY-MM-DDTHH:mm (ou ISO)
    const dt = new Date(departureDateTime);
    if (!isNaN(dt)) {
      journeyDate = dt.toISOString().slice(0,10).replace(/-/g, '');
      journeyTimeSec = dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds();
    }
  }

  // Filtrer les trips actifs à la date donnée ET à l'heure demandée
  if (journeyDate && journeyTimeSec !== null) {
    filteredLinks = filteredLinks.filter(link => {
      if (link.type === 'trip' && link.service_id && link.departure) {
        // Service actif ce jour ?
        if (!isServiceRunning(link.service_id, journeyDate, calendar, calendarDates)) return false;
        // Heure de passage compatible ?
        const depSec = timeToSeconds(link.departure);
        // On autorise un départ si l'heure demandée <= heure de départ du lien (ou tu peux ajuster la tolérance)
        return depSec >= journeyTimeSec;
      }
      return true;
    });
  }

  // TODO: Prendre en compte les horaires de passage et temps de correspondance dans l'algo Djikstra (ici, structure prête)
  // Pour l'instant, on ne fait qu'un filtrage simple, à améliorer pour un vrai calcul horaire

  const filteredGraph = createGraph(stations, filteredLinks);
  const result = Djikstra(filteredGraph, fromStation.id, toStation.id);
  if (!result || !result.path || !result.path.length || result.totalDistance === Infinity) {
    return res.status(404).json({ error: 'No valid path found between the specified stations.' });
  }
  // Ajout du temps de correspondance (exemple naïf)
  let totalTransferTime = 0;
  if (result.path && result.path.length > 1) {
    for (let i = 1; i < result.path.length; i++) {
      totalTransferTime += getTransferTime(result.path[i-1].id, result.path[i].id, transfers);
    }
  }
  res.json({
    from: fromStation,
    to: toStation,
    path: result.path.map(st => ({ id: st.id, name: st.name, lineNumbers: (stations.find(s => s.id === st.id) || {}).lineNumbers, distance: st.distance })),
    totalDistance: result.totalDistance,
    totalTransferTime
  });
});

// Algorithme avancé d'itinéraire tenant compte des horaires et du temps d'attente
function findEarliestArrivalJourney({ fromId, toId, departureDateTime, stations, stopTimes, trips, calendar, calendarDates }) {
  // On suppose que stopTimes est un tableau d'objets {trip_id, stop_id, arrival_time, departure_time, stop_sequence}
  // trips : {trip_id, service_id, ...}
  // On veut trouver le chemin le plus rapide en tenant compte des horaires
  const startTime = new Date(departureDateTime);
  const journeyDate = startTime.toISOString().slice(0,10).replace(/-/g, '');
  const startSec = startTime.getHours() * 3600 + startTime.getMinutes() * 60 + startTime.getSeconds();

  // Indexation rapide
  const stopDepartures = {};
  stopTimes.forEach(st => {
    if (!stopDepartures[st.stop_id]) stopDepartures[st.stop_id] = [];
    stopDepartures[st.stop_id].push(st);
  });
  Object.values(stopDepartures).forEach(arr => arr.sort((a, b) => timeToSeconds(a.departure_time) - timeToSeconds(b.departure_time)));
  const tripById = {};
  trips.forEach(t => { tripById[t.trip_id] = t; });

  // Dijkstra-like: [station, arrivalTimeSec, path, trip_id, waitTime]
  const pq = [[fromId, startSec, [], null, 0]];
  const visited = {};
  let best = null;

  while (pq.length) {
    pq.sort((a, b) => a[1] - b[1]); // min-heap by arrival time
    const [currentStop, currentTime, path, lastTripId, waitTime] = pq.shift();
    const key = `${currentStop}-${currentTime}`;
    if (visited[key]) continue;
    visited[key] = true;
    const newPath = [...path, { stop_id: currentStop, arrival_time: currentTime, trip_id: lastTripId, waitTime }];
    if (currentStop === toId) {
      best = newPath;
      break;
    }
    // Pour chaque départ possible depuis ce stop après currentTime
    const departures = (stopDepartures[currentStop] || []).filter(st => {
      const trip = tripById[st.trip_id];
      if (!trip) return false;
      // Service actif ce jour ?
      if (!isServiceRunning(trip.service_id, journeyDate, calendar, calendarDates)) return false;
      // Départ après currentTime
      return timeToSeconds(st.departure_time) >= currentTime;
    });
    for (const dep of departures) {
      const trip = tripById[dep.trip_id];
      // Trouver la prochaine station sur ce trip
      const seq = parseInt(dep.stop_sequence, 10);
      const nextStops = stopTimes.filter(st => st.trip_id === dep.trip_id && parseInt(st.stop_sequence, 10) > seq);
      if (!nextStops.length) continue;
      const next = nextStops[0];
      const depSec = timeToSeconds(dep.departure_time);
      const arrSec = timeToSeconds(next.arrival_time);
      pq.push([
        next.stop_id,
        arrSec,
        newPath,
        dep.trip_id,
        depSec - currentTime // temps d'attente
      ]);
    }
  }
  if (!best) return null;
  // Format du résultat
  return best.map((step, i) => {
    const st = stations.find(s => s.id === step.stop_id);
    return {
      id: step.stop_id,
      name: st ? st.name : step.stop_id,
      arrival_time: step.arrival_time,
      trip_id: step.trip_id,
      waitTime: step.waitTime
    };
  });
}

app.get('/api/earliest-journey', (req, res) => {
  const { from, to, departureDateTime } = req.query;
  if (!from || !to || !departureDateTime) {
    return res.status(400).json({ error: "'from', 'to' station IDs and 'departureDateTime' are required" });
  }
  const fromStation = stations.find(s => s.id === from);
  const toStation = stations.find(s => s.id === to);
  if (!fromStation || !toStation) {
    return res.status(404).json({ error: 'One or both station IDs could not be found.' });
  }
  const result = findEarliestArrivalJourney({
    fromId: from,
    toId: to,
    departureDateTime,
    stations,
    stopTimes: Object.values(graph.nodes).flatMap(node => node.stopTimes || []),
    trips: tripsResults,
    calendar,
    calendarDates
  });
  if (!result) {
    return res.status(404).json({ error: 'No valid journey found.' });
  }
  res.json(result);
});

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
