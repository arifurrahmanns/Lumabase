import React, { useState } from 'react';
import { Layout, Button, Table, message, Space } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { ipc } from '../renderer/ipc';

const { Content } = Layout;

interface SqlEditorProps {
    connectionId: string;
    initialQuery?: string;
}

const SqlEditor: React.FC<SqlEditorProps> = ({ connectionId, initialQuery = '' }) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setColumns([]);

    try {
      const data = await ipc.executeQuery(connectionId, query);
      
      if (Array.isArray(data)) {
        setResults(data);
        if (data.length > 0) {
          // Auto-generate columns from first row
          const cols = Object.keys(data[0]).map(key => ({
            title: key,
            dataIndex: key,
            key: key,
            render: (text: string, _record: any) => {
                if (text === null) return <span style={{ color: '#666', fontStyle: 'italic' }}>NULL</span>;
                if (typeof text === 'object') return JSON.stringify(text);
                return String(text);
            }
          }));
          setColumns(cols);
        }
        message.success(`Query executed successfully. ${data.length} rows returned.`);
      } else {
        // Handle non-select queries (e.g. INSERT/UPDATE might return metadata depending on adapter)
        // For now, just show success message if it didn't throw
        message.success('Query executed successfully.');
      }
    } catch (e: any) {
      setError(e.message);
      message.error('Query failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout style={{ height: '100%', background: '#141414' }}>
      <Content style={{ display: 'flex', flexDirection: 'column', padding: 16, gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ border: '1px solid #303030', borderRadius: 4, overflow: 'hidden' }}>
                <CodeMirror
                    value={query}
                    height="200px"
                    theme={vscodeDark}
                    extensions={[sql()]}
                    onChange={(val) => setQuery(val)}
                    basicSetup={{
                        foldGutter: true,
                        dropCursor: true,
                        allowMultipleSelections: true,
                        indentOnInput: true,
                    }}
                />
            </div>
            <Space>
                <Button 
                    type="primary" 
                    icon={<PlayCircleOutlined />} 
                    onClick={handleExecute} 
                    loading={loading}
                >
                    Run Query
                </Button>
            </Space>
        </div>

        {error && (
            <div style={{ padding: 12, background: '#3a1616', color: '#ff4d4f', borderRadius: 4, border: '1px solid #5c2222' }}>
                {error}
            </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', border: '1px solid #303030', borderRadius: 4 }}>
            <Table 
                dataSource={results} 
                columns={columns} 
                rowKey={(_, index) => index!.toString()} 
                pagination={{ pageSize: 50 }} 
                size="small"
                scroll={{ y: 'calc(100vh - 400px)' }} // Adjust scroll height considering editor height
                locale={{ emptyText: 'No results' }}
            />
        </div>
      </Content>
    </Layout>
  );
};

export default SqlEditor;
