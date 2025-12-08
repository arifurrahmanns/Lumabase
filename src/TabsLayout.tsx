import React, { useState, useRef } from 'react';
import { Layout, Tabs, Space, message } from 'antd';
import { Database, Home } from 'lucide-react';
import EngineManagerScreen from './screens/EngineManagerScreen';
import ExplorerScreen from './screens/ExplorerScreen';
import TitleBar from './components/TitleBar';
import { ipc } from './renderer/ipc';

interface Tab {
  key: string;
  label: string;
  type: 'engine-manager' | 'explorer';
  connectionId?: string;
  engineName?: string;
  closable?: boolean;
}

const TabsLayout: React.FC = () => {
  const [activeKey, setActiveKey] = useState('home');
  const [tabs, setTabs] = useState<Tab[]>([
    { key: 'home', label: 'Engines', type: 'engine-manager', closable: false }
  ]);
  const tabRefs = useRef<Record<string, any>>({});

  const handleConnect = (connectionId: string, engineName: string) => {
    const newKey = `tab-${Date.now()}`;
    const newTab: Tab = {
      key: newKey,
      label: engineName,
      type: 'explorer',
      connectionId: connectionId,
      engineName: engineName,
      closable: true,
    };
    setTabs([...tabs, newTab]);
    setActiveKey(newKey);
  };

  const handleAddTab = () => {
    // For now, adding a tab opens the Engine Manager
    const newKey = `new-tab-${Date.now()}`;
    const newTab: Tab = {
        key: newKey,
        label: 'New Tab',
        type: 'engine-manager',
        closable: true
    };
    setTabs([...tabs, newTab]);
    setActiveKey(newKey);
  };

  const onEdit = (targetKey: any, action: 'add' | 'remove') => {
    if (action === 'remove') {
      removeTab(targetKey);
    }
  };

  const removeTab = (targetKey: string) => {
    const targetIndex = tabs.findIndex((pane) => pane.key === targetKey);
    const newTabs = tabs.filter((pane) => pane.key !== targetKey);
    if (newTabs.length && targetKey === activeKey) {
      const { key } = newTabs[targetIndex === newTabs.length ? targetIndex - 1 : targetIndex];
      setActiveKey(key);
    }

    setTabs(newTabs);
    // Remove ref
    if (tabRefs.current[targetKey]) {
        delete tabRefs.current[targetKey];
    }
    // TODO: Ideally close connection on backend too
  };

  const handleRefresh = () => {
      const activeRef = tabRefs.current[activeKey];
      if (activeRef && activeRef.refresh) {
          activeRef.refresh();
      }
  };

  const handleMenuAction = (action: string) => {
      const activeRef = tabRefs.current[activeKey];
      if (!activeRef) return;

      if (action === 'delete-database') {
          if (activeRef.deleteCurrentDatabase) {
              activeRef.deleteCurrentDatabase();
          }
      }
  };

  const handleOpenDatabase = async (sourceConnectionId: string, dbName: string) => {
      try {
          const res = await ipc.cloneConnection(sourceConnectionId, dbName);
          if (res.success && res.connectionId) {
            const newKey = `tab_${Date.now()}`;
            setTabs(prev => [...prev, { 
                key: newKey, 
                label: dbName, 
                type: 'explorer', 
                connectionId: res.connectionId 
            }]);
            setActiveKey(newKey);
          } else {
            message.error(`Failed to open database: ${res.error}`);
          }
      } catch (e: any) {
          message.error(`Failed to open database: ${e.message}`);
      }
  };

  const activeTab = tabs.find(t => t.key === activeKey);
  const isRefreshable = activeTab?.type === 'engine-manager' || activeTab?.type === 'explorer';

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <TitleBar 
        onAddTab={handleAddTab} 
        onRefresh={handleRefresh} 
        onMenuAction={handleMenuAction}
        refreshDisabled={!isRefreshable} 
      />
      <Tabs
        type="editable-card"
        activeKey={activeKey}
        onChange={setActiveKey}
        onEdit={onEdit}
        hideAdd // Hiding default add button as we have one in TitleBar
        items={tabs.map(tab => ({
          key: tab.key,
          label: (
            <Space>
              {tab.type === 'engine-manager' ? <Home size={16} /> : <Database size={16} />}
              {tab.label}
            </Space>
          ),
          closable: tab.closable !== false,
          children: tab.type === 'engine-manager' ? (
            <EngineManagerScreen 
                ref={(el) => { if (el) tabRefs.current[tab.key] = el; }}
                onConnect={(connectionId, engineName) => handleConnect(connectionId, engineName)} 
            />
          ) : (
            <ExplorerScreen 
                ref={(el) => { if (el) tabRefs.current[tab.key] = el; }}
                connectionId={tab.connectionId!} 
                onOpenDatabase={(dbName) => handleOpenDatabase(tab.connectionId!, dbName)}
            />
          )
        }))}
        style={{ height: 'calc(100% - 32px)' }}
        tabBarStyle={{ margin: 0, paddingLeft: 16, paddingTop: 8, background: 'var(--sidebar)' }}
      />
    </Layout>
  );
};

export default TabsLayout;
