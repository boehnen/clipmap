/**
 * Upload new water tiles (v3) and 1deg land tiles to Cloudflare R2
 * Run: node upload_new_tiles_v3.js
 *
 * Uploads:
 * - water-tiles-v3/* -> R2 (all LOD water tiles)
 * - land-tiles-new/land-tiles-1deg -> R2
 */

const { S3Client, PutObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// R2 Configuration
const ACCOUNT_ID = 'be21682557ad7bf6388b0baa6a7448d4';
const ACCESS_KEY_ID = '9e0ca86115a33fab7ce4367c306f7d56';
const SECRET_ACCESS_KEY = '1c0e05d7e4441204e7fe3c5fcd53d5be3f962bf155e055ec06619b2b68c85817';
const BUCKET_NAME = 'clipmap-tiles';

const BASE_DIR = __dirname;

// Directories to upload - water v3 and 1deg land
const UPLOAD_DIRS = [
  // Water tiles v3 (all LODs)
  { local: path.join(BASE_DIR, 'water-tiles-v3', 'water-tiles-20deg'), remote: 'water-tiles-20deg' },
  { local: path.join(BASE_DIR, 'water-tiles-v3', 'water-tiles-10deg'), remote: 'water-tiles-10deg' },
  { local: path.join(BASE_DIR, 'water-tiles-v3', 'water-tiles-5deg'), remote: 'water-tiles-5deg' },
  { local: path.join(BASE_DIR, 'water-tiles-v3', 'water-tiles-2.5deg'), remote: 'water-tiles-2.5deg' },
  { local: path.join(BASE_DIR, 'water-tiles-v3', 'water-tiles-1deg'), remote: 'water-tiles-1deg' },
  // 1deg land tiles
  { local: path.join(BASE_DIR, 'land-tiles-new', 'land-tiles-1deg'), remote: 'land-tiles-1deg' },
];

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

function getFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFiles(fullPath, path.join(prefix, entry.name)));
    } else if (entry.name.endsWith('.geojson')) {
      files.push({ localPath: fullPath, key: path.join(prefix, entry.name).replace(/\\/g, '/') });
    }
  }

  return files;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Upload New Tiles (Water v3 + 1deg Land) to R2');
  console.log('='.repeat(60));
  console.log();

  // Ensure bucket exists
  await ensureBucket();

  // Gather all files
  console.log('Scanning files...');
  const allFiles = [];

  for (const { local, remote } of UPLOAD_DIRS) {
    if (!fs.existsSync(local)) {
      console.log(`  SKIP: ${local} (not found)`);
      continue;
    }
    console.log(`  ${path.basename(local)} -> ${remote}/`);
    const files = getFiles(local, remote);
    allFiles.push(...files);
    console.log(`    Found ${files.length.toLocaleString()} files`);
  }

  console.log();
  console.log(`Total: ${allFiles.length.toLocaleString()} files to upload`);
  console.log();

  if (allFiles.length === 0) {
    console.log('No files to upload!');
    return;
  }

  // Upload with progress
  let uploaded = 0;
  let errors = 0;
  const startTime = Date.now();
  const BATCH_SIZE = 100; // Upload 100 files concurrently

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
