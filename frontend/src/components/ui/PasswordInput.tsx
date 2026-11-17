import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  leftIcon?: React.ReactNode;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  showToggle?: boolean;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      style,
      leftIcon,
      containerClassName,
      containerStyle,
      showToggle = true,
      id,
      name,
      value,
      defaultValue,
      onChange,
      disabled,
      placeholder = 'Nhập mật khẩu',
      autoComplete = 'current-password',
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const toggleShowPassword = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setShowPassword((prev) => !prev);
    };

    return (
      <div
        className={`password-input-wrap ${containerClassName || ''}`}
        style={{
          position: 'relative',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          ...containerStyle,
        }}
      >
        {leftIcon && (
          <span
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-tertiary)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          id={id}
          name={name}
          type={showPassword ? 'text' : 'password'}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`password-input-field ${className || ''}`}
          style={{
            width: '100%',
            height: '46px',
            paddingLeft: leftIcon ? '42px' : '14px',
            paddingRight: showToggle ? '44px' : '14px',
            paddingTop: 0,
            paddingBottom: 0,
            color: 'var(--color-text-primary)',
            backgroundColor: 'var(--color-surface)',
            border: isFocused ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
            outline: isFocused ? '3px solid var(--color-accent-soft)' : 'none',
            borderRadius: '10px',
            fontSize: 'var(--text-md)',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease, outline 0.15s ease',
            ...style,
          }}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />

        {showToggle && (
          <button
            type="button"
            tabIndex={0}
            disabled={disabled}
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            aria-pressed={showPassword}
            aria-controls={id}
            title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            onClick={toggleShowPassword}
            onMouseDown={(e) => {
              // Crucial: prevent losing focus from the input field
              e.preventDefault();
            }}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-tertiary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              transition: 'color 0.15s ease, background-color 0.15s ease',
              zIndex: 2,
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.color = 'var(--color-text-primary)';
                e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {showPassword ? (
              <Eye size={18} aria-hidden="true" />
            ) : (
              <EyeOff size={18} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
