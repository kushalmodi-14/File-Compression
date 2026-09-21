const { execFile, execSync, exec } = require("child_process");
const util = require("util");
const fs = require("fs");
const path = require("path");

const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);

const FFMPEG_PATH = "/usr/bin/ffmpeg";
const FFPROBE_PATH = "/usr/bin/ffprobe";
const HEIF_CONVERT_PATH = "/usr/bin/heif-convert";
const GS_PATH = "/usr/bin/gs";
const UNZIP_PATH = "/usr/bin/unzip";
const ZIP_PATH = "/usr/bin/zip";
const LIBREOFFICE_PATH = "/usr/bin/soffice";
const DOC_CONVERT_TIMEOUT_MS = 5 * 60 * 1000;

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

function checkBinary(binPath) {
  return fs.existsSync(binPath);
}

module.exports = {
  execAsync,
  execFileAsync,
  execSync,
  fs,
  path,
  FFMPEG_PATH,
  FFPROBE_PATH,
  HEIF_CONVERT_PATH,
  GS_PATH,
  UNZIP_PATH,
  ZIP_PATH,
  LIBREOFFICE_PATH,
  DOC_CONVERT_TIMEOUT_MS,
  startTimer,
  checkBinary,
};
