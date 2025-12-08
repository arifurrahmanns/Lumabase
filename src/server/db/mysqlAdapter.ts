import mysql from 'mysql2/promise';

export class MysqlAdapter {
  private connection: mysql.Connection | null = null;

  async connect(config: any) {
    try {
      this.connection = await mysql.createConnection({
        host: config.host,
        port: parseInt(config.port) || 3306,
        user: config.user,
        password: config.password,
        database: config.database,
      });
      return { success: true };
    } catch (error: any) {
      console.error('MySQL Connection failed:', error);
      return { success: false, error: error.message };
    }
  }

  async listTables() {
    if (!this.connection) throw new Error('Database not connected');
    const [rows] = await this.connection.execute('SHOW TABLES');
    // rows is an array of objects like { 'Tables_in_dbname': 'tablename' }
    return (rows as any[]).map(row => Object.values(row)[0] as string);
  }

  async getTableData(tableName: string, conditions: any[] = []) {
    if (!this.connection) throw new Error('Database not connected');
    let sql = `SELECT * FROM \`${tableName}\``;
    const params: any[] = [];
    
    if (conditions && conditions.length > 0) {
        const clauses = conditions.map(cond => {
             const op = cond.operator.toUpperCase();
             const allowedOps = ['=', '!=', '<', '>', '<=', '>=', 'LIKE'];
             if (!allowedOps.includes(op)) throw new Error(`Invalid operator: ${op}`);
             params.push(cond.value);
             return `\`${cond.column}\` ${op} ?`;
        });
        sql += ' WHERE ' + clauses.join(' AND ');
    }
    
    // Limit for safety? Maybe later.
    sql += ' LIMIT 1000'; 

    const [rows] = await this.connection.execute(sql, params);
    return rows as any[];
  }

