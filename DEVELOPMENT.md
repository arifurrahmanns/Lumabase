# Developer Guide

This document provides technical details on how to extend and scale the Rof Database Client.

## Architecture Overview

The application follows a standard Electron architecture with a clear separation of concerns:

1.  **Main Process (`electron/`)**: Handles the application lifecycle, window management, and native Node.js capabilities. It hosts the "Server" layer.
2.  **Renderer Process (`src/`)**: The React UI. It communicates with the Main process via secure IPC.
3.  **Server Layer (`src/server/`)**: Acts as the backend logic running within the Main process. It manages database connections and executes queries.

## Adding a New Database Adapter

To add support for a new database (e.g., SQLite, MSSQL), follow these steps:

### 1. Create the Adapter

Create a new file in `src/server/db/` (e.g., `sqliteAdapter.ts`) that implements the `DatabaseAdapter` interface.

```typescript
// src/server/db/sqliteAdapter.ts
import { DatabaseAdapter } from './index';

export class SqliteAdapter implements DatabaseAdapter {
    // Implement all required methods
    async connect(config: any): Promise<void> { ... }
    async listTables(): Promise<string[]> { ... }
    async getTableData(tableName: string): Promise<any[]> { ... }
    // ...
}
```

### 2. Register the Adapter

Update `src/server/db/index.ts` to include your new adapter in the `DatabaseManager`.

```typescript
// src/server/db/index.ts
import { SqliteAdapter } from './sqliteAdapter';

export class DatabaseManager {
    // ...
    async connect(config: any) {
        switch (config.type) {
            case 'mysql':
                this.adapter = new MysqlAdapter();
                break;
            case 'postgres':
                this.adapter = new PostgresAdapter();
                break;
            case 'sqlite': // Add this
                this.adapter = new SqliteAdapter();
                break;
            default:
                throw new Error('Unsupported database type');
        }
        await this.adapter.connect(config);
    }
}
```

### 3. Update the UI

Update `src/screens/ConnectionScreen.tsx` to allow users to select the new database type and input the necessary connection details.

## Scaling and Refactoring

### Modular UI Logic (Hooks)

To keep the application scalable, avoid putting complex logic directly inside React components. Use **Custom Hooks** in `src/hooks/`.

-   **Data Fetching**: Use hooks like `useTableData` to handle loading states and IPC calls.
-   **Business Logic**: Use hooks like `useBatchEditor` to handle complex interactions like batch saving, validation, and error logging.

### Column Generation (Utils)

Table column definitions (especially for Tabulator) can get complex. Use `src/utils/columnBuilder.ts` to generate these definitions dynamically based on the table structure. This keeps the `ExplorerScreen` clean.

### IPC Communication

All communication between the UI and the Database happens via IPC.
-   **Renderer**: Define typed wrappers in `src/renderer/ipc.ts`.
-   **Main**: Register handlers in `electron/main.ts`.

When adding new features (e.g., "Export to CSV"), always implement the logic in the Main process (or Server layer) and expose it via a new IPC handler.

## Best Practices

-   **Type Safety**: Always define interfaces for your data structures (e.g., `TableStructure`, `ConnectionConfig`).
-   **Error Handling**: The UI should never crash. Catch errors in the Main process and return meaningful error messages to the Renderer.
-   **Optimistic UI**: When possible, update the UI immediately (e.g., in `useBatchEditor`) before waiting for the server response, but always have a rollback mechanism (reloading data) on failure.
