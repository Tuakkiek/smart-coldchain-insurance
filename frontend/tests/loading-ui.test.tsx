import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LoadingState } from '../src/components/feedback/LoadingState';
import { Button } from '../src/components/ui/Button';

describe('LoadingState component', () => {
  it('renders default message and accessibility attributes', () => {
    render(<LoadingState />);
    const statusElem = screen.getByRole('status');
    expect(statusElem).toBeInTheDocument();
    expect(statusElem).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Đang tải dữ liệu...')).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<LoadingState message="Đang nạp chi tiết thiết bị..." />);
    expect(screen.getByText('Đang nạp chi tiết thiết bị...')).toBeInTheDocument();
  });

  it('applies fullPage minHeight when fullPage is true', () => {
    render(<LoadingState fullPage message="Full page loading" />);
    const statusElem = screen.getByRole('status');
    expect(statusElem).toHaveStyle({ minHeight: '420px' });
  });

  it('respects custom minHeight over fullPage', () => {
    render(<LoadingState minHeight="500px" message="Custom height" />);
    const statusElem = screen.getByRole('status');
    expect(statusElem).toHaveStyle({ minHeight: '500px' });
  });
});

describe('Button loading state and double-submit prevention', () => {
  it('disables button and shows spinner when loading is true', () => {
    const handleClick = vi.fn();
    render(
      <Button loading onClick={handleClick}>
        Lưu thay đổi
      </Button>
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ cursor: 'not-allowed', opacity: '0.6' });

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('enables button and handles click when loading is false', () => {
    const handleClick = vi.fn();
    render(
      <Button loading={false} onClick={handleClick}>
        Lưu thay đổi
      </Button>
    );

    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
