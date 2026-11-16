import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../src/api/client';
import { loginAdmin } from '../src/api/auth';
import { endSession, getActiveSession, getAuthSnapshot, startSession } from '../src/auth/session';
import { registerDevice, assignDevice, getAdminDeviceDetails } from '../src/api/devices';
import { createShipment } from '../src/api/shipments';
import { verifyBatch } from '../src/api/integrity';
import { jsonResponse, tokenFor } from './helpers';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  endSession();
  apiClient.setMockEnabled(false);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { endSession(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Bearer API client', () => {
  it('does not fetch protected data without a session', async () => {
    await expect(apiClient.get('/api/v1/devices')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs in with JSON, preserves password whitespace and sends no Authorization header', async () => {
    const token = tokenFor('quản-trị');
    fetchMock.mockResolvedValue(jsonResponse({ access_token: token, token_type: 'bearer' }));
    await loginAdmin(' quản-trị ', '  demo-password  ');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/auth\/login$/);
    expect(JSON.parse(options!.body as string)).toEqual({ username: 'quản-trị', password: '  demo-password  ' });
    expect(new Headers(options!.headers).has('Authorization')).toBe(false);
    expect(getActiveSession()?.accessToken).toBe(token);
    expect(sessionStorage.getItem('coldchain_admin_session')).toBe(token);
    expect(localStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it('uses the current Bearer for all reads and legacy Admin mutations', async () => {
    const token = tokenFor();
    startSession(token);
    fetchMock.mockImplementation(async () => jsonResponse({ verification_status: 'MATCHED', merkle_root: '0x00' }));
    await apiClient.get('/api/v1/shipments');
    await registerDevice({ device_id: 'ESP32-001', device_name: 'Sensor' });
    await assignDevice('ESP32-001', { shipment_id: 'shipment-id', active: true });
    await getAdminDeviceDetails('ESP32-001');
    await createShipment({} as Parameters<typeof createShipment>[0]);
    await verifyBatch('batch-id');
    for (const [, options] of fetchMock.mock.calls) {
      const headers = new Headers(options!.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
      expect(headers.has('X-Admin-Key')).toBe(false);
      expect(options!.cache).toBe('no-store');
    }
  });

  it('keeps login/health public and does not attach a token selected by a caller', async () => {
    startSession(tokenFor());
    fetchMock.mockImplementation(async () => jsonResponse({ status: 'ok' }));
    await apiClient.request('/api/v1/health', { headers: { Authorization: 'Bearer wrong' } }, 1000, false);
    expect(new Headers(fetchMock.mock.calls[0][1]!.headers).has('Authorization')).toBe(false);
  });

  it('a 401 clears the current session, while 403 leaves it intact', async () => {
    startSession(tokenFor());
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Forbidden' } }, 403));
    await expect(apiClient.get('/api/v1/devices')).rejects.toMatchObject({ status: 403 });
    expect(getActiveSession()).not.toBeNull();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401));
    await expect(apiClient.get('/api/v1/devices')).rejects.toMatchObject({ status: 401 });
    expect(getActiveSession()).toBeNull();
    expect(getAuthSnapshot().reason).toBe('unauthorized');
    expect(sessionStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it('failed login and malformed login responses never create a session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Incorrect' } }, 401));
    await expect(loginAdmin('admin', 'wrong')).rejects.toMatchObject({ status: 401 });
    expect(getActiveSession()).toBeNull();
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'bad', token_type: 'bearer' }));
    await expect(loginAdmin('admin', 'wrong')).rejects.toThrow('không hợp lệ');
    expect(getActiveSession()).toBeNull();
  });

  it('exposes Retry-After to the login UI without retrying the POST', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'RATE_LIMITED', message: 'Wait' } }, 429, { 'Retry-After': '17' }));
    await expect(loginAdmin('admin', 'wrong')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 17 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('distinguishes a missing deployed login route from incorrect credentials', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Not Found' }, 404));
    await expect(loginAdmin('admin', 'wrong')).rejects.toMatchObject({
      status: 404, code: 'LOGIN_ENDPOINT_UNAVAILABLE',
      message: expect.stringContaining('VITE_API_BASE_URL'),
    });
    expect(getActiveSession()).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts pending reads on logout and rejects a response that ignores abort', async () => {
    startSession(tokenFor());
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    const pending = apiClient.get('/api/v1/shipments');
    const signal = fetchMock.mock.calls[0][1]!.signal!;
    endSession();
    expect(signal.aborted).toBe(true);
    resolve(jsonResponse({ items: ['private-data'] }));
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED', isBackendColdStart: false });
  });

  it('an old request returning 401 cannot log out a newly established session', async () => {
    startSession(tokenFor('old-session'));
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    const pending = apiClient.get('/api/v1/devices');
    startSession(tokenFor('new-session'));
    resolve(jsonResponse({ error: { message: 'Old session expired' } }, 401));
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    expect(getActiveSession()?.username).toBe('new-session');
  });

  it('does not expose data whose response body arrives after logout', async () => {
    startSession(tokenFor());
    let resolveBody!: (body: unknown) => void;
    const body = new Promise((done) => { resolveBody = done; });
    const json = vi.fn(() => body);
    fetchMock.mockResolvedValue({ ok: true, json } as unknown as Response);
    const pending = apiClient.get('/api/v1/shipments');
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    endSession();
    resolveBody({ items: ['private-data'] });
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
  });

  it('cancellation from a caller is not reported as a Render timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(apiClient.request('/api/v1/auth/login', { signal: controller.signal }, 1000, false))
      .rejects.toMatchObject({ code: 'REQUEST_CANCELLED', isBackendColdStart: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
