import { Client } from 'pg';

export class PostgresAdapter {
  private client: Client | null = null;
  private config: any = null;

  async connect(config: any) {
    try {
      this.client = new Client({
        host: config.host,
        port: parseInt(config.port) || 5432,
        user: config.user,
        password: config.password,
        database: config.database,
      });
      await this.client.connect();
      this.config = config;
      return { success: true };
    } catch (error: any) {
      console.error('Postgres Connection failed:', error);
      return { success: false, error: error.message };
    }
  }

  async listTables() {
    if (!this.client) throw new Error('Database not connected');
    const res = await this.client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    return res.rows.map((row: any) => row.table_name);
  }

  async getTableData(tableName: string) {
    if (!this.client) throw new Error('Database not connected');
    const res = await this.client.query(`SELECT * FROM "${tableName}"`);
    return res.rows;
  }

  async addRow(tableName: string, row: any) {
    if (!this.client) throw new Error('Database not connected');
    const keys = Object.keys(row);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
    const sql = `INSERT INTO "${tableName}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders}) RETURNING *`;
    await this.client.query(sql, Object.values(row));
    // Try to guess ID from returned row if possible, or just return success
    return { success: true };
  }

  async updateRow(tableName: string, row: any, primaryKeyColumn: string, primaryKeyValue: any) {
    if (!this.client) throw new Error('Database not connected');
    const keys = Object.keys(row).filter(k => k !== primaryKeyColumn);
    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(',');
    const sql = `UPDATE "${tableName}" SET ${setClause} WHERE "${primaryKeyColumn}" = $${keys.length + 1}`;
    const res = await this.client.query(sql, [...keys.map(k => row[k]), primaryKeyValue]);
    return { success: true, changes: res.rowCount };
  }

  async deleteRow(tableName: string, primaryKeyColumn: string, primaryKeyValue: any) {
    if (!this.client) throw new Error('Database not connected');
    const sql = `DELETE FROM "${tableName}" WHERE "${primaryKeyColumn}" = $1`;
    const res = await this.client.query(sql, [primaryKeyValue]);
    return { success: true, changes: res.rowCount };
  }

  async deleteRows(tableName: string, primaryKeyColumn: string, primaryKeyValues: any[]) {
      if (!this.client) throw new Error('Database not connected');
      if (primaryKeyValues.length === 0) return { success: true, changes: 0 };
      
      const placeholders = primaryKeyValues.map((_, i) => `$${i + 1}`).join(',');
      const sql = `DELETE FROM "${tableName}" WHERE "${primaryKeyColumn}" IN (${placeholders})`;
      const res = await this.client.query(sql, primaryKeyValues);
      return { success: true, changes: res.rowCount };
  }

  async updateRows(tableName: string, updateCol: string, updateVal: any, pkCol: string, pkVals: any[]) {
      if (!this.client) throw new Error('Database not connected');
      if (pkVals.length === 0) return { success: true, changes: 0 };
      
      // $1 is updateVal, $2...$N are pkVals
      const placeholders = pkVals.map((_, i) => `$${i + 2}`).join(',');
      const sql = `UPDATE "${tableName}" SET "${updateCol}" = $1 WHERE "${pkCol}" IN (${placeholders})`;
      const res = await this.client.query(sql, [updateVal, ...pkVals]);
      return { success: true, changes: res.rowCount };
  }

  async createTable(tableName: string, columns: any[]) {
    if (!this.client) throw new Error('Database not connected');
    const colDefs = columns.map(col => {
      let def = `"${col.name}" ${col.type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.default) def += ` DEFAULT ${col.default}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      // Auto increment in PG is typically SERIAL or GENERATED ALWAYS AS IDENTITY
      if (col.autoIncrement) def = `"${col.name}" SERIAL PRIMARY KEY`; 
      return def;
    }).join(',');
    const sql = `CREATE TABLE "${tableName}" (${colDefs})`;
    await this.client.query(sql);
    return { success: true };
  }

  async dropTable(tableName: string) {
    if (!this.client) throw new Error('Database not connected');
    await this.client.query(`DROP TABLE "${tableName}"`);
    return { success: true };
  }

