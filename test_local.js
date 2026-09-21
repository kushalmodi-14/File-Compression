const fs = require("fs");
const path = require("path");

const compressPdf = require("./compressors/compressPdf");
const compressDocx = require("./compressors/compressDocx");
const compressDoc = require("./compressors/compressDoc");
const compressImage = require("./compressors/compressImage");
const compressVideo = require("./compressors/compressVideo");

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function reportResult(startTime, beforeBytes, outputPath) {
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  const outStats = fs.statSync(outputPath);
  const beforeMB = formatMB(beforeBytes);
  const afterMB = formatMB(outStats.size);
  const pctChange = (
    ((outStats.size - beforeBytes) / beforeBytes) *
    100
  ).toFixed(1);

  console.log(`⏱  Done in ${elapsed}s`);
  console.log(
    `📦 ${beforeMB} MB → ${afterMB} MB (${pctChange > 0 ? "+" : ""}${pctChange}%)`,
  );
  console.log(`✅ Output: ${outputPath}`);
}

async function compressLocal(inputPath) {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found at ${inputPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(inputPath);
  const sizeMB = stats.size / (1024 * 1024);
  const fileName = path.basename(inputPath);
  const fileExt = path.extname(fileName).toLowerCase();

  console.log(`\n📂 File chosen: ${fileName} (${sizeMB.toFixed(2)} MB)`);

  const isImage = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".heic",
    ".heif",
    ".svg",
    ".webp",
  ].includes(fileExt);
  const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(fileExt);
  const isPdf = fileExt === ".pdf";
  const isDocx = fileExt === ".docx";
  const isDoc = fileExt === ".doc";

  if (!isImage && !isVideo && !isPdf && !isDocx && !isDoc) {
    console.error(`Error: Unsupported file type ${fileExt}`);
    process.exit(1);
  }

  const outputDir = path.join(__dirname, "after-processed");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const startTime = performance.now();
  let outputPath;

  try {
        switch (true) {
      case isPdf:
        outputPath = await compressPdf(inputPath, outputDir, fileName, fileExt);
        break;

      case isDocx:
        outputPath = await compressDocx(inputPath, outputDir, fileName, fileExt);
        break;

      case isDoc:
        outputPath = await compressDoc(inputPath, outputDir, stats, fileName, fileExt);
        break;

      case isImage:
        outputPath = await compressImage(inputPath, outputDir, fileName, fileExt);
        break;

      case isVideo:
        outputPath = await compressVideo(inputPath, outputDir, stats, fileName, fileExt);
        break;

      default:
        throw new Error(`Unsupported file type ${fileExt}`);
    }

    reportResult(startTime, stats.size, outputPath);
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

const inputFile = process.argv[2];

if (!inputFile) {
  console.log(`Usage: npm run dev -- <filename>`);
  const files = fs
    .readdirSync(__dirname)
    .filter(
      (f) =>
        !f.startsWith(".") &&
        ![
          "node_modules",
          "package.json",
          "package-lock.json",
          "index.js",
          "test_local.js",
          "output",
          "compressors",
          "after-processed"
        ].includes(f),
    );
  if (files.length === 0) {
    console.log(`(No media files found)`);
  } else {
    files.forEach((f) => console.log(` - ${f}`));
  }
  process.exit(0);
} else {
  compressLocal(inputFile);
}