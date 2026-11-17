import React, { useState, useEffect, useCallback } from 'react';
import { checkBackendHealth } from '../../api/shipments';
import { apiClient, ApiError } from '../../api/client';
import { Badge } from '../ui/Badge';
import { Activity, Wifi, WifiOff, Clock } from 'lucide-react';

export type BackendConnectionState = 'ONLINE' | 'COLD_START' | 'OFFLINE' | 'CHECKING';

// Global listener store for cross-component subscription (e.g. DevicesPage)
type Listener = (state: BackendConnectionState) => void;
const listeners = new Set<Listener>();

let globalBackendState: BackendConnectionState = 'CHECKING';

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
  onRefresh?: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ onRefresh }) => {
  const [connectionState, setConnectionState] = useState<BackendConnectionState>('CHECKING');
  const [checking, setChecking] = useState<boolean>(false);

  const checkStatus = useCallback(async () => {
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

  const handleRetry = () => {
    checkStatus();
    if (onRefresh) onRefresh();
  };

  return (
    <div className="flex-row items-center gap-2">
      {connectionState === 'ONLINE' && (
        <Badge
          variant="success"
          icon={<Wifi size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={handleRetry}
          title={`Backend kết nối thành công: ${apiClient.getBaseUrl()}. Nhấn để làm mới trạng thái.`}
        >
          Backend Online
        </Badge>
      )}

      {connectionState === 'COLD_START' && (
        <Badge
          variant="warning"
          icon={<Clock size={12} className="animate-spin" />}
          style={{ cursor: 'pointer' }}
          onClick={handleRetry}
          title="Render Cold Start: Dịch vụ FastAPI đang thức giấc sau thời gian nghỉ (~30-50s). Nhấn để kiểm tra lại."
        >
          Render Cold Start (~30s)
        </Badge>
      )}

      {connectionState === 'OFFLINE' && (
        <Badge
          variant="danger"
          icon={<WifiOff size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={handleRetry}
          title="Không kết nối được Backend. Nhấn để thử kết nối lại."
        >
          Backend Offline
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
