import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Layout, Menu, Button, Space, Empty, message, Select, Modal, Form, Input } from 'antd';
import { PlusOutlined, ReloadOutlined, EditOutlined, TableOutlined, CodeOutlined, DeleteOutlined } from '@ant-design/icons';
import { ReactTabulator } from 'react-tabulator';
import { ipc } from '../renderer/ipc';
import TableStructureEditor from './TableStructureEditor';
import CreateTableModal from './CreateTableModal';
import UserManagementModal from './UserManagementModal';
import SqlEditor from './SqlEditor';
import LogViewer from './LogViewer';
import { useTableData } from '../hooks/useTableData';
import { useBatchEditor } from '../hooks/useBatchEditor';

const { Sider, Content, Footer } = Layout;

interface ExplorerScreenProps {
    connectionId: string;
}

const ExplorerScreen: React.FC<ExplorerScreenProps> = ({ connectionId }) => {
  const [tables, setTables] = useState<string[]>([]);
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
  const tableRef = useRef<any>(null);

  // Navigation callback for FKs
  const handleNavigate = useCallback((table: string, filter: { field: string; value: any }) => {
      setPendingFilter(filter);
      setActiveTable(table);
  }, []);

  // Custom Hooks
  const { 
      tableData, 
      columns, 
      loading: dataLoading, 
      refresh, 
      loadTableData 
  } = useTableData(connectionId, activeTable, handleNavigate);

  const { 
      pendingChanges, 
      logs, 
      setLogs, 
      logViewerVisible, 
      setLogViewerVisible, 
      saving, 
      handleCellEdited, 
      handleSave 
  } = useBatchEditor(connectionId, activeTable, loadTableData);

  useEffect(() => {
    loadTables();
    loadDatabases();
  }, [connectionId]);

  // Filter application logic
  useEffect(() => {
    if (pendingFilter && tableRef.current && tableData.length > 0) {
        const instance = tableRef.current;
        if (instance) {
            console.log('Applying filter:', pendingFilter);
            const table = instance.table || instance;
            
            if (table && typeof table.setFilter === 'function') {
                table.clearFilter();
                table.setFilter(pendingFilter.field, '=', pendingFilter.value);
                message.success(`Filtered by ${pendingFilter.field} = ${pendingFilter.value}`);
                setPendingFilter(null);
            }
        }
    }
  }, [tableData, pendingFilter]);

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

  const handleDropDatabase = async (dbName: string) => {
      if (!window.confirm(`Are you sure you want to delete database "${dbName}"? This cannot be undone.`)) return;
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

  // Add Delete button column
  const gridColumns = [
      ...columns,
      { title: 'Actions', formatter: 'buttonCross', width: 80, align: 'center', resizable: false, cellClick: async (e: any, cell: any) => {
          if (!window.confirm('Delete this row?')) return;
          const row = cell.getRow().getData();
          const pk = 'id'; // Simplified
          if (row[pk]) {
              await ipc.deleteRow(connectionId, activeTable!, pk, row[pk]);
              cell.getRow().delete();
              message.success('Deleted');
          }
      }}
  ];

  return (
    <Layout style={{ height: '100%' }}>
      <Sider theme="dark" collapsible width={250} style={{ borderRight: '1px solid var(--border)', minHeight: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ padding: 16 }}>
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
              } else {
                  setViewMode('table');
                  setActiveTable(e.key);
              }
          }}
          items={[
              { key: 'sql-editor', icon: <CodeOutlined />, label: 'SQL Editor', style: { marginBottom: 16, borderBottom: '1px solid #303030' } },
              ...tables.map(t => ({ key: t, icon: <TableOutlined />, label: t }))
          ]}
        />
          </div>
          <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setIsCreateTableModalVisible(true)}>New Table</Button>
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
                </Space>
                <div style={{ color: 'var(--muted-foreground)' }}>{tableData.length} rows</div>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <ReactTabulator
                  key={activeTable} // Force remount on table change
                  data={tableData}
                  columns={gridColumns}
                  layout="fitColumns"
                  options={{
                    height: "100%",
                    movableColumns: true,
                    resizableColumnFit: true,
                  }}
                  events={{
                    cellEdited: handleCellEdited
                  }}
                  onRef={(r) => (tableRef.current = r)}
                  className="dark-theme-tabulator"
                />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Empty description="Select a table to view data" />
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
             // Refresh structure if needed, but usually we just close or reload data
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
};

export default ExplorerScreen;
