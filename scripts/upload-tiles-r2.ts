/**
 * Upload tiles to Cloudflare R2 (S3-compatible)
 *
 * Uses AWS S3 SDK for fast parallel uploads.
 *
 * Setup:
 *   1. Create R2 API Token in Cloudflare Dashboard
 *   2. Copy .env.example to .env and fill in credentials
 *   3. npm install
 *   4. npx ts-node upload-tiles-r2.ts --input ./tiles
 *
 * Environment variables (in scripts/.env):
 *   R2_ACCOUNT_ID=your_account_id
 *   R2_ACCESS_KEY_ID=your_access_key_id
 *   R2_SECRET_ACCESS_KEY=your_secret_access_key
 *   R2_BUCKET_NAME=your_bucket_name
 */

import * as fs from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { config } from 'dotenv';

// Load environment variables from scripts/.env
config({ path: path.join(__dirname, '.env') });

interface UploadStats {
  total: number;
  uploaded: number;
  skipped: number;
  failed: number;
  bytes: number;
}

const CONCURRENCY = 20; // Parallel uploads
const CONTENT_TYPES: Record<string, string> = {
  '.geojson': 'application/geo+json',
  '.json': 'application/json',
  '.pbf': 'application/x-protobuf',
  '.png': 'image/png',
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function getAllFiles(dir: string, files: string[] = []): string[] {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      // Include all relevant file types
      const ext = path.extname(item).toLowerCase();
      if (['.geojson', '.json', '.pbf', '.png'].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function uploadFile(
  client: S3Client,
  bucket: string,
  localPath: string,
  remotePath: string,
  skipExisting: boolean
): Promise<{ success: boolean; skipped: boolean; bytes: number }> {
  const fileContent = fs.readFileSync(localPath);
  const contentType = getContentType(localPath);

  // Check if file exists (if skipExisting enabled)
  if (skipExisting) {
    try {
      await client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: remotePath,
      }));
      return { success: true, skipped: true, bytes: 0 };
    } catch {
      // File doesn't exist, proceed with upload
    }
  }

  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: remotePath,
      Body: fileContent,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // 1 year cache
    }));
    return { success: true, skipped: false, bytes: fileContent.length };
  } catch (err) {
    console.error(`\nFailed to upload ${remotePath}:`, err);
    return { success: false, skipped: false, bytes: 0 };
  }
}

async function uploadBatch(
  client: S3Client,
  bucket: string,
  files: Array<{ local: string; remote: string }>,
  skipExisting: boolean,
  stats: UploadStats,
  startIndex: number,
  totalFiles: number
): Promise<void> {
  const results = await Promise.all(
    files.map(f => uploadFile(client, bucket, f.local, f.remote, skipExisting))
  );

  for (const result of results) {
    if (result.skipped) {
      stats.skipped++;
    } else if (result.success) {
      stats.uploaded++;
      stats.bytes += result.bytes;
    } else {
      stats.failed++;
    }
  }

  const current = startIndex + files.length;
  const pct = ((current / totalFiles) * 100).toFixed(1);
  const mb = (stats.bytes / 1024 / 1024).toFixed(1);
  process.stdout.write(
    `\r  Progress: ${current}/${totalFiles} (${pct}%) | Uploaded: ${stats.uploaded} | Skipped: ${stats.skipped} | ${mb} MB`
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let inputDir = './tiles';
  let dryRun = false;
  let skipExisting = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputDir = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--force') {
      skipExisting = false;
    } else if (args[i] === '--help') {
      console.log(`
Upload Tiles to Cloudflare R2

Usage:
  npx ts-node upload-tiles-r2.ts [options]

Options:
  --input <dir>   Local tiles directory (default: ./tiles)
  --dry-run       List files without uploading
  --force         Re-upload existing files (default: skip existing)
  --help          Show this help

Environment Variables (in scripts/.env):
  R2_ACCOUNT_ID         Cloudflare account ID
  R2_ACCESS_KEY_ID      R2 API token access key
  R2_SECRET_ACCESS_KEY  R2 API token secret key
  R2_BUCKET_NAME        R2 bucket name

Setup:
  1. Go to Cloudflare Dashboard > R2 > Manage R2 API Tokens
  2. Create new API Token with Object Read & Write permissions
  3. Copy the credentials to scripts/.env
  4. Run: npx ts-node upload-tiles-r2.ts --input ./tiles
`);
      process.exit(0);
    }
  }

  // Check environment variables
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error('Error: Missing R2 credentials in environment variables.\n');
    console.error('Create scripts/.env with:');
    console.error('  R2_ACCOUNT_ID=your_account_id');
    console.error('  R2_ACCESS_KEY_ID=your_access_key_id');
    console.error('  R2_SECRET_ACCESS_KEY=your_secret_access_key');
    console.error('  R2_BUCKET_NAME=your_bucket_name');
    console.error('\nGet these from: Cloudflare Dashboard > R2 > Manage R2 API Tokens');
    process.exit(1);
  }

  if (!fs.existsSync(inputDir)) {
    console.error(`Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  console.log('=== R2 Tile Uploader ===\n');
  console.log(`Bucket: ${bucket}`);
  console.log(`Input: ${inputDir}`);
  console.log(`Skip existing: ${skipExisting}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Concurrency: ${CONCURRENCY}`);

  // Get all files
  console.log('\nScanning files...');
  const files = getAllFiles(inputDir);
  console.log(`Found ${files.length} files\n`);

  if (files.length === 0) {
    console.log('No files to upload.');
    return;
  }

  // Prepare file list with remote paths
  const fileList = files.map(localPath => ({
    local: localPath,
    remote: path.relative(inputDir, localPath).replace(/\\/g, '/'),
  }));

  if (dryRun) {
    console.log('Files to upload:');
    for (const f of fileList.slice(0, 20)) {
      console.log(`  ${f.remote}`);
    }
    if (fileList.length > 20) {
      console.log(`  ... and ${fileList.length - 20} more`);
    }
    console.log(`\nTotal: ${fileList.length} files`);
    return;
  }

  // Create S3 client for R2
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const stats: UploadStats = {
    total: files.length,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
  };

  console.log('Uploading...');

  // Process in batches for parallel upload
  for (let i = 0; i < fileList.length; i += CONCURRENCY) {
    const batch = fileList.slice(i, i + CONCURRENCY);
    await uploadBatch(client, bucket, batch, skipExisting, stats, i, fileList.length);
  }

  const mb = (stats.bytes / 1024 / 1024).toFixed(2);
  console.log('\n\n=== Upload Complete ===');
  console.log(`Total files: ${stats.total}`);
  console.log(`Uploaded: ${stats.uploaded} (${mb} MB)`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);

  if (stats.uploaded > 0 || stats.skipped > 0) {
    console.log(`\n✓ Tiles available at: https://cdn.clipmap.io/`);
    console.log(`\nSet in web/.env.local:`);
    console.log(`  NEXT_PUBLIC_TILE_CDN_URL=https://cdn.clipmap.io`);
  }
}

main().catch(console.error);
