import React, { useEffect, useState } from 'react';
import { Layout, Table, Button, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Progress } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseCircleOutlined, DeleteOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
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
    onConnect?: () => void;
}

const EngineManagerScreen: React.FC<EngineManagerScreenProps> = ({ onConnect }) => {
  const [instances, setInstances] = useState<EngineInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [defaultPaths, setDefaultPaths] = useState<{ base: string, platform: string } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('mysql');
  const [form] = Form.useForm();
  const navigate = useNavigate();

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

  const handleTypeChange = (type: string) => {
      setSelectedType(type);
      // No need to update paths here anymore, done on submit
  };

  const handleVersionChange = (version: string) => {
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

  const handleCreate = async (values: any) => {
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

  const handleRemove = async (id: string) => {
    try {
      await ipc.removeEngine(id);
      message.success('Engine removed');
      loadInstances();
    } catch (error) {
      message.error('Failed to remove engine');
    }
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
              if (onConnect) onConnect();
              navigate('/explorer');
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
      render: (_: any, record: EngineInstance) => (
        <Space>
          {record.status === 'running' ? (
            <>
                <Button 
                  icon={<ExportOutlined />} 
                  type="primary"
                  onClick={() => handleOpen(record)}
                >
                  Open
                </Button>
                <Button 
                  icon={<PauseCircleOutlined />} 
                  danger 
                  onClick={() => handleStop(record.id)}
                >
                  Stop
                </Button>
            </>
          ) : (
            <Button 
              icon={<PlayCircleOutlined />} 
              type="primary" 
              onClick={() => handleStart(record.id)}
              disabled={record.status === 'starting'}
            >
              Start
            </Button>
          )}
          <Button 
            icon={<DeleteOutlined />} 
            onClick={() => handleRemove(record.id)}
            disabled={record.status === 'running'}
          >
            Remove
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ height: '100vh', padding: '24px' }}>
      <Content>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1>DB Engine Manager</h1>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadInstances}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>
              Add Instance
            </Button>
          </Space>
        </div>

        <Table 
          columns={columns} 
          dataSource={instances} 
          rowKey="id" 
          loading={loading}
        />

        <Modal
          title="Add New Engine Instance"
          open={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          footer={null}
        >
          <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ type: 'mysql', version: '8.0' }}>
            <Form.Item name="name" label="Name" rules={[{ required: true }]}>
              <Input placeholder="My Local DB" />
            </Form.Item>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select onChange={handleTypeChange}>
                <Option value="mysql">MySQL</Option>
                <Option value="postgres">PostgreSQL</Option>
              </Select>
            </Form.Item>
            <Form.Item name="version" label="Version" rules={[{ required: true }]}>
              <Select onChange={handleVersionChange}>
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
              <Button type="primary" htmlType="submit" block loading={loading}>
                Create & Install
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </Content>
    </Layout>
  );
};

export default EngineManagerScreen;
