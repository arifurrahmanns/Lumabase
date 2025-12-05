import { ipc } from '../renderer/ipc';
import { message } from 'antd';

export const buildColumns = async (
    structure: any[],
    onNavigate: (table: string, filter: { field: string; value: any }) => void,
    handleSave: (row: any) => void
) => {
    return Promise.all(structure.map(async (col: any, index: number) => {
        const isLast = index === structure.length - 1;
        
        const baseCol: any = {
            title: col.name,
            dataIndex: col.name,
            // Only set width if not the last column, to allow flexible filling
            // OR set a width but expect it might render differently? 
            // Better: undefined width for last column triggers standard th, filling space.
            width: isLast ? undefined : 150, 
            editable: true,
            ellipsis: true,
        };

        let selectOptions: any[] = [];
        let inputType = 'text';

        if (col.fk) {
            inputType = 'select';
            // Fetch valid values
            try {
                // Modified query to get DISTINCT values to avoid duplicates
                const query = `SELECT DISTINCT ${col.fk.column} FROM ${col.fk.table} LIMIT 1000`;
                const rows = await ipc.executeQuery(query);
                if (Array.isArray(rows)) {
                    selectOptions = rows.map((r: any) => {
                        const val = String(Object.values(r)[0]);
                        return { label: val, value: val };
                    });
                }
            } catch (e) {
                console.error('Error fetching FK values', e);
            }

            baseCol.render = (text: any, record: any) => {
                 return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{text}</span>
                        <span 
                            style={{ cursor: 'pointer', color: '#1890ff', marginLeft: 8, fontWeight: 'bold' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                message.info(`Navigating to ${col.fk.table}`);
                                onNavigate(col.fk.table, { field: col.fk.column, value: text });
                            }}
                        >
                            ➔
                        </span>
                    </div>
                 );
            };
        }

        baseCol.onCell = (record: any) => ({
            record,
            editable: true,
            dataIndex: col.name,
            title: col.name,
            handleSave,
            inputType,
            selectOptions
        });
        
        return baseCol;
    }));
};
