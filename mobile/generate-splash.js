/**
 * Generates mobile/assets/splash.png:
 * 2732x2732 dark #0a0a0f background with the Agency AI logo centered at 400px.
 * Run from mobile/: node generate-splash.js
 */
const Jimp = require('jimp')
const path = require('path')
const fs   = require('fs')

const SRC        = path.join(__dirname, '..', 'Images', 'agency_ai_logo_dark.png')
const CANVAS_SIZE = 2732
const LOGO_SIZE   = 400
const BG_COLOR    = 0x0a0a0fff  // #0a0a0f opaque

async function generateSplash() {
  if (!fs.existsSync(SRC)) {
    console.error('Source PNG not found:', SRC)
    process.exit(1)
  }

  fs.mkdirSync(path.join(__dirname, 'assets'), { recursive: true })

  // Dark background canvas
  const canvas = new Jimp(CANVAS_SIZE, CANVAS_SIZE, BG_COLOR)

  // Logo resized to 400×400 and composited centred
  const logo = await Jimp.read(SRC)
  logo.resize(LOGO_SIZE, LOGO_SIZE)

  const x = (CANVAS_SIZE - LOGO_SIZE) / 2
  const y = (CANVAS_SIZE - LOGO_SIZE) / 2

  canvas.composite(logo, x, y)

  const outPath = path.join(__dirname, 'assets', 'splash.png')
  await canvas.writeAsync(outPath)

  console.log(`✓ splash.png — ${CANVAS_SIZE}x${CANVAS_SIZE} (logo at ${LOGO_SIZE}px centred)`)
}

generateSplash().catch(err => { console.error(err); process.exit(1) })
