const { checkBinary, UNZIP_PATH, ZIP_PATH, FFMPEG_PATH, path, fs, startTimer, execAsync, execSync } = require("./utils");

async function compressDocx(inputPath, outputDir, fileName, fileExt) {
  if (!checkBinary(UNZIP_PATH) || !checkBinary(ZIP_PATH)) {
    throw new Error(`unzip/zip not found. Install them with:\n  sudo apt install unzip zip`);
  }
  try {
    execSync(`"${FFMPEG_PATH}" -version`, { stdio: "ignore" });
  } catch (err) {
    throw new Error(`FFmpeg not found at ${FFMPEG_PATH}`);
  }

  const baseName = path.basename(fileName, fileExt);
  const tempDir = path.join(outputDir, `.tmp-${baseName}-docx`);
  const outputPath = path.join(outputDir, `compressed-${baseName}.docx`);

  const timer = startTimer("Starting DOCX compression (extracting & recompressing images)...");

  try {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
    fs.mkdirSync(tempDir, { recursive: true });

    await execAsync(`"${UNZIP_PATH}" -q "${inputPath}" -d "${tempDir}"`);

    let logMessage = `🖼  No embedded images found in word/media`;
    const mediaDir = path.join(tempDir, "word", "media");
    if (fs.existsSync(mediaDir)) {
      const mediaFiles = fs.readdirSync(mediaDir);
      let recompressedCount = 0;

      for (const file of mediaFiles) {
        const ext = path.extname(file).toLowerCase();
        const isJpg = ext === ".jpg" || ext === ".jpeg";
        const isPng = ext === ".png";
        if (!isJpg && !isPng) continue;

        const filePath = path.join(mediaDir, file);
        const tmpOut = filePath + ".tmp" + ext;

        try {
          await execAsync(`"${FFMPEG_PATH}" -i "${filePath}" ${isJpg ? "-q:v 5" : "-compression_level 9"} -y "${tmpOut}"`);
          if (fs.statSync(tmpOut).size < fs.statSync(filePath).size) {
            fs.renameSync(tmpOut, filePath);
            recompressedCount++;
          } else {
            fs.unlinkSync(tmpOut);
          }
        } catch (e) {
          if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        }
      }
      logMessage = `🖼  Recompressed ${recompressedCount}/${mediaFiles.length} embedded image(s)`;
    }

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    await execAsync(`"${ZIP_PATH}" -q -r -X "${outputPath}" .`, { cwd: tempDir });

    timer.stop();
    console.log(logMessage);
    fs.rmSync(tempDir, { recursive: true });
    return outputPath;
  } catch (err) {
    timer.stop();
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
    throw new Error(`DOCX compression failed: ${err.message}`);
  }
}

module.exports = compressDocx;
