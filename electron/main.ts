import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import { dbManager } from '../src/server/db'
import { EngineController } from '../src/server/engineManager/engineController'
import { EngineInstance } from '../src/server/engineManager/types'

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
const engineController = new EngineController()
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
let tray: Tray | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1150,
    height: 800,
    minWidth: 1150,
    minHeight: 700,
    icon: path.join(process.env.VITE_PUBLIC, 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    frame: false, // Frameless window
    titleBarStyle: 'hidden', // Hide title bar but keep traffic lights on macOS if needed
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

  // Disable DevTools in production
  if (app.isPackaged) {
    win.removeMenu();
    win.webContents.on('before-input-event', (event, input) => {
      // Windows/Linux: Ctrl+Shift+I, Ctrl+Shift+J
      if (input.control && input.shift && (input.key.toLowerCase() === 'i' || input.key.toLowerCase() === 'j')) {
        event.preventDefault();
      }
      // macOS: Cmd+Option+I, Cmd+Option+J
      if (input.meta && input.alt && (input.key.toLowerCase() === 'i' || input.key.toLowerCase() === 'j')) {
          event.preventDefault();
      }
      // F12
      if (input.key === 'F12') {
        event.preventDefault();
      }
    });
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  console.log('Window all closed, setting quitting flag...');
  engineController.setQuitting();
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', async (_event) => {
    console.log('App closing, setting quitting flag...');
    // Do NOT stop instances if we want them to persist.
    // Just mark as quitting so we don't overwrite the config with 'stopped'
    engineController.setQuitting();
});

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
    return dbManager.connect(config);
  });

  ipcMain.handle('list-tables', async (_, connectionId) => {
    return dbManager.listTables(connectionId);
  });

  ipcMain.handle('get-table-data', async (_, { connectionId, tableName }) => {
    return dbManager.getTableData(connectionId, tableName);
  });

  ipcMain.handle('add-row', async (_, { connectionId, tableName, row }) => {
    return dbManager.addRow(connectionId, tableName, row);
  });

  ipcMain.handle('update-row', async (_, { connectionId, tableName, row, primaryKeyColumn, primaryKeyValue }) => {
    return dbManager.updateRow(connectionId, tableName, row, primaryKeyColumn, primaryKeyValue);
  });

  ipcMain.handle('delete-row', async (_, { connectionId, tableName, primaryKeyColumn, primaryKeyValue }) => {
    return dbManager.deleteRow(connectionId, tableName, primaryKeyColumn, primaryKeyValue);
  });

  ipcMain.handle('create-table', async (_, { connectionId, tableName, columns }) => {
    return dbManager.createTable(connectionId, tableName, columns);
  });

  ipcMain.handle('drop-table', async (_, { connectionId, tableName }) => {
    return dbManager.dropTable(connectionId, tableName);
  });

  ipcMain.handle('get-table-structure', async (_, { connectionId, tableName }) => {
    return dbManager.getTableStructure(connectionId, tableName);
  });

  ipcMain.handle('update-table-structure', async (_, { connectionId, tableName, actions }) => {
    return dbManager.updateTableStructure(connectionId, tableName, actions);
  });

  ipcMain.handle('execute-query', async (_, { connectionId, query }) => {
    try {
        return await dbManager.executeQuery(connectionId, query);
    } catch (error: any) {
        console.error('Execute Query Error:', error);
        throw new Error(error.message || 'Query execution failed');
    }
  });

  ipcMain.handle('list-databases', async (_, connectionId) => {
      return dbManager.listDatabases(connectionId);
  });

  ipcMain.handle('create-database', async (_, { connectionId, name }) => {
      return dbManager.createDatabase(connectionId, name);
  });

  ipcMain.handle('drop-database', async (_, { connectionId, name }) => {
      return dbManager.dropDatabase(connectionId, name);
  });

  ipcMain.handle('switch-database', async (_, { connectionId, name }) => {
      return dbManager.switchDatabase(connectionId, name);
  });

  ipcMain.handle('list-users', async (_, connectionId) => {
      return dbManager.listUsers(connectionId);
  });

  ipcMain.handle('create-user', async (_, { connectionId, user }) => {
      return dbManager.createUser(connectionId, user);
  });

  ipcMain.handle('drop-user', async (_, { connectionId, username, host }) => {
      return dbManager.dropUser(connectionId, username, host);
  });

  ipcMain.handle('update-user', async (_, { connectionId, user }) => {
      return dbManager.updateUser(connectionId, user);
  });

  // Engine Manager IPC
  ipcMain.handle('engine-list', async () => {
    return engineController.getInstances();
  });

  ipcMain.handle('engine-create', async (event, instance: EngineInstance) => {
    return engineController.addInstance(instance, (percent) => {
        event.sender.send('engine-download-progress', percent);
    });
  });

  ipcMain.handle('engine-remove', async (_event, id: string) => {
    return engineController.removeInstance(id);
  });

  ipcMain.handle('engine-start', async (_event, id: string) => {
    return engineController.startInstance(id);
  });

  ipcMain.handle('engine-stop', async (_event, id: string) => {
    return engineController.stopInstance(id);
  });

  ipcMain.handle('engine-update', async (_event, { id, updates }: { id: string, updates: Partial<EngineInstance> }) => {
    return engineController.updateInstanceConfig(id, updates);
  });

  ipcMain.handle('get-default-engine-paths', async () => {
    const userDataPath = app.getPath('userData');
    const enginesPath = path.join(userDataPath, 'engines');
    return {
      base: enginesPath,
      platform: process.platform
    };
  });

  // Window Controls
  ipcMain.handle('window-minimize', () => {
    win?.minimize();
  });
  
  ipcMain.handle('window-maximize', () => {
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });
  
  ipcMain.handle('window-close', () => {
    win?.close();
  });

  // Tray Window Management
  let trayWindow: BrowserWindow | null = null;
  const iconPath = path.join(process.env.VITE_PUBLIC || '', 'app-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  let showInTray = true;

  const createTrayWindow = () => {
    trayWindow = new BrowserWindow({
        width: 240,
        height: 400, // Adjustable based on content
        show: false,
        frame: false,
        fullscreenable: false,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // We need secure implementation, but for MVP local tool:
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
        }
    });

    if (VITE_DEV_SERVER_URL) {
        trayWindow.loadURL(`${VITE_DEV_SERVER_URL}#/tray`);
    } else {
        trayWindow.loadFile(path.join(process.env.DIST, 'index.html'), { hash: 'tray' });
    }

    // Hide on blur
    trayWindow.on('blur', () => {
        if (!trayWindow) return;
        if (!trayWindow.webContents.isDevToolsOpened()) {
            trayWindow.hide();
        }
    });
  };

  const toggleTrayWindow = () => {
      if (!trayWindow) createTrayWindow();
      if (!trayWindow || !tray) return;

      if (trayWindow.isVisible()) {
          trayWindow.hide();
      } else {
          // Calculate position
          const trayBounds = tray.getBounds();
          const windowBounds = trayWindow.getBounds();
          
          // Basic alignment for bottom taskbar
          
          // If tray is at bottom (y > height - 100), show above
          let newY = trayBounds.y - windowBounds.height;
          let newX = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));

          if (trayBounds.y < 100) { // Top taskbar
              newY = trayBounds.y + trayBounds.height;
          }

          trayWindow.setPosition(newX, newY, false);
          trayWindow.show();
          trayWindow.focus();
      }
  };

  const createTray = () => {
      if (tray) return;
      tray = new Tray(icon.resize({ width: 16, height: 16 }));
      tray.setToolTip('Lumabase');
      // Replace context menu with click handler
      tray.setContextMenu(Menu.buildFromTemplate([])); // Clear native menu
      tray.on('click', toggleTrayWindow);
      tray.on('right-click', toggleTrayWindow);
  };

  const destroyTray = () => {
      if (tray) {
          tray.destroy();
          tray = null;
      }
  };

  ipcMain.handle('app-open', () => {
      if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
      } else {
          createWindow();
      }
      trayWindow?.hide();
  });

  ipcMain.handle('app-quit', () => {
      engineController.setQuitting();
      app.quit();
  });

  // App Settings Updates
  ipcMain.handle('get-app-settings', () => {
    return {
        startOnLogin: app.getLoginItemSettings().openAtLogin,
        showInTaskbar: true, // Default to true as we are not managing it via tray anymore
        showInTray: !!tray
    };
  });

  ipcMain.handle('set-start-on-login', (_, openAtLogin: boolean) => {
    app.setLoginItemSettings({
        openAtLogin,
        path: app.getPath('exe')
    });
  });

  ipcMain.handle('set-show-in-tray', (_, show: boolean) => {
      showInTray = show;
      if (show) {
          createTray();
      } else {
          destroyTray();
      }
  });

  // Initial Startup
  createTrayWindow();
  if (showInTray) {
      createTray();
  }

}); // End of app.whenReady
