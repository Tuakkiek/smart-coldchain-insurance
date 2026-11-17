import {
  endSession,
  finishSessionInitialization,
  getAuthSnapshot,
} from '../auth/session';
import { apiClient, ApiError } from './client';

interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
}

export async function loginAdmin(
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<void> {
  // Login always uses the real Backend, even when monitoring uses mock fixtures.
  apiClient.cancelRefresh();
  let result: LoginResponse;
  try {
    result = await apiClient.request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim(), password }),
      signal,
    }, 60_000, false);
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(
        'Backend chưa có API đăng nhập tại URL đang cấu hình. ' +
        'Vui lòng kiểm tra VITE_API_BASE_URL và phiên bản Backend.',
        404,
        'LOGIN_ENDPOINT_UNAVAILABLE',
      );
    }
    throw error;
  }
  apiClient.acceptTokenResponse(result, 'login');
}

export async function initializeAdminSession(): Promise<void> {
  const initial = getAuthSnapshot();
  if (!initial.initializing && !initial.session) return;
  // revision=0 identifies a session restored during this page load. Sessions
  // created by an in-page login/refresh have already completed auth setup.
  if (initial.session && initial.revision !== 0) return;
  try {
    await apiClient.refreshAccessToken();
  } catch {
    if (initial.session) endSession('unauthorized');
    else finishSessionInitialization(initial.reason);
  }
}

export async function refreshAdminSession(): Promise<void> {
  try {
    await apiClient.refreshAccessToken();
  } catch (error: unknown) {
    endSession('expired');
    throw error;
  }
}

export async function logoutAdmin(): Promise<void> {
  apiClient.cancelRefresh();
  endSession();
  try {
    await apiClient.request<void>(
      '/api/v1/auth/logout',
      { method: 'POST' },
      15_000,
      false,
    );
  } finally {
    endSession();
  }
}
