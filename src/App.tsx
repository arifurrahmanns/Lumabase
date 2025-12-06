import React from 'react';
import { ConfigProvider, theme } from 'antd';
import TabsLayout from './TabsLayout';
import TrayWindow from './screens/TrayWindow';
import { HashRouter, Routes, Route } from 'react-router-dom';
import '@fontsource/geist-sans';

const App: React.FC = () => {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#FA541C', // Volcano
          fontFamily: 'Geist Sans, Inter, sans-serif',
        },
      }}
    >
      <HashRouter>
        <Routes>
          <Route path="/" element={<TabsLayout />} />
          <Route path="/tray" element={<TrayWindow />} />
        </Routes>
      </HashRouter>
    </ConfigProvider>
  );
};

export default App;
