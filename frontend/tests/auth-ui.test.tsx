import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { apiClient } from '../src/api/client';
import { endSession, getActiveSession, startSession } from '../src/auth/session';
import { jsonResponse, tokenFor } from './helpers';

// Use the real App routes, shell, Login and TopBar. Data pages are fixtures so
// these auth tests do not depend on charts/maps/Backend datasets.
vi.mock('../src/pages/OverviewPage', () => ({ OverviewPage: () => <h1>Dashboard riêng tư</h1> }));
vi.mock('../src/pages/DevicesPage', () => ({ DevicesPage: () => <h1>Danh sách thiết bị</h1> }));
vi.mock('../src/pages/ShipmentsPage', () => ({ ShipmentsPage: () => <h1>Danh sách chuyến hàng</h1> }));
vi.mock('../src/pages/ShipmentDetailPage', () => ({ ShipmentDetailPage: () => <h1>Chi tiết chuyến hàng</h1> }));
vi.mock('../src/pages/DataIntegrityPage', () => ({ DataIntegrityPage: () => <h1>Toàn vẹn dữ liệu</h1> }));
vi.mock('../src/pages/EventsPage', () => ({ EventsPage: () => <h1>Sự kiện riêng tư</h1> }));
vi.mock('../src/pages/DemoPage', () => ({ DemoPage: () => <h1>Demo riêng tư</h1> }));
vi.mock('../src/components/feedback/ConnectionStatus', () => ({ ConnectionStatus: () => <span>Backend Online</span> }));

const fetchMock = vi.fn<typeof fetch>();
const fillLogin = (password = ' demo-password ') => {
  fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'admin' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: password } });
  fireEvent.submit(screen.getByRole('button', { name: 'Đăng nhập' }).closest('form')!);
};

beforeEach(() => {
  endSession();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { endSession(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Admin Login and guarded routes', () => {
  it.each(['/','/devices','/shipments','/shipments/example','/integrity','/events','/demo'])(
    'requires login for %s and never mounts private pages first', (path) => {
      window.history.replaceState({}, '', path);
      render(<App />);
      expect(screen.getByRole('heading', { name: 'Đăng nhập quản trị' })).not.toBeNull();
      expect(window.location.pathname).toBe('/login');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    },
  );

  it('logs in, restores the protected deep link, and logs out without leaking old content', async () => {
    window.history.replaceState({}, '', '/devices?filter=active');
    const token = tokenFor('admin');
    fetchMock.mockResolvedValue(jsonResponse({ access_token: token, token_type: 'bearer' }));
    render(<App />);
    fillLogin();
    await screen.findByRole('heading', { name: 'Danh sách thiết bị' });
    expect(window.location.pathname + window.location.search).toBe('/devices?filter=active');
    expect(screen.getByText('admin')).not.toBeNull();
    expect(getActiveSession()?.accessToken).toBe(token);
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(screen.getByRole('heading', { name: 'Đăng nhập quản trị' })).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Danh sách thiết bị' })).toBeNull();
    expect(sessionStorage.getItem('coldchain_admin_session')).toBeNull();
    // Simulate history/deep-link navigation after logout; the guard runs again.
    act(() => {
      window.history.pushState({}, '', '/devices');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Danh sách thiết bị' })).toBeNull();
  });

  it('shows incorrect credentials, clears the password, and does not offer extra account flows', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Incorrect' } }, 401));
    render(<App />);
    fillLogin(' incorrect-password ');
    await screen.findByText('Tên đăng nhập hoặc mật khẩu không chính xác.');
    expect((screen.getByLabelText('Mật khẩu') as HTMLInputElement).value).toBe('');
    expect(getActiveSession()).toBeNull();
    expect(screen.queryByText(/register|sign up|quên mật khẩu|đăng ký tài khoản/i)).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('honors Retry-After and never retries login automatically', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Wait' } }, 429, { 'Retry-After': '2' }));
    render(<App />);
    await act(async () => { fillLogin(); });
    expect(screen.getByRole('alert').textContent).toContain('quá nhiều lần');
    expect((screen.getByRole('button', { name: 'Đăng nhập' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Thử lại sau 2 giây');
    act(() => { vi.advanceTimersByTime(2000); });
    expect((screen.getByRole('button', { name: 'Đăng nhập' }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns to Login as soon as an idle token expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    startSession(tokenFor('admin', 4000));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Dashboard riêng tư' })).not.toBeNull();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole('heading', { name: 'Đăng nhập quản trị' })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('hết hạn');
    expect(screen.queryByRole('heading', { name: 'Dashboard riêng tư' })).toBeNull();
  });

  it('clears a rejected session on a real protected API 401', async () => {
    startSession(tokenFor());
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Invalid JWT' } }, 401));
    render(<App />);
    await act(async () => {
      await expect(apiClient.get('/api/v1/shipments')).rejects.toMatchObject({ status: 401 });
    });
    expect(screen.getByRole('heading', { name: 'Đăng nhập quản trị' })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('không còn hợp lệ');
  });

  it('never redirects a successful login to an external history target', async () => {
    startSession(tokenFor());
    window.history.replaceState({ usr: { from: '//external.example/' } }, '', '/login');
    render(<App />);
    await waitFor(() => { expect(window.location.pathname).toBe('/'); });
    expect(screen.getByRole('heading', { name: 'Dashboard riêng tư' })).not.toBeNull();
  });
});
