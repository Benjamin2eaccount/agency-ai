/**
 * Generates all required iOS icon sizes from the source logo.
 * Run from the mobile/ directory: node generate-icons.js
 */
const Jimp = require('jimp')
const fs   = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'Images', 'agency_ai_logo_dark.png')

const ICON_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024]

async function generateIcons() {
  if (!fs.existsSync(SRC)) {
    console.error('Source PNG not found:', SRC)
    process.exit(1)
  }

  fs.mkdirSync(path.join(__dirname, 'assets', 'icons'), { recursive: true })

  const img = await Jimp.read(SRC)
  console.log(`Source: ${img.getWidth()}x${img.getHeight()}`)

  for (const size of ICON_SIZES) {
    const outPath = path.join(__dirname, 'assets', 'icons', `icon-${size}.png`)
    await img.clone().resize(size, size).writeAsync(outPath)
    console.log(`  ✓ icon-${size}.png`)
  }

  console.log(`\nGenerated ${ICON_SIZES.length} icons in assets/icons/`)
}

generateIcons().catch(err => { console.error(err); process.exit(1) })
