import React from 'react';
import { Space, Button, Checkbox } from 'antd';
import { 
    QuestionCircleOutlined, 
    ReloadOutlined, 
    PlusOutlined, 
    MinusOutlined, 
    BorderOutlined, 
    CloseOutlined
} from '@ant-design/icons';
import { ipc } from '../renderer/ipc';

interface TitleBarProps {
    onAddTab?: () => void;
    onRefresh?: () => void;
    refreshDisabled?: boolean;
}

const TitleBar: React.FC<TitleBarProps> = ({ onAddTab, onRefresh, refreshDisabled }) => {
    // const { token } = theme.useToken(); // Unused for now
    const [startOnLogin, setStartOnLogin] = React.useState(false);
    const [showInTray, setShowInTray] = React.useState(true);

    React.useEffect(() => {
        // Load initial settings
        ipc.getAppSettings().then((settings: any) => {
            setStartOnLogin(settings.startOnLogin);
            setShowInTray(settings.showInTray);
        });
    }, []);

    const handleStartOnLoginChange = (e: any) => {
        const newVal = e.target.checked;
        setStartOnLogin(newVal);
        ipc.setStartOnLogin(newVal);
    };

    return (
        <div style={{
            height: 32,
            background: '#1e1e1e', // Dark header background
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            borderBottom: '1px solid #303030',
            userSelect: 'none',
            WebkitAppRegion: 'drag' // Allow dragging
        } as React.CSSProperties}>
            {/* Left Actions */}
            <Space style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <Button type="text" size="small" icon={<QuestionCircleOutlined />} style={{ color: '#aaa' }} />
                <Button 
                    type="text" 
                    size="small" 
                    icon={<ReloadOutlined />} 
                    style={{ color: '#aaa' }} 
                    onClick={onRefresh}
                    disabled={refreshDisabled}
                />
                <Button type="text" size="small" icon={<PlusOutlined />} style={{ color: '#aaa' }} onClick={onAddTab} />
            </Space>

            {/* Config & Window Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                 <Space size="middle">
                    <Checkbox 
                        style={{ color: '#aaa' }} 
                        checked={startOnLogin} 
                        onChange={handleStartOnLoginChange}
                    >
                        Start on login
                    </Checkbox>
                    <Checkbox 
                        style={{ color: '#aaa' }} 
                        checked={showInTray}
                        onChange={(e) => {
                            const val = e.target.checked;
                            setShowInTray(val);
                            ipc.setShowInTray(val);
                        }}
                    >
                        Show in system tray
                    </Checkbox>
                 </Space>
                 
                 <Space size={0}>
                    <Button 
                        type="text" 
                        size="small" 
                        icon={<MinusOutlined />} 
                        style={{ color: '#aaa', width: 40, height: 32, borderRadius: 0 }} 
                        onClick={() => ipc.minimizeWindow()}
                    />
                    <Button 
                        type="text" 
                        size="small" 
                        icon={<BorderOutlined style={{ fontSize: 10 }} />} 
                        style={{ color: '#aaa', width: 40, height: 32, borderRadius: 0 }} 
                        onClick={() => ipc.maximizeWindow()}
                    />
                    <Button 
                        type="text" 
                        size="small" 
                        icon={<CloseOutlined />} 
                        style={{ color: '#aaa', width: 40, height: 32, borderRadius: 0 }} 
                        className="hover:bg-red-500 hover:text-white"
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'red'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        onClick={() => ipc.closeWindow()}
                    />
                 </Space>
            </div>
        </div>
    );
};

export default TitleBar;
