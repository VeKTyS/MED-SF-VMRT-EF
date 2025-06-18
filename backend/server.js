const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

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
    if (line.startsWith('V')) {
      // Découpe entre ID et les autres infos (on prend directement V + ID + nom)
      const match = line.match(/^V\s+(\d+)\s+(.+);(.+);(True|False)\s+(\d+)/);
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

    } else if (line.startsWith('E')) {
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

  return { stations, links };
}


const posPoints = loadPosPoints();
const { stations, links } = loadMetroData();

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
  const fromStation = stations.find(station => station.name === from);
  const toStation = stations.find(station => station.name === to);

  if (!fromStation || !toStation) {
    return res.status(404).json({ error: 'Station not found' });
  }

  res.json({
    from: fromStation,
    to: toStation,
    message: 'Sample journey (no real path calculation)'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});