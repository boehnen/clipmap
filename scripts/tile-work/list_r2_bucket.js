/**
 * List R2 bucket structure
 */

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const client = new S3Client({
  region: 'auto',
  endpoint: 'https://be21682557ad7bf6388b0baa6a7448d4.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '9e0ca86115a33fab7ce4367c306f7d56',
    secretAccessKey: '1c0e05d7e4441204e7fe3c5fcd53d5be3f962bf155e055ec06619b2b68c85817',
  },
});

async function listBucket() {
  const folders = {};
  let continuationToken = undefined;
  let totalFiles = 0;
  let totalSize = 0;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: 'clipmap-tiles',
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));

    for (const obj of response.Contents || []) {
      totalFiles++;
      totalSize += obj.Size;
      const parts = obj.Key.split('/');
      const folder = parts.length > 1 ? parts[0] : '(root)';
      if (!folders[folder]) folders[folder] = { count: 0, size: 0 };
      folders[folder].count++;
      folders[folder].size += obj.Size;
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log('R2 Bucket Structure: clipmap-tiles');
  console.log('===================================\n');

  const sorted = Object.entries(folders).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [folder, data] of sorted) {
    const sizeMB = (data.size / (1024 * 1024)).toFixed(1);
    console.log(folder.padEnd(25) + data.count.toString().padStart(6) + ' files' + sizeMB.padStart(10) + ' MB');
  }

  console.log('\n-----------------------------------');
  console.log('TOTAL:'.padEnd(25) + totalFiles.toString().padStart(6) + ' files' + (totalSize / (1024 * 1024)).toFixed(1).padStart(10) + ' MB');
}

listBucket().catch(console.error);
