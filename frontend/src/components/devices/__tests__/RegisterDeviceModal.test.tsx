import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RegisterDeviceModal } from '../RegisterDeviceModal';
import * as deviceApi from '../../../api/devices';
import { AdminDeviceViewOut } from '../../../types/api';

// Mock registerDevice API
vi.mock('../../../api/devices', () => ({
  registerDevice: vi.fn(),
}));

// Mock useToast
vi.mock('../../feedback/Toast', () => ({
  useToast: () => ({
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }),
}));

describe('RegisterDeviceModal Layout & Functionality', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <RegisterDeviceModal isOpen={false} onClose={onClose} onSuccess={onSuccess} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders into document.body via Portal when isOpen is true', () => {
    render(
      <div id="parent-container">
        <RegisterDeviceModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
      </div>
    );

    // Dialog must be mounted directly under document.body, outside the parent div
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.parentElement).toBe(document.body);
  });

  it('has correct flexbox layout, centering, and max-height constraints', () => {
    render(<RegisterDeviceModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    const overlay = screen.getByRole('dialog');
    expect(overlay).toHaveStyle({
      position: 'fixed',
      inset: '0px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });

    // Outer card container
    const card = overlay.firstElementChild as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(card).toHaveStyle({
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    });

    // Title and Header
    expect(screen.getByText('Đăng Ký Thiết Bị ESP32 (Admin)')).toBeInTheDocument();
    expect(
      screen.getByText('Đăng ký ID & Tên thiết bị • Backend local tự động cấp khóa P-256')
    ).toBeInTheDocument();

    // Inputs and Sinh mã
    expect(screen.getByLabelText(/Mã Thiết Bị/i)).toBeInTheDocument();
    expect(screen.getByText('Sinh mã')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên Thiết Bị/i)).toBeInTheDocument();

    // ECDSA P-256 Notice
    expect(screen.getByText(/Cấp khóa tự động trên Backend local/i)).toBeInTheDocument();
    expect(screen.getByText(/ECDSA P-256/i)).toBeInTheDocument();

    // Footer action buttons
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng Ký Thiết Bị' })).toBeInTheDocument();
  });

  it('locks body scroll when opened and restores it when closed', () => {
    const { rerender } = render(
      <RegisterDeviceModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<RegisterDeviceModal isOpen={false} onClose={onClose} onSuccess={onSuccess} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('calls onClose when clicking the Close button or Cancel button', () => {
    render(<RegisterDeviceModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    const closeBtn = screen.getByRole('button', { name: 'Đóng' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByRole('button', { name: 'Hủy' });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('calls onClose when pressing the Escape key', () => {
    render(<RegisterDeviceModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('generates a new random Device ID when clicking Sinh mã', () => {
    render(<RegisterDeviceModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    const idInput = screen.getByLabelText(/Mã Thiết Bị/i) as HTMLInputElement;
    expect(idInput.value).toBe('ESP32-001');

    const generateBtn = screen.getByRole('button', { name: 'Sinh mã' });
    fireEvent.click(generateBtn);

    expect(idInput.value).toMatch(/^ESP32-\d{3}$/);
  });

  it('submits registration successfully and triggers onSuccess and onClose', async () => {
    const mockResult: AdminDeviceViewOut = {
      device_id: 'ESP32-001',
      device_name: 'Cold Chain Sensor 01',
      status: 'active',
      key_id: 'key-123',
      provisioning_status: 'ready',
      has_public_key: true,
      current_shipment_id: null,
      current_shipment_code: null,
      last_sequence_number: 0,
      last_seen_at: null,
      keys: [],
      assignments: [],
    };
    vi.mocked(deviceApi.registerDevice).mockResolvedValueOnce(mockResult);

    render(<RegisterDeviceModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    const submitBtn = screen.getByRole('button', { name: 'Đăng Ký Thiết Bị' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(deviceApi.registerDevice).toHaveBeenCalledWith({
        device_id: 'ESP32-001',
        device_name: 'Cold Chain Sensor 01',
      });
      expect(onSuccess).toHaveBeenCalledWith(mockResult);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
