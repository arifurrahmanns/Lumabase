import { useState, useCallback } from 'react';
import { message } from 'antd';
import { ipc } from '../renderer/ipc';

export const useBatchEditor = (
    connectionId: string,
    activeTable: string | null,
    getData: () => any[], // Access current table data
    onReload: () => void,
    structure: any[],
    setTableData: React.Dispatch<React.SetStateAction<any[]>>
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
        const pk = 'id'; // Simplified

        const currentRows = getData();
        const newRows = currentRows.filter(r => r._isNew);
        const processedIds = new Set();
        const successfulIds = new Set();
        
        // Helper to validate a row
        const validateRow = (row: any, changes: any = {}) => {
            const merged = { ...row, ...changes };
            if (!structure || structure.length === 0) return { valid: true };

            for (const col of structure) {
                if (col.autoIncrement) continue; 
                if (col.notnull) {
                     const val = merged[col.name];
                     if (val === undefined || val === null || val === '') {
                        return { valid: false, field: col.name };
                     }
                }
            }
            return { valid: true };
        };

        // 1. Handle New Rows (INSERTS)
        for (const row of newRows) {
            const rowKey = getRowId(row); 
            processedIds.add(rowKey);
            
            const changes = pendingChanges.get(rowKey) || {};

            // Validate
            const validation = validateRow(row, changes);
            if (!validation.valid) {
                 batchLogs.push({
                     type: 'error',
                     message: `Row failed validation: Field '${validation.field}' is required.`,
                     timestamp: new Date().toLocaleTimeString()
                 });
                 // Do not attempt to save, keep in pending
                 continue;
            }

            const finalRow = { ...row, ...changes };
            
            // Clean up internal flags
            delete finalRow._isNew;
            delete finalRow._tempKey;
            
            try {
                // Expecting DB to return the ID or the full row
                const result = await ipc.addRow(connectionId, activeTable, finalRow);
                const newId = (typeof result === 'object' && result?.id) ? result.id : (typeof result === 'number' || typeof result === 'string' ? result : undefined);
                
                batchLogs.push({
                    type: 'success',
                    message: `Successfully added row${newId ? ` (ID: ${newId})` : ''}`,
                    timestamp: new Date().toLocaleTimeString()
                });

                successfulIds.add(rowKey);

                // Update local state IMMEDIATELY for this success
                setTableData(prev => prev.map(r => {
                    if (getRowId(r) === rowKey) {
                        return { 
                            ...r, 
                            ...changes, 
                            id: newId || r.id, // Use new ID if available
                            _isNew: undefined, 
                            _tempKey: undefined 
                        };
                    }
                    return r;
                }));

            } catch (e: any) {
                batchLogs.push({
                    type: 'error',
                    message: `Failed to add row: ${e.message}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        }

        // 2. Handle Updates (UPDATES)
        // For updates, we also try to save one by one (or batch if API supported it, but we do one by one here)
        for (const [pkValue, changes] of pendingChanges.entries()) {
            if (processedIds.has(pkValue)) continue; 

            // Basic check? 
            // For now, assume updates are valid or let DB fail them. 
            
            try {
                await ipc.updateRow(connectionId, activeTable, changes, pk, pkValue);
                batchLogs.push({
                    type: 'success',
                    message: `Successfully updated row ${pkValue}`,
                    timestamp: new Date().toLocaleTimeString()
                });
                successfulIds.add(pkValue);
                
                // Update local data? 
                // Usually we can wait for reload, but if we have mixed success/fail, 
                // we should stick to local update to avoid losing failed ones.
                 setTableData(prev => prev.map(r => {
                    if (getRowId(r) === pkValue) {
                        return { ...r, ...changes };
                    }
                    return r;
                }));

            } catch (e: any) {
                batchLogs.push({
                    type: 'error',
                    message: `Failed to update row ${pkValue}: ${e.message}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        }

        setLogs(prev => [...batchLogs, ...prev]);

        // Clear pending changes ONLY for successful ones
        if (successfulIds.size > 0) {
            setPendingChanges(prev => {
                const next = new Map(prev);
                successfulIds.forEach(k => next.delete(k));
                return next;
            });
            message.success(`Saved ${successfulIds.size} changes`);
        }
        
        const hasFailures = batchLogs.some(l => l.type === 'error');
        if (hasFailures) {
            setLogViewerVisible(true);
            message.warning('Some rows could not be saved');
            // Do NOT reload if there are failures, to preserve them
        } else {
             // If everything worked, we can do a full clean reload to be sure
             // But strictly speaking, we already updated local state. 
             // Reload might be safer to ensure consistency with DB triggers etc.
             // But reload destroys local "unsaved" state if we had any (we shouldn't if no failures).
             // If no failures, it's safe to reload.
             onReload(); 
        }
        
        setSaving(false);
    }, [activeTable, connectionId, pendingChanges, onReload, getData, structure, setTableData]);

    const reset = useCallback(() => {
        setPendingChanges(new Map());
        setLogs([]);
        setLogViewerVisible(false);
    }, []);

    return {
        pendingChanges,
        setPendingChanges,
        logs,
        setLogs,
        logViewerVisible,
        setLogViewerVisible,
        saving,
        handleFieldChange,
        handleSave,
        reset
    };
};
