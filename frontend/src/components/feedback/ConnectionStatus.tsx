import React, { useState, useEffect, useCallback } from 'react';
import { checkBackendHealth } from '../../api/shipments';
import { apiClient, ApiError } from '../../api/client';
import { Badge } from '../ui/Badge';
import { Activity, Wifi, WifiOff, Database, Clock } from 'lucide-react';

export type BackendConnectionState = 'ONLINE' | 'COLD_START' | 'OFFLINE' | 'MOCK' | 'CHECKING';

// Global listener store for cross-component subscription (e.g. DevicesPage)
type Listener = (state: BackendConnectionState) => void;
const listeners = new Set<Listener>();

let globalBackendState: BackendConnectionState = apiClient.isMockEnabled() ? 'MOCK' : 'CHECKING';

export function getGlobalBackendState(): BackendConnectionState {
  return globalBackendState;
}

function setGlobalBackendState(state: BackendConnectionState) {
  globalBackendState = state;
  listeners.forEach((listener) => listener(state));
}

export function useBackendConnectionState(): BackendConnectionState {
  const [state, setState] = useState<BackendConnectionState>(globalBackendState);

  useEffect(() => {
    const handler: Listener = (nextState) => setState(nextState);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return state;
}

interface ConnectionStatusProps {
  onModeChange?: (isMock: boolean) => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ onModeChange }) => {
  const [connectionState, setConnectionState] = useState<BackendConnectionState>(
    apiClient.isMockEnabled() ? 'MOCK' : 'CHECKING'
  );
  const [checking, setChecking] = useState<boolean>(false);

  const checkStatus = useCallback(async () => {
    if (apiClient.isMockEnabled()) {
      setConnectionState('MOCK');
      setGlobalBackendState('MOCK');
      return;
    }

    setChecking(true);
    const startTime = Date.now();

    try {
      const res = await checkBackendHealth();
      if (res && res.status === 'ok') {
        setConnectionState('ONLINE');
        setGlobalBackendState('ONLINE');
      } else {
        setConnectionState('OFFLINE');
        setGlobalBackendState('OFFLINE');
      }
    } catch (err: unknown) {
      const elapsed = Date.now() - startTime;
      const isColdStart =
        (err instanceof ApiError && (err.isBackendColdStart || err.code === 'RENDER_COLD_START_TIMEOUT' || err.status === 504 || err.status === 503)) ||
        elapsed >= 5000;

      if (isColdStart) {
        setConnectionState('COLD_START');
        setGlobalBackendState('COLD_START');
      } else {
        setConnectionState('OFFLINE');
        setGlobalBackendState('OFFLINE');
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 25000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const toggleMock = () => {
    const nextMock = !apiClient.isMockEnabled();
    apiClient.setMockEnabled(nextMock);
    if (nextMock) {
      setConnectionState('MOCK');
      setGlobalBackendState('MOCK');
    } else {
      setConnectionState('CHECKING');
      setGlobalBackendState('CHECKING');
      checkStatus();
    }
    if (onModeChange) onModeChange(nextMock);
  };

  return (
    <div className="flex-row items-center gap-2">
      {connectionState === 'MOCK' && (
        <Badge
          variant="warning"
          icon={<Database size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={toggleMock}
          title="Đang dùng dữ liệu giả lập (Mock). Nhấn để chuyển sang API thật."
        >
          MOCK DATA MODE
        </Badge>
      )}

      {connectionState === 'ONLINE' && (
        <Badge
          variant="success"
          icon={<Wifi size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={toggleMock}
          title={`Backend kết nối thành công: ${apiClient.getBaseUrl()}. Nhấn để chuyển sang Mock Data.`}
        >
          Backend Online
        </Badge>
      )}

      {connectionState === 'COLD_START' && (
        <Badge
          variant="warning"
          icon={<Clock size={12} className="animate-spin" />}
          style={{ cursor: 'pointer' }}
          onClick={toggleMock}
          title="Render Cold Start: Dịch vụ FastAPI đang thức giấc sau thời gian nghỉ (~30-50s). Nhấn để chuyển sang Mock Data nếu muốn xem ngay."
        >
          Render Cold Start (~30s)
        </Badge>
      )}

      {connectionState === 'OFFLINE' && (
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

      {connectionState === 'CHECKING' && (
        <Badge
          variant="neutral"
          icon={<Activity size={12} className="animate-spin" />}
          title="Đang kiểm tra kết nối Backend..."
        >
          Kiểm tra kết nối...
        </Badge>
      )}

      {checking && connectionState !== 'CHECKING' && (
        <Activity
          size={14}
          className="animate-spin"
          style={{ color: 'var(--color-text-tertiary)' }}
        />
      )}
    </div>
  );
};
