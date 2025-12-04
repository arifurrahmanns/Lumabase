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
