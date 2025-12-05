export const ipc = {
  connectDatabase: (config: any) => window.electron.ipcRenderer.invoke('connect-database', config),
  testConnection: (config: any) => window.electron.ipcRenderer.invoke('test-connection', config),
  listTables: (connectionId: string) => window.electron.ipcRenderer.invoke('list-tables', connectionId),
  getTableData: (connectionId: string, tableName: string) => window.electron.ipcRenderer.invoke('get-table-data', { connectionId, tableName }),
  addRow: (connectionId: string, tableName: string, row: any) => window.electron.ipcRenderer.invoke('add-row', { connectionId, tableName, row }),
  updateRow: (connectionId: string, tableName: string, row: any, primaryKeyColumn: string, primaryKeyValue: any) => window.electron.ipcRenderer.invoke('update-row', { connectionId, tableName, row, primaryKeyColumn, primaryKeyValue }),
  deleteRow: (connectionId: string, tableName: string, primaryKeyColumn: string, primaryKeyValue: any) => window.electron.ipcRenderer.invoke('delete-row', { connectionId, tableName, primaryKeyColumn, primaryKeyValue }),
  createTable: (connectionId: string, tableName: string, columns: any[]) => window.electron.ipcRenderer.invoke('create-table', { connectionId, tableName, columns }),
  dropTable: (connectionId: string, tableName: string) => window.electron.ipcRenderer.invoke('drop-table', { connectionId, tableName }),
  getTableStructure: (connectionId: string, tableName: string) => window.electron.ipcRenderer.invoke('get-table-structure', { connectionId, tableName }),
  updateTableStructure: (connectionId: string, tableName: string, actions: any[]) => window.electron.ipcRenderer.invoke('update-table-structure', { connectionId, tableName, actions }),
  executeQuery: (connectionId: string, query: string) => window.electron.ipcRenderer.invoke('execute-query', { connectionId, query }),
  listDatabases: (connectionId: string) => window.electron.ipcRenderer.invoke('list-databases', connectionId),
  createDatabase: (connectionId: string, name: string) => window.electron.ipcRenderer.invoke('create-database', { connectionId, name }),
  dropDatabase: (connectionId: string, name: string) => window.electron.ipcRenderer.invoke('drop-database', { connectionId, name }),
  switchDatabase: (connectionId: string, name: string) => window.electron.ipcRenderer.invoke('switch-database', { connectionId, name }),
  
  // User Management
  listUsers: (connectionId: string) => window.electron.ipcRenderer.invoke('list-users', connectionId),
  createUser: (connectionId: string, user: any) => window.electron.ipcRenderer.invoke('create-user', { connectionId, user }),
  dropUser: (connectionId: string, username: string, host?: string) => window.electron.ipcRenderer.invoke('drop-user', { connectionId, username, host }),
  updateUser: (connectionId: string, user: any) => window.electron.ipcRenderer.invoke('update-user', { connectionId, user }),

  // Engine Manager
  listEngines: () => window.electron.ipcRenderer.invoke('engine-list'),
  createEngine: (instance: any) => window.electron.ipcRenderer.invoke('engine-create', instance),
  removeEngine: (id: string) => window.electron.ipcRenderer.invoke('engine-remove', id),
  startEngine: (id: string) => window.electron.ipcRenderer.invoke('engine-start', id),
  stopEngine: (id: string) => window.electron.ipcRenderer.invoke('engine-stop', id),
  getDefaultEnginePaths: () => window.electron.ipcRenderer.invoke('get-default-engine-paths'),
  onDownloadProgress: (callback: (percent: number) => void) => window.electron.ipcRenderer.on('engine-download-progress', (_, percent) => callback(percent)),
};

// Type definition for window.electron
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        on: (channel: string, listener: (event: any, ...args: any[]) => void) => () => void;
      };
    };
  }
}
