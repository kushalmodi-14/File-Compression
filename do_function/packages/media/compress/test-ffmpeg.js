const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { execFileSync } = require('child_process');
console.log('FFMPEG_PATH:', ffmpeg.path);
try {
  const result = execFileSync(ffmpeg.path, ['-version']);
  console.log('Version out:', result.toString().split('\n')[0]);
} catch(e) {
  console.error(e.message);
}
