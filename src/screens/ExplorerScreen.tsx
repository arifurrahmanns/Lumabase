import React, { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { FilterModal } from '../components/FilterModal';
import { Layout, Menu, Button, Space, Empty, message, Select, Modal, Form, Input, Table, Dropdown, Pagination } from 'antd';
import { Plus, RefreshCw, Edit, Table as TableIcon, Code, Trash2, Database, Filter } from 'lucide-react';
import { ipc } from '../renderer/ipc';
import TableStructureEditor from './TableStructureEditor';
import CreateTableModal from './CreateTableModal';
import UserManagementModal from './UserManagementModal';
import SqlEditor from './SqlEditor';
import LogViewer from './LogViewer';
import BulkEditModal from './BulkEditModal';
import { useTableData } from '../hooks/useTableData';
import { useBatchEditor } from '../hooks/useBatchEditor';
import ResizableTitle from '../components/ResizableTitle';
import { EditableCell } from '../components/EditableCell';
import '../components/ResizableTitle.css';
import './ExplorerScreen.css';

const { Sider, Content, Footer } = Layout;

interface ExplorerScreenProps {
    connectionId: string;
    onOpenDatabase?: (dbName: string) => void;
}

interface ExplorerScreenRef {
    refresh: () => void;
    deleteCurrentDatabase?: () => void;
}

const ExplorerScreen = forwardRef<ExplorerScreenRef, ExplorerScreenProps>((props, ref) => {
  const { connectionId, onOpenDatabase } = props;
  const [tables, setTables] = useState<string[]>([]);
  const [modal, contextHolder] = Modal.useModal();
  const [collapsed, setCollapsed] = useState(false);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'sql'>('table');
  const [isStructureModalVisible, setIsStructureModalVisible] = useState(false);
  const [pendingFilter, setPendingFilter] = useState<{ field: string; value: any } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [databases, setDatabases] = useState<string[]>([]);
  const [currentDb, setCurrentDb] = useState<string>('');
  const [isCreateDbModalVisible, setIsCreateDbModalVisible] = useState(false);
  const [isCreateTableModalVisible, setIsCreateTableModalVisible] = useState(false);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false);
  const [filterConditions, setFilterConditions] = useState<any[]>([]);
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [createDbForm] = Form.useForm();
  
  // Ref to hold latest tableData to avoid dependency cycles
  const tableDataRef = useRef<any[]>([]);

  // Navigation callback for FKs
  const handleNavigate = useCallback((table: string, filter: { field: string; value: any }) => {
      setPendingFilter(filter);
      setActiveTable(table);
  }, []);

  // Ref to break dependency cycle for handleRowSave
  const handleRowSaveRef = useRef<(row: any) => void>(() => {});

  const handleRowSaveWrapper = useCallback((r: any) => handleRowSaveRef.current(r), []);

  // Custom Hooks - Called FIRST to get structure
  const { 
      tableData, 
      columns, 
      loading: dataLoading, 
      refresh, 
      loadTableData,
      setTableData,
      setColumns,
      structure
  } = useTableData(connectionId, activeTable, handleNavigate, handleRowSaveWrapper, filterConditions);

  // Sync Ref with state (must do this early for useBatchEditor to use fresh data if it used ref, but it uses callback)
  useEffect(() => {
    tableDataRef.current = tableData;
  }, [tableData]);

  const { 
      pendingChanges, 
      logs, 
      setLogs, 
      logViewerVisible, 
      setLogViewerVisible, 
      saving, 
      handleFieldChange, 
      handleSave,
      reset
  } = useBatchEditor(connectionId, activeTable, () => tableDataRef.current, () => {
      loadTableData();
  }, structure, setTableData);

  // Now handleRowSave can use ref, so it doesn't need tableData in dependency
  const handleRowSave = useCallback((newRow: any) => {
    // Find the original row to detect changes from REF using robust key check
    const getRowId = (r: any) => r._tempKey || r.id;
    const oldRow = tableDataRef.current.find((r: any) => getRowId(r) === getRowId(newRow));
    if (!oldRow) return;

    Object.keys(newRow).forEach(key => {
        if (newRow[key] !== oldRow[key]) {
            handleFieldChange(newRow, key, newRow[key]);
        }
    });

    // Optimistically update local data
    setTableData(prevData => {
        const newData = [...prevData];
        const index = newData.findIndex((item) => getRowId(item) === getRowId(newRow));
        if (index > -1) {
            const item = newData[index];
            newData.splice(index, 1, { ...item, ...newRow });
        }
        return newData;
    });
  }, [handleFieldChange, setTableData]);

  // Update the ref so useTableData calls this logic
  useEffect(() => {
      handleRowSaveRef.current = handleRowSave;
  }, [handleRowSave]);


  // Load tables and dbs on mount or connection change
  useEffect(() => {
    const initDatabaseState = async () => {
        try {
            // 1. Get List of DBs
            const dbs = await ipc.listDatabases(connectionId);
            setDatabases(dbs);

            // 2. Get Current DB
            // 2. Get Current DB
            let current = '';
            try {
                // Use universal method that handles both MySQL (SELECT DATABASE()) and Postgres (current_database())
                current = await ipc.getCurrentDatabase(connectionId);
            } catch (e) {
                console.warn('Failed to get current database:', e);
            }

            // 3. Selection Logic
            const systemDbs = ['information_schema', 'mysql', 'performance_schema', 'sys', 'postgres'];
            const isSystem = !current || systemDbs.includes(current);

            // If we are on a system DB (default connection), show NOTHING selected.
            // User must explicitly pick a DB.
            if (isSystem) {
                console.log(`System database '${current}' detected. Defaulting to no selection.`);
                setCurrentDb('');
                setTables([]);
            } else {
                // If we connected directly to a user DB, show it.
                setCurrentDb(current);
                const tables = await ipc.listTables(connectionId);
                setTables(tables);
            }

        } catch (e: any) {
            console.error('Failed to init databse state:', e);
            message.error('Failed to initialize connection: ' + e.message);
        }
    };
    
    initDatabaseState();
  }, [connectionId]);

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
      // Use the ref passed from useBatchEditor or parent
      if (activeTable) {
        refresh();
        reset(); 
        setSelectedRowKeys([]); // connect reset
      } else {
        loadTables();
        loadDatabases();
      }
  }, [activeTable, refresh, reset]);

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
  };

  const hasSelected = selectedRowKeys.length > 0;

  const [isBulkEditVisible, setIsBulkEditVisible] = useState(false);

  const handleBulkUpdate = async (column: string, value: any, mode: 'selection' | 'filter', conditions?: any[]) => {
      const pk = 'id'; // Hardcoded for now
      try {
          if (mode === 'filter') {
               if (!conditions || conditions.length === 0) {
                   message.error("No conditions provided for filter update");
                   return;
               }
               const result = await ipc.updateRowsByFilter(connectionId, activeTable!, column, value, conditions);
               message.success(`Updated ${column} for ${result.changes} rows matching criteria`);
          } else {
              // Standard Selection Mode
              const dbKeys = selectedRowKeys.filter(k => !String(k).startsWith('new_'));
              
              if (dbKeys.length > 0) {
                  await ipc.updateRows(connectionId, activeTable!, column, value, pk, dbKeys);
                  message.success(`Updated ${column} for ${dbKeys.length} rows`);
              } else {
                  message.warning('Only new unsaved rows selected. Edit them manually.');
                  return;
              }
          }
          
          loadTableData(); 
          setSelectedRowKeys([]); 
      } catch (e: any) {
          console.error(e);
          message.error(`Failed to update: ${e.message}`);
          throw e; 
      }
  };

  const handleBulkDelete = () => {
      if (!selectedRowKeys.length) return;
       modal.confirm({
          title: `Delete ${selectedRowKeys.length} rows?`,
          content: 'This action cannot be undone.',
          okText: `Delete ${selectedRowKeys.length} Items`,
          okType: 'danger',
          onOk: async () => {
              const pk = 'id'; // Hardcoded for now, should get from structure
              try {
                  // Filter out unsaved rows (keys starting with 'new_') from database delete
                  const dbKeys = selectedRowKeys.filter(k => !String(k).startsWith('new_'));
                  const localKeys = selectedRowKeys.filter(k => String(k).startsWith('new_'));
                  
                  if (dbKeys.length > 0) {
                      await ipc.deleteRows(connectionId, activeTable!, pk, dbKeys);
                  }
                  
                  // Also remove from local state
                  if (localKeys.length > 0) {
                      setTableData(prev => prev.filter(r => !localKeys.includes(r._tempKey)));
                  }

                  message.success(`Deleted ${selectedRowKeys.length} rows`);
                  setSelectedRowKeys([]);
                  loadTableData();
              } catch (e: any) {
                  message.error(`Failed to delete rows: ${e.message}`);
              }
          }
      });
  };

  useImperativeHandle(ref, () => ({
      refresh: handleRefresh,
      deleteCurrentDatabase: () => {
          if (currentDb) {
              handleDropDatabase(currentDb);
          } else {
              message.warning("No database selected to delete.");
          }
      }
  }));

  const handleResize = (index: number) => (_: any, { size }: any) => {
       setColumns((prevColumns: any[]) => {
           const nextColumns = [...prevColumns];
           nextColumns[index] = {
               ...nextColumns[index],
               width: size.width,
           };
           return nextColumns;
       });
  };

  const filteredData = React.useMemo(() => {
     if (!pendingFilter) return tableData;
     return tableData.filter(item => item[pendingFilter.field] == pendingFilter.value);
  }, [tableData, pendingFilter]);

  const paginatedData = React.useMemo(() => {
      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize;
      return filteredData.slice(start, end);
  }, [filteredData, currentPage, pageSize]);

  useEffect(() => {
      setCurrentPage(1);
  }, [pendingFilter, activeTable]);

  useEffect(() => {
       if (pendingFilter) {
           message.success(`Filtered by ${pendingFilter.field} = ${pendingFilter.value}`);
       }
  }, [pendingFilter]);
  
  const clearFilter = () => setPendingFilter(null);

  const loadTables = async () => {
    try {
      const list = await ipc.listTables(connectionId);
      setTables(list);
    } catch (error) {
    }
  };

  const loadDatabases = async () => {
      try {
          const dbs = await ipc.listDatabases(connectionId);
          setDatabases(dbs);
      } catch (error) {
          console.error(error);
      }
  };

  const handleCreateDatabase = async (values: any) => {
      try {
          await ipc.createDatabase(connectionId, values.name);
          message.success(`Database ${values.name} created`);
          setIsCreateDbModalVisible(false);
          createDbForm.resetFields();
          loadDatabases();
          
          if (onOpenDatabase) {
              onOpenDatabase(values.name);
          }
      } catch (e: any) {
          message.error(`Failed to create database: ${e.message}`);
      }
  };

  const handleDatabaseChange = async (dbName: string) => {
      try {
          await ipc.switchDatabase(connectionId, dbName);
          setCurrentDb(dbName);
          message.success(`Switched to ${dbName}`);
          loadTables();
          setActiveTable(null);
      } catch (e: any) {
          message.error(`Failed to switch database: ${e.message}`);
      }
  };

  const handleDropDatabase = (dbName: string) => {
      modal.confirm({
          title: `Delete database "${dbName}"?`,
          content: 'This action cannot be undone.',
          okText: 'Delete',
          okType: 'danger',
          onOk: async () => {
              try {
                  await ipc.dropDatabase(connectionId, dbName);
                  message.success(`Database ${dbName} deleted`);
                  if (currentDb === dbName) {
                      setCurrentDb('');
                      setTables([]);
                      setActiveTable(null);
                  }
                  loadDatabases();
              } catch (e: any) {
                  message.error(`Failed to delete database: ${e.message}`);
              }
          }
      });
  };

  const handleAddRow = async () => {
      if (!activeTable) return;
      try {
          // Construct default row
          const defaultRow: any = {};
          if (structure && structure.length > 0) {
            structure.forEach((col: any) => {
                // SKIP Auto-Increment and Defaults for ID and PK
                if (col.autoIncrement || col.pk) {
                    return; // Leave undefined
                }
                
                if (col.notnull && col.dflt_value === null) {
                    if (col.type.includes('INT') || col.type.includes('DECIMAL') || col.type.includes('FLOAT') || col.type.includes('DOUBLE')) {
                        defaultRow[col.name] = 0;
                    } else if (col.type.includes('CHAR') || col.type.includes('TEXT')) {
                        defaultRow[col.name] = '';
                    } else if (col.type.includes('DATE') || col.type.includes('TIME')) {
                        defaultRow[col.name] = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    } else {
                        defaultRow[col.name] = ''; 
                    }
                }
            });
          }

          // Generate Metadata
          defaultRow._tempKey = `new_${Date.now()}`;
          defaultRow._isNew = true;

          console.log('Adding local row:', defaultRow);
          // Add to local state only
          setTableData(prev => [defaultRow, ...prev]);
          
          message.info('Row added manually. Click Save to persist.');
      } catch (e: any) {
          console.error(e);
          message.error(`Failed to add row: ${e.message || e}`);
      }
  };

  const mergedColumns = columns.map((col, index) => ({
      ...col,
      onHeaderCell: (column: any) => ({
          width: column.width,
          onResize: handleResize(index),
      }),
  }));

  const handleDropTable = (tableName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      modal.confirm({
          title: `Delete table "${tableName}"?`,
          content: 'This action cannot be undone. All data will be lost.',
          okText: 'Delete',
          okType: 'danger',
          onOk: async () => {
              try {
                  await ipc.dropTable(connectionId, tableName);
                  message.success(`Table ${tableName} deleted`);
                  if (activeTable === tableName) {
                      setActiveTable(null);
                  }
                  loadTables();
              } catch (e: any) {
                  message.error(`Failed to delete table: ${e.message}`);
              }
          }
      });
  };

  return (
    <Layout style={{ height: '100%' }}>
      {contextHolder}
      <Sider 
        theme="dark" 
        collapsible 
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
        width={250} 
        style={{ borderRight: '1px solid var(--border)', minHeight: '100%', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ padding: 16 }}>
            {collapsed ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <Dropdown 
                        menu={{ 
                            items: [
                                ...databases.map(db => ({
                                    key: db,
                                    label: (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 150 }}>
                                            <span>{db}</span>
                                            {currentDb === db && <span style={{ fontSize: 12, color: 'var(--primary)' }}> (Active)</span>}
                                        </div>
                                    ),
                                    onClick: () => handleDatabaseChange(db)
                                })),
                                { type: 'divider' },
                                {
                                    key: 'refresh-dbs',
                                    icon: <RefreshCw size={16} />,
                                    label: 'Refresh List',
                                    onClick: () => loadDatabases()
                                },
                                {
                                    key: 'new-db',
                                    icon: <Plus size={16} />,
                                    label: 'New Database',
                                    onClick: () => setIsCreateDbModalVisible(true)
                                },
                                {
                                    key: 'manage-users',
                                    icon: <Edit size={16} />,
                                    label: 'Manage Users',
                                    onClick: () => setIsUserModalVisible(true)
                                }
                            ]
                        }} 
                        trigger={['click']}
                    >
                         <Button type="text" icon={<Database size={16} />} title={currentDb || "Select Database"} />
                    </Dropdown>
                </div>
            ) : (
                <Select 
                    style={{ width: '100%', marginBottom: 8 }} 
                    placeholder="Select Database"
                    value={currentDb || undefined}
                    onChange={handleDatabaseChange}
                    dropdownRender={menu => (
                        <>
                            {menu}
                            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 8px 8px', marginTop: 4 }}>
                                <Button 
                                    type="primary" 
                                    block 
                                    icon={<Plus size={14} />} 
                                    onClick={() => setIsCreateDbModalVisible(true)}
                                    style={{ marginBottom: 8 }}
                                >
                                    New Database
                                </Button>
                                <Button 
                                    block 
                                    icon={<Edit size={14} />} 
                                    onClick={() => setIsUserModalVisible(true)}
                                >
                                    Manage Users
                                </Button>
                            </div>
                        </>
                    )}
                >
                    {databases.length === 0 ? (
                         <Select.Option key="no-db" value="no-db" disabled>
                            <div style={{ padding: '8px 0', textAlign: 'center', color: '#888' }}>
                                No databases found
                            </div>
                         </Select.Option>
                    ) : (
                        databases.map(db => (
                            <Select.Option key={db} value={db}>
                                {db}
                            </Select.Option>
                        ))
                    )}
                </Select>
            )}
        </div>
        {currentDb ? (
            <>
                <div style={{ padding: '0 16px', color: '#888', fontSize: '12px', fontWeight: 'bold' }}>TABLES</div>
                <Menu
                theme="dark"
                mode="inline"
                selectedKeys={viewMode === 'table' && activeTable ? [activeTable] : viewMode === 'sql' ? ['sql-editor'] : []}
                onClick={(e) => {
                    if (e.key === 'sql-editor') {
                        setViewMode('sql');
                        setActiveTable(null);
                        setPendingFilter(null);
                    } else {
                        // Prevent navigation if it was the delete button clicked (though stopPropagation in handleDropTable normally handles this, extra safety)
                        if ((e as any).domEvent && (e as any).domEvent.defaultPrevented) return;
                        
                        setViewMode('table');
                        setActiveTable(e.key);
                        setPendingFilter(null);
                        setSelectedRowKeys([]);
                    }
                }}
                items={[
                    { key: 'sql-editor', icon: <Code size={16} />, label: 'SQL Editor', style: { marginBottom: 8 } },
                    { type: 'divider' },
                    ...tables.map(t => ({ 
                        key: t, 
                        icon: <TableIcon size={16} />, 
                        label: (
                            <Dropdown 
                                menu={{ 
                                    items: [
                                        { 
                                            key: 'delete', 
                                            label: 'Delete Table', 
                                            icon: <Trash2 size={14} />, 
                                            danger: true,
                                            onClick: ({ domEvent }) => handleDropTable(t, domEvent as any) 
                                        }
                                    ] 
                                }} 
                                trigger={['contextMenu']}
                            >
                                <span style={{ display: 'block', width: '100%' }}>{t}</span>
                            </Dropdown>
                        ) 
                    }))
                ]}
                />
            </>
        ) : (
             <div style={{ padding: 20, textAlign: 'center', color: '#666', marginTop: 20 }}>
                 <div>Please select a database to view tables</div>
             </div>
        )}
          </div>
          {currentDb && (
            <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
                <Button 
                    type="dashed" 
                    block={!collapsed} 
                    icon={<Plus size={16} />} 
                    onClick={() => setIsCreateTableModalVisible(true)}
                    title={collapsed ? "New Table" : undefined}
                >
                    {!collapsed && "New Table"}
                </Button>
            </div>
          )}
        </div>
      </Sider>
      <Layout>
        <Content style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--background)' }}>
          {viewMode === 'sql' ? (
              <SqlEditor connectionId={connectionId} />
          ) : activeTable ? (
            <>
              <div style={{ padding: '8px 16px', background: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <Button icon={<Plus size={16} />} onClick={handleAddRow}>Add Row</Button>
                    <Button icon={<RefreshCw size={16} />} onClick={handleRefresh}>Refresh</Button>
                    {hasSelected && (
                        <Space size={8}>
                        <Button 
                            danger 
                            type="primary" 
                            icon={<Trash2 size={16} />} 
                            onClick={handleBulkDelete}
                        >
                            Delete ({selectedRowKeys.length})
                        </Button>
                        <Button
                            icon={<Edit size={16} />}
                            onClick={() => setIsBulkEditVisible(true)}
                        >
                            Edit ({selectedRowKeys.length})
                        </Button>
                        </Space>
                    )}
                    <Button icon={<Edit size={16} />} onClick={() => setIsStructureModalVisible(true)}>Structure</Button>
                    {pendingFilter && <Button onClick={clearFilter}>Clear Filter</Button>}
                </Space>
                <Space>
                    <Button 
                        type={filterConditions.length > 0 ? "primary" : "default"}
                        icon={<Filter size={16} />} 
                        onClick={() => setIsFilterVisible(true)}
                    >
                        Filter {filterConditions.length > 0 && `(${filterConditions.length})`}
                    </Button>
                    <div style={{ color: 'var(--muted-foreground)' }}>{filteredData.length} rows</div>
                </Space>
              </div>
              <FilterModal
                  visible={isFilterVisible}
                  columns={structure}
                  activeFilters={filterConditions}
                  onCancel={() => setIsFilterVisible(false)}
                  onApply={(newConditions) => {
                      setFilterConditions(newConditions);
                      setIsFilterVisible(false);
                  }}
              />
              <div style={{ flex: 1, overflow: 'auto' }}>
                <Table
                  bordered
                  rowSelection={{
                      selectedRowKeys,
                      onChange: onSelectChange,
                  }}
                  dataSource={paginatedData}
                  columns={mergedColumns}
                  components={{
                      header: { cell: ResizableTitle },
                      body: { cell: EditableCell }
                  }}
                  rowKey={(r) => r._tempKey || r.id}
                  pagination={false}
                  size="small"
                />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Empty description={currentDb ? "Select a table to view data" : "Select a database to continue"} />
            </div>
            </div>
          )}
        </Content>
        <Footer style={{ padding: '8px 16px', background: 'var(--sidebar)', color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{activeTable ? `Connected: ${activeTable}` : 'Ready'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                 {activeTable && (
                    <Pagination 
                        current={currentPage}
                        pageSize={pageSize}
                        total={filteredData.length}
                        onChange={(page, size) => {
                            setCurrentPage(page);
                            setPageSize(size);
                        }}
                        size="small"
                        showSizeChanger
                        showQuickJumper
                        showTotal={(total) => `Total ${total}`}
                    />
                )}
                <Space>
                    <Button onClick={() => setLogViewerVisible(true)}>Logs</Button>
                    {activeTable && (
                        <Button 
                            type="primary" 
                            onClick={handleSave} 
                            disabled={pendingChanges.size === 0}
                            loading={saving || dataLoading}
                        >
                            Save ({pendingChanges.size})
                        </Button>
                    )}
                </Space>
            </div>
        </Footer>
      </Layout>
      
      <LogViewer 
        visible={logViewerVisible} 
        onClose={() => setLogViewerVisible(false)} 
        logs={logs}
        onClear={() => setLogs([])}
      />
      
      <Modal
        title="Create Database"
        open={isCreateDbModalVisible}
        onCancel={() => setIsCreateDbModalVisible(false)}
        footer={null}
      >
          <Form form={createDbForm} onFinish={handleCreateDatabase}>
              <Form.Item name="name" rules={[{ required: true, message: 'Please enter database name' }]}>
                  <Input placeholder="Database Name" />
              </Form.Item>
              <Form.Item>
                  <Button type="primary" htmlType="submit" block>Create</Button>
              </Form.Item>
          </Form>
      </Modal>
      
      {isStructureModalVisible && activeTable && (
        <TableStructureEditor
          visible={isStructureModalVisible}
          tableName={activeTable}
          connectionId={connectionId}
          onCancel={() => setIsStructureModalVisible(false)}
          onSuccess={() => {
             loadTableData();
          }}
        />
      )}


      <BulkEditModal 
        visible={isBulkEditVisible}
        columns={structure}
        selectedCount={selectedRowKeys.length}
        activeFilters={filterConditions}
        onCancel={() => setIsBulkEditVisible(false)}
        onUpdate={handleBulkUpdate}
      />

      <CreateTableModal
        visible={isCreateTableModalVisible}
        onCancel={() => setIsCreateTableModalVisible(false)}
        connectionId={connectionId}
        onSuccess={() => {
            setIsCreateTableModalVisible(false);
            loadTables();
        }}
      />

      <UserManagementModal
        visible={isUserModalVisible}
        onCancel={() => setIsUserModalVisible(false)}
        connectionId={connectionId}
      />
    </Layout>
  );
});

export default ExplorerScreen;
