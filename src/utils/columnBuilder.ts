import { ipc } from '../renderer/ipc';
import { message } from 'antd';

export const buildColumns = async (
    structure: any[],
    onNavigate: (table: string, filter: { field: string; value: any }) => void
) => {
    return Promise.all(structure.map(async (col: any) => {
        const baseCol: any = {
            title: col.name,
            field: col.name,
            editor: 'input',
        };

        if (col.fk) {
            // Configure Dropdown
            baseCol.editor = 'list';
            
            baseCol.editorParams = {
                values: [], 
                autocomplete: true,
                clearable: true,
                freetext: true, // Allow typing values not in list
                allowEmpty: true,
                listOnEmpty: true
            };
            
            // Fetch valid values from referenced table
            try {
                const query = `SELECT DISTINCT ${col.fk.column} FROM ${col.fk.table} LIMIT 1000`;
                const rows = await ipc.executeQuery(query);
                if (Array.isArray(rows)) {
                    const values = rows.map((r: any) => String(Object.values(r)[0]));
                    console.log(`Loaded ${values.length} FK values for ${col.name}`);
                    baseCol.editorParams.values = values;
                } else {
                    console.warn(`FK query returned non-array for ${col.name}`, rows);
                }
            } catch (e) {
                console.error('Error fetching FK values', e);
            }

            // Formatter for arrow using DOM node to attach event listener directly
            baseCol.formatter = (cell: any) => {
                const val = cell.getValue();
                if (!val) return '';

                const container = document.createElement('div');
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.style.justifyContent = 'space-between';
                
                const text = document.createElement('span');
                text.innerText = val;
                container.appendChild(text);

                const arrow = document.createElement('span');
                arrow.innerText = '➔';
                arrow.style.cursor = 'pointer';
                arrow.style.color = '#1890ff';
                arrow.style.marginLeft = '8px';
                arrow.style.fontWeight = 'bold';
                arrow.className = 'fk-arrow';
                
                // Stop propagation immediately to prevent editor opening
                arrow.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                });
                
                arrow.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    
                    console.log('Arrow clicked via DOM listener');
                    message.info(`Navigating to ${col.fk.table}`);
                    
                    onNavigate(col.fk.table, { field: col.fk.column, value: val });
                });

                container.appendChild(arrow);
                return container;
            };
        }
        
        return baseCol;
    }));
};
