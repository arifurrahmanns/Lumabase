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
  forceEdit?: boolean;
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
  forceEdit = false,
  ...restProps
}) => {
  const [editing, setEditing] = useState(forceEdit);
  // Initialize with record value.
  const [value, setValue] = useState(record ? record[dataIndex] : undefined);
  
  const inputRef = useRef<any>(null);

  useEffect(() => {
      setValue(record ? record[dataIndex] : undefined);
  }, [record, dataIndex]);

  useEffect(() => {
    if (forceEdit) {
        setEditing(true);
    }
  }, [forceEdit]);

  useEffect(() => {
    if (editing && inputRef.current) {
        inputRef.current.focus();
    }
  }, [editing]);

  const toggleEdit = () => {
    if (forceEdit) return;
    setEditing(!editing);
    if (!editing && record) {
        // When entering edit mode, ensure we have the latest value
        setValue(record[dataIndex]);
    }
  };

  const save = () => {
    if (!forceEdit) {
        setEditing(false); // Only toggle off if not forced
    }
    
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
             defaultOpen={!forceEdit} // Don't auto-open if forced (would be annoying)
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
