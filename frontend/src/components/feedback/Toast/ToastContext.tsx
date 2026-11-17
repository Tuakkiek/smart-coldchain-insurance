import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { ToastContextValue, ToastItem, ToastOptions, ToastType } from './types';
import { ToastContainer } from './ToastContainer';

const DEFAULT_DURATION = 4500;
const DEDUP_COOLDOWN_MS = 1500;

export const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const recentToastsRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions): string => {
      const trimmedMessage = message.trim();
      const dedupKey =
        options?.dedupKey || `${type}:${options?.title || ''}:${trimmedMessage}`;
      const now = Date.now();

      // Check if identical toast is already active in list
      const existing = toasts.find((t) => t.dedupKey === dedupKey);
      if (existing) {
        return existing.id;
      }

      // Check cooldown window to prevent rapid bursts (e.g. fast double-click or quick retry)
      const lastCreated = recentToastsRef.current.get(dedupKey);
      if (lastCreated && now - lastCreated < DEDUP_COOLDOWN_MS) {
        return options?.id || dedupKey;
      }

      recentToastsRef.current.set(dedupKey, now);

      // Clean old entries in recentToastsRef
      for (const [key, timestamp] of recentToastsRef.current.entries()) {
        if (now - timestamp > 10000) {
          recentToastsRef.current.delete(key);
        }
      }

      const id = options?.id || `toast-${Date.now()}-${++toastCounter}`;
      const duration =
        options?.duration !== undefined ? options.duration : DEFAULT_DURATION;

      const newToast: ToastItem = {
        id,
        type,
        title: options?.title,
        message: trimmedMessage,
        duration,
        createdAt: now,
        dedupKey,
        action: options?.action,
      };

      setToasts((prev) => [...prev, newToast]);
      return id;
    },
    [toasts]
  );

  const toast = useMemo(
    () => ({
      success: (message: string, options?: ToastOptions) =>
        addToast('success', message, options),
      error: (message: string, options?: ToastOptions) =>
        addToast('error', message, options),
      warning: (message: string, options?: ToastOptions) =>
        addToast('warning', message, options),
      info: (message: string, options?: ToastOptions) =>
        addToast('info', message, options),
    }),
    [addToast]
  );

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      toasts,
      addToast,
      removeToast,
      clearToasts,
      toast,
    }),
    [toasts, addToast, removeToast, clearToasts, toast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
