const { FFMPEG_PATH, path, startTimer, execSync, execFileAsync } = require("./utils");
const { getVideoBitrate, getVideoHeight, getCompressionSettings } = require("./videoUtils");

async function compressVideo(inputPath, outputDir, stats, fileName, fileExt) {
  const outputPath = path.join(outputDir, `processed-${path.basename(fileName, fileExt)}.mp4`);
  const sizeMB = stats.size / (1024 * 1024);

  const bitrateKbps = getVideoBitrate(inputPath);
  const sourceHeight = getVideoHeight(inputPath);
  const { crf, preset, maxrate } = getCompressionSettings(bitrateKbps, sizeMB);

  const targetHeight = Math.min(2160, sourceHeight);

  console.log(`⚙️  CRF: ${crf} | Preset: ${preset} | Target height: ${targetHeight}p | Maxrate: ${maxrate}k | Bufsize: ${maxrate * 2}k`);

  const ffmpegArgs = [
    "-i", inputPath,
    "-c:v", "libx264",
    "-crf", String(crf),
    "-preset", preset,
    "-profile:v", "high",
    "-vf", `scale=-2:${targetHeight}`,
    "-level", "4.1",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-threads", "0",
    "-b:v", "0",
    "-maxrate", `${maxrate}k`,
    "-bufsize", `${maxrate * 2}k`,
    "-y", outputPath,
  ];

  try {
    execSync(`"${FFMPEG_PATH}" -version`, { stdio: "ignore" });
  } catch (err) {
    throw new Error(`FFmpeg not found at ${FFMPEG_PATH}`);
  }

  const timer = startTimer("Starting video compression via FFmpeg...");

  try {
    await execFileAsync(FFMPEG_PATH, ffmpegArgs);
    timer.stop();
    return outputPath;
  } catch (err) {
    timer.stop();
    throw new Error(`Compression failed: ${err.message}`);
  }
}

module.exports = compressVideo;
