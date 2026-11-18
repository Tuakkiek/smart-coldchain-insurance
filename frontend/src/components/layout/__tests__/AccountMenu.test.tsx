import React from 'react';
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AccountMenu } from '../AccountMenu';
import { ToastProvider } from '../../feedback/Toast';
import * as authApi from '../../../api/auth';
import * as authProvider from '../../../auth/AuthProvider';
import * as connectionStatus from '../../feedback/ConnectionStatus';

vi.mock('../../../api/auth', () => ({
  logoutAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../auth/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../feedback/ConnectionStatus', () => ({
  useBackendHealthMonitor: vi.fn(),
}));

const renderAccountMenu = (initialRoute = '/') =>
  render(
    <MemoryRouter
      initialEntries={[initialRoute]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ToastProvider>
        <div>
          <AccountMenu />
          <Link to="/devices">Đi tới thiết bị</Link>
          <div data-testid="outside">Outside area</div>
          <Routes>
            <Route path="/" element={<div>Home</div>} />
            <Route path="/devices" element={<div>Devices</div>} />
          </Routes>
        </div>
      </ToastProvider>
    </MemoryRouter>
  );

describe('AccountMenu', () => {
  const checkStatusMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authProvider.useAuth).mockReturnValue({
      session: {
        accessToken: 'token',
        username: 'admin',
        expiresAt: Date.now() + 60_000,
      },
      reason: null,
      revision: 1,
      initializing: false,
    });
    vi.mocked(connectionStatus.useBackendHealthMonitor).mockReturnValue({
      connectionState: 'ONLINE',
      checking: false,
      checkStatus: checkStatusMock,
    });
  });

  it('renders only the Avatar button by default without direct status, username, refresh, or logout', () => {
    renderAccountMenu();

    const trigger = screen.getByRole('button', { name: 'Mở menu tài khoản' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('A');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Backend Online')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Đăng xuất' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/làm mới/i)).not.toBeInTheDocument();
  });

  it('opens on Avatar click and displays account info, backend status, and logout', () => {
    renderAccountMenu();

    const trigger = screen.getByRole('button', { name: 'Mở menu tài khoản' });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument();
    expect(screen.getByText('Backend Online')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument();

    // Clicking Avatar again closes the dropdown
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('displays Backend Offline status accurately and allows rechecking', () => {
    vi.mocked(connectionStatus.useBackendHealthMonitor).mockReturnValue({
      connectionState: 'OFFLINE',
      checking: false,
      checkStatus: checkStatusMock,
    });

    renderAccountMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu tài khoản' }));

    const statusBtn = screen.getByRole('menuitem', { name: /Backend Offline/i });
    expect(statusBtn).toBeInTheDocument();
    fireEvent.click(statusBtn);
    expect(checkStatusMock).toHaveBeenCalledWith(true);
  });

  it('closes on outside click, Escape key, and route change', () => {
    renderAccountMenu();
    const trigger = screen.getByRole('button', { name: 'Mở menu tài khoản' });

    // 1. Outside click
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // 2. Escape key
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // 3. Route change
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Đi tới thiết bị'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('executes logoutAdmin and displays a Toast when clicking Đăng xuất', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu tài khoản' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    expect(authApi.logoutAdmin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByText('Bạn đã đăng xuất khỏi hệ thống quản trị.')).toBeInTheDocument();
  });
});
