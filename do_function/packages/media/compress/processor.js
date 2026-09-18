const { execFile, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ffmpegStatic = require('@ffmpeg-installer/ffmpeg');
const ffprobeStatic = require('@ffprobe-installer/ffprobe');

const FFMPEG_PATH = ffmpegStatic.path;
const FFPROBE_PATH = ffprobeStatic.path;


function getVideoBitrate(inputPath) {
  try {
    const result = execSync(`"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=bit_rate -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`).toString().trim();
    const kbps = parseInt(result, 10) / 1000;
    if (!isNaN(kbps) && kbps > 0) return kbps;
    return 5000;
  } catch {
    return 5000;
  }
}

function getCompressionSettings(bitrateKbps, sizeMB) {
  if (sizeMB > 25 || bitrateKbps > 8000) return { crf: 23, maxrate: Math.floor(bitrateKbps * 0.4) };
  if (sizeMB > 15 || bitrateKbps > 4000) return { crf: 20, maxrate: Math.floor(bitrateKbps * 0.6) };
  return { crf: 18, maxrate: Math.floor(bitrateKbps * 0.85) };
}

async function processMedia(inputPath, fileExt) {
  const isImage = [".jpg", ".jpeg", ".png", ".gif", ".heic", ".heif", ".svg", ".webp"].includes(fileExt);
  const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(fileExt);
  
  if (!isImage && !isVideo) throw new Error(`Unsupported file type: ${fileExt}`);

  const fileName = path.basename(inputPath);
  let outputPath;
  let contentType;

  if (isImage) {
    outputPath = `/tmp/${path.basename(fileName, fileExt)}.webp`;
    contentType = "image/webp";
    
    await new Promise((resolve, reject) => {
      execFile(FFMPEG_PATH, ["-i", inputPath, "-c:v", "libwebp", "-quality", "80", "-compression_level", "6", "-preset", "picture", "-y", outputPath], (error, stdout, stderr) => {
        if (error) { console.error("FFmpeg image error:", stderr); reject(error); } 
        else resolve();
      });
    });
  } else if (isVideo) {
    outputPath = `/tmp/processed-${path.basename(fileName, fileExt)}.mp4`;
    contentType = "video/mp4";
    
    const sizeMB = fs.statSync(inputPath).size / (1024 * 1024);
    const bitrateKbps = getVideoBitrate(inputPath);
    const { crf, maxrate } = getCompressionSettings(bitrateKbps, sizeMB);

    await new Promise((resolve, reject) => {
      execFile(FFMPEG_PATH, ["-i", inputPath, "-c:v", "libx264", "-crf", String(crf), "-preset", "ultrafast", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "0", "-b:v", "0", "-maxrate", `${maxrate}k`, "-bufsize", `${maxrate * 2}k`, "-y", outputPath], (error, stdout, stderr) => {
        if (error) { console.error("FFmpeg video error:", stderr); reject(error); } 
        else resolve();
      });
    });
  }

  if (!fs.existsSync(outputPath)) throw new Error(`Processed file not found at: ${outputPath}`);
  return { outputPath, contentType };
}

module.exports = { processMedia };
