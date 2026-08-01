const axios = require('axios');

let apiKey = null;

function setKey(key) { apiKey = key; }
function getKey() { return apiKey || process.env.RD_KEY || ''; }

const RD = axios.create({ baseURL: 'https://api.real-debrid.com/rest/1.0', timeout: 15000 });

function h() { return { Authorization: `Bearer ${getKey()}` }; }

async function checkCached(hash) {
  try {
    const { data } = await RD.get(`/torrents/instantAvailability/${hash}`, { headers: h() });
    return !!(data[hash]?.rd?.length);
  } catch { return false; }
}

async function addMagnet(magnet) {
  const { data } = await RD.post('/torrents/addMagnet', `magnet=${encodeURIComponent(magnet)}`, { headers: { ...h(), 'Content-Type': 'application/x-www-form-urlencoded' } });
  return data.id;
}

async function getInfo(id) {
  const { data } = await RD.get(`/torrents/info/${id}`, { headers: h() });
  return data;
}

async function selectFiles(id, files = 'all') {
  await RD.post(`/torrents/selectFiles/${id}`, `files=${files}`, { headers: { ...h(), 'Content-Type': 'application/x-www-form-urlencoded' } });
  await new Promise(r => setTimeout(r, 1000));
}

async function unrestrict(link) {
  const { data } = await RD.post('/unrestrict/link', `link=${encodeURIComponent(link)}`, { headers: { ...h(), 'Content-Type': 'application/x-www-form-urlencoded' } });
  return data.download;
}

async function waitForDownload(torrentId, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const info = await getInfo(torrentId);
    if (info.status === 'downloaded') return info;
    if (info.status === 'error' || info.status === 'dead') throw new Error('RD download failed: ' + info.status);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('RD download timed out');
}

module.exports = { setKey, getKey, checkCached, addMagnet, getInfo, selectFiles, unrestrict, waitForDownload };
