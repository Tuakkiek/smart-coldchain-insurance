import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '../feedback/Toast';

export interface CopyButtonProps {
  value: string;
  tooltip?: string;
  ariaLabel?: string;
  iconSize?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  tooltip = 'Sao chép ID',
  ariaLabel,
  iconSize = 13,
  className = '',
  style,
}) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const textToCopy = typeof value === 'string' ? value.trim() : '';
    if (!textToCopy) {
      toast.error('Không thể sao chép ID. Vui lòng thử lại!', {
        dedupKey: 'copy-id-error:empty',
      });
      return;
    }

    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== 'function'
      ) {
        throw new Error('Clipboard API unavailable');
      }

      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = setTimeout(() => {
        setCopied(false);
      }, 1500);

      toast.success('Đã sao chép ID thành công!', {
        dedupKey: `copy-id-success:${textToCopy}`,
      });
    } catch {
      setCopied(false);
      toast.error('Không thể sao chép ID. Vui lòng thử lại!', {
        dedupKey: `copy-id-error:${textToCopy}`,
      });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.stopPropagation();
    }
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <button
      type="button"
      className={`copy-id-btn${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={handleCopy}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      title={tooltip}
      aria-label={ariaLabel ?? tooltip}
      style={style}
    >
      {copied ? (
        <Check size={iconSize} aria-hidden="true" />
      ) : (
        <Copy size={iconSize} aria-hidden="true" />
      )}
    </button>
  );
};
