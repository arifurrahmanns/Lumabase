import React, { useState } from 'react';
import { Layout, Tabs, Space } from 'antd';
import { DatabaseOutlined, HomeOutlined } from '@ant-design/icons';
import EngineManagerScreen from './screens/EngineManagerScreen';
import ExplorerScreen from './screens/ExplorerScreen';
import TitleBar from './components/TitleBar';

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
    // TODO: Ideally close connection on backend too
  };

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <TitleBar onAddTab={handleAddTab} />
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
              {tab.type === 'engine-manager' ? <HomeOutlined /> : <DatabaseOutlined />}
              {tab.label}
            </Space>
          ),
          closable: tab.closable,
          children: tab.type === 'engine-manager' ? (
            <EngineManagerScreen onConnect={(connectionId, engineName) => handleConnect(connectionId, engineName)} />
          ) : (
            <ExplorerScreen connectionId={tab.connectionId!} />
          )
        }))}
        style={{ height: 'calc(100% - 32px)' }}
        tabBarStyle={{ margin: 0, paddingLeft: 16, paddingTop: 8, background: 'var(--sidebar)' }}
      />
    </Layout>
  );
};

export default TabsLayout;
