const { app, BrowserWindow, Menu, Tray, shell, nativeImage } = require('electron')
const path = require('path')

let mainWindow
let tray

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
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

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

app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
