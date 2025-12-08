import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Input, InputNumber, DatePicker, Radio, Button, Space, message, Row, Col, Tag, Alert } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';

interface BulkEditModalProps {
    visible: boolean;
    columns: any[];
    selectedCount: number;
    activeFilters?: any[];
    onCancel: () => void;
    onUpdate: (column: string, value: any, mode: 'selection' | 'filter', conditions?: any[]) => Promise<void>;
}

const BulkEditModal: React.FC<BulkEditModalProps> = ({ visible, columns, selectedCount, activeFilters = [], onCancel, onUpdate }) => {
    const [form] = Form.useForm();
    const [mode, setMode] = useState<'selection' | 'filter'>('selection');
    const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Reset form when opening
    useEffect(() => {
        if (visible) {
            form.resetFields();
            setSelectedColumn(null);
            setMode('selection');
        }
    }, [visible, form, selectedCount]);

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            


            setLoading(true);
            
            let finalValue = values.value;
            if (dayjs.isDayjs(finalValue)) {
                finalValue = finalValue.format('YYYY-MM-DD HH:mm:ss');
            }

            await onUpdate(values.column, finalValue, mode, activeFilters);
            setLoading(false);
            onCancel(); 
        } catch (e) {
            setLoading(false);
            console.error(e);
        }
    };

    const renderInput = (colName: string | null, value: any, onChange?: (val: any) => void) => {
        if (!colName) return <Input disabled placeholder="Select column" />;
        
        const col = columns.find(c => c.name === colName);
        if (!col) return <Input />;

        const type = col.type.toUpperCase();
        const props = { style: { width: '100%' }, value, onChange };

        if (type.includes('INT') || type.includes('DECIMAL') || type.includes('FLOAT') || type.includes('DOUBLE')) {
            return <InputNumber {...props} />;
        }
        
        if (type.includes('BOOL') || type.includes('TINYINT(1)')) {
             return (
                 <Select {...props}>
                     <Select.Option value={1}>True / 1</Select.Option>
                     <Select.Option value={0}>False / 0</Select.Option>
                 </Select>
             );
        }

        if (type.includes('DATE') || type.includes('TIME')) {
            return <DatePicker showTime={type.includes('DATETIME')} {...props} />;
        }
        
        return <Input {...props} />; // Text/Char
    };

    const editableColumns = columns.filter(c => !c.autoIncrement && c.name !== 'id');
    const filterableColumns = columns; // All columns can be used in filters

    return (
        <Modal
            title="Bulk Edit"
            open={visible}
            onOk={handleOk}
            onCancel={onCancel}
            confirmLoading={loading}
            okText={mode === 'selection' ? "Update Selected" : "Update Matching"}
            okButtonProps={{ danger: true }} 
            width={700}
        >
            <Form form={form} layout="vertical">
                <div style={{ padding: '0 0 16px', fontWeight: 500 }}>
                    Updating {selectedCount} selected rows
                </div>

                <div style={{ borderTop: '1px solid #eee', paddingTop: 16, marginBottom: 16 }}>
                    <Form.Item 
                        name="column" 
                        label="Field to Update" 
                        rules={[{ required: true, message: 'Please select a column' }]}
                    >
                        <Select 
                            placeholder="Select Column to Modify" 
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
                        rules={[{ required: false }]} 
                    >
                        {renderInput(selectedColumn, undefined)}
                    </Form.Item>
                </div>


                
                <div style={{ marginTop: 16, padding: 12, background: 'rgba(255, 165, 0, 0.1)', border: '1px solid orange', borderRadius: 4, color: 'orange' }}>
                    {mode === 'selection' 
                        ? `This will update ${selectedColumn || '...'} for ${selectedCount} selected rows.`
                        : `This will update ${selectedColumn || '...'} for ALL rows matching the conditions.`
                    }
                </div>
            </Form>
        </Modal>
    );
};

export default BulkEditModal;
