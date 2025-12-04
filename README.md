# Rof Database Client

A modern, cross-platform database management tool built with Electron, React, and Ant Design. Supports MySQL and PostgreSQL.

## Features

-   **Multi-Database Support**: Connect to MySQL and PostgreSQL databases.
-   **Table Explorer**: View and edit table data with a powerful grid interface (Tabulator).
-   **Structure Editor**: Modify table schema, add/remove columns, and manage data types (including `BIGINT`, `UNSIGNED`).
-   **Foreign Key Management**: Visual editor for foreign key constraints with navigation support.
-   **Batch Editing**: Make multiple changes and save them in a single transaction with rollback support.
-   **SQL Editor**: Execute custom SQL queries and view results.
-   **Dark Mode**: Sleek dark theme for comfortable usage.

## Tech Stack

-   **Runtime**: [Electron](https://www.electronjs.org/)
-   **Frontend**: [React](https://reactjs.org/), [Vite](https://vitejs.dev/)
-   **UI Framework**: [Ant Design](https://ant.design/)
-   **Data Grid**: [React Tabulator](https://github.com/ngduc/react-tabulator)
-   **Database Drivers**: `mysql2`, `pg`
-   **Language**: [TypeScript](https://www.typescriptlang.org/)

## File Structure

```
f:\Rof Database Client\
├── electron/                   # Main process code
│   ├── main.ts                 # Application entry point & IPC handlers
│   └── preload.ts              # Preload script for secure IPC
├── src/                        # Renderer process code
│   ├── hooks/                  # Custom React hooks
│   │   ├── useBatchEditor.ts   # Batch editing & save logic
│   │   └── useTableData.ts     # Data fetching & state management
│   ├── renderer/               # IPC wrappers
│   │   └── ipc.ts              # Type-safe IPC interface
│   ├── screens/                # UI Screens & Components
│   │   ├── ConnectionScreen.tsx    # Database connection form
│   │   ├── ExplorerScreen.tsx      # Main data explorer
│   │   ├── ForeignKeyModal.tsx     # FK management modal
│   │   ├── LogViewer.tsx           # Error/Success log viewer
│   │   ├── SqlEditor.tsx           # Custom SQL query editor
│   │   └── TableStructureEditor.tsx # Schema editor
│   ├── server/                 # Database Adapter Layer (Node.js)
│   │   ├── db/
│   │   │   ├── index.ts            # Adapter factory/manager
│   │   │   ├── mysqlAdapter.ts     # MySQL implementation
│   │   │   └── postgresAdapter.ts  # PostgreSQL implementation
│   ├── styles/                 # Global styles
│   │   └── index.css
│   ├── utils/                  # Utility functions
│   │   └── columnBuilder.ts    # Tabulator column generation logic
│   ├── App.tsx                 # Main App component & Routing
│   └── main.tsx                # React entry point
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Getting Started

### Prerequisites

-   Node.js (v16 or higher)
-   npm or yarn

### Installation

1.  Clone the repository.
2.  Install dependencies:

```bash
npm install
```

### Running Locally

Start the development server (Vite + Electron):

```bash
npm run dev
```

### Building for Production

Build the application for your OS:

```bash
npm run build
```

## Development

For details on how to extend the application (e.g., adding new database adapters) or understand the architecture, please read the [Developer Guide](DEVELOPMENT.md).

-   **Linting**: `npm run lint`
-   **Type Checking**: `npm run type-check`

## License

MIT
