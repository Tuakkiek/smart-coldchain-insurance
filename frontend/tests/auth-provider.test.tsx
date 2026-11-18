import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { initializeAdminSession, refreshAdminSession } from '../src/api/auth';
import { endSession, getAuthSnapshot, startSession } from '../src/auth/session';
import { tokenFor } from './helpers';

vi.mock('../src/api/auth', () => ({
  initializeAdminSession: vi.fn().mockResolvedValue(undefined),
  refreshAdminSession: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(refreshAdminSession).mockReset();
  endSession();
});

afterEach(() => { vi.useRealTimers(); });

describe('proactive session refresh recovery', () => {
  it('retries after a temporary outage and stops retrying once a new token is available', async () => {
    startSession(tokenFor('admin', 45_000));
    vi.mocked(refreshAdminSession)
      .mockRejectedValueOnce(new Error('Backend starting'))
      .mockImplementationOnce(async () => { startSession(tokenFor('refreshed-admin')); });
    render(<AuthProvider><span>Dashboard</span></AuthProvider>);
    await act(async () => {});
    expect(initializeAdminSession).toHaveBeenCalledOnce();
    expect(refreshAdminSession).toHaveBeenCalledOnce();
    expect(getAuthSnapshot().session?.username).toBe('admin');

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(refreshAdminSession).toHaveBeenCalledTimes(2);
    expect(getAuthSnapshot().session?.username).toBe('refreshed-admin');
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(refreshAdminSession).toHaveBeenCalledTimes(2);
  });

  it('cancels a scheduled retry when the provider unmounts', async () => {
    startSession(tokenFor('admin', 45_000));
    vi.mocked(refreshAdminSession).mockRejectedValue(new Error('Offline'));
    const { unmount } = render(<AuthProvider><span>Dashboard</span></AuthProvider>);
    await act(async () => {});
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(refreshAdminSession).toHaveBeenCalledOnce();
  });
});
