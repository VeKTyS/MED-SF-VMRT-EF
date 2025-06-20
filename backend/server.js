const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createGraph, Djikstra, kruskal_acpm, prim_acpm} = require('./algorithms/graph');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Charger et parser pospoints.txt
function loadPosPoints() {
  const filePath = path.join(__dirname, 'V1', 'pospoints.txt');
  const data = fs.readFileSync(filePath, 'utf-8');
  return data
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const [x, y, name] = line.split(';');
      return {
        x: parseInt(x, 10),
        y: parseInt(y, 10),
        name: name.replace(/@/g, ' ').trim()
      };
    });
}

// Charger et parser metro.txt
function loadMetroData() {
  const filePath = path.join(__dirname, 'V1', 'metro.txt');
  const data = fs.readFileSync(filePath, 'utf-8');

  const stations = [];
  const links = [];
  const stationIds = new Set();

  data.split('\n').forEach(line => {
    line = line.trim();
    if (!line) return;

    // Parse stations (V)
    if (line.startsWith('V')) {
      try {
        const content = line.slice(1).trim(); // remove leading 'V'
        const [idName, lineNumber, isTerminusStr, branchingStr] = content.split(';').map(e => e.trim());
        const [id, ...nameParts] = idName.split(/\s+/);
        const name = nameParts.join(' ');

        const station = {
          id: id,
          name: name,
          lineNumber: lineNumber,
          isTerminus: isTerminusStr.toLowerCase() === 'true',
          branching: parseInt(branchingStr, 10)
        };

        stations.push(station);
        stationIds.add(id);
      } catch (err) {
        console.warn(`Skipping malformed station line: ${line}`);
      }
    }

    // Parse links (E)
    else if (line.startsWith('E')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        let from = parts[1].trim();
        let to = parts[2].trim();
        const time = parseInt(parts[3].trim(), 10);

        // Zero-pad the IDs to match the format in stationIds
        from = from.padStart(4, '0');
        to = to.padStart(4, '0');

        if (!stationIds.has(from) || !stationIds.has(to)) {
          console.warn(`Link references missing station(s): from=${from}, to=${to}`);
        } else {
          links.push({ from, to, time });
        }
      } else {
        console.warn(`Skipping malformed link line: ${line}`);
      }
    }
  });

  const graph = createGraph(stations, links);
  return { stations, links, graph };
}

const posPoints = loadPosPoints();
const { stations, links, graph } = loadMetroData();

app.get('/api/stations', (req, res) => {
  res.json(stations);
});

app.get('/api/links', (req, res) => {
  res.json(links);
});

app.get('/api/pospoints', (req, res) => {
  res.json(posPoints);
});

app.get('/api/graph', (req, res) => {
  res.json(graph);
});

app.get('/api/djikstra', (req, res) => {
  const { startId } = req.query;
  if (!startId || !graph[startId]) {
    return res.status(400).json({ error: 'Invalid start station ID' });
  }

  const result = Djikstra(graph, startId);
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

  // Debug: Log station IDs
  console.log('From Station:', fromStation);
  console.log('To Station:', toStation);

  // Run Dijkstra's algorithm to calculate the shortest path
  const result = Djikstra(graph, fromStation.id);

  // Debug: Log Dijkstra result
  console.log('Dijkstra Result:', result);

  // Extract the full path to the destination station
  const path = [];
  let currentStationId = toStation.id;

  while (currentStationId) {
    const station = stations.find(station => station.id === currentStationId);
    if (!station) break;
    path.unshift({
      id: station.id,
      name: station.name,
      distance: result.distances[currentStationId] || Infinity
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
    totalDistance: result.distances[toStation.id] || Infinity
  });
});

// After loading posPoints and stations
const posPointsMap = {};
posPoints.forEach(p => { posPointsMap[p.name] = p; });

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

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
