const { S3Client, GetObjectCommand, PutObjectCommand, PutObjectTaggingCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");

function getConfig() {
  const isProd = process.env.enviorments === 'production';
  
  if (isProd) {
    return {
      endpoint: process.env.PROD_SPACES_ENDPOINT,
      key: process.env.PROD_SPACES_KEY,
      secret: process.env.PROD_SPACES_SECRET,
      bucket: process.env.PROD_SPACES_BUCKET
    };
  }
  
  // Staging defaults
  return {
    endpoint: process.env.STAGGING_SPACES_ENDPOINT,
    key: process.env.STAGGING_SPACES_KEY,
    secret: process.env.STAGGING_SPACES_SECRET,
    bucket: process.env.STAGGING_SPACES_BUCKET,
  };
}

function getS3Client() {
  const config = getConfig();
  return new S3Client({
    endpoint: config.endpoint, // e.g., 'https://nyc3.digitaloceanspaces.com'
    region: "us-east-1", // DO Spaces uses us-east-1 compatibility
    credentials: {
      accessKeyId: config.key,
      secretAccessKey: config.secret,
    },
  });
}

function getBucket() {
  return getConfig().bucket;
}

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
  const s3 = getS3Client();
  const bucket = getBucket();
  const data = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const buffer = await streamToBuffer(data.Body);
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

async function uploadFile(localPath, newKey, contentType) {
  console.log(`Uploading ${localPath} to ${newKey}...`);
  const s3 = getS3Client();
  const bucket = getBucket();
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: newKey,
    Body: fs.readFileSync(localPath),
    ContentType: contentType,
  }));
  
  // Clean endpoint url by removing protocol to append correctly
  const config = getConfig();
  const endpointHost = config.endpoint.replace(/^https?:\/\//, '');
  return `https://${bucket}.${endpointHost}/${newKey}`;
}

async function updateTagToCompressed(key) {
  const s3 = getS3Client();
  const bucket = getBucket();
  await s3.send(new PutObjectTaggingCommand({
    Bucket: bucket,
    Key: key,
    Tagging: { TagSet: [{ Key: "Status", Value: "Compressed" }] },
  }));
  console.log(`Set tag Status=Compressed for ${key}`);
}

module.exports = { downloadFile, uploadFile, updateTagToCompressed };
