/**
 * Generates electron/assets/icon.png (256x256) using only Node built-ins.
 * Dark blue #1E3A5F background, white lightning bolt, indigo border ring.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── CRC32 ────────────────────────────────────────────────────────────────────
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

// ── PNG builder ──────────────────────────────────────────────────────────────
function buildPNG(w, h, pixelFn) {
  // IHDR: RGB (colour type 2), 8-bit
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;

  // Raw scanlines: filter byte (0) + RGB per pixel
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
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Pixel drawing ────────────────────────────────────────────────────────────
const BG     = [0x1E, 0x3A, 0x5F]; // dark blue
const RING   = [0x63, 0x66, 0xf1]; // indigo
const WHITE  = [0xff, 0xff, 0xff];

function pixelFn(x, y, W, H) {
  // Normalise to [0,1]
  const nx = x / W, ny = y / H;
  // Circle distance from centre
  const dx = nx - 0.5, dy = ny - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Outer indigo ring (r 0.47–0.50)
  if (dist > 0.47 && dist < 0.50) return RING;
  // Outside circle → transparent-ish (use BG)
  if (dist >= 0.50) return BG;

  // Lightning bolt defined as a pixel-art polygon
  // Scaled to sit within a 0.26–0.74 box on each axis
  const bx = (nx - 0.26) / 0.48; // 0→1 within bolt bounding box
  const by = (ny - 0.26) / 0.48;

  if (bx >= 0 && bx <= 1 && by >= 0 && by <= 1) {
    // Top half:  slanted right stripe from top-centre toward mid-right
    // Bottom half: slanted left stripe from mid-left toward bottom-centre
    // Classic lightning bolt shape
    const inTop    = by < 0.5 && bx > (0.55 - by * 0.40) && bx < (0.95 - by * 0.50);
    const inBottom = by >= 0.5 && bx > (0.05 + (by - 0.5) * 0.50) && bx < (0.45 + (by - 0.5) * 0.40);
    if (inTop || inBottom) return WHITE;
  }

  return BG;
}

// ── Write files ───────────────────────────────────────────────────────────────
const assetsDir = path.join(__dirname, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const png256 = buildPNG(256, 256, pixelFn);
const png32  = buildPNG(32,  32,  pixelFn);

fs.writeFileSync(path.join(assetsDir, 'icon.png'), png256);
fs.writeFileSync(path.join(assetsDir, 'icon32.png'), png32);
fs.writeFileSync(path.join(assetsDir, 'icon256.png'), png256);

console.log('Icons written to electron/assets/:');
console.log('  icon.png    ', png256.length, 'bytes (256×256)');
console.log('  icon32.png  ', png32.length,  'bytes (32×32)');
console.log('  icon256.png ', png256.length, 'bytes (256×256 copy)');
