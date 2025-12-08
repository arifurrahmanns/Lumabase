import React from 'react';
import { Modal, List, Typography, Button } from 'antd';
import { XCircle, CheckCircle, Info } from 'lucide-react';

const { Text } = Typography;

interface LogEntry {
  type: 'error' | 'info' | 'success';
  message: string;
  timestamp: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  logs: LogEntry[];
  onClear: () => void;
}

const LogViewer: React.FC<Props> = ({ visible, onClose, logs, onClear }) => {
  return (
    <Modal
      title="Operation Logs"
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="clear" onClick={onClear}>Clear Logs</Button>,
        <Button key="close" type="primary" onClick={onClose}>Close</Button>
      ]}
      width={600}
    >
      <List
        dataSource={logs}
        renderItem={item => (
          <List.Item>
            <List.Item.Meta
              avatar={
                item.type === 'error' ? <XCircle style={{ color: 'red' }} size={24} /> :
                item.type === 'success' ? <CheckCircle style={{ color: 'green' }} size={24} /> :
                <Info style={{ color: 'blue' }} size={24} />
              }
              title={<Text type={item.type === 'error' ? 'danger' : item.type === 'success' ? 'success' : undefined}>{item.message}</Text>}
              description={item.timestamp}
            />
          </List.Item>
        )}
        locale={{ emptyText: 'No logs' }}
      />
    </Modal>
  );
};

export default LogViewer;
