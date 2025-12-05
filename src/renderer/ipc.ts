export const ipc = {
  connectDatabase: (config: any) => window.electron.ipcRenderer.invoke('connect-database', config),
  testConnection: (config: any) => window.electron.ipcRenderer.invoke('test-connection', config),
  listTables: () => window.electron.ipcRenderer.invoke('list-tables'),
  getTableData: (tableName: string) => window.electron.ipcRenderer.invoke('get-table-data', tableName),
  addRow: (tableName: string, row: any) => window.electron.ipcRenderer.invoke('add-row', { tableName, row }),
  updateRow: (tableName: string, row: any, primaryKeyColumn: string, primaryKeyValue: any) => window.electron.ipcRenderer.invoke('update-row', { tableName, row, primaryKeyColumn, primaryKeyValue }),
  deleteRow: (tableName: string, primaryKeyColumn: string, primaryKeyValue: any) => window.electron.ipcRenderer.invoke('delete-row', { tableName, primaryKeyColumn, primaryKeyValue }),
  createTable: (tableName: string, columns: any[]) => window.electron.ipcRenderer.invoke('create-table', { tableName, columns }),
  dropTable: (tableName: string) => window.electron.ipcRenderer.invoke('drop-table', tableName),
  getTableStructure: (tableName: string) => window.electron.ipcRenderer.invoke('get-table-structure', tableName),
  updateTableStructure: (tableName: string, actions: any[]) => window.electron.ipcRenderer.invoke('update-table-structure', { tableName, actions }),
  executeQuery: (query: string) => window.electron.ipcRenderer.invoke('execute-query', query),
  listDatabases: () => window.electron.ipcRenderer.invoke('list-databases'),
  createDatabase: (name: string) => window.electron.ipcRenderer.invoke('create-database', name),
  dropDatabase: (name: string) => window.electron.ipcRenderer.invoke('drop-database', name),
  switchDatabase: (name: string) => window.electron.ipcRenderer.invoke('switch-database', name),
  
  // User Management
  listUsers: () => window.electron.ipcRenderer.invoke('list-users'),
  createUser: (user: any) => window.electron.ipcRenderer.invoke('create-user', user),
  dropUser: (username: string, host?: string) => window.electron.ipcRenderer.invoke('drop-user', { username, host }),
  updateUser: (user: any) => window.electron.ipcRenderer.invoke('update-user', user),

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
