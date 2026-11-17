import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAdmin, logoutAdmin } from '../src/api/auth';
import { apiClient } from '../src/api/client';
import { endSession, getActiveSession, getAuthSnapshot, startSession } from '../src/auth/session';
import { registerDevice } from '../src/api/devices';
import { createShipment } from '../src/api/shipments';
import { jsonResponse, tokenFor } from './helpers';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  apiClient.cancelRefresh();
  endSession();
  localStorage.clear();
  sessionStorage.clear();
  apiClient.setMockEnabled(false);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  apiClient.cancelRefresh();
  endSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Bearer API client with refresh-cookie integration', () => {
  it('tries one credentialed refresh when protected data has no access token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      error: { code: 'REFRESH_TOKEN_MISSING', message: 'Missing' },
    }, 401));

    await expect(apiClient.get('/api/v1/devices')).rejects.toMatchObject({
      status: 401,
      code: 'REFRESH_TOKEN_MISSING',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/auth\/refresh$/);
    expect(options!.credentials).toBe('include');
    expect(getActiveSession()).toBeNull();
  });

  it('logs in with credentials, preserves password whitespace and stores access token locally', async () => {
    const token = tokenFor('quản-trị');
    fetchMock.mockResolvedValue(jsonResponse({ access_token: token, token_type: 'bearer' }));
    await loginAdmin(' quản-trị ', '  demo-password  ');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/auth\/login$/);
    expect(JSON.parse(options!.body as string)).toEqual({
      username: 'quản-trị',
      password: '  demo-password  ',
    });
    expect(new Headers(options!.headers).has('Authorization')).toBe(false);
    expect(options!.credentials).toBe('include');
    expect(getActiveSession()?.accessToken).toBe(token);
    expect(localStorage.getItem('coldchain_admin_session')).toBe(token);
    expect(sessionStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it('uses Bearer without cookies for normal protected requests', async () => {
    const token = tokenFor();
    startSession(token);
    fetchMock.mockImplementation(async () => jsonResponse({}));
    await apiClient.get('/api/v1/shipments');
    await registerDevice({ device_id: 'ESP32-001', device_name: 'Sensor' });
    await createShipment({} as Parameters<typeof createShipment>[0]);

    for (const [url, options] of fetchMock.mock.calls) {
      expect(new URL(String(url)).origin).toBe(new URL(apiClient.getBaseUrl()).origin);
      expect(new Headers(options!.headers).get('Authorization')).toBe(`Bearer ${token}`);
      expect(options!.credentials).toBe('omit');
      expect(options!.cache).toBe('no-store');
    }
  });

  it('refreshes once and retries the original 401 request once', async () => {
    const oldToken = tokenFor('admin-old');
    const newToken = tokenFor('admin-new');
    startSession(oldToken);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: newToken, token_type: 'bearer' }))
      .mockResolvedValueOnce(jsonResponse({ items: ['ok'] }));

    await expect(apiClient.get<{ items: string[] }>('/api/v1/shipments'))
      .resolves.toEqual({ items: ['ok'] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Headers(fetchMock.mock.calls[0][1]!.headers).get('Authorization')).toBe(`Bearer ${oldToken}`);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/v1\/auth\/refresh$/);
    expect(fetchMock.mock.calls[1][1]!.credentials).toBe('include');
    expect(new Headers(fetchMock.mock.calls[2][1]!.headers).get('Authorization')).toBe(`Bearer ${newToken}`);
    expect(getActiveSession()?.accessToken).toBe(newToken);
  });

  it('deduplicates concurrent 401 responses into one refresh request', async () => {
    const oldToken = tokenFor('admin-old');
    const newToken = tokenFor('admin-new');
    startSession(oldToken);
    let resolveRefresh!: (response: Response) => void;
    const refreshResponse = new Promise<Response>((resolve) => { resolveRefresh = resolve; });
    let refreshCalls = 0;
    let protectedCalls = 0;
    fetchMock.mockImplementation(async (input, options) => {
      if (String(input).endsWith('/api/v1/auth/refresh')) {
        refreshCalls += 1;
        return refreshResponse;
      }
      protectedCalls += 1;
      const bearer = new Headers(options?.headers).get('Authorization');
      return bearer === `Bearer ${oldToken}`
        ? jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401)
        : jsonResponse({ ok: true });
    });

    const first = apiClient.get('/api/v1/shipments');
    const second = apiClient.get('/api/v1/devices');
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    resolveRefresh(jsonResponse({ access_token: newToken, token_type: 'bearer' }));
    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(4);
  });

  it('clears the session when refresh fails and does not retry protected data', async () => {
    startSession(tokenFor());
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401))
      .mockResolvedValueOnce(jsonResponse({
        error: { code: 'REFRESH_TOKEN_REVOKED', message: 'Revoked' },
      }, 401));

    await expect(apiClient.get('/api/v1/devices')).rejects.toMatchObject({
      status: 401,
      code: 'REFRESH_TOKEN_REVOKED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getActiveSession()).toBeNull();
    expect(getAuthSnapshot().reason).toBe('unauthorized');
    expect(localStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it('never performs a second refresh or retry when the retried request is also 401', async () => {
    startSession(tokenFor('old'));
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Expired' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: tokenFor('new'), token_type: 'bearer' }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Still unauthorized' } }, 401));

    await expect(apiClient.get('/api/v1/devices')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
    expect(getActiveSession()).toBeNull();
  });

  it('never refreshes or retries login failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Incorrect' } }, 401));
    await expect(loginAdmin('admin', 'wrong')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('keeps the session on 403 and does not attempt refresh', async () => {
    startSession(tokenFor());
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Forbidden' } }, 403));
    await expect(apiClient.get('/api/v1/devices')).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getActiveSession()).not.toBeNull();
  });

  it('exposes Retry-After without retrying a rate-limited login', async () => {
    fetchMock.mockResolvedValue(jsonResponse(
      { error: { code: 'RATE_LIMITED', message: 'Wait' } },
      429,
      { 'Retry-After': '17' },
    ));
    await expect(loginAdmin('admin', 'wrong')).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 17,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects a malformed login response without storing it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'bad', token_type: 'bearer' }));
    await expect(loginAdmin('admin', 'password')).rejects.toMatchObject({
      code: 'INVALID_LOGIN_RESPONSE',
    });
    expect(getActiveSession()).toBeNull();
    expect(localStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it('calls backend logout with credentials and always clears local state', async () => {
    startSession(tokenFor());
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await logoutAdmin();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/auth\/logout$/);
    expect(fetchMock.mock.calls[0][1]!.credentials).toBe('include');
    expect(new Headers(fetchMock.mock.calls[0][1]!.headers).has('Authorization')).toBe(false);
    expect(getActiveSession()).toBeNull();
    expect(localStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it('clears local state even when backend logout fails', async () => {
    startSession(tokenFor());
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(logoutAdmin()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(getActiveSession()).toBeNull();
    expect(localStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it('an old response cannot log out or expose data in a newly established session', async () => {
    startSession(tokenFor('old-session'));
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    const pending = apiClient.get('/api/v1/devices');
    startSession(tokenFor('new-session'));
    resolve(jsonResponse({ error: { message: 'Old session expired' } }, 401));
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    expect(getActiveSession()?.username).toBe('new-session');
  });

  it('does not expose a response body that finishes after logout', async () => {
    startSession(tokenFor());
    let resolveBody!: (body: unknown) => void;
    const body = new Promise((resolve) => { resolveBody = resolve; });
    const json = vi.fn(() => body);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json } as unknown as Response);
    const pending = apiClient.get('/api/v1/shipments');
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    endSession();
    resolveBody({ items: ['private-data'] });
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
  });

  it('caller cancellation is not reported as a Render timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(apiClient.request(
      '/api/v1/auth/login',
      { signal: controller.signal },
      1000,
      false,
    )).rejects.toMatchObject({ code: 'REQUEST_CANCELLED', isBackendColdStart: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
