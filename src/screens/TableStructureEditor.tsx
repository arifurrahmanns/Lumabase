import React, { useEffect, useState } from 'react';
import { Modal, Table, Button, Form, Input, Select, Checkbox, message, Space, Popconfirm, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined, EditOutlined, SaveOutlined, CloseOutlined, LinkOutlined } from '@ant-design/icons';
import { ipc } from '../renderer/ipc';
import ForeignKeyModal from './ForeignKeyModal';

interface Props {
  visible: boolean;
  onCancel: () => void;
  tableName: string;
  connectionId: string;
  onSuccess: () => void;
}

const TableStructureEditor: React.FC<Props> = ({ visible, onCancel, tableName, connectionId, onSuccess }) => {
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [editingKey, setEditingKey] = useState('');
  const [fkModalVisible, setFkModalVisible] = useState(false);
  const [selectedColumnForFk, setSelectedColumnForFk] = useState('');

  useEffect(() => {
    if (visible) {
      loadStructure();
      setEditingKey('');
    }
  }, [visible, tableName]);

  const loadStructure = async () => {
    setLoading(true);
    try {
      const struct = await ipc.getTableStructure(connectionId, tableName);
      setColumns(struct);
    } catch (e) {
      message.error('Failed to load structure');
    } finally {
      setLoading(false);
    }
  };

  const handleAddColumn = async (values: any) => {
    setLoading(true);
    try {
      await ipc.updateTableStructure(connectionId, tableName, [{
        type: 'add_column',
        column: {
          name: values.name,
          type: values.type,
          unsigned: values.unsigned,
          nullable: !values.notNull,
          default: values.default
        }
      }]);
      message.success('Column added');
      form.resetFields();
      loadStructure();
      onSuccess();
    } catch (e: any) {
      message.error(`Failed to add column: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteColumn = async (columnName: string) => {
    setLoading(true);
    try {
      await ipc.updateTableStructure(connectionId, tableName, [{
        type: 'drop_column',
        columnName: columnName
      }]);
      message.success('Column deleted');
      loadStructure();
      onSuccess();
    } catch (e: any) {
      message.error(`Failed to delete column: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isEditing = (record: any) => record.name === editingKey;

  const edit = (record: any) => {
    form.setFieldsValue({
      name: record.name,
      type: record.type,
      unsigned: record.unsigned === 1,
      notNull: record.notnull === 1,
      default: record.dflt_value,
      ...record,
    });
    setEditingKey(record.name);
  };

  const cancel = () => {
    setEditingKey('');
  };

  const save = async (key: React.Key) => {
    try {
      const row = (await form.validateFields()) as any;
      setLoading(true);
      
      // We only support modifying type/null/default, not renaming yet (renaming is complex in some DBs)
      // So we use the original key as the name
      await ipc.updateTableStructure(connectionId, tableName, [{
        type: 'modify_column',
        column: {
          name: key, // Keep original name
          type: row.type,
          unsigned: row.unsigned,
          nullable: !row.notNull,
          default: row.default
        }
      }]);

      setEditingKey('');
      message.success('Column updated');
      loadStructure();
      onSuccess();
    } catch (errInfo: any) {
      message.error(`Save failed: ${errInfo.message}`);
    } finally {
        setLoading(false);
    }
  };

  const columnsTable = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { 
      title: 'Type', 
      dataIndex: 'type', 
      key: 'type',
      render: (text: string, record: any) => {
        if (isEditing(record)) {
            return (
                <Form.Item name="type" style={{ margin: 0 }} rules={[{ required: true }]}>
                    <Select style={{ width: 100 }}>
                        <Select.Option value="VARCHAR(255)">VARCHAR</Select.Option>
                        <Select.Option value="INT">INT</Select.Option>
                        <Select.Option value="TEXT">TEXT</Select.Option>
                        <Select.Option value="FLOAT">FLOAT</Select.Option>
                        <Select.Option value="BOOLEAN">BOOLEAN</Select.Option>
                        <Select.Option value="VARCHAR(255)">VARCHAR</Select.Option>
                        <Select.Option value="INT">INT</Select.Option>
                        <Select.Option value="BIGINT">BIGINT</Select.Option>
                        <Select.Option value="TEXT">TEXT</Select.Option>
                        <Select.Option value="FLOAT">FLOAT</Select.Option>
                        <Select.Option value="BOOLEAN">BOOLEAN</Select.Option>
                        <Select.Option value="DATE">DATE</Select.Option>
                    </Select>
                </Form.Item>
            );
        }
        return text;
      }
    },
    {
        title: 'Unsigned',
        dataIndex: 'unsigned',
        key: 'unsigned',
        render: (val: number, record: any) => {
            if (isEditing(record)) {
                return (
                    <Form.Item name="unsigned" valuePropName="checked" style={{ margin: 0 }}>
                        <Checkbox />
                    </Form.Item>
                );
            }
            return val ? 'Yes' : 'No';
        }
    },
    { 
        title: 'Not Null', 
        dataIndex: 'notnull', 
        key: 'notnull', 
        render: (val: number, record: any) => {
            if (isEditing(record)) {
                return (
                    <Form.Item name="notNull" valuePropName="checked" style={{ margin: 0 }}>
                        <Checkbox />
                    </Form.Item>
                );
            }
            return val ? 'Yes' : 'No';
        }
    },
    { 
        title: 'Default', 
        dataIndex: 'dflt_value', 
        key: 'dflt_value',
        render: (text: string, record: any) => {
            if (isEditing(record)) {
                return (
                    <Form.Item name="default" style={{ margin: 0 }}>
                        <Input />
                    </Form.Item>
                );
            }
            return text;
        }
    },
    { title: 'PK', dataIndex: 'pk', key: 'pk', render: (val: number) => val ? 'Yes' : '' },
    { 
        title: 'Foreign Key', 
        dataIndex: 'fk', 
        key: 'fk', 
        render: (val: any, record: any) => (
            <Space>
                {val ? `${val.table}(${val.column})` : 'EMPTY'}
                <Button 
                    type="text" 
                    icon={<LinkOutlined />} 
                    size="small" 
                    onClick={() => {
                        setSelectedColumnForFk(record.name);
                        setFkModalVisible(true);
                    }} 
                />
            </Space>
        )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      align: 'center' as const,
      render: (_: any, record: any) => {
        const editable = isEditing(record);
        return editable ? (
            <Space>
                <Button icon={<SaveOutlined />} type="link" onClick={() => save(record.name)} />
                <Button icon={<CloseOutlined />} type="link" onClick={cancel} />
            </Space>
        ) : (
            <Space>
                <Tooltip title="Edit Column">
                    <Button disabled={editingKey !== ''} icon={<EditOutlined />} type="link" onClick={() => edit(record)} />
                </Tooltip>
                <Popconfirm title="Sure to delete?" onConfirm={() => handleDeleteColumn(record.name)}>
                    <Button disabled={editingKey !== ''} icon={<DeleteOutlined />} type="link" danger />
                </Popconfirm>
            </Space>
        );
      },
    },
  ];

  return (
    <Modal
      title={`Structure: ${tableName}`}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={900}
    >
      <Form form={form} component={false}>
        <Table 
            dataSource={columns} 
            columns={columnsTable} 
            rowKey="name" 
            pagination={false} 
            size="small"
            loading={loading}
        />
      </Form>
      
      <div style={{ marginTop: 24, borderTop: '1px solid #303030', paddingTop: 16 }}>
        <h4>Add New Column</h4>
        <Form layout="inline" onFinish={handleAddColumn}>
          <Form.Item name="name" rules={[{ required: true, message: 'Name req' }]}>
            <Input placeholder="Column Name" />
          </Form.Item>
          <Form.Item name="type" rules={[{ required: true }]}>
            <Select style={{ width: 120 }} placeholder="Type">
              <Select.Option value="VARCHAR(255)">VARCHAR</Select.Option>
              <Select.Option value="INT">INT</Select.Option>
              <Select.Option value="TEXT">TEXT</Select.Option>
              <Select.Option value="FLOAT">FLOAT</Select.Option>
              <Select.Option value="BOOLEAN">BOOLEAN</Select.Option>
              <Select.Option value="VARCHAR(255)">VARCHAR</Select.Option>
              <Select.Option value="INT">INT</Select.Option>
              <Select.Option value="BIGINT">BIGINT</Select.Option>
              <Select.Option value="TEXT">TEXT</Select.Option>
              <Select.Option value="FLOAT">FLOAT</Select.Option>
              <Select.Option value="BOOLEAN">BOOLEAN</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="unsigned" valuePropName="checked">
            <Checkbox>Unsigned</Checkbox>
          </Form.Item>
          <Form.Item name="notNull" valuePropName="checked">
            <Checkbox>Not Null</Checkbox>
          </Form.Item>
          <Form.Item name="default">
            <Input placeholder="Default Value" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>Add</Button>
          </Form.Item>
        </Form>
      </div>
      
      {fkModalVisible && (
        <ForeignKeyModal
            connectionId={connectionId}
        visible={fkModalVisible}
            onCancel={() => setFkModalVisible(false)}
            tableName={tableName}
            columnName={selectedColumnForFk}
            onSuccess={() => {
                setFkModalVisible(false);
                loadStructure();
                // Do not close the parent modal, so user can continue editing
            }}
        />
      )}
    </Modal>
  );
};

export default TableStructureEditor;
