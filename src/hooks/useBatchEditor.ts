import { useState } from 'react';
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

    const handleCellEdited = (cell: any) => {
        const row = cell.getData();
        const field = cell.getField();
        const value = cell.getValue();
        const oldValue = cell.getOldValue();
        
        // Strict comparison to avoid false positives
        if (value === oldValue) return;
        if ((value === '' && oldValue === null) || (value === null && oldValue === '')) return;

        const pk = 'id'; // Simplified: assuming 'id' is PK

        if (row[pk] !== undefined) {
            setPendingChanges(prev => {
                const newMap = new Map(prev);
                const existing = newMap.get(row[pk]) || {};
                newMap.set(row[pk], { ...existing, [field]: value });
                return newMap;
            });
        } else {
            message.warning('Cannot edit: Primary Key "id" not found in row');
            cell.restoreOldValue();
        }
    };

    const handleSave = async () => {
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
    };

    return {
        pendingChanges,
        setPendingChanges,
        logs,
        setLogs,
        logViewerVisible,
        setLogViewerVisible,
        saving,
        handleCellEdited,
        handleSave
    };
};
