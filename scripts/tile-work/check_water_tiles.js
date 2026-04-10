/**
 * Check if water tiles exist on CDN for suspicious solid land tiles
 */
const https = require('https');

const CDN_BASE = 'https://cdn.clipmap.io';

// Suspicious tiles that are solid rectangles (excluding Antarctica -90 lat)
const SUSPICIOUS_TILES = [
  '-10_-10', '-10_-20', '-10_-30', '-10_-40', '-10_-50', '-10_-60', '-10_-70', '-10_-80',
  '-100_-10', '-100_-20', '-100_-30', '-100_-40', '-100_-50', '-100_-60', '-100_-70', '-100_-80',
  '-100_0', '-100_10', '-100_20', '-100_30', '-100_40', '-100_50', '-100_60', '-100_70', '-100_80',
  '-40_70', '-50_70',
  '100_-80', '110_-80', '120_-80', '130_-80', '140_-80',
  '40_-80', '50_-80', '80_-80', '90_-80'
];

function checkUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const hasFeatures = json.features && json.features.length > 0;
            resolve({ exists: true, hasWater: hasFeatures, size: data.length });
          } catch {
            resolve({ exists: false });
          }
        });
      } else {
        resolve({ exists: false });
      }
    }).on('error', () => resolve({ exists: false }));
  });
}

async function main() {
  console.log('Checking water tiles on CDN for suspicious land tiles');
  console.log('='.repeat(55));

  const needsRegeneration = [];

  for (const tileId of SUSPICIOUS_TILES) {
    const url = `${CDN_BASE}/water-tiles-10deg/${tileId}.geojson`;
    const result = await checkUrl(url);

    if (result.exists && result.hasWater) {
      console.log(`  ${tileId}: HAS WATER (${(result.size/1024).toFixed(1)}KB) - NEEDS REGEN`);
      needsRegeneration.push(tileId);
    } else if (result.exists) {
      console.log(`  ${tileId}: empty water (correct)`);
    } else {
      console.log(`  ${tileId}: no water tile`);
    }
  }

  console.log('\n' + '='.repeat(55));
  console.log(`Tiles needing regeneration: ${needsRegeneration.length}`);
  if (needsRegeneration.length > 0) {
    console.log(JSON.stringify(needsRegeneration));
  }
}

main();
