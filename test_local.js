const { execFile, execSync, exec } = require("child_process");
const util = require("util");
const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);
const fs = require("fs");
const path = require("path");

function startTimer(message) {
  const startTime = performance.now();
  process.stdout.write(`\r⏳ ${message} [00:00]`);
  const interval = setInterval(() => {
    const elapsed = Math.floor((performance.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    process.stdout.write(`\r⏳ ${message} [${mins}:${secs}]`);
  }, 1000);

  return {
    stop: () => {
      clearInterval(interval);
      process.stdout.write("\n");
    },
  };
}

const FFMPEG_PATH = "/usr/bin/ffmpeg";
const FFPROBE_PATH = "/usr/bin/ffprobe";
const HEIF_CONVERT_PATH = "/usr/bin/heif-convert"; // from `sudo apt install libheif-examples`
const GS_PATH = "/usr/bin/gs"; // from `sudo apt install ghostscript`
const UNZIP_PATH = "/usr/bin/unzip"; // from `sudo apt install unzip`
const ZIP_PATH = "/usr/bin/zip"; // from `sudo apt install zip`
const LIBREOFFICE_PATH = "/usr/bin/soffice"; // from `sudo apt install libreoffice`
// Hard timeout for .doc → .docx conversion. LibreOffice conversion time
// scales with PAGE COUNT, not file size — a 2MB, 734-page document takes
// many minutes. This cap prevents an infinite hang; raise it if you
// regularly process very large documents.
const DOC_CONVERT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
function checkBinary(binPath) {
  return fs.existsSync(binPath);
}

function getVideoBitrate(inputPath) {
  try {
    const result = execSync(
      `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=bit_rate -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
    )
      .toString()
      .trim();

    const kbps = parseInt(result) / 1000;
    if (!isNaN(kbps) && kbps > 0) return kbps;

    const fallback = execSync(
      `"${FFPROBE_PATH}" -v error -show_entries format=bit_rate -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
    )
      .toString()
      .trim();
    return parseInt(fallback) / 1000;
  } catch (e) {
    console.warn("⚠️  Could not probe bitrate, using default settings.");
    return 5000;
  }
}

// NEW: get source height so we never upscale
function getVideoHeight(inputPath) {
  try {
    const result = execSync(
      `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
    )
      .toString()
      .trim();
    const h = parseInt(result);
    return !isNaN(h) && h > 0 ? h : 2160;
  } catch (e) {
    return 2160;
  }
}

function getCompressionSettings(bitrateKbps, sizeMB) {
  console.log(
    `📊 Source: ${bitrateKbps.toFixed(0)} kbps | ${sizeMB.toFixed(2)} MB`,
  );

  // Tiers are keyed off bitrate DENSITY (kbps), not raw file size. A long
  // video that's already lightly compressed (e.g. 595 kbps over 6 minutes
  // = ~28 MB) is NOT the same problem as a short, high-bitrate 4K clip
  // that happens to also be 28 MB — the old sizeMB-based buckets treated
  // them the same and over-squeezed the already-lean source. The lower
  // the source bitrate already is, the less further compression it needs
  // (or can survive) without visible quality loss.
  if (bitrateKbps > 8000) {
    return {
      crf: 25,
      preset: "slow",
      maxrate: Math.floor(bitrateKbps * 0.45),
    };
  } else if (bitrateKbps > 4000) {
    return {
      crf: 23,
      preset: "slow",
      maxrate: Math.floor(bitrateKbps * 0.6),
    };
  } else if (bitrateKbps > 2000) {
    return {
      crf: 22,
      preset: "slow",
      maxrate: Math.floor(bitrateKbps * 0.75),
    };
  } else if (bitrateKbps > 1000) {
    return {
      crf: 21,
      preset: "slow",
      maxrate: Math.floor(bitrateKbps * 0.9),
    };
  } else {
    // Source is already lean (<1000 kbps). Don't chase further size
    // reduction at the cost of quality — let a strong preset squeeze out
    // real inefficiency (most phone/camera encoders are far from optimal)
    // while a generous maxrate acts only as a safety net against runaway
    // growth, not a hard cut.
    return {
      crf: 20,
      preset: "slower",
      maxrate: Math.ceil(bitrateKbps * 1.3),
    };
  }
}

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

// PDF: Ghostscript recompresses embedded images, downsamples resolution,
// and can subset fonts. /ebook is a good default balance of size vs
// quality; scanned/image-heavy PDFs shrink the most, text-only PDFs won't
// shrink much since there's little to recompress.
async function compressPdf(inputPath, outputDir, stats, fileName, fileExt) {
  if (!checkBinary(GS_PATH)) {
    console.error(
      `Error: Ghostscript not found at ${GS_PATH}. Install it with:\n  sudo apt install ghostscript`,
    );
    process.exit(1);
  }

  const outputPath = path.join(
    outputDir,
    `compressed-${path.basename(fileName, fileExt)}.pdf`,
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

  const startTime = performance.now();
  const timer = startTimer("Starting PDF compression via Ghostscript...");

  try {
    await execFileAsync(GS_PATH, gsArgs);
    timer.stop();
    reportResult(startTime, stats.size, outputPath);
    process.exit(0);
  } catch (err) {
    timer.stop();
    console.error(`PDF compression failed: ${err.message}`);
    process.exit(1);
  }
}

// DOCX: a .docx is already a zip archive. Real size savings come from
// recompressing the embedded images (Word usually stores them at full
// camera resolution even when displayed small), not from the zip
// compression itself. Approach: unzip to a temp dir, recompress every
// image under word/media/ with ffmpeg (same encoder it already uses for
// standalone images, quality-matched), rezip in place, clean up.
async function compressDocx(inputPath, outputDir, stats, fileName, fileExt) {
  if (!checkBinary(UNZIP_PATH) || !checkBinary(ZIP_PATH)) {
    console.error(
      `Error: unzip/zip not found. Install them with:\n  sudo apt install unzip zip`,
    );
    process.exit(1);
  }
  try {
    execSync(`"${FFMPEG_PATH}" -version`, { stdio: "ignore" });
  } catch (err) {
    console.error(`Error: FFmpeg not found at ${FFMPEG_PATH}`);
    process.exit(1);
  }

  const baseName = path.basename(fileName, fileExt);
  const tempDir = path.join(outputDir, `.tmp-${baseName}-docx`);
  const outputPath = path.join(outputDir, `compressed-${baseName}.docx`);

  const startTime = performance.now();
  const timer = startTimer(
    "Starting DOCX compression (extracting & recompressing images)...",
  );

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
        if (!isJpg && !isPng) continue; // leave gifs/emf/wmf/etc. untouched

        const filePath = path.join(mediaDir, file);
        const tmpOut = filePath + ".tmp" + ext;

        try {
          await execAsync(
            `"${FFMPEG_PATH}" -i "${filePath}" ${isJpg ? "-q:v 5" : "-compression_level 9"} -y "${tmpOut}"`,
          );
          // Only keep the recompressed version if it's actually smaller.
          if (fs.statSync(tmpOut).size < fs.statSync(filePath).size) {
            fs.renameSync(tmpOut, filePath);
            recompressedCount++;
          } else {
            fs.unlinkSync(tmpOut);
          }
        } catch (e) {
          if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
          // Skip images ffmpeg can't handle (e.g. CMYK JPEGs); keep original.
        }
      }
      logMessage = `🖼  Recompressed ${recompressedCount}/${mediaFiles.length} embedded image(s)`;
    }

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    // -X drops extra file attributes some zip tools choke on; run from
    // inside tempDir so paths in the archive stay relative (docx requires
    // this).
    await execAsync(`"${ZIP_PATH}" -q -r -X "${outputPath}" .`, {
      cwd: tempDir,
    });

    timer.stop();
    console.log(logMessage);
    reportResult(startTime, stats.size, outputPath);
    fs.rmSync(tempDir, { recursive: true });
    process.exit(0);
  } catch (err) {
    timer.stop();
    console.error(`DOCX compression failed: ${err.message}`);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
    process.exit(1);
  }
}

// Legacy .doc: this is the old OLE/Compound-File binary format, not a zip
// archive, so the unzip/recompress/rezip trick used for .docx can't touch
// it directly. Convert it to .docx via LibreOffice headless first, then
// run it through the same image-recompression pipeline as compressDocx.
//
// The key to fast, reliable conversion is giving each run its OWN isolated
// user profile via -env:UserInstallation. Without this, soffice tries to
// lock the global ~/.config/libreoffice profile — if a previous run crashed
// or another instance is open, it blocks indefinitely waiting for the lock.
// With an isolated profile in a fresh temp dir, there is no shared lock
// and conversion typically finishes in 5-15s regardless of .doc size.
async function compressDoc(inputPath, outputDir, stats, fileName, fileExt) {
  if (!checkBinary(LIBREOFFICE_PATH)) {
    console.error(
      `Error: LibreOffice not found at ${LIBREOFFICE_PATH}. Install it with:\n  sudo apt install libreoffice`,
    );
    process.exit(1);
  }

  const baseName = path.basename(fileName, fileExt);
  const convertDir = path.join(outputDir, `.tmp-${baseName}-convert`);

  const timer = startTimer(
    "Converting legacy .doc → .docx via LibreOffice...",
  );

  // Warn early: LibreOffice conversion time scales with PAGE COUNT, not
  // file size. A 2MB .doc can be 700+ pages and take several minutes.
  // Nothing to do here except set expectations.
  if (stats.size > 1 * 1024 * 1024) {
    console.log(
      `⚠️  Large .doc detected (${(stats.size / 1024 / 1024).toFixed(1)} MB). LibreOffice conversion time scales with page count — this may take 1–10+ minutes for documents with hundreds of pages. Timeout is set to 5 minutes.`,
    );
  }

  try {
    if (fs.existsSync(convertDir)) fs.rmSync(convertDir, { recursive: true });
    fs.mkdirSync(convertDir, { recursive: true });

    // Use an isolated per-conversion user profile so soffice never blocks
    // waiting on a global lock. The profile dir is inside convertDir so it
    // gets cleaned up automatically with everything else.
    const loProfile = path.join(convertDir, "lo_profile");
    fs.mkdirSync(loProfile, { recursive: true });

    await execAsync(
      `"${LIBREOFFICE_PATH}" "-env:UserInstallation=file://${loProfile}" --headless --invisible --nocrashreport --nodefault --nofirststartwizard --nologo --norestore --convert-to docx --outdir "${convertDir}" "${inputPath}"`,
      { timeout: DOC_CONVERT_TIMEOUT_MS },
    );

    const convertedPath = path.join(convertDir, `${baseName}.docx`);
    if (!fs.existsSync(convertedPath)) {
      timer.stop();
      console.error(
        "Error: LibreOffice conversion did not produce a .docx file",
      );
      fs.rmSync(convertDir, { recursive: true });
      process.exit(1);
    }

    timer.stop();
    console.log("🔄 Converted legacy .doc → .docx, now compressing...");

    // compressDocx calls process.exit() itself once it finishes, so clean
    // up this conversion temp dir via the synchronous 'exit' event rather
    // than after the call (code after an exiting call never runs).
    process.on("exit", () => {
      if (fs.existsSync(convertDir)) {
        fs.rmSync(convertDir, { recursive: true, force: true });
      }
    });

    return compressDocx(convertedPath, outputDir, stats, fileName, fileExt);
  } catch (err) {
    timer.stop();
    console.error(`.doc conversion failed: ${err.message}`);
    if (fs.existsSync(convertDir)) fs.rmSync(convertDir, { recursive: true });
    process.exit(1);
  }
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

  if (isPdf) {
    return compressPdf(inputPath, outputDir, stats, fileName, fileExt);
  }
  if (isDocx) {
    return compressDocx(inputPath, outputDir, stats, fileName, fileExt);
  }
  if (isDoc) {
    return compressDoc(inputPath, outputDir, stats, fileName, fileExt);
  }

  let outputPath;
  let ffmpegArgs = [];
  let tempImgPath = null; // set if we had to pre-convert a HEIC/HEIF source

  if (isImage) {
    outputPath = path.join(
      outputDir,
      `${path.basename(fileName, fileExt)}.webp`,
    );

    // ffmpeg's built-in HEIC/HEIF demuxer chokes on most real-world files
    // (iPhone HEICs especially), throwing "moov atom not found" as if it
    // were a broken MP4. Route those through heif-convert -> PNG first,
    // then let ffmpeg do the PNG -> WebP step it already handles fine.
    let webpSourcePath = inputPath;
    if (fileExt === ".heic" || fileExt === ".heif") {
      if (!checkBinary(HEIF_CONVERT_PATH)) {
        console.error(
          `Error: heif-convert not found at ${HEIF_CONVERT_PATH}. Install it with:\n  sudo apt install libheif-examples`,
        );
        process.exit(1);
      }

      tempImgPath = path.join(
        outputDir,
        `.tmp-${path.basename(fileName, fileExt)}.jpg`,
      );

      try {
        // JPEG, not PNG: heif-convert's PNG encoder goes through libpng,
        // which on Ubuntu hard-errors on the "incorrect sRGB profile"
        // ICC chunk that iPhone HEICs commonly embed ("libpng error: known
        // incorrect sRGB profile"). JPEG output skips that validation
        // entirely, and the quality loss before the WebP re-encode is
        // negligible.
        execSync(`"${HEIF_CONVERT_PATH}" "${inputPath}" "${tempImgPath}"`, {
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        console.error(`Error: heif-convert failed to decode ${fileName}`);
        console.error((err.stderr || err.stdout || err.message).toString());
        process.exit(1);
      }

      webpSourcePath = tempImgPath;
    }

    ffmpegArgs = [
      "-i",
      webpSourcePath,
      "-c:v",
      "libwebp",
      "-quality",
      "80",
      "-compression_level",
      "6",
      "-preset",
      "picture",
      "-y",
      outputPath,
    ];
  } else if (isVideo) {
    outputPath = path.join(
      outputDir,
      `processed-${path.basename(fileName, fileExt)}.mp4`,
    );

    const bitrateKbps = getVideoBitrate(inputPath);
    const sourceHeight = getVideoHeight(inputPath);
    const { crf, preset, maxrate } = getCompressionSettings(
      bitrateKbps,
      sizeMB,
    );

    // Never upscale: cap at the smaller of 2160 or the source's own height.
    const targetHeight = Math.min(2160, sourceHeight);

    console.log(
      `⚙️  CRF: ${crf} | Preset: ${preset} | Target height: ${targetHeight}p | Maxrate: ${maxrate}k | Bufsize: ${maxrate * 2}k`,
    );

    ffmpegArgs = [
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-crf",
      String(crf),
      "-preset",
      preset,
      "-profile:v",
      "high",
      "-vf",
      `scale=-2:${targetHeight}`,
      "-level",
      "4.1",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-threads",
      "0",
      "-b:v",
      "0",
      "-maxrate",
      `${maxrate}k`,
      "-bufsize",
      `${maxrate * 2}k`,
      "-y",
      outputPath,
    ];
  }

  try {
    execSync(`"${FFMPEG_PATH}" -version`, { stdio: "ignore" });
  } catch (err) {
    console.error(`Error: FFmpeg not found at ${FFMPEG_PATH}`);
    process.exit(1);
  }

  const startTime = performance.now();
  const timer = startTimer(
    `Starting ${isImage ? "image" : "video"} compression via FFmpeg...`,
  );

  try {
    await execFileAsync(FFMPEG_PATH, ffmpegArgs);
    timer.stop();
    reportResult(startTime, stats.size, outputPath);

    if (tempImgPath && fs.existsSync(tempImgPath)) fs.unlinkSync(tempImgPath);
    process.exit(0);
  } catch (err) {
    timer.stop();
    console.error(`Compression failed: ${err.message}`);
    if (tempImgPath && fs.existsSync(tempImgPath)) fs.unlinkSync(tempImgPath);
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