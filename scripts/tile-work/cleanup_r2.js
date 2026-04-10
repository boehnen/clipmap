/**
 * Clean up old R2 paths (remove prefixed paths like /land-tiles/land-tiles-20deg/)
 */

const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const ACCOUNT_ID = 'be21682557ad7bf6388b0baa6a7448d4';
const ACCESS_KEY_ID = '9e0ca86115a33fab7ce4367c306f7d56';
const SECRET_ACCESS_KEY = '1c0e05d7e4441204e7fe3c5fcd53d5be3f962bf155e055ec06619b2b68c85817';
const BUCKET_NAME = 'clipmap-tiles';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

// Old/legacy paths to clean up
// NOTE: These are flat legacy folders, NOT the organized LOD folders
const OLD_PREFIXES = [
  // Legacy flat folders (replaced by land-tiles-{lod}/ and water-tiles-{lod}/)
  'land-tiles/',    // ~80k files, ~20GB
  'water-tiles/',   // ~80k files, ~20GB

  // Old nested prefixes (if any)
  'land-tiles/land-tiles-20deg/',
  'land-tiles/land-tiles-10deg/',
  'land-tiles/land-tiles-5deg/',
  'land-tiles/land-tiles-2.5deg/',
  'land-tiles/land-tiles-1deg/',
];

async function listObjects(prefix) {
  const objects = [];
  let continuationToken;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    if (response.Contents) {
      objects.push(...response.Contents.map(o => o.Key));
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

async function deleteObjects(keys) {
  if (keys.length === 0) return 0;

  // Delete in batches of 1000 (S3 limit)
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: batch.map(Key => ({ Key })),
      },
    }));
    deleted += batch.length;
    console.log(`  Deleted ${deleted}/${keys.length}`);
  }

  return deleted;
}

async function main() {
  console.log('Clean Up Old R2 Paths');
  console.log('=====================\n');

  let totalDeleted = 0;

  for (const prefix of OLD_PREFIXES) {
    console.log(`Checking ${prefix}...`);
    const objects = await listObjects(prefix);

    if (objects.length === 0) {
      console.log(`  No objects found\n`);
      continue;
    }

    console.log(`  Found ${objects.length} objects to delete`);
    const deleted = await deleteObjects(objects);
    totalDeleted += deleted;
    console.log(`  Done\n`);
  }

  console.log('=====================');
  console.log(`Total deleted: ${totalDeleted}`);
}

main().catch(console.error);
