import React from 'react';
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AccountMenu } from '../AccountMenu';
import { AppShell } from '../AppShell';
import { Sidebar } from '../Sidebar';
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

  it('renders the horizontal Avatar circle alongside stacked username and role without opening the menu by default', () => {
    renderAccountMenu();

    const trigger = screen.getByRole('button', { name: 'Mở menu tài khoản' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    const avatarCircle = trigger.querySelector('.account-avatar-circle');
    const infoBlock = trigger.querySelector('.account-trigger-info');
    const nameEl = trigger.querySelector('.account-trigger-name');
    const roleEl = trigger.querySelector('.account-trigger-role');

    expect(avatarCircle).toBeInTheDocument();
    expect(avatarCircle).toHaveTextContent('A');
    expect(infoBlock).toBeInTheDocument();
    expect(avatarCircle).not.toContainElement(nameEl as HTMLElement);
    expect(infoBlock).toContainElement(nameEl as HTMLElement);
    expect(infoBlock).toContainElement(roleEl as HTMLElement);
    expect(nameEl).toHaveTextContent('admin');
    expect(roleEl).toHaveTextContent('Quản trị viên');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Backend Online')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Đăng xuất' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/làm mới/i)).not.toBeInTheDocument();
  });

  it('displays dynamic username and role from the logged-in session without hardcoding', () => {
    vi.mocked(authProvider.useAuth).mockReturnValue({
      session: {
        accessToken: 'token',
        username: 'ĐĂNG KHOA',
        role: 'Go',
        expiresAt: Date.now() + 60_000,
      },
      reason: null,
      revision: 1,
      initializing: false,
    });

    renderAccountMenu();

    const trigger = screen.getByRole('button', { name: 'Mở menu tài khoản' });
    expect(trigger.querySelector('.account-avatar-circle')).toHaveTextContent('Đ');
    expect(trigger.querySelector('.account-trigger-name')).toHaveTextContent('ĐĂNG KHOA');
    expect(trigger.querySelector('.account-trigger-role')).toHaveTextContent('Go');

    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Thông tin tài khoản' });
    expect(within(menu).getByText('ĐĂNG KHOA')).toBeInTheDocument();
    expect(within(menu).getByText('Go')).toBeInTheDocument();
  });

  it('opens on Avatar/account area click and displays account info, backend status, and logout', () => {
    renderAccountMenu();

    const trigger = screen.getByRole('button', { name: 'Mở menu tài khoản' });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Thông tin tài khoản' });
    expect(menu).toBeInTheDocument();
    expect(within(menu).getByText('admin')).toBeInTheDocument();
    expect(within(menu).getByText('Quản trị viên')).toBeInTheDocument();
    expect(within(menu).getByText('Backend Online')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument();

    // Clicking trigger again closes the dropdown
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

  it('mounts in a fixed bottom-left anchor outside the transformed sidebar with upward dropdown placement', () => {
    const { container } = render(
      <MemoryRouter
        initialEntries={['/']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ToastProvider>
          <Sidebar />
        </ToastProvider>
      </MemoryRouter>
    );

    const sidebar = container.querySelector('.app-sidebar');
    const footer = container.querySelector('.app-sidebar .sidebar-account-footer');
    expect(sidebar).toBeInTheDocument();
    expect(footer).toBeInTheDocument();

    const floatingAnchor = container.querySelector('.account-floating-anchor');
    expect(floatingAnchor).toBeInTheDocument();
    expect(sidebar).not.toContainElement(floatingAnchor as HTMLElement);

    const menuRoot = floatingAnchor?.querySelector('.account-menu-root.account-menu-root--up');
    expect(menuRoot).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Mở menu tài khoản' });
    expect(floatingAnchor).toContainElement(trigger);

    fireEvent.click(trigger);
    const dropdown = screen.getByRole('menu', { name: 'Thông tin tài khoản' });
    expect(menuRoot).toContainElement(dropdown);
  });

  it('persists the bottom-left Avatar inside AppShell across page navigation', () => {
    render(
      <MemoryRouter
        initialEntries={['/']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ToastProvider>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<div>Tổng quan page</div>} />
              <Route path="shipments" element={<div>Lô hàng page</div>} />
              <Route path="devices" element={<div>Thiết bị page</div>} />
            </Route>
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Tổng quan page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở menu tài khoản' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Lô hàng' }));
    expect(screen.getByText('Lô hàng page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở menu tài khoản' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Thiết bị ESP32' }));
    expect(screen.getByText('Thiết bị page')).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Mở menu tài khoản' });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Thông tin tài khoản' })).toBeInTheDocument();
  });
});
