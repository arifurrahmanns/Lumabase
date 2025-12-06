import React from 'react';
import { ConfigProvider, theme } from 'antd';
import TabsLayout from './TabsLayout';
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
      <TabsLayout />
    </ConfigProvider>
  );
};

export default App;
