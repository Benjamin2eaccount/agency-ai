/**
 * Launcher: strips ELECTRON_RUN_AS_NODE so Electron starts as a real GUI app.
 * Run via: node launch.js   (or npm start, which calls this)
 */
const { spawn } = require('child_process');
const path = require('path');

const electronBin = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, [path.join(__dirname)], {
  env,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('close', (code, signal) => {
  if (signal) { console.error('Electron exited with signal', signal); process.exit(1); }
  process.exit(code || 0);
});
