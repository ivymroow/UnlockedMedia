const torrent = require('./torrent');
const { transcodeStream, hasFfmpeg } = require('./transcoder');
const { SUBTITLE_EXTENSIONS } = require('../config/constants');

async function streamInfoHash(infoHash, fileIndex, req, res) {
  const link = torrent.makeLink(infoHash, 'stream');
  const stream = torrent.getOrStart(link);

  await torrent.waitForData(stream, 25_000);

  let file = stream.files?.[fileIndex] || torrent.getVideo(stream);
  if (!file && stream.files?.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    file = stream.files?.[fileIndex] || torrent.getVideo(stream);
  }
  if (!file && stream.files?.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    file = stream.files?.[fileIndex] || torrent.getVideo(stream);
  }

  if (!file) {
    const names = stream.files?.map(item => item.name).join(', ') || 'none';
    res.status(404).json({ error: `No video file found. Files: ${names}` });
    return;
  }

  if (stream.numPeers === 0 && stream.progress === 0) {
    await Promise.race([
      new Promise(resolve => {
        stream.once('wire', resolve);
        stream.once('download', resolve);
      }),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
  }

  if (hasFfmpeg) {
    const transcoded = await transcodeStream(file.createReadStream(), req, res);
    if (transcoded) return;
  }

  torrent.sendFile(file, req, res);
}

async function listSubtitles(infoHash) {
  const stream = torrent.getOrStart(torrent.makeLink(infoHash, 'subtitles'));
  await torrent.waitForData(stream, 15_000);
  return (stream.files || []).filter(file =>
    SUBTITLE_EXTENSIONS.some(ext => (file.name || '').toLowerCase().endsWith(ext))
  );
}

async function getSubtitle(infoHash, index) {
  const files = await listSubtitles(infoHash);
  const file = files[Number(index)];
  if (!file) return null;

  const chunks = [];
  const readable = file.createReadStream();
  for await (const chunk of readable) chunks.push(chunk);

  const text = Buffer.concat(chunks).toString('utf8');
  if (text.startsWith('WEBVTT')) return text;
  return `WEBVTT\n\n${text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
}

module.exports = { streamInfoHash, listSubtitles, getSubtitle };
