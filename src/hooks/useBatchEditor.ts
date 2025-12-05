import { useState, useCallback } from 'react';
import { message } from 'antd';
import { ipc } from '../renderer/ipc';

export const useBatchEditor = (
    connectionId: string,
    activeTable: string | null,
    getData: () => any[], // Access current table data
    onReload: () => void
) => {
    const [pendingChanges, setPendingChanges] = useState<Map<any, any>>(new Map());
    const [logs, setLogs] = useState<any[]>([]);
    const [logViewerVisible, setLogViewerVisible] = useState(false);
    const [saving, setSaving] = useState(false);

    const getRowId = (row: any) => row._tempKey || row.id;

    const handleFieldChange = useCallback((row: any, field: string, value: any) => {
        const id = getRowId(row);
        if (id !== undefined) {
             setPendingChanges(prev => {
                const newMap = new Map(prev);
                const existing = newMap.get(id) || {};
                newMap.set(id, { ...existing, [field]: value });
                return newMap;
            });
        }
    }, []);

    const handleSave = useCallback(async () => {
        if (!activeTable) return;
        setSaving(true);
        const batchLogs: any[] = [];
        let hasError = false;
        const pk = 'id'; // Simplified

        const currentRows = getData();
        const newRows = currentRows.filter(r => r._isNew);
        const processedIds = new Set();

        // 1. Handle New Rows (INSERTS)
        for (const row of newRows) {
            const rowKey = getRowId(row); // _tempKey
            processedIds.add(rowKey);
            
            const changes = pendingChanges.get(rowKey) || {};
            const finalRow = { ...row, ...changes };
            
            // Clean up internal flags
            delete finalRow._isNew;
            delete finalRow._tempKey;
            
            // For insertions, we generally don't send the PK if it's null/undefined (AI)
            // But if the user entered a value (changes.id exists), we send it.
            // If explicit "id" is in row (from defaults) but it's empty string/0, we might strictly need to check structure.
            // For now, if defaults put a value there, we send it. 
            // BUT ExplorerScreen will be updated to NOT put a value for AI.

            try {
                await ipc.addRow(connectionId, activeTable, finalRow);
                batchLogs.push({
                    type: 'success',
                    message: `Successfully added row`,
                    timestamp: new Date().toLocaleTimeString()
                });
            } catch (e: any) {
                hasError = true;
                batchLogs.push({
                    type: 'error',
                    message: `Failed to add row: ${e.message}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        }

        // 2. Handle Updates (UPDATES)
        for (const [pkValue, changes] of pendingChanges.entries()) {
            if (processedIds.has(pkValue)) continue; // Already handled as insert

            try {
                await ipc.updateRow(connectionId, activeTable, changes, pk, pkValue);
                batchLogs.push({
                    type: 'success',
                    message: `Successfully updated row ${pkValue}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            } catch (e: any) {
                hasError = true;
                batchLogs.push({
                    type: 'error',
                    message: `Failed to update row ${pkValue}: ${e.message}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        }

        setLogs(prev => [...batchLogs, ...prev]);

        if (hasError) {
            setLogViewerVisible(true);
            message.error('Some changes failed to save');
        } else {
            message.success('All changes saved');
        }
        
        // Always clear pending changes and reload data
        setPendingChanges(new Map());
        onReload();
        
        setSaving(false);
    }, [activeTable, connectionId, pendingChanges, onReload, getData]);

    return {
        pendingChanges,
        setPendingChanges,
        logs,
        setLogs,
        logViewerVisible,
        setLogViewerVisible,
        saving,
        handleFieldChange,
        handleSave
    };
};
