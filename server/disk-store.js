const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class DiskStore {
  constructor(chunkLength, opts) {
    this.chunkLength = chunkLength;
    this.dir = (opts && opts.path) || path.join(os.tmpdir(), 'ws-chunks-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(this.dir, { recursive: true });
    this.length = Infinity;
    this.closed = false;
  }

  put(index, buf, cb) {
    if (this.closed) return cb(new Error('closed'));
    fs.writeFileSync(path.join(this.dir, String(index)), buf);
    cb(null);
  }

  get(index, opts, cb) {
    if (this.closed) return cb(new Error('closed'));
    const p = path.join(this.dir, String(index));
    let data;
    try { data = fs.readFileSync(p); } catch { data = Buffer.alloc(0); }
    if (opts && opts.offset != null && opts.length != null) {
      data = data.slice(opts.offset, opts.offset + opts.length);
    }
    cb(null, data);
  }

  close(cb) {
    if (this.closed) return cb && cb(null);
    this.closed = true;
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch {}
    if (cb) cb(null);
  }

  destroy(cb) { this.close(cb); }
}

module.exports = DiskStore;
