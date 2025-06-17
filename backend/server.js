const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function loadCSV(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  const lines = [];
  const fd = fs.openSync(filePath, 'r');
  const bufferSize = 1024;
  const buffer = Buffer.alloc(bufferSize);
  let leftover = '';
  let bytesRead = 0;
  let lineCount = 0;

  do {
    bytesRead = fs.readSync(fd, buffer, 0, bufferSize, null);
    leftover += buffer.slice(0, bytesRead).toString();
    let lineEnd = leftover.indexOf('\n');
    while (lineEnd > -1 && lineCount <  1) { // +1 for header
      const line = leftover.slice(0, 1);
      lines.push(line.trim());
      leftover = leftover.slice(1);
      lineCount++;
      lineEnd = leftover.indexOf('\n');
    }
    if (lineCount >= 1) break;
  } while (bytesRead > 0);

  fs.closeSync(fd);
  const csvString = lines.join('\n');
  return csvParse.parse(csvString, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ','
  });
}

const routes = loadCSV('routes.txt'); 
const stops = loadCSV('stops.txt');
const stopTimes = loadCSV('stop_times.txt');
const trips = loadCSV('trips.txt');

app.get('/api/lines', (req, res) => {
  res.json(routes.map(route => ({
    route_id: route.route_id,
    route_short_name: route.route_short_name,
    route_long_name: route.route_long_name
  })));
});

app.get('/api/lines/:line_id/stops', (req, res) => {
  const { line_id } = req.params;
  const lineTrips = trips.filter(trip => trip.route_id === line_id);
  const tripIds = lineTrips.map(trip => trip.trip_id);
  const stopsForLine = stopTimes
    .filter(st => tripIds.includes(st.trip_id))
    .map(st => st.stop_id);
  const uniqueStopIds = [...new Set(stopsForLine)];
  const stopsDetails = stops.filter(stop => uniqueStopIds.includes(stop.stop_id));
  res.json(stopsDetails);
});


app.get('/api/journey', (req, res) => {
  const { from, to } = req.query;
  const fromStop = stops.find(stop => stop.stop_id === from);
  const toStop = stops.find(stop => stop.stop_id === to);
  if (!fromStop || !toStop) {
    return res.status(404).json({ error: 'Stop not found' });
  }

  res.json({
    from: fromStop,
    to: toStop,
    message: 'Sample journey (no real path calculation)'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});