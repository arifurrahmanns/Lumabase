import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Input, InputNumber, DatePicker, Switch, message } from 'antd';
import dayjs from 'dayjs';

interface BulkEditModalProps {
    visible: boolean;
    columns: any[];
    selectedCount: number;
    onCancel: () => void;
    onUpdate: (column: string, value: any) => Promise<void>;
}

const BulkEditModal: React.FC<BulkEditModalProps> = ({ visible, columns, selectedCount, onCancel, onUpdate }) => {
    const [form] = Form.useForm();
    const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Reset form when opening
    useEffect(() => {
        if (visible) {
            form.resetFields();
            setSelectedColumn(null);
        }
    }, [visible, form]);

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            
            // Format value if needed
            let finalValue = values.value;
            const colDef = columns.find(c => c.name === values.column);
            
            if (colDef) {
               if (colDef.type.includes('DATE') || colDef.type.includes('TIME')) {
                 // Ensure valid date string for backend
                 finalValue = finalValue ? finalValue.format('YYYY-MM-DD HH:mm:ss') : null;
               }
            }

            await onUpdate(values.column, finalValue);
            setLoading(false);
            onCancel(); // Close on success
        } catch (e) {
            setLoading(false);
            // Validation error or update error
        }
    };

    const renderInput = () => {
        if (!selectedColumn) return <Input disabled placeholder="Select a column first" />;
        
        const col = columns.find(c => c.name === selectedColumn);
        if (!col) return <Input />;

        const type = col.type.toUpperCase();

        if (type.includes('INT') || type.includes('DECIMAL') || type.includes('FLOAT') || type.includes('DOUBLE')) {
            return <InputNumber style={{ width: '100%' }} />;
        }
        
        if (type.includes('BOOL') || type.includes('TINYINT(1)')) {
             return (
                 <Select>
                     <Select.Option value={1}>True / 1</Select.Option>
                     <Select.Option value={0}>False / 0</Select.Option>
                 </Select>
             );
        }

        if (type.includes('DATE') || type.includes('TIME')) {
            return <DatePicker showTime={type.includes('DATETIME')} style={{ width: '100%' }} />;
        }
        
        if (type.includes('TEXT') || type.includes('CHAR')) {
            return <Input.TextArea rows={4} />;
        }

        return <Input />;
    };

    const editableColumns = columns.filter(c => !c.autoIncrement && c.name !== 'id'); // Simplify exclusion

    return (
        <Modal
            title={`Bulk Edit (${selectedCount} rows)`}
            open={visible}
            onOk={handleOk}
            onCancel={onCancel}
            confirmLoading={loading}
            okText="Update All"
            okButtonProps={{ danger: true }} 
        >
            <Form form={form} layout="vertical">
                <Form.Item 
                    name="column" 
                    label="Field to Update" 
                    rules={[{ required: true, message: 'Please select a column' }]}
                >
                    <Select 
                        placeholder="Select Column" 
                        onChange={setSelectedColumn}
                        showSearch
                        optionFilterProp="children"
                    >
                        {editableColumns.map(col => (
                            <Select.Option key={col.name} value={col.name}>
                                {col.name} <span style={{ color: '#888', fontSize: '0.8em' }}>({col.type})</span>
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item 
                    name="value" 
                    label="New Value"
                    rules={[{ required: false }]} // Allow null/empty?
                >
                    {renderInput()}
                </Form.Item>
                
                {selectedColumn && (
                    <div style={{ padding: 12, background: 'rgba(255, 165, 0, 0.1)', border: '1px solid orange', borderRadius: 4, color: 'orange' }}>
                        Warning: This will overwrite <b>{selectedColumn}</b> for all <b>{selectedCount}</b> selected rows.
                    </div>
                )}
            </Form>
        </Modal>
    );
};

export default BulkEditModal;
