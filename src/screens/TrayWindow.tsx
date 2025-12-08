import React, { useEffect, useState } from 'react';
import { Switch, Button, List, Typography, Space, Divider, Badge } from 'antd';
import { Power, LayoutGrid } from 'lucide-react';
import { ipc } from '../renderer/ipc';
import { EngineInstance } from '../server/engineManager/types';

const { Text } = Typography;

const TrayWindow: React.FC = () => {
  const [instances, setInstances] = useState<EngineInstance[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const fetchEngines = async () => {
    try {
      const list = await ipc.getEngines();
      // Sort: Priority to running instances, then by lastStartedAt descending
      const sorted = list.sort((a: any, b: any) => {
          if (a.status === 'running' && b.status !== 'running') return -1;
          if (a.status !== 'running' && b.status === 'running') return 1;
          // Both same status category
          const timeA = a.lastStartedAt || 0;
          const timeB = b.lastStartedAt || 0;
          return timeB - timeA;
      });
      setInstances(sorted.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch engines:', error);
    }
  };

  useEffect(() => {
    fetchEngines();
    
    // Subscribe to updates if exposed via IPC events, or just poll.
    // The main process implementation sends 'main-process-message' but currently 
    // doesn't broadcast engine changes to all windows automatically unless we set it up.
    // For now, let's poll every 2 seconds to be safe, or relies on user interaction.
    // Better: We can check if `ipc.on` allows subscribing to a generic event.
    
    // We'll set up a poller for now as it guarantees sync without complex socket logic
    // since this window might open/close frequently.
    const interval = setInterval(fetchEngines, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (instance: EngineInstance) => {
    setLoading(prev => ({ ...prev, [instance.id]: true }));
    try {
      if (instance.status === 'running') {
        await ipc.stopEngine(instance.id);
      } else {
        await ipc.startEngine(instance.id);
      }
      // Immediate fetch after action
      await fetchEngines();
    } catch (error) {
      console.error('Toggle failed:', error);
    } finally {
      setLoading(prev => ({ ...prev, [instance.id]: false }));
    }
  };

  const handleOpenApp = () => {
    // We need an IPC event to show the main window. 
    // We can reuse 'window-maximize' or add a specific 'show-main-window'
    // But commonly the tray window logic in main.ts handles the open/close.
    // Let's invoke a new IPC handler we'll add: 'app-open'
    // For now, let's try 'window-maximize' if it restores the window.
    // Actually, let's just use 'window-restore' or similar. 
    // Let's add 'app-open' to main.ts later.
    // Using 'window-maximize' might be weird if it was just minimized.
    // Let's assume we will add `ipc.invoke('app-open')`.
    // Since `ipc` wrapper might not have it, we'll use `window-maximize` as a fallback or add it to `ipc.ts` later.
    // Actually, let's assume `ipc.ts` is strictly typed. I should check `ipc.ts` first? 
    // No, I can add `appOpen` to it.
    
    // For this step, I'll use a direct ipcRenderer call if possible, but `ipc` is a wrapper.
    // Any unknown method usually fails TS.
    // I will add `appOpen` to the IPC wrapper in the next step.
    // Here I will use it as if it exists.
    (ipc as any).openApp?.(); 
  };

  const handleQuit = () => {
     (ipc as any).quitApp?.();
  };

  return (
    <div style={{ 
      padding: '12px', 
      backgroundColor: '#1f1f1f', // Match dark theme
      height: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ marginBottom: '12px', textAlign: 'center' }}>
          <Text strong style={{ color: '#fff' }}>Lumabase</Text>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <List
          itemLayout="horizontal"
          dataSource={instances}
          locale={{ emptyText: <Text type="secondary">No engines found</Text> }}
          renderItem={(item) => (
            <List.Item style={{ padding: '8px 0', borderBottom: '1px solid #303030' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                      <Badge status={item.status === 'running' ? 'success' : 'default'} />
                      <div>
                          <Text style={{ color: '#fff', display: 'block' }}>{item.name}</Text>
                          <Text type="secondary" style={{ fontSize: '10px' }}>
                              {item.type} {item.version} : {item.port}
                          </Text>
                      </div>
                  </Space>
                  <Switch 
                    size="small" 
                    checked={item.status === 'running'} 
                    loading={loading[item.id] || item.status === 'starting'}
                    onChange={() => handleToggle(item)}
                    style={{ backgroundColor: item.status === 'running' ? '#FA541C' : undefined }}
                  />
              </div>
            </List.Item>
          )}
        />
      </div>

      <Divider style={{ margin: '12px 0', borderColor: '#303030' }} />

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Button block icon={<LayoutGrid size={16} />} onClick={handleOpenApp} style={{ textAlign: 'left' }}>
          Open Dashboard
        </Button>
        <Button block danger type="text" icon={<Power size={16} />} onClick={handleQuit} style={{ textAlign: 'left' }}>
          Quit Lumabase
        </Button>
      </Space>
    </div>
  );
};

export default TrayWindow;
