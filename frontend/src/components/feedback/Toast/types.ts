export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  title?: string;
  duration?: number; // Milliseconds before auto-dismiss (0 means no auto-dismiss)
  action?: ToastAction;
  dedupKey?: string; // Key used to prevent duplicate toasts
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
  createdAt: number;
  dedupKey: string;
  action?: ToastAction;
}

export interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  toast: {
    success: (message: string, options?: ToastOptions) => string;
    error: (message: string, options?: ToastOptions) => string;
    warning: (message: string, options?: ToastOptions) => string;
    info: (message: string, options?: ToastOptions) => string;
  };
}
