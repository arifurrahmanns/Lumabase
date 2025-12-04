import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Input, Button, message } from 'antd';
import { ipc } from '../renderer/ipc';

interface Props {
  visible: boolean;
  onCancel: () => void;
  tableName: string;
  columnName: string;
  onSuccess: () => void;
}

const ForeignKeyModal: React.FC<Props> = ({ visible, onCancel, tableName, columnName, onSuccess }) => {
  const [form] = Form.useForm();
  const [tables, setTables] = useState<string[]>([]);
  const [refColumns, setRefColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadTables();
      form.setFieldsValue({
        table: tableName,
        column: columnName,
        onUpdate: 'NO ACTION',
        onDelete: 'NO ACTION'
      });
    }
  }, [visible, tableName, columnName]);

  const loadTables = async () => {
    try {
      const list = await ipc.listTables();
      setTables(list);
    } catch (e) {
      message.error('Failed to load tables');
    }
  };

  const handleRefTableChange = async (table: string) => {
    try {
      const struct = await ipc.getTableStructure(table);
      setRefColumns(struct.map((c: any) => c.name));
      form.setFieldsValue({ refColumn: undefined });
    } catch (e) {
      message.error('Failed to load columns');
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      // Generate a constraint name if not provided (though we don't ask for it in UI, we should generate one)
      const constraintName = `fk_${tableName}_${columnName}_${Date.now()}`; // Simple unique name

      const results = await ipc.updateTableStructure(tableName, [{
        type: 'add_foreign_key',
        constraintName: constraintName,
        column: columnName,
        refTable: values.refTable,
        refColumn: values.refColumn,
        onUpdate: values.onUpdate,
        onDelete: values.onDelete
      }]);

      const failed = results.find((r: any) => !r.success);
      if (failed) {
        throw new Error(failed.error || 'Unknown error');
      }

      message.success('Foreign key created');
      onSuccess();
    } catch (e: any) {
      message.error(`Failed to create foreign key: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Foreign Key Window"
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      okText="OK"
      cancelText="Cancel"
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Table" name="table">
          <Input disabled />
        </Form.Item>
        <Form.Item label="Column" name="column">
          <Input disabled />
        </Form.Item>
        
        <Form.Item 
            label="Referenced Table" 
            name="refTable" 
            rules={[{ required: true, message: 'Select referenced table' }]}
        >
          <Select onChange={handleRefTableChange} placeholder="Select a table...">
            {tables.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
          </Select>
        </Form.Item>

        <Form.Item 
            label="Referenced Column" 
            name="refColumn"
            rules={[{ required: true, message: 'Select referenced column' }]}
        >
          <Select placeholder="Column name..." disabled={!refColumns.length}>
            {refColumns.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
          </Select>
        </Form.Item>

        <Form.Item label="On Update" name="onUpdate">
          <Select>
            <Select.Option value="NO ACTION">NO ACTION</Select.Option>
            <Select.Option value="CASCADE">CASCADE</Select.Option>
            <Select.Option value="SET NULL">SET NULL</Select.Option>
            <Select.Option value="RESTRICT">RESTRICT</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="On Delete" name="onDelete">
          <Select>
            <Select.Option value="NO ACTION">NO ACTION</Select.Option>
            <Select.Option value="CASCADE">CASCADE</Select.Option>
            <Select.Option value="SET NULL">SET NULL</Select.Option>
            <Select.Option value="RESTRICT">RESTRICT</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ForeignKeyModal;
