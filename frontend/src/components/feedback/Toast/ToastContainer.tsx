import React from 'react';
import { ToastItem as ToastItemType } from './types';
import { ToastItem } from './ToastItem';

interface ToastContainerProps {
  toasts: ToastItemType[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        .coldchain-toast-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 400px;
          width: 100%;
          pointer-events: none;
        }

        @media (max-width: 640px) {
          .coldchain-toast-container {
            bottom: 16px;
            left: 16px;
            right: 16px;
            max-width: none;
            width: auto;
          }
        }
      `}</style>
      <div
        className="coldchain-toast-container"
        role="region"
        aria-label="Thông báo hệ thống"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
};
