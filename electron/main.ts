import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { dbManager } from '../src/server/db'

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()

  // IPC Handlers
  ipcMain.handle('connect-database', async (_, config) => {
    return dbManager.connect(config);
  });

  ipcMain.handle('test-connection', async (_, config) => {
    // Reuse connect logic but maybe don't keep it persistent? 
    // For now, simple connect check.
    // In a real app, we might want to close this connection immediately.
    // But dbManager.connect stores state. 
    // Let's assume test-connection just tries to connect and if successful, returns true.
    // Ideally we'd have a separate test method, but connect works for now.
    return dbManager.connect(config);
  });

  ipcMain.handle('list-tables', async () => {
    return dbManager.listTables();
  });

  ipcMain.handle('get-table-data', async (_, tableName) => {
    return dbManager.getTableData(tableName);
  });

  ipcMain.handle('add-row', async (_, { tableName, row }) => {
    return dbManager.addRow(tableName, row);
  });

  ipcMain.handle('update-row', async (_, { tableName, row, primaryKeyColumn, primaryKeyValue }) => {
    return dbManager.updateRow(tableName, row, primaryKeyColumn, primaryKeyValue);
  });

  ipcMain.handle('delete-row', async (_, { tableName, primaryKeyColumn, primaryKeyValue }) => {
    return dbManager.deleteRow(tableName, primaryKeyColumn, primaryKeyValue);
  });

  ipcMain.handle('create-table', async (_, { tableName, columns }) => {
    return dbManager.createTable(tableName, columns);
  });

  ipcMain.handle('drop-table', async (_, tableName) => {
    return dbManager.dropTable(tableName);
  });

  ipcMain.handle('get-table-structure', async (_, tableName) => {
    return dbManager.getTableStructure(tableName);
  });

  ipcMain.handle('update-table-structure', async (_, { tableName, actions }) => {
    return dbManager.updateTableStructure(tableName, actions);
  });

  ipcMain.handle('execute-query', async (_, query) => {
    return dbManager.executeQuery(query);
  });
})
