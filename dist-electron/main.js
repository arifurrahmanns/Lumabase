"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path = require("node:path");
const mysql = require("mysql2/promise");
const pg = require("pg");
class MysqlAdapter {
  constructor() {
    __publicField(this, "connection", null);
    __publicField(this, "config", null);
  }
  async connect(config) {
    try {
      this.connection = await mysql.createConnection({
        host: config.host,
        port: parseInt(config.port) || 3306,
        user: config.user,
        password: config.password,
        database: config.database
      });
      this.config = config;
      return { success: true };
    } catch (error) {
      console.error("MySQL Connection failed:", error);
      return { success: false, error: error.message };
    }
  }
  async listTables() {
    if (!this.connection) throw new Error("Database not connected");
    const [rows] = await this.connection.execute("SHOW TABLES");
    return rows.map((row) => Object.values(row)[0]);
  }
  async getTableData(tableName) {
    if (!this.connection) throw new Error("Database not connected");
    const [rows] = await this.connection.query(`SELECT * FROM \`${tableName}\``);
    return rows;
  }
  async addRow(tableName, row) {
    if (!this.connection) throw new Error("Database not connected");
    const keys = Object.keys(row);
    const placeholders = keys.map(() => "?").join(",");
    const sql = `INSERT INTO \`${tableName}\` (${keys.map((k) => `\`${k}\``).join(",")}) VALUES (${placeholders})`;
    const [result] = await this.connection.execute(sql, Object.values(row));
    return { success: true, id: result.insertId };
  }
  async updateRow(tableName, row, primaryKeyColumn, primaryKeyValue) {
    if (!this.connection) throw new Error("Database not connected");
    const keys = Object.keys(row).filter((k) => k !== primaryKeyColumn);
    const setClause = keys.map((k) => `\`${k}\` = ?`).join(",");
    const sql = `UPDATE \`${tableName}\` SET ${setClause} WHERE \`${primaryKeyColumn}\` = ?`;
    const [result] = await this.connection.execute(sql, [...keys.map((k) => row[k]), primaryKeyValue]);
    return { success: true, changes: result.affectedRows };
  }
  async deleteRow(tableName, primaryKeyColumn, primaryKeyValue) {
    if (!this.connection) throw new Error("Database not connected");
    const sql = `DELETE FROM \`${tableName}\` WHERE \`${primaryKeyColumn}\` = ?`;
    const [result] = await this.connection.execute(sql, [primaryKeyValue]);
    return { success: true, changes: result.affectedRows };
  }
  async createTable(tableName, columns) {
    if (!this.connection) throw new Error("Database not connected");
    const colDefs = columns.map((col) => {
      let def = `\`${col.name}\` ${col.type}`;
      if (!col.nullable) def += " NOT NULL";
      if (col.default) def += ` DEFAULT ${col.default}`;
      if (col.primaryKey) def += " PRIMARY KEY";
      if (col.autoIncrement) def += " AUTO_INCREMENT";
      return def;
    }).join(",");
    const sql = `CREATE TABLE \`${tableName}\` (${colDefs})`;
    await this.connection.execute(sql);
    return { success: true };
  }
  async dropTable(tableName) {
    if (!this.connection) throw new Error("Database not connected");
    await this.connection.execute(`DROP TABLE \`${tableName}\``);
    return { success: true };
  }
  async getTableStructure(tableName) {
    if (!this.connection) throw new Error("Database not connected");
    const [rows] = await this.connection.execute(`SHOW COLUMNS FROM \`${tableName}\``);
    const [fks] = await this.connection.execute(`
      SELECT 
        COLUMN_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME 
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
    `, [tableName]);
    console.log("Fetched FKs for", tableName, fks);
    const fkMap = /* @__PURE__ */ new Map();
    fks.forEach((fk) => {
      fkMap.set(fk.COLUMN_NAME, {
        table: fk.REFERENCED_TABLE_NAME,
        column: fk.REFERENCED_COLUMN_NAME
      });
    });
    return rows.map((row) => ({
      name: row.Field,
      type: row.Type.toUpperCase().includes("UNSIGNED") ? row.Type.replace(" unsigned", "").toUpperCase() : row.Type.toUpperCase(),
      unsigned: row.Type.toLowerCase().includes("unsigned") ? 1 : 0,
      notnull: row.Null === "NO" ? 1 : 0,
      dflt_value: row.Default,
      pk: row.Key === "PRI" ? 1 : 0,
      fk: fkMap.get(row.Field) || null
    }));
  }
  async updateTableStructure(tableName, actions) {
    if (!this.connection) throw new Error("Database not connected");
    const results = [];
    for (const action of actions) {
      if (action.type === "add_column") {
        const col = action.column;
        let def = `\`${col.name}\` ${col.type}`;
        if (!col.nullable) def += " NOT NULL";
        if (col.default) def += ` DEFAULT ${col.default}`;
        try {
          await this.connection.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN ${def}`);
          results.push({ action: "add_column", success: true });
        } catch (e) {
          results.push({ action: "add_column", success: false, error: e.message });
        }
      } else if (action.type === "drop_column") {
        try {
          await this.connection.execute(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${action.columnName}\``);
          results.push({ action: "drop_column", success: true });
        } catch (e) {
          results.push({ action: "drop_column", success: false, error: e.message });
        }
      } else if (action.type === "modify_column") {
        const col = action.column;
        let def = `\`${col.name}\` ${col.type}`;
        if (!col.nullable) def += " NOT NULL";
        if (col.default) def += ` DEFAULT ${col.default}`;
        try {
          await this.connection.execute(`ALTER TABLE \`${tableName}\` MODIFY COLUMN ${def}`);
          results.push({ action: "modify_column", success: true });
        } catch (e) {
          results.push({ action: "modify_column", success: false, error: e.message });
        }
      } else if (action.type === "add_foreign_key") {
        try {
          const { constraintName, column, refTable, refColumn, onUpdate, onDelete } = action;
          let sql = `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(\`${refColumn}\`)`;
          if (onDelete && onDelete !== "NO ACTION") sql += ` ON DELETE ${onDelete}`;
          if (onUpdate && onUpdate !== "NO ACTION") sql += ` ON UPDATE ${onUpdate}`;
          console.log("Executing FK SQL:", sql);
          await this.connection.execute(sql);
          results.push({ action: "add_foreign_key", success: true });
        } catch (e) {
          console.error("FK Creation Failed:", e);
          results.push({ action: "add_foreign_key", success: false, error: e.message });
        }
      } else if (action.type === "drop_foreign_key") {
        try {
          await this.connection.execute(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${action.constraintName}\``);
          results.push({ action: "drop_foreign_key", success: true });
        } catch (e) {
          results.push({ action: "drop_foreign_key", success: false, error: e.message });
        }
      }
    }
    return results;
  }
  async executeQuery(query) {
    if (!this.connection) throw new Error("Database not connected");
    const [rows] = await this.connection.query(query);
    return rows;
  }
}
class PostgresAdapter {
  constructor() {
    __publicField(this, "client", null);
  }
  async connect(config) {
    try {
      this.client = new pg.Client({
        host: config.host,
        port: parseInt(config.port) || 5432,
        user: config.user,
        password: config.password,
        database: config.database
      });
      await this.client.connect();
      return { success: true };
    } catch (error) {
      console.error("Postgres Connection failed:", error);
      return { success: false, error: error.message };
    }
  }
  async listTables() {
    if (!this.client) throw new Error("Database not connected");
    const res = await this.client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    return res.rows.map((row) => row.table_name);
  }
  async getTableData(tableName) {
    if (!this.client) throw new Error("Database not connected");
    const res = await this.client.query(`SELECT * FROM "${tableName}"`);
    return res.rows;
  }
  async addRow(tableName, row) {
    if (!this.client) throw new Error("Database not connected");
    const keys = Object.keys(row);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(",");
    const sql = `INSERT INTO "${tableName}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${placeholders}) RETURNING *`;
    await this.client.query(sql, Object.values(row));
    return { success: true };
  }
  async updateRow(tableName, row, primaryKeyColumn, primaryKeyValue) {
    if (!this.client) throw new Error("Database not connected");
    const keys = Object.keys(row).filter((k) => k !== primaryKeyColumn);
    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(",");
    const sql = `UPDATE "${tableName}" SET ${setClause} WHERE "${primaryKeyColumn}" = $${keys.length + 1}`;
    const res = await this.client.query(sql, [...keys.map((k) => row[k]), primaryKeyValue]);
    return { success: true, changes: res.rowCount };
  }
  async deleteRow(tableName, primaryKeyColumn, primaryKeyValue) {
    if (!this.client) throw new Error("Database not connected");
    const sql = `DELETE FROM "${tableName}" WHERE "${primaryKeyColumn}" = $1`;
    const res = await this.client.query(sql, [primaryKeyValue]);
    return { success: true, changes: res.rowCount };
  }
  async createTable(tableName, columns) {
    if (!this.client) throw new Error("Database not connected");
    const colDefs = columns.map((col) => {
      let def = `"${col.name}" ${col.type}`;
      if (!col.nullable) def += " NOT NULL";
      if (col.default) def += ` DEFAULT ${col.default}`;
      if (col.primaryKey) def += " PRIMARY KEY";
      if (col.autoIncrement) def = `"${col.name}" SERIAL PRIMARY KEY`;
      return def;
    }).join(",");
    const sql = `CREATE TABLE "${tableName}" (${colDefs})`;
    await this.client.query(sql);
    return { success: true };
  }
  async dropTable(tableName) {
    if (!this.client) throw new Error("Database not connected");
    await this.client.query(`DROP TABLE "${tableName}"`);
    return { success: true };
  }
  async getTableStructure(tableName) {
    if (!this.client) throw new Error("Database not connected");
    const sql = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1
    `;
    const res = await this.client.query(sql, [tableName]);
    return res.rows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
      notnull: row.is_nullable === "NO" ? 1 : 0,
      dflt_value: row.column_default,
      pk: 0
      // Fetching PKs in PG is more complex, skipping for MVP or need extra query
    }));
  }
  async updateTableStructure(tableName, actions) {
    if (!this.client) throw new Error("Database not connected");
    const results = [];
    for (const action of actions) {
      if (action.type === "add_column") {
        const col = action.column;
        let def = `"${col.name}" ${col.type}`;
        if (!col.nullable) def += " NOT NULL";
        if (col.default) def += ` DEFAULT ${col.default}`;
        try {
          await this.client.query(`ALTER TABLE "${tableName}" ADD COLUMN ${def}`);
          results.push({ action: "add_column", success: true });
        } catch (e) {
          results.push({ action: "add_column", success: false, error: e.message });
        }
      } else if (action.type === "drop_column") {
        try {
          await this.client.query(`ALTER TABLE "${tableName}" DROP COLUMN "${action.columnName}"`);
          results.push({ action: "drop_column", success: true });
        } catch (e) {
          results.push({ action: "drop_column", success: false, error: e.message });
        }
      } else if (action.type === "modify_column") {
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
          results.push({ action: "modify_column", success: true });
        } catch (e) {
          results.push({ action: "modify_column", success: false, error: e.message });
        }
      } else if (action.type === "add_foreign_key") {
        try {
          const { constraintName, column, refTable, refColumn, onUpdate, onDelete } = action;
          let sql = `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${column}") REFERENCES "${refTable}"("${refColumn}")`;
          if (onDelete && onDelete !== "NO ACTION") sql += ` ON DELETE ${onDelete}`;
          if (onUpdate && onUpdate !== "NO ACTION") sql += ` ON UPDATE ${onUpdate}`;
          await this.client.query(sql);
          results.push({ action: "add_foreign_key", success: true });
        } catch (e) {
          results.push({ action: "add_foreign_key", success: false, error: e.message });
        }
      } else if (action.type === "drop_foreign_key") {
        try {
          await this.client.query(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${action.constraintName}"`);
          results.push({ action: "drop_foreign_key", success: true });
        } catch (e) {
          results.push({ action: "drop_foreign_key", success: false, error: e.message });
        }
      }
    }
    return results;
  }
  async executeQuery(query) {
    if (!this.client) throw new Error("Database not connected");
    const res = await this.client.query(query);
    return res.rows;
  }
}
class DatabaseManager {
  constructor() {
    __publicField(this, "adapter", null);
  }
  async connect(config) {
    console.log("DatabaseManager.connect called with:", JSON.stringify(config));
    const type = config.type ? config.type.toString().trim() : "";
    console.log(`Type: '${type}', Equal to mysql? ${type === "mysql"}`);
    if (type === "mysql") {
      this.adapter = new MysqlAdapter();
    } else if (type === "postgres") {
      this.adapter = new PostgresAdapter();
    } else {
      console.error("Unsupported type:", type);
      throw new Error(`Unsupported database type: ${config.type}`);
    }
    return this.adapter.connect(config);
  }
  // Proxy methods to the active adapter
  async listTables() {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.listTables();
  }
  async getTableData(tableName) {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.getTableData(tableName);
  }
  async addRow(tableName, row) {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.addRow(tableName, row);
  }
  async updateRow(tableName, row, pkCol, pkVal) {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.updateRow(tableName, row, pkCol, pkVal);
  }
  async deleteRow(tableName, pkCol, pkVal) {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.deleteRow(tableName, pkCol, pkVal);
  }
  async createTable(tableName, columns) {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.createTable(tableName, columns);
  }
  async dropTable(tableName) {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.dropTable(tableName);
  }
  async getTableStructure(tableName) {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.getTableStructure(tableName);
  }
  async updateTableStructure(tableName, actions) {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.updateTableStructure(tableName, actions);
  }
  async executeQuery(query) {
    var _a;
    return (_a = this.adapter) == null ? void 0 : _a.executeQuery(query);
  }
}
const dbManager = new DatabaseManager();
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = electron.app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
let win;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
function createWindow() {
  win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST, "index.html"));
  }
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
    win = null;
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.app.whenReady().then(() => {
  createWindow();
  electron.ipcMain.handle("connect-database", async (_, config) => {
    return dbManager.connect(config);
  });
  electron.ipcMain.handle("test-connection", async (_, config) => {
    return dbManager.connect(config);
  });
  electron.ipcMain.handle("list-tables", async () => {
    return dbManager.listTables();
  });
  electron.ipcMain.handle("get-table-data", async (_, tableName) => {
    return dbManager.getTableData(tableName);
  });
  electron.ipcMain.handle("add-row", async (_, { tableName, row }) => {
    return dbManager.addRow(tableName, row);
  });
  electron.ipcMain.handle("update-row", async (_, { tableName, row, primaryKeyColumn, primaryKeyValue }) => {
    return dbManager.updateRow(tableName, row, primaryKeyColumn, primaryKeyValue);
  });
  electron.ipcMain.handle("delete-row", async (_, { tableName, primaryKeyColumn, primaryKeyValue }) => {
    return dbManager.deleteRow(tableName, primaryKeyColumn, primaryKeyValue);
  });
  electron.ipcMain.handle("create-table", async (_, { tableName, columns }) => {
    return dbManager.createTable(tableName, columns);
  });
  electron.ipcMain.handle("drop-table", async (_, tableName) => {
    return dbManager.dropTable(tableName);
  });
  electron.ipcMain.handle("get-table-structure", async (_, tableName) => {
    return dbManager.getTableStructure(tableName);
  });
  electron.ipcMain.handle("update-table-structure", async (_, { tableName, actions }) => {
    return dbManager.updateTableStructure(tableName, actions);
  });
  electron.ipcMain.handle("execute-query", async (_, query) => {
    return dbManager.executeQuery(query);
  });
});
