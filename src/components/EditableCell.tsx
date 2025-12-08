import React, { useState, useEffect, useRef } from 'react';
import { Input, Select, DatePicker } from 'antd';
import dayjs from 'dayjs';

interface EditableCellProps {
  title: React.ReactNode;
  editable: boolean;
  children: React.ReactNode;
  dataIndex: string;
  record: any;
  handleSave: (record: any) => void;
  inputType?: 'text' | 'select' | 'date' | 'datetime';
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
  const [value, setValue] = useState(record ? record[dataIndex] : undefined);
  const valueRef = useRef(value);
  
  const inputRef = useRef<any>(null);
  const calendarOpenRef = useRef(false);

  useEffect(() => {
      const val = record ? record[dataIndex] : undefined;
      setValue(val);
      valueRef.current = val;
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
        const val = record[dataIndex];
        setValue(val);
        valueRef.current = val;
    }
  };

  const save = () => {
    // If calendar is open, don't close edit mode yet. let onOpenChange(false) handle it.
    if (calendarOpenRef.current) return;

    if (!forceEdit) {
        setEditing(false); 
    }
    
    if (record) {
        handleSave({ ...record, [dataIndex]: valueRef.current });
    }
  };

  const handleChange = (val: any) => {
      setValue(val);
      valueRef.current = val;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setValue(val);
      valueRef.current = val;
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
             defaultOpen={!forceEdit}
             autoFocus
             style={{ width: '100%', margin: 0 }}
           />
        ) : inputType === 'date' || inputType === 'datetime' ? (
            <DatePicker
             ref={inputRef}
             showTime={inputType === 'datetime'}
             value={value && value !== 'NULL' ? dayjs(value) : null}
             onChange={(date, dateString) => {
                 // If date is cleared, set to NULL (string) or empty which backend treats as null
                 const val = date ? dateString : null; 
                 setValue(val);
                 valueRef.current = val;
             }}
             onBlur={() => {
                 // Slight delay to allow onOpenChange to fire first if clicking into calendar
                 setTimeout(() => {
                     if (!calendarOpenRef.current) {
                         save();
                     }
                 }, 100);
             }}
             onOpenChange={(open) => { 
                 calendarOpenRef.current = open;
                 if (!open) {
                     // Wait for the value to settle then save
                     setTimeout(save, 50); 
                 }
             }}
             autoFocus
             style={{ width: '100%', margin: 0 }}
             format={inputType === 'datetime' ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD"}
             allowClear
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
        style={{ paddingRight: 24, cursor: 'pointer', border: '1px solid transparent', minHeight: '32px' }} 
        onClick={toggleEdit}
      >
        {children || <span style={{ color: '#555', fontStyle: 'italic' }}>NULL</span>}
      </div>
    );
  }

  return <td {...restProps}>{childNode}</td>;
};
