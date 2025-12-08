import React, { useState } from 'react';
import { Button, Select, Input } from 'antd';
import { Plus, X } from 'lucide-react';

interface FilterCondition {
    id: number;
    column: string;
    operator: string;
    value: any;
}

interface TableFilterBarProps {
    columns: any[];
    onFilterChange: (conditions: FilterCondition[]) => void;
}

export const TableFilterBar: React.FC<TableFilterBarProps> = ({ columns, onFilterChange }) => {
    const [conditions, setConditions] = useState<FilterCondition[]>([]);

    const handleAddCondition = () => {
        const newCond = { id: Date.now(), column: '', operator: '=', value: '' };
        const newConditions = [...conditions, newCond];
        setConditions(newConditions);
        // Don't auto-apply on add, user needs to type
    };

    const handleRemoveCondition = (id: number) => {
        const newConditions = conditions.filter(c => c.id !== id);
        setConditions(newConditions);
        onFilterChange(newConditions);
    };

    const updateCondition = (id: number, field: string, val: any) => {
        const newConditions = conditions.map(c => c.id === id ? { ...c, [field]: val } : c);
        setConditions(newConditions);
        // Auto-apply on change? Or manual apply button?
        // Let's add an explicit "Apply" button or just debounce.
        // For simplicity and immediate feedback, explicit apply is sometimes safer, 
        // but modern UX prefers auto. Let's start with auto but maybe debounce in parent if needed.
        // Actually, preventing fetch storms: let's invoke change immediately but let parent debounce.
        onFilterChange(newConditions);
    };



    return (
        <div style={{ padding: '8px 16px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {conditions.map((cond, index) => (
                    <div key={cond.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                         <span style={{ fontSize: 12, fontWeight: 'bold', width: 40, textAlign: 'right' }}>
                            {index === 0 ? 'WHERE' : 'AND'}
                         </span>
                         <Select 
                            style={{ width: 200 }} 
                            placeholder="Column" 
                            size="small"
                            value={cond.column || undefined}
                            onChange={v => updateCondition(cond.id, 'column', v)}
                            showSearch
                         >
                            {columns.map(c => <Select.Option key={c.name} value={c.name}>{c.name}</Select.Option>)}
                         </Select>
                         <Select
                            style={{ width: 80 }}
                            value={cond.operator}
                            size="small"
                            onChange={v => updateCondition(cond.id, 'operator', v)}
                         >
                            <Select.Option value="=">=</Select.Option>
                            <Select.Option value="!=">!=</Select.Option>
                            <Select.Option value=">">&gt;</Select.Option>
                            <Select.Option value="<">&lt;</Select.Option>
                            <Select.Option value="LIKE">LIKE</Select.Option>
                         </Select>
                         <Input 
                            style={{ width: 200 }} 
                            placeholder="Value" 
                            size="small"
                            value={cond.value}
                            onChange={e => updateCondition(cond.id, 'value', e.target.value)}
                         />
                         <Button 
                            type="text" 
                            size="small" 
                            danger 
                            icon={<X size={14} />} 
                            onClick={() => handleRemoveCondition(cond.id)} 
                         />
                    </div>
                ))}
                <div style={{ paddingLeft: conditions.length > 0 ? 48 : 0 }}>
                    <Button type="dashed" size="small" icon={<Plus size={14} />} onClick={handleAddCondition}>
                        Add Condition
                    </Button>
                </div>
            </div>
        </div>
    );
};
