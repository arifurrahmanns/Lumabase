import React, { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import ConnectionScreen from './screens/ConnectionScreen';
import ExplorerScreen from './screens/ExplorerScreen';

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm, // Use dark mode by default for "TablePlus" feel
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <HashRouter>
        <Routes>
          <Route 
            path="/connect" 
            element={<ConnectionScreen onConnect={() => setIsConnected(true)} />} 
          />
          <Route 
            path="/explorer" 
            element={isConnected ? <ExplorerScreen /> : <Navigate to="/connect" replace />} 
          />
          <Route path="*" element={<Navigate to="/connect" replace />} />
        </Routes>
      </HashRouter>
    </ConfigProvider>
  );
};

export default App;
