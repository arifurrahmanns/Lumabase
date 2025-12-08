import React, { useEffect, useState } from 'react';
import { Modal, Table, Button, Form, Input, message, Popconfirm, Space } from 'antd';
import { UserPlus, Trash2, Edit, RefreshCw } from 'lucide-react';
import { ipc } from '../renderer/ipc';

interface Props {
  visible: boolean;
  onCancel: () => void;
  connectionId: string;
}

const UserManagementModal: React.FC<Props> = ({ visible, onCancel, connectionId }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  useEffect(() => {
    if (visible) {
      loadUsers();
    }
  }, [visible]);

  const loadUsers = async () => {
    setLoading(true);
    setLoading(true);
    try {
      const list = await ipc.listUsers(connectionId);
      setUsers(list);
    } catch (e: any) {
      message.error(`Failed to load users: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (values: any) => {
    try {
      await ipc.createUser(connectionId, values);
      message.success('User created');
      setIsAddModalVisible(false);
      form.resetFields();
      loadUsers();
    } catch (e: any) {
      message.error(`Failed to create user: ${e.message}`);
    }
  };

  const handleDeleteUser = async (user: any) => {
    try {
      await ipc.dropUser(connectionId, user.username, user.host);
      message.success('User deleted');
      loadUsers();
    } catch (e: any) {
      message.error(`Failed to delete user: ${e.message}`);
    }
  };

  const handleUpdateUser = async (values: any) => {
      try {
          await ipc.updateUser(connectionId, { ...editingUser, ...values });
          message.success('User updated');
          setIsEditModalVisible(false);
          editForm.resetFields();
          setEditingUser(null);
          loadUsers();
      } catch (e: any) {
          message.error(`Failed to update user: ${e.message}`);
      }
  };

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username' },
    { title: 'Host', dataIndex: 'host', key: 'host' },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      align: 'center' as const,
      render: (_: any, record: any) => (
        <Space>
            <Button 
                icon={<Edit size={16} />} 
                size="small" 
                onClick={() => {
                    setEditingUser(record);
                    editForm.setFieldsValue({ username: record.username, host: record.host });
                    setIsEditModalVisible(true);
                }}
            />
            <Popconfirm title="Delete user?" onConfirm={() => handleDeleteUser(record)}>
                <Button icon={<Trash2 size={16} />} danger size="small" />
            </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title="User Management"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={700}
    >
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Button icon={<RefreshCw size={16} />} onClick={loadUsers}>Refresh</Button>
        <Button type="primary" icon={<UserPlus size={16} />} onClick={() => setIsAddModalVisible(true)}>
          Add User
        </Button>
      </div>
      
      <Table 
        dataSource={users} 
        columns={columns} 
        rowKey={(r) => `${r.username}@${r.host}`} 
        loading={loading} 
        pagination={false}
        size="small"
      />

      <Modal
        title="Add User"
        open={isAddModalVisible}
        onCancel={() => setIsAddModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleCreateUser} layout="vertical">
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="host" label="Host" initialValue="%">
            <Input placeholder="%" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>Create</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Edit User: ${editingUser?.username}`}
        open={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        footer={null}
      >
          <Form form={editForm} onFinish={handleUpdateUser} layout="vertical">
              <Form.Item name="password" label="New Password" rules={[{ required: true, message: 'Enter new password' }]}>
                  <Input.Password placeholder="New Password" />
              </Form.Item>
              <Form.Item>
                  <Button type="primary" htmlType="submit" block>Update Password</Button>
              </Form.Item>
          </Form>
      </Modal>
    </Modal>
  );
};

export default UserManagementModal;
