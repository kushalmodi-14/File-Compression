const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const { downloadFile, uploadFile } = require('./storage');
const { updateMediaStatus } = require('./db');
const compressDocx = require('./docx-compressor');
const compressPdf = require('./pdf-compressor');

const FFMPEG_PATH = '/tmp/ffmpeg';
const FFMPEG_URL = 'https://registry.npmjs.org/@ffmpeg-installer/linux-x64/-/linux-x64-4.1.0.tgz';
const GS_PATH = '/tmp/gs';
const GS_URL = 'https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs1000/ghostscript-10.0.0-linux-x86_64.tgz';

async function downloadAndExtract(url, binaryName) {
  const archivePath = `/tmp/${binaryName}.tgz`;
  const response = await axios({ method: 'get', url, responseType: 'stream' });
  const writer = fs.createWriteStream(archivePath);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  
  execSync(`tar -xzf ${archivePath} --no-same-owner -C /tmp --strip-components=1 ${binaryName === 'gs' ? 'ghostscript-10.0.0-linux-x86_64/gs-1000-linux-x86_64' : 'package/' + binaryName}`);
  if (binaryName === 'gs') {
    fs.renameSync('/tmp/gs-1000-linux-x86_64', `/tmp/${binaryName}`);
  }
  fs.chmodSync(`/tmp/${binaryName}`, 0o755);
  fs.unlinkSync(archivePath);
}

async function ensureFFmpeg() {
  if (!fs.existsSync(FFMPEG_PATH)) {
    console.log("Downloading FFmpeg binary for DOCX media compression...");
    await downloadAndExtract(FFMPEG_URL, 'ffmpeg');
    console.log("FFmpeg ready.");
  }
}

async function ensureGhostscript() {
  if (!fs.existsSync(GS_PATH)) {
    console.log("Downloading Ghostscript binary for PDF compression...");
    await downloadAndExtract(GS_URL, 'gs');
    console.log("Ghostscript ready.");
  }
}

async function main(args) {
  let mediaId = args.mediaId;
  let key = args.key;
  
  if (!key) {
    return { statusCode: 400, body: "Missing 'key' argument" };
  }
  
  const ext = path.extname(key).toLowerCase();
  
  try {
    // 1. Ensure required binaries
    if (ext === '.docx') {
      await ensureFFmpeg();
    } else if (ext === '.pdf') {
      await ensureGhostscript();
    }
    
    // 2. Download original file to /tmp
    const localInputPath = `/tmp/${path.basename(key)}`;
    console.log(`Downloading ${key} to ${localInputPath}`);
    await downloadFile(key, localInputPath);
    
    let localOutputPath;
    
    // 3. Compress based on extension
    if (ext === '.docx') {
      localOutputPath = await compressDocx(localInputPath, '/tmp', path.basename(key), ext, FFMPEG_PATH);
    } else if (ext === '.pdf') {
      localOutputPath = await compressPdf(localInputPath, '/tmp', path.basename(key), ext, GS_PATH);
    } else {
      throw new Error(`Unsupported document type: ${ext}`);
    }
    
    // 4. Upload compressed file
    let dir = path.dirname(key);
    if (dir.startsWith('original')) {
      dir = dir.replace(/^original\/?/, '');
    }
    const outDir = dir ? `after-compression/${dir}` : 'after-compression';
    const outKey = `${outDir}/${path.basename(key)}`;
    console.log(`Uploading compressed file to ${outKey}`);
    await uploadFile(localOutputPath, outKey);
    
    // 5. Update DB
    if (mediaId) {
      await updateMediaStatus(mediaId, 'COMPRESSED', outKey);
    }
    
    // Cleanup
    if (fs.existsSync(localInputPath)) fs.unlinkSync(localInputPath);
    if (fs.existsSync(localOutputPath)) fs.unlinkSync(localOutputPath);
    
    return {
      statusCode: 200,
      body: { message: "Compression successful", outKey }
    };
    
  } catch (err) {
    console.error("Compression failed:", err);
    if (mediaId) {
      await updateMediaStatus(mediaId, 'FAILED', null);
    }
    return {
      statusCode: 500,
      body: { error: err.message }
    };
  }
}

exports.main = main;
