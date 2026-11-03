import React, { useState, useEffect } from 'react';
import { checkBackendHealth } from '../../api/shipments';
import { apiClient } from '../../api/client';
import { Badge } from '../ui/Badge';
import { Activity, Wifi, WifiOff, Database } from 'lucide-react';

interface ConnectionStatusProps {
  onModeChange?: (isMock: boolean) => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ onModeChange }) => {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isMock, setIsMock] = useState<boolean>(apiClient.isMockEnabled());
  const [checking, setChecking] = useState<boolean>(false);

  const checkStatus = async () => {
    if (isMock) {
      setIsOnline(true);
      return;
    }
    setChecking(true);
    try {
      const res = await checkBackendHealth();
      setIsOnline(res.status === 'ok');
    } catch {
      setIsOnline(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [isMock]);

  const toggleMock = () => {
    const nextMock = !isMock;
    setIsMock(nextMock);
    apiClient.setMockEnabled(nextMock);
    if (onModeChange) onModeChange(nextMock);
  };

  return (
    <div className="flex-row items-center gap-2">
      {isMock ? (
        <Badge
          variant="warning"
          icon={<Database size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={toggleMock}
          title="Đang dùng dữ liệu giả lập (Mock). Nhấn để chuyển sang API thật."
        >
          MOCK DATA MODE
        </Badge>
      ) : isOnline ? (
        <Badge
          variant="success"
          icon={<Wifi size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={toggleMock}
          title={`Backend kết nối: ${apiClient.getBaseUrl()}. Nhấn để chuyển sang Mock Data.`}
        >
          Backend Online
        </Badge>
      ) : (
        <Badge
          variant="danger"
          icon={<WifiOff size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={toggleMock}
          title="Không kết nối được Backend. Nhấn để chuyển sang chế độ Mock Data."
        >
          Backend Offline (Chuyển Mock)
        </Badge>
      )}

      {checking && (
        <Activity
          size={14}
          className="animate-spin"
          style={{ color: 'var(--color-text-tertiary)' }}
        />
      )}
    </div>
  );
};

