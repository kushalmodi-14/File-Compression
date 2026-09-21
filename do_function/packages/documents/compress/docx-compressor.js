const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { execSync } = require('child_process');

async function compressDocx(inputPath, outputDir, fileName, fileExt, ffmpegPath) {
  const baseName = path.basename(fileName, fileExt);
  const tempExtractDir = path.join(outputDir, `.tmp-${baseName}-docx`);
  const outputPath = path.join(outputDir, `compressed-${baseName}.docx`);

  console.log("Starting DOCX compression (extracting & recompressing images)...");

  try {
    if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
    fs.mkdirSync(tempExtractDir, { recursive: true });

    // Extract the DOCX using adm-zip
    const zip = new AdmZip(inputPath);
    zip.extractAllTo(tempExtractDir, true);

    let logMessage = `🖼  No embedded images found in word/media`;
    const mediaDir = path.join(tempExtractDir, "word", "media");
    
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
          // Recompress using dynamically downloaded ffmpeg
          const args = isJpg ? "-q:v 5" : "-compression_level 9";
          execSync(`"${ffmpegPath}" -i "${filePath}" ${args} -y "${tmpOut}"`, { stdio: 'ignore' });
          
          if (fs.existsSync(tmpOut)) {
            if (fs.statSync(tmpOut).size < fs.statSync(filePath).size) {
              fs.renameSync(tmpOut, filePath);
              recompressedCount++;
            } else {
              fs.unlinkSync(tmpOut);
            }
          }
        } catch (e) {
          if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        }
      }
      logMessage = `🖼  Recompressed ${recompressedCount}/${mediaFiles.length} embedded image(s)`;
    }

    console.log(logMessage);

    // Re-zip the modified contents
    const newZip = new AdmZip();
    newZip.addLocalFolder(tempExtractDir);
    newZip.writeZip(outputPath);

    fs.rmSync(tempExtractDir, { recursive: true, force: true });
    return outputPath;
  } catch (err) {
    if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
    throw new Error(`DOCX compression failed: ${err.message}`);
  }
}

module.exports = compressDocx;
