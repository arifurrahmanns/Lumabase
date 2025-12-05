import { MysqlAdapter } from './mysqlAdapter';
import { PostgresAdapter } from './postgresAdapter';

interface DatabaseAdapter {
  connect(config: any): Promise<any>;
  listTables(): Promise<string[]>;
  getTableData(tableName: string): Promise<any[]>;
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
  listUsers(): Promise<any[]>;
  createUser(user: any): Promise<any>;
  dropUser(username: string, host?: string): Promise<any>;
  updateUser(user: any): Promise<any>;
}

class DatabaseManager {
  private adapter: DatabaseAdapter | null = null;

  async connect(config: any) {
    console.log('DatabaseManager.connect called with:', JSON.stringify(config));
    const type = config.type ? config.type.toString().trim() : '';
    console.log(`Type: '${type}', Equal to mysql? ${type === 'mysql'}`);
    
    if (type === 'mysql') {
      this.adapter = new MysqlAdapter();
    } else if (type === 'postgres') {
      this.adapter = new PostgresAdapter();
    } else {
      console.error('Unsupported type:', type);
      throw new Error(`Unsupported database type: ${config.type}`);
    }
    return this.adapter.connect(config);
  }

  // Proxy methods to the active adapter
  async listTables() { return this.adapter?.listTables(); }
  async getTableData(tableName: string) { return this.adapter?.getTableData(tableName); }
  async addRow(tableName: string, row: any) { return this.adapter?.addRow(tableName, row); }
  async updateRow(tableName: string, row: any, pkCol: string, pkVal: any) { return this.adapter?.updateRow(tableName, row, pkCol, pkVal); }
  async deleteRow(tableName: string, pkCol: string, pkVal: any) { return this.adapter?.deleteRow(tableName, pkCol, pkVal); }
  async createTable(tableName: string, columns: any[]) { return this.adapter?.createTable(tableName, columns); }
  async dropTable(tableName: string) { return this.adapter?.dropTable(tableName); }
  async getTableStructure(tableName: string) { return this.adapter?.getTableStructure(tableName); }
  async updateTableStructure(tableName: string, actions: any[]) { return this.adapter?.updateTableStructure(tableName, actions); }
  async executeQuery(query: string) { return this.adapter?.executeQuery(query); }
  async listDatabases() { return this.adapter?.listDatabases(); }
  async createDatabase(name: string) { return this.adapter?.createDatabase(name); }
  async dropDatabase(name: string) { return this.adapter?.dropDatabase(name); }
  async switchDatabase(name: string) { return this.adapter?.switchDatabase(name); }
  async listUsers() { return this.adapter?.listUsers(); }
  async createUser(user: any) { return this.adapter?.createUser(user); }
  async dropUser(username: string, host?: string) { return this.adapter?.dropUser(username, host); }
  async updateUser(user: any) { return this.adapter?.updateUser(user); }
}

export const dbManager = new DatabaseManager();
