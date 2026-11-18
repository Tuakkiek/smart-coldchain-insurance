import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfirmModal } from '../ConfirmModal';

describe('ConfirmModal', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ConfirmModal
        isOpen={false}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn muốn xóa?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders title, message, description and action buttons via Portal', () => {
    render(
      <ConfirmModal
        isOpen
        title="Xác nhận xóa lô hàng"
        message="Bạn có chắc chắn muốn xóa lô hàng SHIP-001 không?"
        description="Thao tác này không thể hoàn tác."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByText('Xác nhận xóa lô hàng')).toBeInTheDocument();
    expect(screen.getByText('Bạn có chắc chắn muốn xóa lô hàng SHIP-001 không?')).toBeInTheDocument();
    expect(screen.getByText('Thao tác này không thể hoàn tác.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeInTheDocument();
  });

  it('calls onCancel and never onConfirm when clicking Hủy, close button, backdrop, or Escape', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        isOpen
        title="Xác nhận xóa thiết bị"
        message="Bạn có chắc chắn muốn xóa ESP32-01 không?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng hộp thoại xác nhận' }));
    fireEvent.click(screen.getByRole('alertdialog'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(4);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm only when clicking Xác nhận', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        isOpen
        title="Xác nhận xóa lô hàng"
        message="Xóa SHIP-001?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables buttons and blocks dismiss while loading', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        isOpen
        loading
        title="Xác nhận xóa lô hàng"
        message="Xóa SHIP-001?"
        confirmLabel="Đang xóa..."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đang xóa...' })).toBeDisabled();

    fireEvent.click(screen.getByRole('alertdialog'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
