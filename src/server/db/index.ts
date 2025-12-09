import { MysqlAdapter } from './mysqlAdapter';
import { PostgresAdapter } from './postgresAdapter';

interface DatabaseAdapter {
  connect(config: any): Promise<any>;
  listTables(): Promise<string[]>;
  getTableData(tableName: string, conditions?: any[]): Promise<any[]>;
  addRow(tableName: string, row: any): Promise<any>;
  updateRow(tableName: string, row: any, pkCol: string, pkVal: any): Promise<any>;
  deleteRow(tableName: string, pkCol: string, pkVal: any): Promise<any>;
  createTable(tableName: string, columns: any[]): Promise<any>;
  dropTable(tableName: string): Promise<any>;
  getTableStructure(tableName: string): Promise<any>;
  updateTableStructure(tableName: string, actions: any[]): Promise<any>;
  executeQuery(query: string): Promise<any>;
  listDatabases(): Promise<string[]>;
  createDatabase(name: string): Promise<any>;
  dropDatabase(name: string): Promise<any>;
  switchDatabase(name: string): Promise<any>;
  getConfig(): any;
  listUsers(): Promise<any[]>;
  createUser(user: any): Promise<any>;
  dropUser(username: string, host?: string): Promise<any>;
  updateUser(user: any): Promise<any>;
  getCurrentDatabase(): Promise<string>;
}

class DatabaseManager {
  private connections: Map<string, DatabaseAdapter> = new Map();

  async connect(config: any): Promise<{ success: boolean; connectionId?: string; error?: any }> {
    console.log('DatabaseManager.connect called with:', JSON.stringify(config));
    const type = config.type ? config.type.toString().trim() : '';
    console.log(`Type: '${type}', Equal to mysql? ${type === 'mysql'}`);
    
    let adapter: DatabaseAdapter;
    if (type === 'mysql') {
      adapter = new MysqlAdapter();
    } else if (type === 'postgres') {
      adapter = new PostgresAdapter();
    } else {
      console.error('Unsupported type:', type);
      throw new Error(`Unsupported database type: ${config.type}`);
    }

    try {
        const result = await adapter.connect(config);
        if (!result.success) {
            return result;
        }
        const connectionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        this.connections.set(connectionId, adapter);
        return { success: true, connectionId };
    } catch (e) {
        return { success: false, error: e };
    }
  }

  async cloneConnection(connectionId: string, newDbName: string): Promise<{ success: boolean; connectionId?: string; error?: any }> {
      try {
          const adapter = this.getAdapter(connectionId);
          console.log(`Cloning connection ${connectionId} for db ${newDbName}`);
          const config = adapter.getConfig();
          if (!config) throw new Error("Could not retrieve config from adapter");

          const newConfig = { ...config, database: newDbName };
          return await this.connect(newConfig);
      } catch (e: any) {
          console.error('Clone connection failed:', e);
          return { success: false, error: e.message };
      }
  }

  private getAdapter(connectionId: string) {
      const adapter = this.connections.get(connectionId);
      if (!adapter) throw new Error(`Connection ${connectionId} not found`);
      return adapter;
  }

  async getConnectionConfig(connectionId: string) {
      return this.getAdapter(connectionId).getConfig();
  }

  // Proxy methods to the active adapter
  // Proxy methods to the active adapter
  async listTables(connectionId: string) { return this.getAdapter(connectionId).listTables(); }
  async getTableData(connectionId: string, tableName: string, conditions: any[] = []) { return this.getAdapter(connectionId).getTableData(tableName, conditions); }
  async addRow(connectionId: string, tableName: string, row: any) { return this.getAdapter(connectionId).addRow(tableName, row); }
  async updateRow(connectionId: string, tableName: string, row: any, pkCol: string, pkVal: any) { return this.getAdapter(connectionId).updateRow(tableName, row, pkCol, pkVal); }
  async deleteRow(connectionId: string, tableName: string, pkCol: string, pkVal: any) { return this.getAdapter(connectionId).deleteRow(tableName, pkCol, pkVal); }
  async deleteRows(connectionId: string, tableName: string, pkCol: string, pkVals: any[]) { 
      const adapter = this.getAdapter(connectionId);
      if ((adapter as any).deleteRows) {
          return (adapter as any).deleteRows(tableName, pkCol, pkVals);
      }
      // Fallback
      for (const val of pkVals) {
          await adapter.deleteRow(tableName, pkCol, val);
      }
      return { success: true, count: pkVals.length };
  }
  async updateRows(connectionId: string, tableName: string, updateCol: string, updateVal: any, pkCol: string, pkVals: any[]) {
      const adapter = this.getAdapter(connectionId);
      if ((adapter as any).updateRows) {
          return (adapter as any).updateRows(tableName, updateCol, updateVal, pkCol, pkVals);
      }
      // Fallback
      for (const val of pkVals) {
         const row: any = {};
         row[updateCol] = updateVal;
         await adapter.updateRow(tableName, row, pkCol, val);
      }
      return { success: true, count: pkVals.length };
  }
  async updateRowsByFilter(connectionId: string, tableName: string, updateCol: string, updateVal: any, conditions: any[]) {
      const adapter = this.getAdapter(connectionId);
      if ((adapter as any).updateRowsByFilter) {
          return (adapter as any).updateRowsByFilter(tableName, updateCol, updateVal, conditions);
      }
      throw new Error('This database type does not support filtered bulk updates yet.');
  }
  async createTable(connectionId: string, tableName: string, columns: any[]) { return this.getAdapter(connectionId).createTable(tableName, columns); }
  async dropTable(connectionId: string, tableName: string) { return this.getAdapter(connectionId).dropTable(tableName); }
  async getTableStructure(connectionId: string, tableName: string) { return this.getAdapter(connectionId).getTableStructure(tableName); }
  async updateTableStructure(connectionId: string, tableName: string, actions: any[]) { return this.getAdapter(connectionId).updateTableStructure(tableName, actions); }
  async executeQuery(connectionId: string, query: string) { return this.getAdapter(connectionId).executeQuery(query); }
  async listDatabases(connectionId: string) { return this.getAdapter(connectionId).listDatabases(); }
  async createDatabase(connectionId: string, name: string) { return this.getAdapter(connectionId).createDatabase(name); }
  async dropDatabase(connectionId: string, name: string) { return this.getAdapter(connectionId).dropDatabase(name); }
  async switchDatabase(connectionId: string, name: string) { return this.getAdapter(connectionId).switchDatabase(name); }
  async listUsers(connectionId: string) { return this.getAdapter(connectionId).listUsers(); }
  async createUser(connectionId: string, user: any) { return this.getAdapter(connectionId).createUser(user); }
  async dropUser(connectionId: string, username: string, host?: string) { return this.getAdapter(connectionId).dropUser(username, host); }
  async updateUser(connectionId: string, user: any) { return this.getAdapter(connectionId).updateUser(user); }
  async getCurrentDatabase(connectionId: string) { return this.getAdapter(connectionId).getCurrentDatabase(); }
}

export const dbManager = new DatabaseManager();
