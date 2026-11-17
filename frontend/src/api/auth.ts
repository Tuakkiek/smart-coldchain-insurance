import { startSession } from '../auth/session';
import { apiClient, ApiError } from './client';

interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
}

export async function loginAdmin(username: string, password: string, signal?: AbortSignal): Promise<void> {
  // Login always uses the real Backend, even when monitoring uses mock fixtures.
  let result: LoginResponse;
  try {
    result = await apiClient.request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ username: username.trim(), password }), signal,
    }, 60_000, false);
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(
        'Backend chưa có API đăng nhập tại URL đang cấu hình. Vui lòng kiểm tra VITE_API_BASE_URL và triển khai bản Backend có Login/JWT.',
        404, 'LOGIN_ENDPOINT_UNAVAILABLE',
      );
    }
    throw error;
  }
  if (!result || result.token_type !== 'bearer' || typeof result.access_token !== 'string') {
    throw new ApiError('Phản hồi đăng nhập không hợp lệ. Vui lòng thử lại.', 502, 'INVALID_LOGIN_RESPONSE');
  }
  startSession(result.access_token);
}
