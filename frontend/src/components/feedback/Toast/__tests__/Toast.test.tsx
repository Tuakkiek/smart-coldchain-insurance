import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ToastProvider, useToast } from '../ToastContext';
import { formatApiErrorMessage, isRequestCancelled } from '../errorMessage';
import { ApiError } from '../../../../api/client';

// Helper component to trigger toasts in tests
const TestComponent: React.FC<{
  onInit?: (toast: ReturnType<typeof useToast>['toast']) => void;
}> = ({ onInit }) => {
  const { toast } = useToast();

  React.useEffect(() => {
    if (onInit) {
      onInit(toast);
    }
  }, [onInit, toast]);

  return (
    <div>
      <button onClick={() => toast.success('Lô hàng tạo thành công')}>
        Trigger Success
      </button>
      <button onClick={() => toast.error('Lỗi kết nối máy chủ')}>
        Trigger Error
      </button>
      <button onClick={() => toast.warning('Cảnh báo vi phạm nhiệt độ')}>
        Trigger Warning
      </button>
      <button onClick={() => toast.info('Đã sao chép khóa')}>
        Trigger Info
      </button>
      <button
        onClick={() =>
          toast.success('Hành động hoàn tất', {
            action: { label: 'Xem ngay', onClick: () => {} },
          })
        }
      >
        Trigger With Action
      </button>
    </div>
  );
};

describe('Toast Notification System', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders success toast with role="status" and aria-live="polite"', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Success'));

    const toastElement = screen.getByRole('status');
    expect(toastElement).toBeInTheDocument();
    expect(toastElement).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Lô hàng tạo thành công')).toBeInTheDocument();
  });

  it('renders error toast with role="alert" and aria-live="assertive"', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Error'));

    const toastElement = screen.getByRole('alert');
    expect(toastElement).toBeInTheDocument();
    expect(toastElement).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByText('Lỗi kết nối máy chủ')).toBeInTheDocument();
  });

  it('renders warning and info toasts correctly', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Warning'));
    expect(screen.getByText('Cảnh báo vi phạm nhiệt độ')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Trigger Info'));
    expect(screen.getByText('Đã sao chép khóa')).toBeInTheDocument();
  });

  it('dismisses toast manually when close button is clicked', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Success'));
    expect(screen.getByText('Lô hàng tạo thành công')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Đóng thông báo' });
    fireEvent.click(closeBtn);

    expect(screen.queryByText('Lô hàng tạo thành công')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after default duration (4500ms)', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Success'));
    expect(screen.getByText('Lô hàng tạo thành công')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4400);
    });
    expect(screen.getByText('Lô hàng tạo thành công')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Lô hàng tạo thành công')).not.toBeInTheDocument();
  });

  it('prevents duplicate toasts when identical message is triggered repeatedly (deduplication)', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Click multiple times
    fireEvent.click(screen.getByText('Trigger Success'));
    fireEvent.click(screen.getByText('Trigger Success'));
    fireEvent.click(screen.getByText('Trigger Success'));

    const toasts = screen.getAllByText('Lô hàng tạo thành công');
    expect(toasts).toHaveLength(1);
  });

  it('executes action callback when action button is clicked', () => {
    const handleAction = vi.fn();
    const ActionTrigger: React.FC = () => {
      const { toast } = useToast();
      return (
        <button
          onClick={() =>
            toast.success('Có cập nhật mới', {
              action: { label: 'Chi tiết', onClick: handleAction },
            })
          }
        >
          Trigger
        </button>
      );
    };

    render(
      <ToastProvider>
        <ActionTrigger />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger'));
    const actionButton = screen.getByRole('button', { name: 'Chi tiết' });
    expect(actionButton).toBeInTheDocument();

    fireEvent.click(actionButton);
    expect(handleAction).toHaveBeenCalledTimes(1);
    // Clicking action also dismisses the toast
    expect(screen.queryByText('Có cập nhật mới')).not.toBeInTheDocument();
  });
});

describe('Toast error message formatting', () => {
  it('detects cancelled requests and returns empty string', () => {
    const cancelled = new ApiError('Yêu cầu đã được hủy.', 0, 'REQUEST_CANCELLED');
    expect(isRequestCancelled(cancelled)).toBe(true);
    expect(formatApiErrorMessage(cancelled, 'Fallback')).toBe('');
  });

  it('sanitizes technical stack/HTML errors to user-friendly fallback', () => {
    const htmlErr = new ApiError('<html><body>502 Bad Gateway</body></html>', 502, 'HTTP_502');
    expect(formatApiErrorMessage(htmlErr, 'Lỗi hệ thống.')).toBe('Lỗi hệ thống.');

    const networkErr = new ApiError('Network failed', 0, 'NETWORK_ERROR');
    expect(formatApiErrorMessage(networkErr, 'Fallback')).toContain('Không thể kết nối tới máy chủ Backend');
  });

  it('maps cold start errors cleanly', () => {
    const coldStart = new ApiError('Timeout', 504, 'RENDER_COLD_START_TIMEOUT', undefined, true);
    expect(formatApiErrorMessage(coldStart, 'Fallback')).toContain('Cold Start');
  });
});
