const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'land-tiles-new', 'land-tiles-20deg');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.geojson'));

let empty = [];
let withData = [];

files.forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f)));
  if (d.features && d.features.length === 0) {
    empty.push(f.replace('.geojson', ''));
  } else {
    withData.push(f.replace('.geojson', ''));
  }
});

console.log(`Empty (ocean-only): ${empty.length}`);
console.log(`With land: ${withData.length}`);
console.log(`\nEmpty tiles:\n${empty.join(', ')}`);
