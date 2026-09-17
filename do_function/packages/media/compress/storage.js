const AWS = require("aws-sdk");
const fs = require("fs");

const s3 = new AWS.S3({
  endpoint: process.env.SPACES_ENDPOINT, // e.g., 'nyc3.digitaloceanspaces.com'
  accessKeyId: process.env.SPACES_KEY,
  secretAccessKey: process.env.SPACES_SECRET,
});

const BUCKET = process.env.SPACES_BUCKET || "dev-goshimmy-app";

async function downloadFile(key, localPath) {
  console.log(`Downloading ${key} to ${localPath}...`);
  const data = await s3.getObject({ Bucket: BUCKET, Key: key }).promise();
  fs.writeFileSync(localPath, data.Body);
  return localPath;
}

async function uploadFile(localPath, newKey, contentType) {
  console.log(`Uploading ${localPath} to ${newKey}...`);
  await s3.putObject({
    Bucket: BUCKET,
    Key: newKey,
    Body: fs.readFileSync(localPath),
    ContentType: contentType,
  }).promise();
  
  return `https://${BUCKET}.${process.env.SPACES_ENDPOINT}/${newKey}`;
}

async function updateTagToCompressed(key) {
  await s3.putObjectTagging({
    Bucket: BUCKET,
    Key: key,
    Tagging: { TagSet: [{ Key: "Status", Value: "Compressed" }] },
  }).promise();
  console.log(`Set tag Status=Compressed for ${key}`);
}

module.exports = { downloadFile, uploadFile, updateTagToCompressed };
