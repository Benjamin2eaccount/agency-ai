/**
 * Creates electron/assets/icon.ico from Images/agency_ai_logo_dark.png.
 * Embeds the PNG directly in ICO format (supported since Windows Vista).
 * Sets the directory entry to 256x256 (width=0, height=0 in the ICO spec)
 * so electron-builder accepts it without errors.
 */
const fs   = require('fs')
const path = require('path')

const srcPath = path.join(__dirname, '..', 'Images', 'agency_ai_logo_dark.png')
if (!fs.existsSync(srcPath)) {
  console.error('Source PNG not found at:', srcPath)
  process.exit(1)
}

const srcPng = fs.readFileSync(srcPath)
console.log('Source:', srcPath, '-', srcPng.length, 'bytes')

function createIco(pngBuffer) {
  const numImages = 1

  // ICONDIR header — 6 bytes
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)          // Reserved — must be 0
  header.writeUInt16LE(1, 2)          // Type: 1 = ICO
  header.writeUInt16LE(numImages, 4)  // Number of images

  // ICONDIRENTRY — 16 bytes
  const entry = Buffer.alloc(16)
  entry.writeUInt8(0, 0)                      // Width:  0 means 256
  entry.writeUInt8(0, 1)                      // Height: 0 means 256
  entry.writeUInt8(0, 2)                      // ColorCount (0 = not used for PNG)
  entry.writeUInt8(0, 3)                      // Reserved
  entry.writeUInt16LE(1, 4)                   // Planes
  entry.writeUInt16LE(32, 6)                  // BitCount (32-bit RGBA)
  entry.writeUInt32LE(pngBuffer.length, 8)    // Size of image data
  entry.writeUInt32LE(6 + 16, 12)             // Offset to image data

  return Buffer.concat([header, entry, pngBuffer])
}

const ico = createIco(srcPng)
const outPath = path.join(__dirname, 'assets', 'icon.ico')
fs.writeFileSync(outPath, ico)
console.log('ICO created:', outPath, '-', ico.length, 'bytes')
