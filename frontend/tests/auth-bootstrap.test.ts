import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, tokenFor } from './helpers';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('auth startup refresh', () => {
  it('keeps a live persisted access token after F5 without requiring a refresh cookie', async () => {
    const token = tokenFor('persisted-admin');
    localStorage.setItem('coldchain_admin_session', token);
    fetchMock.mockResolvedValue(jsonResponse({
      error: { code: 'REFRESH_TOKEN_MISSING', message: 'Cookie blocked' },
    }, 401));
    const { initializeAdminSession } = await import('../src/api/auth');
    const { getAuthSnapshot } = await import('../src/auth/session');

    await initializeAdminSession();
    expect(getAuthSnapshot().session?.accessToken).toBe(token);
    expect(localStorage.getItem('coldchain_admin_session')).toBe(token);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes a persisted access token shortly before it expires', async () => {
    const token = tokenFor('persisted-admin', 30_000);
    const refreshed = tokenFor('startup-refreshed-admin');
    localStorage.setItem('coldchain_admin_session', token);
    fetchMock.mockResolvedValue(jsonResponse({ access_token: refreshed, token_type: 'bearer' }));
    const { initializeAdminSession } = await import('../src/api/auth');
    const { getAuthSnapshot } = await import('../src/auth/session');

    expect(getAuthSnapshot().session?.accessToken).toBe(token);
    await initializeAdminSession();
    expect(getAuthSnapshot().session?.accessToken).toBe(refreshed);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]!.credentials).toBe('include');
    expect(Object.keys(localStorage)).toEqual(['coldchain_admin_session']);
  });

  it('clears a restored access token when startup refresh is rejected', async () => {
    localStorage.setItem('coldchain_admin_session', tokenFor('persisted-admin', 30_000));
    fetchMock.mockResolvedValue(jsonResponse({
      error: { code: 'REFRESH_TOKEN_EXPIRED', message: 'Expired' },
    }, 401));
    const { initializeAdminSession } = await import('../src/api/auth');
    const { getAuthSnapshot } = await import('../src/auth/session');

    await initializeAdminSession();
    expect(getAuthSnapshot().session).toBeNull();
    expect(getAuthSnapshot().reason).toBe('unauthorized');
    expect(localStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it('uses the HttpOnly cookie to recover from an expired persisted access token', async () => {
    localStorage.setItem('coldchain_admin_session', tokenFor('expired-admin', -1000));
    const refreshed = tokenFor('refreshed-admin');
    fetchMock.mockResolvedValue(jsonResponse({ access_token: refreshed, token_type: 'bearer' }));
    const { initializeAdminSession } = await import('../src/api/auth');
    const { getAuthSnapshot } = await import('../src/auth/session');

    expect(getAuthSnapshot().initializing).toBe(true);
    await initializeAdminSession();
    expect(getAuthSnapshot().session?.accessToken).toBe(refreshed);
    expect(localStorage.getItem('coldchain_admin_session')).toBe(refreshed);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/auth\/refresh$/);
    expect(fetchMock.mock.calls[0][1]!.credentials).toBe('include');
  });

  it('finishes at Login when the startup refresh cookie is unavailable', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      error: { code: 'REFRESH_TOKEN_MISSING', message: 'Missing' },
    }, 401));
    const { initializeAdminSession } = await import('../src/api/auth');
    const { getAuthSnapshot } = await import('../src/auth/session');

    await initializeAdminSession();
    expect(getAuthSnapshot().initializing).toBe(false);
    expect(getAuthSnapshot().session).toBeNull();
    expect(getAuthSnapshot().reason).toBeNull();
    expect(localStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it.each([502, 503])('keeps a still-valid token when startup refresh returns %s', async (status) => {
    const token = tokenFor('persisted-admin', 30_000);
    localStorage.setItem('coldchain_admin_session', token);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'UNAVAILABLE', message: 'Starting' } }, status));
    const { initializeAdminSession } = await import('../src/api/auth');
    const { getAuthSnapshot } = await import('../src/auth/session');

    await initializeAdminSession();
    expect(getAuthSnapshot().session?.accessToken).toBe(token);
    expect(localStorage.getItem('coldchain_admin_session')).toBe(token);
  });

  it('keeps a still-valid session when proactive refresh encounters a network error', async () => {
    const { refreshAdminSession } = await import('../src/api/auth');
    const { startSession, getAuthSnapshot } = await import('../src/auth/session');
    const token = tokenFor('admin', 30_000);
    startSession(token);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(refreshAdminSession()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(getAuthSnapshot().session?.accessToken).toBe(token);
  });

  it('ends the session when the access token expires during a failed refresh', async () => {
    vi.useFakeTimers();
    const { refreshAdminSession } = await import('../src/api/auth');
    const { startSession, getAuthSnapshot } = await import('../src/auth/session');
    startSession(tokenFor('admin', 5_000));
    fetchMock.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 10_000);
      throw new TypeError('Backend unavailable');
    });

    await expect(refreshAdminSession()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(getAuthSnapshot().session).toBeNull();
    expect(getAuthSnapshot().reason).toBe('expired');
    expect(localStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it('does not clear a newer login when an earlier startup refresh fails', async () => {
    localStorage.setItem('coldchain_admin_session', tokenFor('old-admin', 30_000));
    let rejectRefresh!: (error: Error) => void;
    fetchMock.mockReturnValue(new Promise<Response>((_resolve, reject) => { rejectRefresh = reject; }));
    const { initializeAdminSession } = await import('../src/api/auth');
    const { startSession, getAuthSnapshot } = await import('../src/auth/session');
    const pending = initializeAdminSession();
    const token = tokenFor('new-admin');
    startSession(token);
    rejectRefresh(new TypeError('Failed to fetch'));

    await pending;
    expect(getAuthSnapshot().session?.accessToken).toBe(token);
  });
});
