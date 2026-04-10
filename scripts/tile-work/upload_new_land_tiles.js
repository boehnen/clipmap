/**
 * Upload new land tiles to Cloudflare R2 with direct paths
 * Run: node upload_new_land_tiles.js
 *
 * Uploads to: /land-tiles-{lod}/ (direct, not prefixed)
 */

const { S3Client, PutObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// R2 Configuration
const ACCOUNT_ID = 'be21682557ad7bf6388b0baa6a7448d4';
const ACCESS_KEY_ID = '9e0ca86115a33fab7ce4367c306f7d56';
const SECRET_ACCESS_KEY = '1c0e05d7e4441204e7fe3c5fcd53d5be3f962bf155e055ec06619b2b68c85817';
const BUCKET_NAME = 'clipmap-tiles';

const BASE_DIR = path.join(__dirname, 'land-tiles-new');

// LODs to upload (each goes to its own direct path)
const LODS = ['20deg', '10deg', '5deg', '2.5deg', '1deg'];

// Only upload specific LODs (pass --lod=20deg,10deg)
const lodFilter = (process.argv.find(a => a.startsWith('--lod=')) || '').replace('--lod=', '').split(',').filter(Boolean);

// Create S3 client for R2
const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function ensureBucket() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`Bucket ${BUCKET_NAME} exists`);
  } catch (err) {
    if (err.name === 'NotFound') {
      console.log('Bucket not found - please create it first');
      process.exit(1);
    } else {
      throw err;
    }
  }
}

async function uploadFile(localPath, key) {
  const content = fs.readFileSync(localPath);
  await client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: content,
    ContentType: 'application/json',
  }));
}

function getFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.geojson'))
    .map(f => ({
      localPath: path.join(dir, f),
      filename: f
    }));
}

async function main() {
  console.log('='.repeat(60));
  console.log('Upload New Land Tiles to R2 (Direct Paths)');
  console.log('='.repeat(60));
  console.log();

  await ensureBucket();

  const lodsToUpload = lodFilter.length > 0
    ? LODS.filter(l => lodFilter.includes(l))
    : LODS;

  console.log(`LODs to upload: ${lodsToUpload.join(', ')}`);
  console.log();

  // Gather all files
  console.log('Scanning files...');
  const allFiles = [];

  for (const lod of lodsToUpload) {
    const localDir = path.join(BASE_DIR, `land-tiles-${lod}`);
    const remotePath = `land-tiles-${lod}`;

    const files = getFiles(localDir);
    for (const file of files) {
      allFiles.push({
        localPath: file.localPath,
        key: `${remotePath}/${file.filename}`
      });
    }
    console.log(`  ${lod}: ${files.length} files -> ${remotePath}/`);
  }

  console.log();
  console.log(`Total: ${allFiles.length.toLocaleString()} files to upload`);
  console.log();

  if (allFiles.length === 0) {
    console.log('No files to upload');
    return;
  }

  // Upload with progress
  let uploaded = 0;
  let errors = 0;
  const startTime = Date.now();
  const BATCH_SIZE = 100;

  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batch = allFiles.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async ({ localPath, key }) => {
      try {
        await uploadFile(localPath, key);
        uploaded++;
      } catch (err) {
        console.error(`\nError uploading ${key}: ${err.message}`);
        errors++;
      }
    }));

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = uploaded / elapsed;
    const remaining = allFiles.length - uploaded - errors;
    const eta = remaining / rate;
    const pct = ((uploaded + errors) / allFiles.length * 100).toFixed(1);

    process.stdout.write(`\r  ${uploaded.toLocaleString()}/${allFiles.length.toLocaleString()} (${pct}%) | ${rate.toFixed(0)}/s | ETA: ${(eta/60).toFixed(1)}min    `);
  }

  console.log();
  console.log();
  console.log('='.repeat(60));
  console.log(`DONE: ${uploaded.toLocaleString()} uploaded, ${errors} errors`);
  console.log(`Time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
  console.log('='.repeat(60));
}

main().catch(console.error);
