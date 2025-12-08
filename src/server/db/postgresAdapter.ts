import { Client } from 'pg';

export class PostgresAdapter {
  private client: Client | null = null;
  private config: any = null;

  async connect(config: any) {
    this.config = config;
    console.log('PostgresAdapter connecting to:', config.host, config.port);
    try {
      this.client = new Client({
        ...config,
        port: parseInt(config.port) || 5432,
        connectionTimeoutMillis: 5000 // Timeout after 5s to prevent hanging
      });

      // Handle unexpected connection errors (e.g., engine stopped) preventing app crash
      this.client.on('error', (err: any) => {
          console.error('Postgres Client Error (connection lost):', err.message);
          // We don't need to rethrow/crash, subsequent queries will fail gracefully
      });

      await this.client.connect();
      console.log('PostgresAdapter connected successfully');
      return { success: true };
    } catch (error: any) {
      console.error('PostgresAdapter connection failed:', error);
      return { success: false, error: error.message };
    }
  }

  getConfig() {
      return this.config;
  }

  async listTables() {
    if (!this.client) throw new Error('Database not connected');
    const res = await this.client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    return res.rows.map((row: any) => row.table_name);
  }

  async getTableData(tableName: string, conditions: any[] = []) {
    if (!this.client) throw new Error('Database not connected');
    let sql = `SELECT * FROM "${tableName}"`;
    const params: any[] = [];
    
    if (conditions && conditions.length > 0) {
        let paramIndex = 1;
        const clauses = conditions.map(cond => {
             const op = cond.operator.toUpperCase();
             const allowedOps = ['=', '!=', '<', '>', '<=', '>=', 'LIKE'];
             if (!allowedOps.includes(op)) throw new Error(`Invalid operator: ${op}`);
             params.push(cond.value);
             const clause = `"${cond.column}" ${op} $${paramIndex}`;
             paramIndex++;
             return clause;
        });
        sql += ' WHERE ' + clauses.join(' AND ');
    }
    
    sql += ' LIMIT 1000';

    const res = await this.client.query(sql, params);
    return res.rows;
  }

  async addRow(tableName: string, row: any) {
    if (!this.client) throw new Error('Database not connected');
    const keys = Object.keys(row);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
    const sql = `INSERT INTO "${tableName}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders}) RETURNING *`;
    await this.client.query(sql, Object.values(row));
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

  async updateRowsByFilter(tableName: string, updateCol: string, updateVal: any, conditions: { column: string, operator: string, value: any }[]) {
      if (!this.client) throw new Error('Database not connected');
      if (conditions.length === 0) throw new Error('No conditions provided');

      const params = [updateVal];
      let paramIndex = 2; // Start from $2 (since $1 is updateVal)
      
      const clauses = conditions.map(cond => {
          const op = cond.operator.toUpperCase();
          const allowedOps = ['=', '!=', '<', '>', '<=', '>=', 'LIKE'];
          if (!allowedOps.includes(op)) throw new Error(`Invalid operator: ${op}`);
          
          params.push(cond.value);
          const clause = `"${cond.column}" ${op} $${paramIndex}`;
          paramIndex++;
          return clause;
      });

      const whereClause = 'WHERE ' + clauses.join(' AND ');
      const sql = `UPDATE "${tableName}" SET "${updateCol}" = $1 ${whereClause}`;
      
      const res = await this.client.query(sql, params);
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
      SELECT 
        c.column_name, 
        c.data_type, 
        c.is_nullable, 
        c.column_default,
        (
           SELECT 1 
           FROM information_schema.key_column_usage kcu 
           JOIN information_schema.table_constraints tc 
             ON kcu.constraint_name = tc.constraint_name 
             AND kcu.table_schema = tc.table_schema
           WHERE kcu.table_name = c.table_name 
             AND kcu.column_name = c.column_name 
             AND tc.constraint_type = 'PRIMARY KEY'
             AND kcu.table_schema = 'public'
           LIMIT 1
        ) as is_pk
      FROM information_schema.columns c
      WHERE c.table_name = $1
      AND c.table_schema = 'public'
    `;
    const res = await this.client.query(sql, [tableName]);
    
    // Fetch Foreign Keys
    const fkSql = `
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = 'public'
    `;
    const fkRes = await this.client.query(fkSql, [tableName]);
    
    const fkMap = new Map();
    fkRes.rows.forEach((fk: any) => {
        fkMap.set(fk.column_name, {
            table: fk.foreign_table_name,
            column: fk.foreign_column_name,
            constraintName: fk.constraint_name
        });
    });

    return res.rows.map((row: any) => ({
      name: row.column_name,
      type: row.data_type,
      notnull: row.is_nullable === 'NO' ? 1 : 0,
      dflt_value: row.column_default,
      pk: row.is_pk,
      // Simple heuristic for auto_increment in PG: default value contains 'nextval'
      autoIncrement: row.column_default && row.column_default.includes('nextval') ? 1 : 0,
      fk: fkMap.get(row.column_name) || null
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
            await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${col.name}" TYPE ${col.type} USING "${col.name}"::${col.type}`);
            
            if (!col.nullable) {
                await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${col.name}" SET NOT NULL`);
            } else {
                await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${col.name}" DROP NOT NULL`);
            }

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
      // Removed check for 'postgres' to allow users to see and select it
      const res = await this.client.query("SELECT datname FROM pg_database WHERE datistemplate = false");
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
      await this.client.end();
      this.client = new Client({
          ...this.config,
          database: name
      });
      await this.client.connect();
      // Update config so we know which DB we are on
      this.config.database = name;
      return { success: true };
  }

  async listUsers() {
      if (!this.client) throw new Error('Database not connected');
      const res = await this.client.query('SELECT usename FROM pg_catalog.pg_user');
      return res.rows.map((row: any) => ({ username: row.usename, host: '%' })); 
  }

  async createUser(user: any) {
      if (!this.client) throw new Error('Database not connected');
      const { username, password } = user;
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

  async getCurrentDatabase() {
      if (!this.client) throw new Error('Database not connected');
      const res = await this.client.query('SELECT current_database()');
      return res.rows[0]?.current_database || '';
  }
}
