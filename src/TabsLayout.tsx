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
