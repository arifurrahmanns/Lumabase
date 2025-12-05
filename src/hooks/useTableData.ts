import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../renderer/ipc';
import { message } from 'antd';
import { buildColumns } from '../utils/columnBuilder';

export const useTableData = (
    connectionId: string,
    activeTable: string | null,
    onNavigate: (table: string, filter: { field: string; value: any }) => void,
    handleSave: (row: any) => void
) => {
    const [tableData, setTableData] = useState<any[]>([]);
    const [columns, setColumns] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const [structure, setStructure] = useState<any[]>([]);

    const loadTableData = useCallback(async () => {
        if (!activeTable) return;
        
        setLoading(true);
        try {
            const data = await ipc.getTableData(connectionId, activeTable);
            const struct = await ipc.getTableStructure(connectionId, activeTable);
            setStructure(struct);
            
            const cols = await buildColumns(struct, onNavigate, handleSave, connectionId);
            
            setColumns(cols);
            setTableData(data);
        } catch (error) {
            console.error(error);
            message.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [connectionId, activeTable, onNavigate, handleSave]);

    useEffect(() => {
        loadTableData();
    }, [loadTableData, refreshKey]);

    const refresh = () => setRefreshKey(k => k + 1);

    return {
        tableData,
        setTableData, 
        columns,
        setColumns,
        loading,
        refresh,
        loadTableData, // Exposed for reloading after save
        structure // Exposed for add row logic
    };
};