  async addRow(tableName: string, row: any) {
    if (!this.connection) throw new Error('Database not connected');
    const keys = Object.keys(row);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO \`${tableName}\` (${keys.map(k => `\`${k}\``).join(',')}) VALUES (${placeholders})`;
    const [result] = await this.connection.execute(sql, Object.values(row));
    return { success: true, id: (result as any).insertId };
  }

  async updateRow(tableName: string, row: any, primaryKeyColumn: string, primaryKeyValue: any) {
    if (!this.connection) throw new Error('Database not connected');
    const keys = Object.keys(row).filter(k => k !== primaryKeyColumn);
    const setClause = keys.map(k => `\`${k}\` = ?`).join(',');
    const sql = `UPDATE \`${tableName}\` SET ${setClause} WHERE \`${primaryKeyColumn}\` = ?`;
    const [result] = await this.connection.execute(sql, [...keys.map(k => row[k]), primaryKeyValue]);
    return { success: true, changes: (result as any).affectedRows };
  }

  async deleteRow(tableName: string, primaryKeyColumn: string, primaryKeyValue: any) {
    if (!this.connection) throw new Error('Database not connected');
    const sql = `DELETE FROM \`${tableName}\` WHERE \`${primaryKeyColumn}\` = ?`;
    const [result] = await this.connection.execute(sql, [primaryKeyValue]);
    return { success: true, changes: (result as any).affectedRows };
  }

  async deleteRows(tableName: string, primaryKeyColumn: string, primaryKeyValues: any[]) {
      if (!this.connection) throw new Error('Database not connected');
      if (primaryKeyValues.length === 0) return { success: true, changes: 0 };
      
      const placeholders = primaryKeyValues.map(() => '?').join(',');
      const sql = `DELETE FROM \`${tableName}\` WHERE \`${primaryKeyColumn}\` IN (${placeholders})`;
      const [result] = await this.connection.execute(sql, primaryKeyValues);
      return { success: true, changes: (result as any).affectedRows };
  }

  async updateRows(tableName: string, updateCol: string, updateVal: any, pkCol: string, pkVals: any[]) {
      if (!this.connection) throw new Error('Database not connected');
      if (pkVals.length === 0) return { success: true, changes: 0 };
      
      const placeholders = pkVals.map(() => '?').join(',');
      const sql = `UPDATE \`${tableName}\` SET \`${updateCol}\` = ? WHERE \`${pkCol}\` IN (${placeholders})`;
      // First arg is updateVal, followed by all pkVals
      const [result] = await this.connection.execute(sql, [updateVal, ...pkVals]);
      return { success: true, changes: (result as any).affectedRows };
  }

  async updateRowsByFilter(tableName: string, updateCol: string, updateVal: any, conditions: { column: string, operator: string, value: any }[]) {
      if (!this.connection) throw new Error('Database not connected');
      if (conditions.length === 0) throw new Error('No conditions provided for bulk update. Use "Update All" carefully.');

      let whereClause = '';
      const params = [updateVal];

      conditions.forEach((cond, index) => {
          const op = cond.operator.toUpperCase();
          const allowedOps = ['=', '!=', '<', '>', '<=', '>=', 'LIKE'];
          if (!allowedOps.includes(op)) throw new Error(`Invalid operator: ${op}`);

          const prefix = index === 0 ? 'WHERE' : 'AND';
          whereClause += ` \`${cond.column}\` ${op} ?`;
          // Prepend WHERE/AND manually or handle cleanly
          if (index === 0) {
             // Logic fix: The line above added the condition, but we need to join them.
             // Actually, let's rewrite the loop logic to be cleaner.
          }
      });
      
      // Let's rely on map/join for better safety
      const clauses = conditions.map(cond => {
          const op = cond.operator.toUpperCase();
          const allowedOps = ['=', '!=', '<', '>', '<=', '>=', 'LIKE'];
          if (!allowedOps.includes(op)) throw new Error(`Invalid operator: ${op}`);
          params.push(cond.value);
          return `\`${cond.column}\` ${op} ?`;
      });
      
      whereClause = 'WHERE ' + clauses.join(' AND ');

      const sql = `UPDATE \`${tableName}\` SET \`${updateCol}\` = ? ${whereClause}`;
      const [result] = await this.connection.execute(sql, params);
      return { success: true, changes: (result as any).affectedRows };
  }

  async createTable(tableName: string, columns: any[]) {
    if (!this.connection) throw new Error('Database not connected');
    const colDefs = columns.map(col => {
      let def = `\`${col.name}\` ${col.type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.default) def += ` DEFAULT ${col.default}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.autoIncrement) def += ' AUTO_INCREMENT';
      return def;
    }).join(',');
    const sql = `CREATE TABLE \`${tableName}\` (${colDefs})`;
    await this.connection.execute(sql);
    return { success: true };
  }

  async dropTable(tableName: string) {
    if (!this.connection) throw new Error('Database not connected');
    await this.connection.execute(`DROP TABLE \`${tableName}\``);
    return { success: true };
  }

  async getTableStructure(tableName: string) {
    if (!this.connection) throw new Error('Database not connected');
    
    // Fetch Columns
    const [rows] = await this.connection.execute(`SHOW COLUMNS FROM \`${tableName}\``);

    // Fetch Foreign Keys
    const [fks] = await this.connection.execute(`
      SELECT 
        COLUMN_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME 
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
    `, [tableName]);

    console.log('Fetched FKs for', tableName, fks);

    const fkMap = new Map();
    (fks as any[]).forEach((fk: any) => {
        fkMap.set(fk.COLUMN_NAME, {
            table: fk.REFERENCED_TABLE_NAME,
            column: fk.REFERENCED_COLUMN_NAME
        });
    });

    return (rows as any[]).map(row => ({
      name: row.Field,
      type: row.Type.toUpperCase().includes('UNSIGNED') ? row.Type.replace(' unsigned', '').toUpperCase() : row.Type.toUpperCase(),
      unsigned: row.Type.toLowerCase().includes('unsigned') ? 1 : 0,
      notnull: row.Null === 'NO' ? 1 : 0,
      dflt_value: row.Default,
      pk: row.Key === 'PRI' ? 1 : 0,
      fk: fkMap.get(row.Field) || null
    }));
  }

  async updateTableStructure(tableName: string, actions: any[]) {
    if (!this.connection) throw new Error('Database not connected');
    const results = [];
    for (const action of actions) {
      if (action.type === 'add_column') {
        const col = action.column;
        let def = `\`${col.name}\` ${col.type}`;
        if (!col.nullable) def += ' NOT NULL';
        if (col.default) def += ` DEFAULT ${col.default}`;
        try {
            await this.connection.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN ${def}`);
            results.push({ action: 'add_column', success: true });
        } catch (e: any) {
            results.push({ action: 'add_column', success: false, error: e.message });
        }
      } else if (action.type === 'drop_column') {
        try {
            await this.connection.execute(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${action.columnName}\``);
            results.push({ action: 'drop_column', success: true });
        } catch (e: any) {
            results.push({ action: 'drop_column', success: false, error: e.message });
        }
      } else if (action.type === 'modify_column') {
        const col = action.column;
        let def = `\`${col.name}\` ${col.type}`;
        if (!col.nullable) def += ' NOT NULL';
        if (col.default) def += ` DEFAULT ${col.default}`;
        try {
            // MySQL syntax: MODIFY COLUMN
            await this.connection.execute(`ALTER TABLE \`${tableName}\` MODIFY COLUMN ${def}`);
            results.push({ action: 'modify_column', success: true });
        } catch (e: any) {
            results.push({ action: 'modify_column', success: false, error: e.message });
        }
      } else if (action.type === 'add_foreign_key') {
        try {
            const { constraintName, column, refTable, refColumn, onUpdate, onDelete } = action;
            let sql = `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(\`${refColumn}\`)`;
            if (onDelete && onDelete !== 'NO ACTION') sql += ` ON DELETE ${onDelete}`;
            if (onUpdate && onUpdate !== 'NO ACTION') sql += ` ON UPDATE ${onUpdate}`;
            
            console.log('Executing FK SQL:', sql);
            await this.connection.execute(sql);
            results.push({ action: 'add_foreign_key', success: true });
        } catch (e: any) {
            console.error('FK Creation Failed:', e);
            results.push({ action: 'add_foreign_key', success: false, error: e.message });
        }
      } else if (action.type === 'drop_foreign_key') {
        try {
            // MySQL needs to drop the FK constraint, usually by name.
            // If we don't have the name, we might need to look it up, but let's assume UI passes it or we generated it deterministically?
            // The UI screenshot implies we are creating new ones.
            // For dropping, we usually need the constraint name.
            // If the UI doesn't have it, we might need to fetch it first.
            // For now, let's assume the action provides `constraintName`.
            await this.connection.execute(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${action.constraintName}\``);
            // Also drop the index if it was created automatically? MySQL usually keeps the index.
            results.push({ action: 'drop_foreign_key', success: true });
        } catch (e: any) {
             results.push({ action: 'drop_foreign_key', success: false, error: e.message });
        }
      }
    }
    return results;
  }

  async executeQuery(query: string) {
    if (!this.connection) throw new Error('Database not connected');
    const [rows] = await this.connection.query(query);
    return rows;
  }

  async listDatabases() {
      if (!this.connection) throw new Error('Database not connected');
      const [rows] = await this.connection.execute('SHOW DATABASES');
      const systemDbs = ['information_schema', 'mysql', 'performance_schema', 'sys'];
      return (rows as any[]).map(row => row.Database).filter(db => !systemDbs.includes(db));
  }

  async createDatabase(name: string) {
      if (!this.connection) throw new Error('Database not connected');
      await this.connection.execute(`CREATE DATABASE \`${name}\``);
      return { success: true };
  }

  async dropDatabase(name: string) {
      if (!this.connection) throw new Error('Database not connected');
      await this.connection.execute(`DROP DATABASE \`${name}\``);
      return { success: true };
  }

  async switchDatabase(name: string) {
      if (!this.connection) throw new Error('Database not connected');
      await this.connection.changeUser({ database: name });
      // Or simply: await this.connection.query(`USE \`${name}\``);
      // changeUser is cleaner for connection state
      return { success: true };
  }

  async listUsers() {
      if (!this.connection) throw new Error('Database not connected');
      const [rows] = await this.connection.execute('SELECT User, Host FROM mysql.user');
      return (rows as any[]).map(row => ({ username: row.User, host: row.Host }));
  }

  async createUser(user: any) {
      if (!this.connection) throw new Error('Database not connected');
      const { username, password, host = '%' } = user;
      await this.connection.execute(`CREATE USER ?@? IDENTIFIED BY ?`, [username, host, password]);
      return { success: true };
  }

  async dropUser(username: string, host: string = '%') {
      if (!this.connection) throw new Error('Database not connected');
      await this.connection.execute(`DROP USER ?@?`, [username, host]);
      return { success: true };
  }

  async updateUser(user: any) {
      if (!this.connection) throw new Error('Database not connected');
      const { username, password, host = '%' } = user;
      if (password) {
          await this.connection.execute(`ALTER USER ?@? IDENTIFIED BY ?`, [username, host, password]);
      }
      return { success: true };
  }
}
