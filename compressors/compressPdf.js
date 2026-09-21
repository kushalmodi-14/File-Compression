const { checkBinary, GS_PATH, path, startTimer, execFileAsync } = require("./utils");

async function compressPdf(inputPath, outputDir, fileName, fileExt) {
  if (!checkBinary(GS_PATH)) {
    throw new Error(`Ghostscript not found at ${GS_PATH}. Install it with:\n  sudo apt install ghostscript`);
  }

  const outputPath = path.join(
    outputDir,
    `compressed-${path.basename(fileName, fileExt)}.pdf`
  );

  const gsArgs = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dPDFSETTINGS=/ebook",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];

  const timer = startTimer("Starting PDF compression via Ghostscript...");

  try {
    await execFileAsync(GS_PATH, gsArgs);
    timer.stop();
    return outputPath;
  } catch (err) {
    timer.stop();
    throw new Error(`PDF compression failed: ${err.message}`);
  }
}

module.exports = compressPdf;
