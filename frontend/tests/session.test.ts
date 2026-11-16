import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => { vi.useRealTimers(); });

describe('Admin session persistence', () => {
  it('restores a live session on reload and reads Unicode subject for display', async () => {
    const token = tokenFor('quản-trị');
    sessionStorage.setItem('coldchain_admin_session', token);
    localStorage.setItem('coldchain_admin_api_key', 'obsolete-credential');
    const { getActiveSession } = await import('../src/auth/session');
    expect(getActiveSession()?.username).toBe('quản-trị');
    expect(getActiveSession()?.accessToken).toBe(token);
    expect(localStorage.getItem('coldchain_admin_api_key')).toBeNull();
    expect(localStorage.getItem('coldchain_admin_session')).toBeNull();
  });

  it.each(['not-a-jwt', 'e30.e30.signature', tokenFor('admin', -1000)])(
    'discards corrupt, missing-claim or expired persisted tokens', async (token) => {
      sessionStorage.setItem('coldchain_admin_session', token);
      const { getActiveSession } = await import('../src/auth/session');
      expect(getActiveSession()).toBeNull();
      expect(sessionStorage.getItem('coldchain_admin_session')).toBeNull();
    },
  );

  it('clears storage and notifies subscribers when the session expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const { startSession, subscribeAuth, getActiveSession, getAuthSnapshot } = await import('../src/auth/session');
    startSession(tokenFor('admin', 1000));
    const listener = vi.fn();
    const unsubscribe = subscribeAuth(listener);
    vi.advanceTimersByTime(1000);
    expect(getActiveSession()).toBeNull();
    expect(getAuthSnapshot().reason).toBe('expired');
    expect(sessionStorage.getItem('coldchain_admin_session')).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('can use memory-only sessions when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Disabled'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Disabled'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Disabled'); });
    const { startSession, endSession, getActiveSession } = await import('../src/auth/session');
    startSession(tokenFor());
    expect(getActiveSession()?.username).toBe('demo-admin');
    endSession();
    expect(getActiveSession()).toBeNull();
  });
});
