const fs = require('fs');
const path = require('path');
const csvPath = path.join(__dirname, 'emissionCO2.csv');

function parseCSV(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n').filter(l => l.trim() && !l.startsWith('//'));
  const headers = lines[0].split(';');
  return lines.slice(1).map(line => {
    const cols = line.split(';');
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = cols[i] ? cols[i].trim() : '');
    return obj;
  });
}

function getCO2ForLine(mode, line, csvData) {
  let entry = csvData.find(e => e.transport_mode === mode && e.name_line === line);
  if (!entry) entry = csvData.find(e => e.transport_mode === mode);
  return entry ? parseFloat(entry.co2e_voy_km_line.replace(',', '.')) : null;
}

function calculerEmpreinteCO2(segments) {
  const csvData = parseCSV(csvPath);
  let total = 0;
  const details = [];
  for (const seg of segments) {
    const co2 = getCO2ForLine(seg.mode, seg.line, csvData);
    if (co2 !== null && seg.distance_km) {
      const empreinte = co2 * seg.distance_km;
      total += empreinte;
      details.push({
        ...seg,
        co2e_voy_km: co2,
        empreinte: empreinte
      });
    }
  }
  return { total, details };
}

module.exports = { calculerEmpreinteCO2 };
