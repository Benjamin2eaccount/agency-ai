const { app, BrowserWindow, Menu, Tray, shell, nativeImage, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

let mainWindow
let tray

// ── Auto-updater config ───────────────────────────────────────────────────────
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://www.agencyai.info/update/',
})
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('update-available', () => {
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      window.showToast && window.showToast('Update beschikbaar! Wordt gedownload...', 'info')
    `).catch(() => {})
  }
})

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update gereed',
    message: 'Agency AI is bijgewerkt. Herstart om de update te installeren.',
    buttons: ['Nu herstarten', 'Later'],
    defaultId: 0,
  }).then(result => {
    if (result.response === 0) autoUpdater.quitAndInstall()
  })
})

autoUpdater.on('error', (err) => {
  console.warn('[AutoUpdater] Error:', err.message)
})

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Agency AI',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    autoHideMenuBar: true,
  })

  mainWindow.loadURL('https://www.agencyai.info/app/')

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // Check for updates 3s after launch so the window is fully loaded
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    }, 3000)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── System tray ───────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png')
  tray = new Tray(iconPath)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Agency AI openen',
      click: () => {
        if (mainWindow) mainWindow.show()
        else createWindow()
      }
    },
    { type: 'separator' },
    {
      label: 'Inbox',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.loadURL('https://www.agencyai.info/app/#inbox')
        }
      }
    },
    {
      label: 'Nieuwe run starten',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.loadURL('https://www.agencyai.info/app/#runs')
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Afsluiten',
      click: () => app.quit()
    },
  ])

  tray.setToolTip('Agency AI')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (mainWindow) mainWindow.show()
    else createWindow()
  })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
