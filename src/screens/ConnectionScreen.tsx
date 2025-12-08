import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, message, Typography, InputNumber, Divider } from 'antd';
import { Database } from 'lucide-react';
import { ipc } from '../renderer/ipc';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;
const { Option } = Select;

interface ConnectionScreenProps {
  onConnect: () => void;
}

const ConnectionScreen: React.FC<ConnectionScreenProps> = ({ onConnect }) => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [_dbType, setDbType] = useState('mysql');
  const [localInstances, setLocalInstances] = useState<any[]>([]);

  useEffect(() => {
    loadLocalInstances();
  }, []);

  const loadLocalInstances = async () => {
    try {
      const engines = await ipc.listEngines();
      // Filter only running instances
      setLocalInstances(engines.filter((e: any) => e.status === 'running'));
    } catch (e) {
      console.error('Failed to load local instances');
    }
  };

  const handleLocalInstanceSelect = (instanceId: string) => {
    const instance = localInstances.find(i => i.id === instanceId);
    if (instance) {
      form.setFieldsValue({
        type: instance.type,
        host: 'localhost',
        port: instance.port,
        user: 'root', // Default guess
        password: '',
        database: ''
      });
      setDbType(instance.type);
    }
  };

  const handleConnect = async (values: any) => {
    setLoading(true);
    try {
      const result = await ipc.connectDatabase(values);
      if (result.success) {
        message.success('Connected successfully');
        onConnect();
        navigate('/explorer');
      } else {
        message.error(`Connection failed: ${result.error}`);
      }
    } catch (error: any) {
      message.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (value: string) => {
    setDbType(value);
    // Set default ports
    if (value === 'mysql') form.setFieldsValue({ port: 3306 });
    if (value === 'postgres') form.setFieldsValue({ port: 5432 });
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#000' }}>
      <Card style={{ width: 450, textAlign: 'center' }}>
        <Title level={3}><Database size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} /> Connect to Database</Title>
        
        {localInstances.length > 0 && (
          <>
            <Form.Item label="Running Local Instances">
              <Select placeholder="Select a running local instance" onChange={handleLocalInstanceSelect}>
                {localInstances.map(i => (
                  <Option key={i.id} value={i.id}>{i.name} ({i.type} : {i.port})</Option>
                ))}
              </Select>
            </Form.Item>
            <Divider>OR</Divider>
          </>
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleConnect}
          initialValues={{ type: 'mysql', host: 'localhost', port: 3306, user: 'root' }}
        >
          <Form.Item
            name="type"
            label="Database Type"
            rules={[{ required: true }]}
          >
            <Select onChange={handleTypeChange}>
              <Option value="mysql">MySQL</Option>
              <Option value="postgres">PostgreSQL</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="host"
            label="Host"
            rules={[{ required: true, message: 'Host is required' }]}
          >
            <Input placeholder="localhost" />
          </Form.Item>

          <Form.Item
            name="port"
            label="Port"
            rules={[{ required: true, message: 'Port is required' }]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="user"
            label="Username"
            rules={[{ required: true, message: 'Username is required' }]}
          >
            <Input placeholder="root" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
          >
            <Input.Password placeholder="Password" />
          </Form.Item>

          <Form.Item
            name="database"
            label="Database Name"
            rules={[{ required: true, message: 'Database name is required' }]}
          >
            <Input placeholder="my_database" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Connect
            </Button>
          </Form.Item>
        </Form>
        
        <Divider />
        <Button type="dashed" block onClick={() => navigate('/engines')}>
          Manage / Install Local Engines
        </Button>
      </Card>
    </div>
  );
};

export default ConnectionScreen;
