const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createGraph, Djikstra } = require('./algorithms/graph');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Function to load and parse pospoints.txt
function loadPosPoints() {
  const filePath = path.join(__dirname, 'V1', 'pospoints.txt');
  const data = fs.readFileSync(filePath, 'utf-8');
  return data.split('\n').filter(line => line.trim()).map(line => {
    const [x, y, name] = line.split(';');
    return { x: parseInt(x, 10), y: parseInt(y, 10), name: name.replace(/@/g, ' ') };
  });
}

function loadMetroData() {
  const filePath = path.join(__dirname, 'V1', 'metro.txt');
  const data = fs.readFileSync(filePath, 'utf-8');
  const stations = [];
  const links = [];

  data.split('\n').forEach(line => {
    line = line.trim();

    // Parse station lines (V)
    if (line.startsWith('V')) {
      const match = line.match(/^V\s+(\d+)\s+(.+?)\s*;(\d+)\s*;(True|False)\s*(\d+)/);
      if (match) {
        const [, id, name, lineNumber, terminusStr, branchingStr] = match;
        stations.push({
          id: id.trim(),
          name: name.trim(),
          lineNumber: lineNumber.trim(),
          isTerminus: terminusStr === 'True',
          branching: parseInt(branchingStr, 10)
        });
      } else {
        console.warn(`Skipping malformed station line: ${line}`);
      }
    }

    // Parse link lines (E)
    else if (line.startsWith('E')) {
      const parts = line.split(' ');
      if (parts.length >= 4) {
        const [, from, to, time] = parts;
        links.push({
          from: from.trim(),
          to: to.trim(),
          time: parseInt(time.trim(), 10)
        });
      } else {
        console.warn(`Skipping malformed link line: ${line}`);
      }
    }
  });

  // Create the graph using stations and links
  const graph = createGraph(stations, links);

  return { stations, links, graph };
}

const posPoints = loadPosPoints();
const { stations, links } = loadMetroData();
const graph = createGraph(stations, links);

app.get('/api/stations', (req, res) => {
  res.json(stations);
});

app.get('/api/links', (req, res) => {
  res.json(links);
});

app.get('/api/pospoints', (req, res) => {
  res.json(posPoints);
});

app.get('/api/journey', (req, res) => {
  const { from, to } = req.query;

  // Debug: Log query parameters
  console.log('Query Parameters:', req.query);

  // Normalize input names (trim and convert to lowercase)
  const normalizedFrom = from?.trim().toLowerCase();
  const normalizedTo = to?.trim().toLowerCase();

  // Debug: Log normalized names
  console.log('Normalized From:', normalizedFrom);
  console.log('Normalized To:', normalizedTo);

  // Find the stations by normalized name
  const fromStation = stations.find(station => station.name.toLowerCase() === normalizedFrom);
  const toStation = stations.find(station => station.name.toLowerCase() === normalizedTo);

  // Debug: Log found stations
  console.log('From Station:', fromStation);
  console.log('To Station:', toStation);

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
      distance: result[currentStationId]?.distance || Infinity
    });
    currentStationId = result[currentStationId]?.previous;
  }

  if (path.length === 0 || path[0].id !== fromStation.id) {
    return res.status(400).json({ error: 'No valid path found' });
  }

  res.json({
    from: fromStation,
    to: toStation,
    path, // Full path of stations
    totalDistance: result[toStation.id]?.distance || Infinity
  });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});