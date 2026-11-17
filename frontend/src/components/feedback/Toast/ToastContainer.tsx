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
          top: 24px;
          right: 24px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 420px;
          width: 100%;
          pointer-events: none;
        }

        .coldchain-toast-item {
          animation: toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
        }

        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translate3d(24px, -6px, 0) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @media (max-width: 640px) {
          .coldchain-toast-container {
            top: 16px;
            left: 16px;
            right: 16px;
            max-width: none;
            width: auto;
          }

          @keyframes toastSlideIn {
            from {
              opacity: 0;
              transform: translate3d(0, -10px, 0) scale(0.97);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
            }
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