  async getTableStructure(tableName: string) {
    if (!this.client) throw new Error('Database not connected');
    const sql = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1
    `;
    const res = await this.client.query(sql, [tableName]);
    return res.rows.map((row: any) => ({
      name: row.column_name,
      type: row.data_type,
      notnull: row.is_nullable === 'NO' ? 1 : 0,
      dflt_value: row.column_default,
      pk: 0 // Fetching PKs in PG is more complex, skipping for MVP or need extra query
    }));
  }

  async updateTableStructure(tableName: string, actions: any[]) {
    if (!this.client) throw new Error('Database not connected');
    const results = [];
    for (const action of actions) {
      if (action.type === 'add_column') {
        const col = action.column;
        let def = `"${col.name}" ${col.type}`;
        if (!col.nullable) def += ' NOT NULL';
        if (col.default) def += ` DEFAULT ${col.default}`;
        try {
            await this.client.query(`ALTER TABLE "${tableName}" ADD COLUMN ${def}`);
            results.push({ action: 'add_column', success: true });
        } catch (e: any) {
            results.push({ action: 'add_column', success: false, error: e.message });
        }
      } else if (action.type === 'drop_column') {
        try {
            await this.client.query(`ALTER TABLE "${tableName}" DROP COLUMN "${action.columnName}"`);
            results.push({ action: 'drop_column', success: true });
        } catch (e: any) {
            results.push({ action: 'drop_column', success: false, error: e.message });
        }
      } else if (action.type === 'modify_column') {
        const col = action.column;
        try {
            // Postgres syntax is different: ALTER COLUMN x TYPE y, ALTER COLUMN x SET/DROP NOT NULL, etc.
            // Doing it all in one go is tricky. Let's do type first.
            await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${col.name}" TYPE ${col.type} USING "${col.name}"::${col.type}`);
            
            // Nullable
            if (!col.nullable) {
                await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${col.name}" SET NOT NULL`);
            } else {
                await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${col.name}" DROP NOT NULL`);
            }

            // Default
            if (col.default) {
                 await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${col.name}" SET DEFAULT ${col.default}`);
            } else {
                 await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${col.name}" DROP DEFAULT`);
            }

            results.push({ action: 'modify_column', success: true });
        } catch (e: any) {
            results.push({ action: 'modify_column', success: false, error: e.message });
        }
      } else if (action.type === 'add_foreign_key') {
        try {
            const { constraintName, column, refTable, refColumn, onUpdate, onDelete } = action;
            let sql = `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${column}") REFERENCES "${refTable}"("${refColumn}")`;
            if (onDelete && onDelete !== 'NO ACTION') sql += ` ON DELETE ${onDelete}`;
            if (onUpdate && onUpdate !== 'NO ACTION') sql += ` ON UPDATE ${onUpdate}`;
            
            await this.client.query(sql);
            results.push({ action: 'add_foreign_key', success: true });
        } catch (e: any) {
            results.push({ action: 'add_foreign_key', success: false, error: e.message });
        }
      } else if (action.type === 'drop_foreign_key') {
        try {
            await this.client.query(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${action.constraintName}"`);
            results.push({ action: 'drop_foreign_key', success: true });
        } catch (e: any) {
             results.push({ action: 'drop_foreign_key', success: false, error: e.message });
        }
      }
    }
    return results;
  }

  async executeQuery(query: string) {
    if (!this.client) throw new Error('Database not connected');
    const res = await this.client.query(query);
    return res.rows;
  }

  async listDatabases() {
      if (!this.client) throw new Error('Database not connected');
      const res = await this.client.query("SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres'");
      return res.rows.map((row: any) => row.datname);
  }

  async createDatabase(name: string) {
      if (!this.client) throw new Error('Database not connected');
      await this.client.query(`CREATE DATABASE "${name}"`);
      return { success: true };
  }

  async dropDatabase(name: string) {
      if (!this.client) throw new Error('Database not connected');
      await this.client.query(`DROP DATABASE "${name}"`);
      return { success: true };
  }

  async switchDatabase(name: string) {
      if (!this.client) throw new Error('Database not connected');
      // Postgres requires reconnection to switch DB
      await this.client.end();
      this.client = new Client({
          ...this.config,
          database: name
      });
      await this.client.connect();
      // Update config so subsequent reconnects use this DB? 
      // Or just keep it transient. 
      // Better to update config in memory
      this.config.database = name;
      return { success: true };
  }

  async listUsers() {
      if (!this.client) throw new Error('Database not connected');
      const res = await this.client.query('SELECT usename FROM pg_catalog.pg_user');
      return res.rows.map((row: any) => ({ username: row.usename, host: '%' })); // Postgres users are global usually
  }

  async createUser(user: any) {
      if (!this.client) throw new Error('Database not connected');
      const { username, password } = user;
      // Parameterized queries for CREATE USER are tricky in PG, usually need manual escaping or specific utility
      // For MVP, we'll use simple string interpolation but validate input strictly or use a library helper if available.
      // PG doesn't support parameters in DDL.
      // We should sanitize `username`.
      if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Invalid username');
      
      await this.client.query(`CREATE USER "${username}" WITH PASSWORD '${password}'`);
      return { success: true };
  }

  async dropUser(username: string, _host?: string) {
      if (!this.client) throw new Error('Database not connected');
      if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Invalid username');
      await this.client.query(`DROP USER "${username}"`);
      return { success: true };
  }

  async updateUser(user: any) {
      if (!this.client) throw new Error('Database not connected');
      const { username, password } = user;
      if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Invalid username');
      
      if (password) {
          await this.client.query(`ALTER USER "${username}" WITH PASSWORD '${password}'`);
      }
      return { success: true };
  }
}
