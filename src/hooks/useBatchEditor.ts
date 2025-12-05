import { useState, useCallback } from 'react';
import { message } from 'antd';
import { ipc } from '../renderer/ipc';

export const useBatchEditor = (
    connectionId: string,
    activeTable: string | null,
    onReload: () => void
) => {
    const [pendingChanges, setPendingChanges] = useState<Map<any, any>>(new Map());
    const [logs, setLogs] = useState<any[]>([]);
    const [logViewerVisible, setLogViewerVisible] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleFieldChange = useCallback((row: any, field: string, value: any) => {
        const pk = 'id'; // Simplified: assuming 'id' is PK

        if (row[pk] !== undefined) {
             setPendingChanges(prev => {
                const newMap = new Map(prev);
                const existing = newMap.get(row[pk]) || {};
                newMap.set(row[pk], { ...existing, [field]: value });
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

        for (const [pkValue, changes] of pendingChanges.entries()) {
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
    }, [activeTable, connectionId, pendingChanges, onReload]);

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
