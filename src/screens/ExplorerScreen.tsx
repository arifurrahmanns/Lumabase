import React, { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Layout, Menu, Button, Space, Empty, message, Select, Modal, Form, Input, Table, Dropdown } from 'antd';
import { PlusOutlined, ReloadOutlined, EditOutlined, TableOutlined, CodeOutlined, DeleteOutlined, DatabaseOutlined } from '@ant-design/icons';
import { ipc } from '../renderer/ipc';
import TableStructureEditor from './TableStructureEditor';
import CreateTableModal from './CreateTableModal';
import UserManagementModal from './UserManagementModal';
import SqlEditor from './SqlEditor';
import LogViewer from './LogViewer';
import { useTableData } from '../hooks/useTableData';
import { useBatchEditor } from '../hooks/useBatchEditor';
import ResizableTitle from '../components/ResizableTitle';
import { EditableCell } from '../components/EditableCell';
import '../components/ResizableTitle.css';
import './ExplorerScreen.css';

const { Sider, Content, Footer } = Layout;

interface ExplorerScreenProps {
    connectionId: string;
}

interface ExplorerScreenRef {
    refresh: () => void;
}

const ExplorerScreen = forwardRef<ExplorerScreenRef, ExplorerScreenProps>(({ connectionId }, ref) => {
  const [tables, setTables] = useState<string[]>([]);
  const [modal, contextHolder] = Modal.useModal(); // Hook for themed modal
  const [collapsed, setCollapsed] = useState(false);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'sql'>('table');
  const [isStructureModalVisible, setIsStructureModalVisible] = useState(false);
  const [pendingFilter, setPendingFilter] = useState<{ field: string; value: any } | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [currentDb, setCurrentDb] = useState<string>('');
  const [isCreateDbModalVisible, setIsCreateDbModalVisible] = useState(false);
  const [isCreateTableModalVisible, setIsCreateTableModalVisible] = useState(false);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false);
  const [createDbForm] = Form.useForm();
  
  // Ref to hold latest tableData to avoid dependency cycles
  const tableDataRef = useRef<any[]>([]);

  // Navigation callback for FKs
  const handleNavigate = useCallback((table: string, filter: { field: string; value: any }) => {
      setPendingFilter(filter);
      setActiveTable(table);
  }, []);

  const { 
      pendingChanges, 
      logs, 
      setLogs, 
      logViewerVisible, 
      setLogViewerVisible, 
      saving, 
      handleFieldChange, 
      handleSave 
  } = useBatchEditor(connectionId, activeTable, () => {
      loadTableData();
  });

  // Now handleRowSave can use ref, so it doesn't need tableData in dependency
  const handleRowSave = useCallback((newRow: any) => {
    // Find the original row to detect changes from REF
    const oldRow = tableDataRef.current.find((r: any) => r.id === newRow.id);
    if (!oldRow) return;

    Object.keys(newRow).forEach(key => {
        if (newRow[key] !== oldRow[key]) {
            handleFieldChange(newRow, key, newRow[key]);
        }
    });

    // Optimistically update local data
    setTableData(prevData => {
        const newData = [...prevData];
        const index = newData.findIndex((item) => item.id === newRow.id);
        if (index > -1) {
            const item = newData[index];
            newData.splice(index, 1, { ...item, ...newRow });
        }
        return newData;
    });
  }, [handleFieldChange]); // No tableData dependency!

  // Custom Hooks
  const { 
      tableData, 
      columns, 
      loading: dataLoading, 
      refresh, 
      loadTableData,
      setTableData,
      setColumns
  } = useTableData(connectionId, activeTable, handleNavigate, handleRowSave);

  // Keep ref in sync
  useEffect(() => {
      tableDataRef.current = tableData;
  }, [tableData]);

  useEffect(() => {
    loadTables();
    loadDatabases();
  }, [connectionId]);

  useImperativeHandle(ref, () => ({
      refresh: () => {
          if (activeTable) {
              refresh(); // from useTableData
          } else {
              loadTables(); // Reload tables list if no table active
          }
      }
  }));

  // Handle Resize using ref for columns if needed, or just functional update?
  // We need to update columns which comes from useTableData. 
  // useTableData returns setColumns now.
  const handleResize = (index: number) => (_: any, { size }: any) => {
       // We access setColumns from the hook result.
       // But wait, setColumns is returned from useTableData but it is not in scope here inside handleResize definition 
       // unless we define handleResize inside the component body (which it is).
       // BUT columns is also from hook.
       setColumns((prevColumns: any[]) => {
           const nextColumns = [...prevColumns];
           nextColumns[index] = {
               ...nextColumns[index],
               width: size.width,
           };
           return nextColumns;
       });
  };

  // Filter application logic 
  const filteredData = React.useMemo(() => {
     if (!pendingFilter) return tableData;
     return tableData.filter(item => item[pendingFilter.field] == pendingFilter.value);
  }, [tableData, pendingFilter]);

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
      message.error('Failed to load tables');
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
          await ipc.addRow(connectionId, activeTable, {});
          loadTableData();
          message.success('Row added');
      } catch (e) {
          message.error('Failed to add row');
      }
  };

  // Merge columns with resize handler and Delete button
  const mergedColumns = columns.map((col, index) => ({
      ...col,
      onHeaderCell: (column: any) => ({
          width: column.width,
          onResize: handleResize(index),
      }),
  }));

  // Add Actions column
  const actionColumn = {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: any, record: any) => (
          <Button 
            type="text" 
            danger 
            icon={<DeleteOutlined />} 
            onClick={(e) => {
                e.stopPropagation();
                modal.confirm({
                    title: 'Delete this row?',
                    content: 'This action cannot be undone.',
                    okText: 'Delete',
                    okType: 'danger',
                    onOk: async () => {
                        const pk = 'id'; // Simplified
                        if (record[pk]) {
                            await ipc.deleteRow(connectionId, activeTable!, pk, record[pk]);
                            loadTableData(); // Reload or splice locally
                            message.success('Deleted');
                        }
                    }
                });
            }}
          />
      )
  };

  const gridColumns = [...mergedColumns, actionColumn];

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
                                    key: 'new-db',
                                    icon: <PlusOutlined />,
                                    label: 'New Database',
                                    onClick: () => setIsCreateDbModalVisible(true)
                                },
                                {
                                    key: 'manage-users',
                                    icon: <EditOutlined />,
                                    label: 'Manage Users',
                                    onClick: () => setIsUserModalVisible(true)
                                }
                            ]
                        }} 
                        trigger={['click']}
                    >
                         <Button type="text" icon={<DatabaseOutlined />} title={currentDb || "Select Database"} />
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
                            <Button type="text" block icon={<PlusOutlined />} onClick={() => setIsCreateDbModalVisible(true)}>
                                New Database
                            </Button>
                            <Button type="text" block icon={<EditOutlined />} onClick={() => setIsUserModalVisible(true)}>
                                Manage Users
                            </Button>
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{db}</span>
                                    <Button 
                                        type="text" 
                                        size="small" 
                                        icon={<DeleteOutlined />} 
                                        danger
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDropDatabase(db);
                                        }}
                                    />
                                </div>
                            </Select.Option>
                        ))
                    )}
                </Select>
            )}
        </div>
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
                  setViewMode('table');
                  setActiveTable(e.key);
                  setPendingFilter(null);
              }
          }}
          items={[
              { key: 'sql-editor', icon: <CodeOutlined />, label: 'SQL Editor', style: { marginBottom: 8 } },
              { type: 'divider' },
              ...tables.map(t => ({ key: t, icon: <TableOutlined />, label: t }))
          ]}
        />
          </div>
          <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
              <Button 
                type="dashed" 
                block={!collapsed} 
                icon={<PlusOutlined />} 
                onClick={() => setIsCreateTableModalVisible(true)}
                title={collapsed ? "New Table" : undefined}
              >
                {!collapsed && "New Table"}
              </Button>
          </div>
        </div>
      </Sider>
      <Layout>
        <Content style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
          {viewMode === 'sql' ? (
              <SqlEditor connectionId={connectionId} />
          ) : activeTable ? (
            <>
              <div style={{ padding: '8px 16px', background: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <Space>
                    <Button icon={<PlusOutlined />} onClick={handleAddRow}>Add Row</Button>
                    <Button icon={<ReloadOutlined />} onClick={refresh}>Refresh</Button>
                    <Button icon={<EditOutlined />} onClick={() => setIsStructureModalVisible(true)}>Structure</Button>
                    {pendingFilter && <Button onClick={clearFilter}>Clear Filter</Button>}
                </Space>
                <div style={{ color: 'var(--muted-foreground)' }}>{filteredData.length} rows</div>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <Table
                  bordered
                  dataSource={filteredData}
                  columns={gridColumns}
                  components={{
                      header: { cell: ResizableTitle },
                      body: { cell: EditableCell }
                  }}
                  rowKey="id"
                  pagination={{ pageSize: 50 }}
                  scroll={{ y: 'calc(100vh - 200px)' }}
                  size="small"
                />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Empty description="Select a table to view data" />
            </div>
            </div>
          )}
        </Content>
        <Footer style={{ padding: '8px 16px', background: 'var(--sidebar)', color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{activeTable ? `Connected: ${activeTable}` : 'Ready'}</span>
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
