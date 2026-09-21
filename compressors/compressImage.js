const { checkBinary, HEIF_CONVERT_PATH, FFMPEG_PATH, path, fs, startTimer, execSync, execFileAsync } = require("./utils");

async function compressImage(inputPath, outputDir, fileName, fileExt) {
  const outputPath = path.join(outputDir, `${path.basename(fileName, fileExt)}.webp`);
  let tempImgPath = null;
  let webpSourcePath = inputPath;

  if (fileExt === ".heic" || fileExt === ".heif") {
    if (!checkBinary(HEIF_CONVERT_PATH)) {
      throw new Error(`heif-convert not found at ${HEIF_CONVERT_PATH}. Install it with:\n  sudo apt install libheif-examples`);
    }

    tempImgPath = path.join(outputDir, `.tmp-${path.basename(fileName, fileExt)}.jpg`);

    try {
      execSync(`"${HEIF_CONVERT_PATH}" "${inputPath}" "${tempImgPath}"`, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      throw new Error(`heif-convert failed to decode ${fileName}\n${(err.stderr || err.stdout || err.message).toString()}`);
    }

    webpSourcePath = tempImgPath;
  }

  const ffmpegArgs = [
    "-i", webpSourcePath,
    "-c:v", "libwebp",
    "-quality", "80",
    "-compression_level", "6",
    "-preset", "picture",
    "-y", outputPath,
  ];

  try {
    execSync(`"${FFMPEG_PATH}" -version`, { stdio: "ignore" });
  } catch (err) {
    throw new Error(`FFmpeg not found at ${FFMPEG_PATH}`);
  }

  const timer = startTimer("Starting image compression via FFmpeg...");

  try {
    await execFileAsync(FFMPEG_PATH, ffmpegArgs);
    timer.stop();
    if (tempImgPath && fs.existsSync(tempImgPath)) fs.unlinkSync(tempImgPath);
    return outputPath;
  } catch (err) {
    timer.stop();
    if (tempImgPath && fs.existsSync(tempImgPath)) fs.unlinkSync(tempImgPath);
    throw new Error(`Compression failed: ${err.message}`);
  }
}

module.exports = compressImage;
