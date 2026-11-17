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
});

describe('auth startup refresh', () => {
  it('restores local state and refreshes it once at application startup', async () => {
    const token = tokenFor('persisted-admin');
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
    localStorage.setItem('coldchain_admin_session', tokenFor('persisted-admin'));
    fetchMock.mockResolvedValue(jsonResponse({
      error: { code: 'REFRESH_TOKEN_REVOKED', message: 'Revoked' },
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
});
