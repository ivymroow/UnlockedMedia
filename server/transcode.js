const { spawn } = require('child_process');
const path = require('path');

// Try to find ffmpeg
function findFfmpeg() {
  const { execSync } = require('child_process');
  // Try common Unix paths first
  const candidates = [
    '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg',
    process.platform === 'win32' ? path.join(__dirname, '..', 'ffmpeg', 'ffmpeg.exe') : 'ffmpeg',
    'C:\\Users\\depis\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffmpeg.exe',
  ];
  for (const c of candidates) {
    if (!c) continue;
    try { execSync(`${c} -version`, { stdio: 'pipe', timeout: 3000 }); return c; } catch {}
  }
  return null;
}

const FFMPEG = findFfmpeg();
console.log('FFmpeg:', FFMPEG || 'NOT FOUND');

async function transcodeStream(inputStream, req, res) {
  if (!FFMPEG) {
    console.log('FFmpeg not found — streaming without transcoding');
    return null;
  }

  const mime = 'video/mp4';

  // Start FFmpeg: copy video, transcode audio to AAC, output fragmented MP4
  const ff = spawn(FFMPEG, [
    '-i', 'pipe:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-preset', 'ultrafast',
    '-hide_banner',
    '-loglevel', 'error',
    'pipe:1',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  // Pipe input FIRST so FFmpeg has data to work with
  inputStream.pipe(ff.stdin);

  // Capture first chunk, then pipe the rest
  let firstChunk = null;
  const gotFirst = new Promise(resolve => {
    ff.stdout.once('data', chunk => { firstChunk = chunk; resolve(true); });
    setTimeout(() => resolve(false), 10000);
  });

  const ok = await gotFirst;
  if (!ok || !firstChunk) {
    ff.kill();
    return null;
  }

  res.writeHead(200, {
    'Content-Type': mime,
    'Transfer-Encoding': 'chunked',
    'Accept-Ranges': 'bytes',
  });

  // Write first chunk, then pipe the rest
  res.write(firstChunk);
  ff.stdout.pipe(res);

  // Log FFmpeg errors
  let ffLogs = '';
  ff.stderr.on('data', (d) => { ffLogs += d.toString(); });
  ff.on('close', (code) => {
    if (code !== 0) console.log('FFmpeg exit code:', code, ffLogs.slice(-200));
  });

  ff.on('error', () => {});
  ff.stdin.on('error', () => {});
  ff.stdout.on('error', () => {});
  ff.stderr.on('error', () => {});
  ff.stdout.on('end', () => { try { res.end(); } catch {} });

  return ff;
}

module.exports = { transcodeStream, hasFfmpeg: !!FFMPEG };
