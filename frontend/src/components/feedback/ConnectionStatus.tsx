import React, { useState, useEffect, useCallback, useRef } from 'react';
import { checkBackendHealth } from '../../api/shipments';
import { apiClient, ApiError } from '../../api/client';
import { Badge } from '../ui/Badge';
import { useToast } from './Toast';
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

export function useBackendHealthMonitor() {
  const { toast } = useToast();
  const [connectionState, setConnectionState] = useState<BackendConnectionState>(globalBackendState);
  const [checking, setChecking] = useState<boolean>(false);
  const prevStateRef = useRef<BackendConnectionState>(globalBackendState);

  useEffect(() => {
    const handler: Listener = (nextState) => {
      prevStateRef.current = nextState;
      setConnectionState(nextState);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const checkStatus = useCallback(
    async (isManual = false) => {
      setChecking(true);
      const startTime = Date.now();
      let nextState: BackendConnectionState = 'OFFLINE';

      try {
        const res = await checkBackendHealth();
        nextState = res && res.status === 'ok' ? 'ONLINE' : 'OFFLINE';
      } catch (err: unknown) {
        const elapsed = Date.now() - startTime;
        const isColdStart =
          (err instanceof ApiError &&
            (err.isBackendColdStart ||
              err.code === 'RENDER_COLD_START_TIMEOUT' ||
              err.status === 504 ||
              err.status === 503)) ||
          elapsed >= 5000;

        nextState = isColdStart ? 'COLD_START' : 'OFFLINE';
      } finally {
        const prevState = prevStateRef.current;
        prevStateRef.current = nextState;
        setConnectionState(nextState);
        setGlobalBackendState(nextState);
        setChecking(false);

        if (nextState === 'COLD_START' && (prevState !== 'COLD_START' || isManual)) {
          toast.warning(
            'Máy chủ Backend đang khởi động lại (Render Cold Start ~30s). Trạng thái thiết bị ESP32 vẫn được bảo lưu.',
            { title: 'Backend đang khởi động', dedupKey: 'backend-cold-start', duration: 6000 }
          );
        } else if (nextState === 'OFFLINE' && (prevState !== 'OFFLINE' || isManual)) {
          toast.error(
            'Không thể kết nối tới máy chủ Backend. Hệ thống sẽ tự động kiểm tra lại.',
            { title: 'Mất kết nối Backend', dedupKey: 'backend-offline' }
          );
        } else if (
          nextState === 'ONLINE' &&
          (prevState === 'OFFLINE' || prevState === 'COLD_START' || isManual)
        ) {
          toast.success(
            isManual
              ? 'Kết nối tới máy chủ Backend đang hoạt động ổn định.'
              : 'Đã khôi phục kết nối tới máy chủ Backend.',
            { title: 'Backend trực tuyến', dedupKey: 'backend-online' }
          );
        }
      }
    },
    [toast]
  );

  useEffect(() => {
    checkStatus(false);
    const interval = setInterval(() => checkStatus(false), 25000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return { connectionState, checking, checkStatus };
}

interface ConnectionStatusProps {
  onRefresh?: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ onRefresh }) => {
  const { connectionState, checking, checkStatus } = useBackendHealthMonitor();

  const handleRetry = () => {
    checkStatus(true);
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
