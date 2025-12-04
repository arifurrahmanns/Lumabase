import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../renderer/ipc';
import { message } from 'antd';
import { buildColumns } from '../utils/columnBuilder';

export const useTableData = (
    activeTable: string | null,
    onNavigate: (table: string, filter: { field: string; value: any }) => void
) => {
    const [tableData, setTableData] = useState<any[]>([]);
    const [columns, setColumns] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const loadTableData = useCallback(async () => {
        if (!activeTable) return;
        
        setLoading(true);
        try {
            const data = await ipc.getTableData(activeTable);
            const structure = await ipc.getTableStructure(activeTable);
            
            const cols = await buildColumns(structure, onNavigate);
            
            setColumns(cols);
            setTableData(data);
        } catch (error) {
            console.error(error);
            message.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [activeTable, onNavigate]);

    useEffect(() => {
        loadTableData();
    }, [loadTableData, refreshKey]);

    const refresh = () => setRefreshKey(k => k + 1);

    return {
        tableData,
        setTableData, // Exposed for optimistic updates
        columns,
        loading,
        refresh,
        loadTableData // Exposed for reloading after save
    };
};
