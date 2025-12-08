import { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Layout, Table, Button, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Progress, Tooltip, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { Plus, PlayCircle, PauseCircle, Trash2, RefreshCw, LogOut, Edit as EditIcon, Settings } from 'lucide-react';
import { ipc } from '../renderer/ipc';

const { Content } = Layout;
const { Option } = Select;

interface EngineInstance {
  id: string;
  name: string;
  type: 'mysql' | 'postgres';
  version: string;
  port: number;
  status: 'stopped' | 'running' | 'starting' | 'error';
  dataDir: string;
  binaryPath: string;
}

interface EngineManagerScreenProps {
    onConnect?: (connectionId: string, engineName: string) => void;
}

interface EngineManagerScreenRef {
    refresh: () => void;
}

const EngineManagerScreen = forwardRef<EngineManagerScreenRef, EngineManagerScreenProps>(({ onConnect }, ref) => {
  const [instances, setInstances] = useState<EngineInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, contextHolder] = Modal.useModal(); // Hook for themed modal
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [defaultPaths, setDefaultPaths] = useState<{ base: string, platform: string } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('mysql');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submittable, setSubmittable] = useState(false);
  const [form] = Form.useForm();

  const loadInstances = async () => {
    setLoading(true);
    try {
      const list = await ipc.listEngines();
      setInstances(list);
    } catch (error) {
      message.error('Failed to load engines');
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: loadInstances
  }));

  useEffect(() => {
    loadInstances();
    loadDefaults();
    // Poll for status updates every 5 seconds
    const interval = setInterval(loadInstances, 5000);
    
    // Listen for download progress
    const removeListener = ipc.onDownloadProgress((percent) => {
        setDownloadProgress(percent);
        setIsDownloading(true);
    });

    return () => {
        clearInterval(interval);
        removeListener();
    };
  }, []);

  // Auto-fill defaults when modal opens
  useEffect(() => {
      if (isModalVisible && defaultPaths) {
          // Default to MySQL if not set, or just trigger for current value
          const currentType = form.getFieldValue('type') || 'mysql';
          handleTypeChange(currentType);
      }
  }, [isModalVisible, defaultPaths]);

  const loadDefaults = async () => {
      try {
          const defaults = await ipc.getDefaultEnginePaths();
          setDefaultPaths(defaults);
      } catch (e) {
          console.error('Failed to load default paths');
      }
  };

  const handleTypeChange = async (type: string) => {
      setSelectedType(type);
      
      // Suggest available port for this service type
      const defaultPorts = { mysql: 3306, postgres: 5432 };
      const startPort = defaultPorts[type as keyof typeof defaultPorts] || 3306;
      
      // Get all ports already used by instances (running or not)
      const usedPorts = instances.map(instance => instance.port);
      
      try {
        let suggestedPort = startPort;
        
        // Find a port that's both network-available AND not in use by any instance
        while (true) {
          const networkAvailablePort = await ipc.findFreePort(suggestedPort);
          
          // Check if this port is already assigned to an instance
          if (!usedPorts.includes(networkAvailablePort)) {
            // Port is free on network and not in instance list
            form.setFieldsValue({ port: networkAvailablePort });
            break;
          }
          
          // This port is in use by an instance, try the next one
          suggestedPort = networkAvailablePort + 1;
        }
        
        // Trigger form validation to update submittable state
        const values = form.getFieldsValue();
        const isComplete = values.name && values.type && values.version && values.port;
        setSubmittable(isComplete);
      } catch (error) {
        console.error('Failed to find free port:', error);
      }
  };

  const handleVersionChange = (_version: string) => {
      // No need to update paths here anymore, done on submit
  };

  // Helper to generate paths based on name, type, and version
  const generatePaths = (name: string, type: string, version: string) => {
      if (!defaultPaths || !name || !type || !version) return null;
      
      const isWin = defaultPaths.platform === 'win32';
      const sep = isWin ? '\\' : '/';
      const binName = type === 'mysql' ? (isWin ? 'mysqld.exe' : 'mysqld') : (isWin ? 'postgres.exe' : 'postgres');
      
      // Sanitize name for filesystem
      const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      // New Structure: <base>/<type>/<safeName>/<version>/...
      const binaryPath = [defaultPaths.base, type, safeName, version, 'bin', binName].join(sep);
      const dataDir = [defaultPaths.base, type, safeName, version, 'data'].join(sep);
      
      return { binaryPath, dataDir };
  };

  const handleSave = async (values: any) => {
    if (isEditMode && editingId) {
        setLoading(true);
        try {
            await ipc.updateEngine(editingId, { port: values.port });
            message.success('Engine updated successfully');
            setIsModalVisible(false);
            setEditingId(null);
            setIsEditMode(false);
            form.resetFields();
            loadInstances();
        } catch (error: any) {
            message.error(`Failed to update engine: ${error.message}`);
        } finally {
            setLoading(false);
        }
        return;
    }

    // Create Mode
    // Check for duplicate name
    if (instances.some(i => i.name.toLowerCase() === values.name.toLowerCase())) {
        message.error('Instance name must be unique');
        return;
    }

    setLoading(true);
    setDownloadProgress(0);
    setIsDownloading(false);
    try {
      // Generate paths here
      const paths = generatePaths(values.name, values.type, values.version);
      if (!paths) throw new Error('Could not generate paths. Missing defaults?');

      const newInstance = {
        id: Date.now().toString(),
        ...values,
        binaryPath: paths.binaryPath,
        dataDir: paths.dataDir,
        status: 'stopped'
      };
      message.loading({ content: 'Downloading and installing engine... This may take a while.', key: 'install' });
      await ipc.createEngine(newInstance);
      message.success({ content: 'Engine instance created and installed!', key: 'install' });
      setIsModalVisible(false);
      form.resetFields();
      loadInstances();
    } catch (error: any) {
      message.error({ content: `Failed to create instance: ${error.message}`, key: 'install' });
    } finally {
        setLoading(false);
        setIsDownloading(false);
    }
  };

  const handleEdit = (record: EngineInstance) => {
      setIsEditMode(true);
      setEditingId(record.id);
      form.setFieldsValue({
          name: record.name,
          type: record.type,
          version: record.version,
          port: record.port
      });
      setSelectedType(record.type);
      setIsModalVisible(true);
  };

  const handleStart = async (id: string) => {
    try {
      await ipc.startEngine(id);
      message.success('Starting engine...');
      loadInstances();
    } catch (error) {
      message.error('Failed to start engine');
    }
  };

  const handleStop = async (id: string) => {
    try {
      await ipc.stopEngine(id);
      message.success('Stopping engine...');
      loadInstances();
    } catch (error) {
      message.error('Failed to stop engine');
    }
  };

  const handleRemove = (id: string) => {
    modal.confirm({
      title: 'Are you sure you want to remove this engine?',
      content: 'This will delete the engine instance and ALL its data. This action cannot be undone.',
      okText: 'Yes, Remove',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await ipc.removeEngine(id);
          message.success('Engine removed');
          loadInstances();
        } catch (error) {
          message.error('Failed to remove engine');
        }
      }
    });
  };

  const handleOpen = async (record: EngineInstance) => {
      try {
          const config = {
              type: record.type,
              host: 'localhost',
              port: record.port,
              user: record.type === 'mysql' ? 'root' : 'postgres',
              password: '', 
              database: record.type === 'mysql' ? 'mysql' : 'postgres'
          };
          const result = await ipc.connectDatabase(config);
          if (result.success) {
              message.success('Connected!');
              if (onConnect) onConnect(result.connectionId, record.name);
          } else {
              message.error(`Connection failed: ${result.error}`);
          }
      } catch (e: any) {
          message.error(`Error: ${e.message}`);
      }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={type === 'mysql' ? 'blue' : 'geekblue'}>{type.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Port',
      dataIndex: 'port',
      key: 'port',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color = 'default';
        if (status === 'running') color = 'success';
        if (status === 'starting') color = 'processing';
        if (status === 'error') color = 'error';
        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      align: 'right' as const,
      render: (_: any, record: EngineInstance) => {
        const items: MenuProps['items'] = [
            {
                key: 'edit',
                label: 'Edit Configuration',
                icon: <EditIcon size={16} />,
                disabled: record.status !== 'stopped',
                onClick: () => handleEdit(record)
            },
            {
                key: 'remove',
                label: 'Remove Instance',
                icon: <Trash2 size={16} />,
                danger: true,
                disabled: record.status === 'running',
                onClick: () => handleRemove(record.id)
            }
        ];

        return (
            <Space>
              {record.status === 'running' && (
                <Tooltip title="Open">
                    <Button 
                      icon={<LogOut size={16} />} 
                      type="primary"
                      size="small"
                      style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                      onClick={() => handleOpen(record)}
                    />
                </Tooltip>
              )}
              
              {record.status === 'running' ? (
                <Tooltip title="Stop">
                    <Button 
                      icon={<PauseCircle size={16} />} 
                      type="primary"
                      danger 
                      size="small"
                      onClick={() => handleStop(record.id)}
                    />
                </Tooltip>
              ) : (
                <Tooltip title="Start">
                    <Button 
                      icon={<PlayCircle size={16} />} 
                      type="primary" 
                      size="small"
                      onClick={() => handleStart(record.id)}
                      disabled={record.status === 'starting'}
                    />
                </Tooltip>
              )}

              <Dropdown menu={{ items }} placement="bottomRight" trigger={['click']}>
                  <Button 
                    icon={<Settings size={16} />} 
                    size="small"
                  />
              </Dropdown>
            </Space>
        );
      },
    },
  ];

  return (
    <Layout style={{ height: '100vh', padding: '24px' }}>
      {contextHolder}
      <Content>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1>DB Engine Manager</h1>
          <Space>
            <Button icon={<RefreshCw size={16} />} onClick={loadInstances}>Refresh</Button>
            <Button type="primary" icon={<Plus size={16} />} onClick={() => {
                setIsEditMode(false);
                setEditingId(null);
                form.resetFields();
                setIsModalVisible(true);
            }}>
              Add Instance
            </Button>
          </Space>
        </div>

        <Table 
          columns={columns} 
          dataSource={instances} 
          rowKey="id" 
          loading={loading}
          pagination={{ hideOnSinglePage: true }}
        />

        <Modal
          title={isEditMode ? "Edit Engine Instance" : "Add New Engine Instance"}
          open={isModalVisible}
          onCancel={() => {
              setIsModalVisible(false);
              setIsEditMode(false);
              setEditingId(null);
              setSubmittable(false);
              form.resetFields();
          }}
          footer={null}
        >
          <Form 
            form={form} 
            layout="vertical" 
            onFinish={handleSave} 
            initialValues={{ type: 'mysql', version: '8.0' }}
            onValuesChange={(_, allValues) => {
              const isComplete = allValues.name && allValues.type && allValues.version && allValues.port;
              setSubmittable(isComplete);
            }}
          >
            <Form.Item name="name" label="Name" rules={[{ required: true }]}>
              <Input placeholder="My Local DB" disabled={isEditMode} />
            </Form.Item>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select onChange={handleTypeChange} disabled={isEditMode}>
                <Option value="mysql">MySQL</Option>
                <Option value="postgres">PostgreSQL</Option>
              </Select>
            </Form.Item>
            <Form.Item name="version" label="Version" rules={[{ required: true }]}>
              <Select onChange={handleVersionChange} disabled={isEditMode}>
                  {selectedType === 'mysql' ? (
                      <>
                        <Option value="8.0">8.0</Option>
                        <Option value="5.7">5.7</Option>
                      </>
                  ) : (
                      <>
                        <Option value="14">14</Option>
                        <Option value="13">13</Option>
                      </>
                  )}
              </Select>
            </Form.Item>
            <Form.Item name="port" label="Port" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1024} max={65535} />
            </Form.Item>
            
            {/* Hidden fields for paths, auto-calculated */}
            <Form.Item name="binaryPath" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="dataDir" hidden>
              <Input />
            </Form.Item>
            
            <div style={{ marginBottom: 16, color: '#888', fontSize: '12px' }}>
                Binaries will be automatically downloaded and installed to: <br/>
                {defaultPaths?.base}
            </div>

            {isDownloading && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 4 }}>Downloading Engine...</div>
                    <Progress percent={downloadProgress} status="active" />
                </div>
            )}

            <Form.Item>
              <Button 
                type="primary" 
                htmlType="submit" 
                block 
                loading={loading}
                disabled={!submittable && !isEditMode}
              >
                {loading ? "Installing..." : isEditMode ? "Save Changes" : "Create & Install"}
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </Content>
    </Layout>
  );
});

export default EngineManagerScreen;
