const path = require("path");
const fs = require("fs");
const { downloadFile, uploadFile, updateTagToCompressed } = require("./storage");
const { processMedia } = require("./processor");
const { updateMediaStatus } = require("./db");

/**
 * Main DigitalOcean Function Handler
 */
async function main(event, context) {
  console.log("DO FUNCTION STARTED", event);

  // Extract variables from the event
  // Using 'key' (DO Spaces / S3 path) and 'mediaId' (database UUID from the media table)
  const key = event.key;
  const mediaId = event.mediaId;

  if (!key) {
    return { statusCode: 400, body: "Missing 'key' in event." };
  }

  const fileName = path.basename(key);
  const inputPath = `/tmp/${fileName}`;
  const fileExt = path.extname(fileName).toLowerCase();
  
  try {
    // 1. Download file from S3/DO Spaces to /tmp folder
    await downloadFile(key, inputPath);

    // 2. Compress the media via FFmpeg (Image to WebP, or Video compression)
    const { outputPath, contentType } = await processMedia(inputPath, fileExt);

    // 3. Upload processed file back to S3/DO Spaces under 'after-processing'
    const outKey = `after-processing/${path.basename(outputPath)}`;
    const processedUrl = await uploadFile(outputPath, outKey, contentType);

    // 4. Update the tag on the original file
    await updateTagToCompressed(key);

    // 5. Update Database Table (`media`) status via GraphQL
    if (mediaId) {
      await updateMediaStatus(mediaId, 'UNCOMPRESSED', outKey);
    }

    // Cleanup local /tmp storage before exit to free up function memory
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    return {
      statusCode: 200,
      body: { message: "Compression successful", processedUrl }
    };
  } catch (error) {
    console.error("Function failed:", error);

    // Update DB on failure so the UI knows it failed
    if (mediaId) {
      await updateMediaStatus(mediaId, 'FAILED', null);
    }

    return {
      statusCode: 500,
      body: { error: error.message || "Compression failed" }
    };
  }
}

// Export the main handler for DO Functions runtime
exports.main = main;
