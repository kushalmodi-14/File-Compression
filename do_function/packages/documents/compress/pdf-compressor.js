const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function compressPdf(inputPath, outputDir, fileName, fileExt, gsPath) {
  const baseName = path.basename(fileName, fileExt);
  const outputPath = path.join(outputDir, `compressed-${baseName}.pdf`);

  console.log("Starting PDF compression via Ghostscript...");

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

  try {
    // Join the arguments safely
    const argsStr = gsArgs.map(arg => `"${arg}"`).join(" ");
    execSync(`"${gsPath}" ${argsStr}`, { stdio: 'ignore' });
    
    if (!fs.existsSync(outputPath)) {
      throw new Error("Output file was not created.");
    }
    
    return outputPath;
  } catch (err) {
    throw new Error(`PDF compression failed: ${err.message}`);
  }
}

module.exports = compressPdf;
