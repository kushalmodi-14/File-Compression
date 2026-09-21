const { checkBinary, LIBREOFFICE_PATH, path, fs, startTimer, execAsync, DOC_CONVERT_TIMEOUT_MS } = require("./utils");
const compressDocx = require("./compressDocx");

async function compressDoc(inputPath, outputDir, stats, fileName, fileExt) {
  if (!checkBinary(LIBREOFFICE_PATH)) {
    throw new Error(`LibreOffice not found at ${LIBREOFFICE_PATH}. Install it with:\n  sudo apt install libreoffice`);
  }

  const baseName = path.basename(fileName, fileExt);
  const convertDir = path.join(outputDir, `.tmp-${baseName}-convert`);

  const timer = startTimer("Converting legacy .doc → .docx via LibreOffice...");

  if (stats.size > 1 * 1024 * 1024) {
    console.log(`⚠️  Large .doc detected (${(stats.size / 1024 / 1024).toFixed(1)} MB). LibreOffice conversion time scales with page count — this may take 1–10+ minutes for documents with hundreds of pages. Timeout is set to 5 minutes.`);
  }

  try {
    if (fs.existsSync(convertDir)) fs.rmSync(convertDir, { recursive: true });
    fs.mkdirSync(convertDir, { recursive: true });

    const loProfile = path.join(convertDir, "lo_profile");
    fs.mkdirSync(loProfile, { recursive: true });

    await execAsync(`"${LIBREOFFICE_PATH}" "-env:UserInstallation=file://${loProfile}" --headless --invisible --nocrashreport --nodefault --nofirststartwizard --nologo --norestore --convert-to docx --outdir "${convertDir}" "${inputPath}"`, { timeout: DOC_CONVERT_TIMEOUT_MS });

    const convertedPath = path.join(convertDir, `${baseName}.docx`);
    if (!fs.existsSync(convertedPath)) {
      timer.stop();
      fs.rmSync(convertDir, { recursive: true });
      throw new Error("LibreOffice conversion did not produce a .docx file");
    }

    timer.stop();
    console.log("🔄 Converted legacy .doc → .docx, now compressing...");

    const finalOutputPath = await compressDocx(convertedPath, outputDir, `${baseName}.docx`, ".docx");
    
    fs.rmSync(convertDir, { recursive: true, force: true });
    return finalOutputPath;
  } catch (err) {
    timer.stop();
    if (fs.existsSync(convertDir)) fs.rmSync(convertDir, { recursive: true });
    throw new Error(`.doc conversion failed: ${err.message}`);
  }
}

module.exports = compressDoc;
