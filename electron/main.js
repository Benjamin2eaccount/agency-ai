const {
  app, BrowserWindow, Menu, Tray,
  shell, dialog, ipcMain, globalShortcut,
} = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs   = require('fs')

let mainWindow = null
let launcher   = null
let tray       = null

// ── Accounts — stored in Electron's userData folder ──────────────────────────
function accountsPath() {
  return path.join(app.getPath('userData'), 'accounts.json')
}

function loadAccounts() {
  const p = accountsPath()
  if (!fs.existsSync(p)) {
    const defaults = [{
      id:       'acc_1',
      name:     'Agency AI — Admin',
      role:     'admin',
      url:      'https://www.agencyai.info/app/',
      color:    '#6366f1',
      lastUsed: null,
    }]
    fs.writeFileSync(p, JSON.stringify(defaults, null, 2))
    return defaults
  }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) }
  catch { return [] }
}

function saveAccounts(list) {
  fs.writeFileSync(accountsPath(), JSON.stringify(list, null, 2))
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-accounts', () => loadAccounts())

ipcMain.handle('open-account', (e, account) => {
  // Stamp lastUsed
  const list = loadAccounts()
  const idx  = list.findIndex(a => a.id === account.id)
  if (idx !== -1) { list[idx].lastUsed = new Date().toISOString(); saveAccounts(list) }

  // Create main window first, close launcher only after it is ready to show
  // (closing launcher before the window exists fires window-all-closed → app quits)
  createMainWindow(account.url, account.id)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (launcher && !launcher.isDestroyed()) {
      launcher.close()
    }
  })
})

ipcMain.handle('add-account', (e, account) => {
  const list  = loadAccounts()
  account.id       = 'acc_' + Date.now()
  account.lastUsed = null
  list.push(account)
  saveAccounts(list)
  return list
})

ipcMain.handle('edit-account', (e, { id, name, role, url, color }) => {
  const list = loadAccounts()
  const idx  = list.findIndex(a => a.id === id)
  if (idx !== -1) Object.assign(list[idx], { name, role, url, color })
  saveAccounts(list)
  return list
})

ipcMain.handle('delete-account', (e, id) => {
  const list = loadAccounts().filter(a => a.id !== id)
  saveAccounts(list)
  return list
})

// ── Auto-updater ──────────────────────────────────────────────────────────────
autoUpdater.setFeedURL({ provider: 'generic', url: 'https://www.agencyai.info/update/' })
autoUpdater.autoDownload         = false  // user-controlled: "Download" button in launcher
autoUpdater.autoInstallOnAppQuit = true

// Helper: broadcast an IPC event to every open window
function sendToAll(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
  if (launcher   && !launcher.isDestroyed())   launcher.webContents.send(channel, payload)
}

autoUpdater.on('update-available',  (info)     => sendToAll('update-available', info))
autoUpdater.on('download-progress', (progress) => sendToAll('update-progress', progress))
autoUpdater.on('update-downloaded', ()         => sendToAll('update-ready'))
autoUpdater.on('error', err => console.warn('[Updater]', err.message))

// IPC — update actions triggered from launcher UI
ipcMain.handle('start-download-update', () => autoUpdater.downloadUpdate())
ipcMain.handle('install-update',        () => autoUpdater.quitAndInstall())
ipcMain.handle('check-for-updates',     () => autoUpdater.checkForUpdates())
ipcMain.handle('get-app-version',       () => app.getVersion())

// ── Launcher window ───────────────────────────────────────────────────────────
function createLauncherWindow() {
  launcher = new BrowserWindow({
    width:  860,
    height: 580,
    title:  'Agency AI — Accounts',
    backgroundColor: '#0a0a0f',
    resizable: false,
    frame: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      // nodeIntegration needed so launcher can use require('electron')
      // This is safe: launcher only loads a local file, never remote content
      nodeIntegration:  true,
      contextIsolation: false,
      partition: 'persist:launcher',
    },
  })
  launcher.loadFile(path.join(__dirname, 'launcher', 'index.html'))
  launcher.on('closed', () => { launcher = null })
}

// ── Main window ───────────────────────────────────────────────────────────────
// Each account gets its own isolated session via its id as the partition key.
// "persist:" prefix means the session (cookies, localStorage) survives restarts.
function createMainWindow(url = 'https://www.agencyai.info/app/', accountId = 'default') {
  mainWindow = new BrowserWindow({
    width:    1400,
    height:   900,
    minWidth: 1000,
    minHeight: 700,
    title:    'Agency AI',
    backgroundColor: '#0a0a0f',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      partition: 'persist:account_' + accountId,
    },
  })

  mainWindow.loadURL(url)
  mainWindow.on('closed', () => { mainWindow = null })
}

// ── System tray ───────────────────────────────────────────────────────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Agency AI openen',
      click: () => {
        if (mainWindow)  mainWindow.show()
        else if (launcher) launcher.show()
        else createLauncherWindow()
      },
    },
    { type: 'separator' },
    {
      label: 'Inbox',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.loadURL('https://www.agencyai.info/app/#inbox') }
      },
    },
    {
      label: 'Nieuwe run starten',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.loadURL('https://www.agencyai.info/app/#runs') }
      },
    },
    { type: 'separator' },
    {
      label: 'Accounts wisselen',
      click: () => { if (mainWindow) mainWindow.close(); createLauncherWindow() },
    },
    { type: 'separator' },
    { label: 'Afsluiten', click: () => app.quit() },
  ])
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'))
  tray.setToolTip('Agency AI')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => {
    if (mainWindow)    mainWindow.show()
    else if (launcher) launcher.show()
    else createLauncherWindow()
  })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createLauncherWindow()   // show launcher first, not the main window
  createTray()

  // Check for updates 3s after launch (launcher is visible by then)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000)

  // ── Global keyboard shortcuts ───────────────────────────────────────────
  // F5 — reload the main app window
  globalShortcut.register('F5', () => {
    if (mainWindow) mainWindow.reload()
  })

  // Ctrl/Cmd+Shift+A — clear impersonation state, close main window, go back to launcher
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Clear impersonation keys BEFORE closing so the partition is clean for next open
      mainWindow.webContents.executeJavaScript(`
        (function() {
          try {
            var keys = Object.keys(localStorage);
            keys.forEach(function(k) {
              if (k === 'currentWorkspace' || k.indexOf('impToken_') === 0) {
                localStorage.removeItem(k);
              }
            });
            sessionStorage.clear();
          } catch(e) {}
        })()
      `).catch(() => {}).finally(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
        createLauncherWindow()
      })
    } else {
      createLauncherWindow()
    }
  })

  // Ctrl/Cmd+Shift+I — toggle DevTools in the main window
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools()
  })

  // F11 — toggle fullscreen
  globalShortcut.register('F11', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })
})

// Unregister all shortcuts when the app is about to quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  const launcherOpen = launcher   && !launcher.isDestroyed()
  const mainOpen     = mainWindow && !mainWindow.isDestroyed()
  if (!launcherOpen && !mainOpen) {
    if (process.platform !== 'darwin') app.quit()
  }
})

app.on('activate', () => {
  if (!mainWindow && !launcher) createLauncherWindow()
})
