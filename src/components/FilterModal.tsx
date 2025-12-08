import React, { useState, useEffect } from 'react';
import { Modal, Button, Select, Input } from 'antd';
import { Plus, Trash2 } from 'lucide-react';


interface FilterCondition {
    id: number;
    column: string;
    operator: string;
    value: any;
}

interface FilterModalProps {
    visible: boolean;
    columns: any[];
    activeFilters: FilterCondition[];
    onCancel: () => void;
    onApply: (conditions: FilterCondition[]) => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({ visible, columns, activeFilters, onCancel, onApply }) => {
    const [conditions, setConditions] = useState<FilterCondition[]>([]);

    useEffect(() => {
        if (visible) {
            setConditions(activeFilters.length > 0 ? [...activeFilters] : []);
        }
    }, [visible, activeFilters]);

    const handleAddCondition = () => {
        const newCond = { id: Date.now(), column: '', operator: '=', value: '' };
        setConditions([...conditions, newCond]);
    };

    const handleRemoveCondition = (id: number) => {
        setConditions(conditions.filter(c => c.id !== id));
    };

    const updateCondition = (id: number, field: string, val: any) => {
        setConditions(conditions.map(c => c.id === id ? { ...c, [field]: val } : c));
    };

    const handleOk = () => {
        // Filter out incomplete conditions if necessary, or validate
        const validConditions = conditions.filter(c => c.column && c.operator);
        onApply(validConditions);
    };

    return (
        <Modal
            title="Filter Data"
            open={visible}
            onOk={handleOk}
            onCancel={onCancel}
            width={700}
            okText={`Apply Filter${conditions.length > 0 ? ` (${conditions.length})` : ''}`}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20 }}>
                {conditions.length === 0 && (
                    <div style={{ color: '#888', fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
                        No filters applied. Showing all data.
                    </div>
                )}
                
                {conditions.map((cond, index) => (
                    <div key={cond.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                         <span style={{ fontSize: 12, fontWeight: 'bold', width: 50, textAlign: 'right' }}>
                            {index === 0 ? 'WHERE' : 'AND'}
                         </span>
                         <Select 
                            style={{ width: 200 }} 
                            placeholder="Column" 
                            value={cond.column || undefined}
                            onChange={v => updateCondition(cond.id, 'column', v)}
                            showSearch
                         >
                            {columns.map(c => <Select.Option key={c.name} value={c.name}>{c.name}</Select.Option>)}
                         </Select>
                         <Select
                            style={{ width: 90 }}
                            value={cond.operator}
                            onChange={v => updateCondition(cond.id, 'operator', v)}
                         >
                            <Select.Option value="=">=</Select.Option>
                            <Select.Option value="!=">!=</Select.Option>
                            <Select.Option value=">">&gt;</Select.Option>
                            <Select.Option value="<">&lt;</Select.Option>
                            <Select.Option value="LIKE">LIKE</Select.Option>
                         </Select>
                         <Input 
                            style={{ flex: 1 }} 
                            placeholder="Value" 
                            value={cond.value}
                            onChange={e => updateCondition(cond.id, 'value', e.target.value)}
                         />
                         <Button 
                            type="text" 
                            danger 
                            icon={<Trash2 size={16} />} 
                            onClick={() => handleRemoveCondition(cond.id)} 
                         />
                    </div>
                ))}
            </div>
            
            <Button type="dashed" block icon={<Plus size={16} />} onClick={handleAddCondition}>
                Add Condition
            </Button>
        </Modal>
    );
};
