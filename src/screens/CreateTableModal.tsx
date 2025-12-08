import React, { useState } from 'react';
import { Modal, Form, Input, Select, Checkbox, Button, message, Table } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { ipc } from '../renderer/ipc';

interface Props {
  visible: boolean;
  onCancel: () => void;
  connectionId: string;
  onSuccess: () => void;
}

interface ColumnDef {
  key: string;
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
  default?: string;
}

const CreateTableModal: React.FC<Props> = ({ visible, onCancel, connectionId, onSuccess }) => {
  const [form] = Form.useForm();
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAddColumn = (values: any) => {
    const newCol: ColumnDef = {
      key: Date.now().toString(),
      name: values.name,
      type: values.type,
      nullable: values.nullable,
      primaryKey: values.primaryKey,
      autoIncrement: values.autoIncrement,
      default: values.default,
    };
    setColumns([...columns, newCol]);
    form.resetFields(['colName', 'colType', 'colNullable', 'colPK', 'colAI', 'colDefault']);
  };

  const handleDeleteColumn = (key: string) => {
    setColumns(columns.filter(c => c.key !== key));
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields(['tableName']);
      if (columns.length === 0) {
        message.error('Please add at least one column');
        return;
      }
      setLoading(true);
      await ipc.createTable(connectionId, values.tableName, columns);
      message.success(`Table ${values.tableName} created`);
      onSuccess();
      setColumns([]);
      form.resetFields();
    } catch (e: any) {
      message.error(`Failed to create table: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const columnsTable = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Nullable', dataIndex: 'nullable', key: 'nullable', render: (v: boolean) => v ? 'Yes' : 'No' },
    { title: 'PK', dataIndex: 'primaryKey', key: 'primaryKey', render: (v: boolean) => v ? 'Yes' : 'No' },
    { title: 'AI', dataIndex: 'autoIncrement', key: 'autoIncrement', render: (v: boolean) => v ? 'Yes' : 'No' },
    { title: 'Default', dataIndex: 'default', key: 'default' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        <Button 
            type="text" 
            danger 
            icon={<Trash2 size={16} />} 
            onClick={() => handleDeleteColumn(record.key)} 
        />
      ),
    },
  ];

  return (
    <Modal
      title="Create New Table"
      open={visible}
      onCancel={onCancel}
      onOk={handleCreate}
      confirmLoading={loading}
      width={800}
      okText="Create Table"
    >
      <Form form={form} layout="vertical">
        <Form.Item 
            name="tableName" 
            label="Table Name" 
            rules={[{ required: true, message: 'Please enter table name' }]}
        >
          <Input placeholder="e.g., users" />
        </Form.Item>

        <div style={{ border: '1px solid #303030', padding: 16, borderRadius: 4, marginBottom: 16 }}>
            <h4>Add Column</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Form.Item name="colName" label="Name" style={{ marginBottom: 0, flex: 2 }}>
                    <Input placeholder="Column Name" />
                </Form.Item>
                <Form.Item name="colType" label="Type" style={{ marginBottom: 0, flex: 1.5 }}>
                    <Select placeholder="Type">
                        <Select.Option value="INT">INT</Select.Option>
                        <Select.Option value="VARCHAR(255)">VARCHAR(255)</Select.Option>
                        <Select.Option value="TEXT">TEXT</Select.Option>
                        <Select.Option value="BOOLEAN">BOOLEAN</Select.Option>
                        <Select.Option value="DATE">DATE</Select.Option>
                        <Select.Option value="DATETIME">DATETIME</Select.Option>
                        <Select.Option value="FLOAT">FLOAT</Select.Option>
                        <Select.Option value="BIGINT">BIGINT</Select.Option>
                    </Select>
                </Form.Item>
                <Form.Item name="colDefault" label="Default" style={{ marginBottom: 0, flex: 1.5 }}>
                    <Input placeholder="NULL" />
                </Form.Item>
                <Form.Item name="colNullable" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Checkbox>Null</Checkbox>
                </Form.Item>
                <Form.Item name="colPK" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Checkbox>PK</Checkbox>
                </Form.Item>
                <Form.Item name="colAI" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Checkbox>AI</Checkbox>
                </Form.Item>
                <Button 
                    type="dashed" 
                    icon={<Plus size={16} />} 
                    onClick={() => {
                        const values = form.getFieldsValue(['colName', 'colType', 'colNullable', 'colPK', 'colAI', 'colDefault']);
                        if (!values.colName || !values.colType) {
                            message.error('Name and Type are required');
                            return;
                        }
                        handleAddColumn({
                            name: values.colName,
                            type: values.colType,
                            nullable: !!values.colNullable,
                            primaryKey: !!values.colPK,
                            autoIncrement: !!values.colAI,
                            default: values.colDefault
                        });
                    }}
                >
                    Add
                </Button>
            </div>
        </div>

        <Table 
            dataSource={columns} 
            columns={columnsTable} 
            pagination={false} 
            size="small" 
            scroll={{ y: 240 }}
        />
      </Form>
    </Modal>
  );
};

export default CreateTableModal;
