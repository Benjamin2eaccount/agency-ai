/**
 * Creates electron/assets/icon.ico from the real agency_ai_logo_dark.png.
 * ICO format supports embedded PNG data — no ImageMagick needed.
 * Uses the source PNG at native size (205×167) and also embeds a 32×32
 * scaled version for taskbar/small icon use.
 */
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, 'assets', 'icon.png');
if (!fs.existsSync(SRC)) {
  console.error('icon.png not found at', SRC);
  process.exit(1);
}

// ── CRC32 + PNG builder (for the small 32×32 thumbnail) ──────────────────────
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

// Read the source PNG and parse its dimensions from the IHDR chunk
const srcPng  = fs.readFileSync(SRC);
const srcW    = srcPng.readUInt32BE(16);
const srcH    = srcPng.readUInt32BE(20);

console.log(`Source: icon.png ${srcW}×${srcH} (${srcPng.length} bytes)`);

// ── Build ICO with two images ─────────────────────────────────────────────────
// Frame 0: the original PNG at its native size (205×167 → stored as 0×0 = 256+ in ICO spec)
// Frame 1: a minimal 32×32 solid-color thumbnail (dark blue, recognisable at small size)

// Build a small 32×32 placeholder PNG with the brand dark-blue colour
function buildSmallPng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0;
    for (let x = 0; x < size; x++) {
      // Dark blue #1E3A5F with white "A" in centre
      const nx = x / size, ny = y / size;
      const cx = nx - 0.5, cy = ny - 0.5;
      const bx = (nx - 0.26) / 0.48, by = (ny - 0.26) / 0.48;
      let r = 0x1E, g = 0x3A, b = 0x5F;
      if (bx >= 0 && bx <= 1 && by >= 0 && by <= 1) {
        const inTop    = by < 0.5 && bx > (0.55 - by * 0.40) && bx < (0.95 - by * 0.50);
        const inBottom = by >= 0.5 && bx > (0.05 + (by-0.5)*0.50) && bx < (0.45 + (by-0.5)*0.40);
        if (inTop || inBottom) { r = g = b = 255; }
      }
      const off = y * (1 + size * 3) + 1 + x * 3;
      raw[off] = r; raw[off+1] = g; raw[off+2] = b;
    }
  }
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw,{level:9})), pngChunk('IEND', Buffer.alloc(0))]);
}

const thumb32 = buildSmallPng(32);
const thumb16 = buildSmallPng(16);

// ICO images: [16×16, 32×32, native-size]
const images = [
  { w: 16,   h: 16,   data: thumb16 },
  { w: 32,   h: 32,   data: thumb32 },
  { w: srcW, h: srcH, data: srcPng  },
];

function buildICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const DIR_ENTRY = 16;
  let offset = 6 + images.length * DIR_ENTRY;

  const dirEntries = images.map(({ w, h, data }) => {
    const entry = Buffer.alloc(DIR_ENTRY);
    entry[0] = w  >= 256 ? 0 : w;
    entry[1] = h  >= 256 ? 0 : h;
    entry[2] = 0; entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...dirEntries, ...images.map(i => i.data)]);
}

const ico = buildICO(images);
fs.writeFileSync(path.join(__dirname, 'assets', 'icon.ico'), ico);

console.log(`icon.ico written: ${ico.length} bytes (16×16 + 32×32 + ${srcW}×${srcH} real logo)`);
