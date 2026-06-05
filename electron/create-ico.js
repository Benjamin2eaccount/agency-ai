/**
 * Creates a minimal ICO file (16x16 + 32x32 + 256x256) from our PNG data.
 * Uses only Node built-ins — no dependencies.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Reuse the PNG builder from create-icon.js ────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcVal]);
}
function buildPNG(w, h, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixelFn(x, y, w, h);
      const off = y * (1 + w * 3) + 1 + x * 3;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

const BG = [0x1E, 0x3A, 0x5F]; const RING = [0x63, 0x66, 0xf1]; const WHITE = [0xff, 0xff, 0xff];
function pixelFn(x, y, W, H) {
  const nx = x / W, ny = y / H;
  const dx = nx - 0.5, dy = ny - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 0.47 && dist < 0.50) return RING;
  if (dist >= 0.50) return BG;
  const bx = (nx - 0.26) / 0.48, by = (ny - 0.26) / 0.48;
  if (bx >= 0 && bx <= 1 && by >= 0 && by <= 1) {
    const inTop    = by < 0.5 && bx > (0.55 - by * 0.40) && bx < (0.95 - by * 0.50);
    const inBottom = by >= 0.5 && bx > (0.05 + (by - 0.5) * 0.50) && bx < (0.45 + (by - 0.5) * 0.40);
    if (inTop || inBottom) return WHITE;
  }
  return BG;
}

// ── ICO builder (stores each size as a PNG inside the ICO container) ─────────
function buildICO(sizes) {
  const images = sizes.map(s => buildPNG(s, s, pixelFn));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(sizes.length, 4);

  const dirEntrySize = 16;
  let offset = 6 + sizes.length * dirEntrySize;

  const dirEntries = images.map((img, i) => {
    const size = sizes[i];
    const entry = Buffer.alloc(dirEntrySize);
    entry[0] = size >= 256 ? 0 : size;  // width (0 = 256)
    entry[1] = size >= 256 ? 0 : size;  // height
    entry[2] = 0;  // color count
    entry[3] = 0;  // reserved
    entry.writeUInt16LE(1, 4);  // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(img.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += img.length;
    return entry;
  });

  return Buffer.concat([header, ...dirEntries, ...images]);
}

const assetsDir = path.join(__dirname, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const ico = buildICO([16, 32, 48, 256]);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
console.log('icon.ico written:', ico.length, 'bytes (16+32+48+256px)');
