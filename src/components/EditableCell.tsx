import React, { useState, useEffect, useRef } from 'react';
import { Input, Select } from 'antd';

interface EditableCellProps {
  title: React.ReactNode;
  editable: boolean;
  children: React.ReactNode;
  dataIndex: string;
  record: any;
  handleSave: (record: any) => void;
  inputType?: 'text' | 'select';
  selectOptions?: { value: any; label: string }[];
}

export const EditableCell: React.FC<EditableCellProps> = ({
  title,
  editable,
  children,
  dataIndex,
  record,
  handleSave,
  inputType = 'text',
  selectOptions = [],
  ...restProps
}) => {
  const [editing, setEditing] = useState(false);
  // Initialize with record value. If record changes, this might need update, 
  // but usually we rely on editing state toggle to refresh.
  const [value, setValue] = useState(record ? record[dataIndex] : undefined);
  
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
        inputRef.current.focus();
    }
  }, [editing]);

  const toggleEdit = () => {
    setEditing(!editing);
    if (!editing && record) {
        // When entering edit mode, ensure we have the latest value
        setValue(record[dataIndex]);
    }
  };

  const save = () => {
    toggleEdit();
    // Only save if value changed? 
    // handleSave logic in ExplorerScreen checks equality, so safe to call always.
    if (record) {
        handleSave({ ...record, [dataIndex]: value });
    }
  };

  const handleChange = (val: any) => {
      setValue(val);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
  };

  let childNode = children;

  if (editable) {
    childNode = editing ? (
        inputType === 'select' ? (
           <Select
             ref={inputRef}
             value={value}
             onChange={handleChange}
             onBlur={save}
             options={selectOptions}
             defaultOpen={true}
             autoFocus
             style={{ width: '100%', margin: 0 }}
           />
        ) : (
           <Input 
             ref={inputRef} 
             value={value}
             onChange={handleInputChange}
             onPressEnter={save} 
             onBlur={save} 
             autoFocus
             style={{ margin: 0 }}
           />
        )
    ) : (
      <div 
        className="editable-cell-value-wrap" 
        style={{ paddingRight: 24, cursor: 'pointer', border: '1px solid transparent' }} 
        onClick={toggleEdit}
      >
        {children}
      </div>
    );
  }

  return <td {...restProps}>{childNode}</td>;
};
