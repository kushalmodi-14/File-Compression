const { S3Client, GetObjectCommand, PutObjectCommand, PutObjectTaggingCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");

const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT, // e.g., 'https://nyc3.digitaloceanspaces.com'
  region: "us-east-1", // DO Spaces uses us-east-1 compatibility
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});

const BUCKET = process.env.SPACES_BUCKET || "dev-goshimmy-app";

// Helper to convert readable stream to buffer for Node 18+
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function downloadFile(key, localPath) {
  console.log(`Downloading ${key} to ${localPath}...`);
  const data = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const buffer = await streamToBuffer(data.Body);
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

async function uploadFile(localPath, newKey, contentType) {
  console.log(`Uploading ${localPath} to ${newKey}...`);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: newKey,
    Body: fs.readFileSync(localPath),
    ContentType: contentType,
  }));
  
  // Clean endpoint url by removing protocol to append correctly
  const endpointHost = process.env.SPACES_ENDPOINT.replace(/^https?:\/\//, '');
  return `https://${BUCKET}.${endpointHost}/${newKey}`;
}

async function updateTagToCompressed(key) {
  await s3.send(new PutObjectTaggingCommand({
    Bucket: BUCKET,
    Key: key,
    Tagging: { TagSet: [{ Key: "Status", Value: "Compressed" }] },
  }));
  console.log(`Set tag Status=Compressed for ${key}`);
}

module.exports = { downloadFile, uploadFile, updateTagToCompressed };
