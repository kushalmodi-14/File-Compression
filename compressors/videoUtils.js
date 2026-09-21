const { execSync, FFPROBE_PATH } = require("./utils");

function getVideoBitrate(inputPath) {
  try {
    const result = execSync(
      `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=bit_rate -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
    ).toString().trim();

    const kbps = parseInt(result) / 1000;
    if (!isNaN(kbps) && kbps > 0) return kbps;

    const fallback = execSync(
      `"${FFPROBE_PATH}" -v error -show_entries format=bit_rate -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
    ).toString().trim();
    return parseInt(fallback) / 1000;
  } catch (e) {
    console.warn("⚠️  Could not probe bitrate, using default settings.");
    return 5000;
  }
}

function getVideoHeight(inputPath) {
  try {
    const result = execSync(
      `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
    ).toString().trim();
    const h = parseInt(result);
    return !isNaN(h) && h > 0 ? h : 2160;
  } catch (e) {
    return 2160;
  }
}

function getCompressionSettings(bitrateKbps, sizeMB) {
  console.log(`📊 Source: ${bitrateKbps.toFixed(0)} kbps | ${sizeMB.toFixed(2)} MB`);
  if (bitrateKbps > 8000) {
    return { crf: 25, preset: "slow", maxrate: Math.floor(bitrateKbps * 0.45) };
  } else if (bitrateKbps > 4000) {
    return { crf: 23, preset: "slow", maxrate: Math.floor(bitrateKbps * 0.6) };
  } else if (bitrateKbps > 2000) {
    return { crf: 22, preset: "slow", maxrate: Math.floor(bitrateKbps * 0.75) };
  } else if (bitrateKbps > 1000) {
    return { crf: 21, preset: "slow", maxrate: Math.floor(bitrateKbps * 0.9) };
  } else {
    return { crf: 20, preset: "slower", maxrate: Math.ceil(bitrateKbps * 1.3) };
  }
}

module.exports = {
  getVideoBitrate,
  getVideoHeight,
  getCompressionSettings,
};
