import { ApiErrorResponse } from '../types/api';
import {
  AdminSession,
  endSession,
  getAuthSnapshot,
  startSession,
  subscribeAuth,
} from '../auth/session';

// Local development uses the Backend that is running alongside Vite. Production
// uses its configured Render origin; never silently switch servers after auth fails.
const DEFAULT_API_BASE = import.meta.env.DEV
  ? 'http://localhost:8000'
  : 'https://smart-coldchain-insurance.onrender.com';

interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

export class ApiError extends Error {
  code: string;
  details?: Array<{ field?: string; message: string }>;
  status: number;
  isBackendColdStart?: boolean;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    code: string = 'API_ERROR',
    details?: Array<{ field?: string; message: string }>,
    isBackendColdStart = false,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isBackendColdStart = isBackendColdStart;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class ApiClient {
  private baseUrl: string;
  private protectedRequests = new Set<AbortController>();
  private refreshPromise: Promise<AdminSession> | null = null;
  private refreshController: AbortController | null = null;
  private refreshEpoch = 0;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
    subscribeAuth(() => {
      if (getAuthSnapshot().session) return;
      this.protectedRequests.forEach((controller) => controller.abort());
      this.protectedRequests.clear();
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  buildUrl(path: string): string {
    let cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (this.baseUrl.endsWith('/api/v1') && cleanPath.startsWith('/api/v1/')) {
      cleanPath = cleanPath.substring('/api/v1'.length);
    }
    const url = `${this.baseUrl}${cleanPath}`;
    const configured = new URL(this.baseUrl, window.location.origin);
    const target = new URL(url, window.location.origin);
    if (target.origin !== configured.origin) {
      throw new ApiError('API origin không khớp cấu hình.', 0, 'API_ORIGIN_MISMATCH');
    }
    return url;
  }

  private isCookieAuthUrl(url: string): boolean {
    const pathname = new URL(url, window.location.origin).pathname.replace(/\/$/, '');
    return /^\/api\/v1\/auth\/(login|refresh|logout)$/.test(pathname);
  }

  private async errorFromResponse(response: Response): Promise<ApiError> {
    let errBody: ApiErrorResponse | null = null;
    try {
      errBody = (await response.json()) as ApiErrorResponse;
    } catch {
      // A proxy may return a non-JSON error page.
    }
    const message = errBody?.error?.message ||
      `Lỗi yêu cầu HTTP ${response.status}: ${response.statusText}`;
    const code = errBody?.error?.code || `HTTP_${response.status}`;
    const retryHeader = response.headers.get('Retry-After');
    let retryAfterSeconds: number | undefined;
    if (retryHeader) {
      const seconds = Number(retryHeader);
      const value = Number.isFinite(seconds)
        ? seconds
        : (Date.parse(retryHeader) - Date.now()) / 1000;
      if (Number.isFinite(value)) retryAfterSeconds = Math.max(0, Math.ceil(value));
    }
    return new ApiError(
      message,
      response.status,
      code,
      errBody?.error?.details,
      false,
      retryAfterSeconds,
    );
  }

  private readTokenResponse(result: unknown, source: 'login' | 'refresh'): AdminSession {
    if (!result || typeof result !== 'object' ||
        !('token_type' in result) || result.token_type !== 'bearer' ||
        !('access_token' in result) || typeof result.access_token !== 'string') {
      throw new ApiError(
        `Phản hồi ${source} không hợp lệ. Vui lòng đăng nhập lại.`,
        502,
        source === 'login' ? 'INVALID_LOGIN_RESPONSE' : 'INVALID_REFRESH_RESPONSE',
      );
    }
    try {
      startSession((result as TokenResponse).access_token);
    } catch {
      throw new ApiError(
        `Phản hồi ${source} không hợp lệ hoặc access token đã hết hạn.`,
        502,
        source === 'login' ? 'INVALID_LOGIN_RESPONSE' : 'INVALID_REFRESH_RESPONSE',
      );
    }
    const session = getAuthSnapshot().session;
    if (!session) throw new ApiError('Không thể khởi tạo phiên đăng nhập.', 502, 'INVALID_TOKEN_RESPONSE');
    return session;
  }

  acceptTokenResponse(result: unknown, source: 'login' | 'refresh'): AdminSession {
    return this.readTokenResponse(result, source);
  }

  private async performRefresh(epoch: number): Promise<AdminSession> {
    const url = this.buildUrl('/api/v1/auth/refresh');
    const controller = new AbortController();
    this.refreshController = controller;
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw await this.errorFromResponse(response);
      const result = await response.json() as unknown;
      if (controller.signal.aborted || epoch !== this.refreshEpoch) {
        throw new ApiError('Yêu cầu đã được hủy.', 0, 'REQUEST_CANCELLED');
      }
      const session = this.readTokenResponse(result, 'refresh');
      return session;
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError('Yêu cầu refresh đã được hủy.', 0, 'REQUEST_CANCELLED');
      }
      throw new ApiError(
        'Không thể kết nối Backend để làm mới phiên đăng nhập.',
        0,
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timeoutId);
      if (this.refreshController === controller) this.refreshController = null;
    }
  }

  refreshAccessToken(): Promise<AdminSession> {
    if (this.refreshPromise) return this.refreshPromise;
    const epoch = this.refreshEpoch;
    let pending: Promise<AdminSession>;
    pending = this.performRefresh(epoch).finally(() => {
      if (this.refreshPromise === pending) this.refreshPromise = null;
    });
    this.refreshPromise = pending;
    return pending;
  }

  cancelRefresh(): void {
    this.refreshEpoch += 1;
    this.refreshController?.abort();
    this.refreshController = null;
    this.refreshPromise = null;
  }

  private async sessionForProtectedRequest(): Promise<AdminSession> {
    const current = getAuthSnapshot().session;
    // Refresh shortly before expiry so a protected request only needs to be sent once.
    if (current && current.expiresAt > Date.now() + 30_000) return current;
    try {
      return await this.refreshAccessToken();
    } catch (error: unknown) {
      if (!(error instanceof ApiError && error.code === 'REQUEST_CANCELLED')) {
        endSession(current ? 'expired' : 'unauthorized');
      }
      throw error;
    }
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
    timeoutMs = 15_000,
    authenticated = true,
  ): Promise<T> {
    const url = this.buildUrl(path);
    const useCookie = this.isCookieAuthUrl(url);
    const controller = new AbortController();
    if (authenticated) this.protectedRequests.add(controller);
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
      const currentSession = authenticated ? getAuthSnapshot().session : null;
      const session = authenticated
        ? (currentSession && currentSession.expiresAt > Date.now() + 30_000
          ? currentSession
          : await this.sessionForProtectedRequest())
        : null;
      if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');

      const headers = new Headers(options.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('Accept', 'application/json');
      headers.delete('Authorization');
      if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
      const revision = getAuthSnapshot().revision;
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        cache: 'no-store',
        credentials: useCookie ? 'include' : 'omit',
      });

      if (authenticated && getAuthSnapshot().revision !== revision) {
        throw new DOMException('Session changed', 'AbortError');
      }
      if (!response.ok) {
        const error = await this.errorFromResponse(response);
        if (authenticated && response.status === 401 &&
            getAuthSnapshot().revision === revision) {
          endSession('unauthorized');
        }
        throw error;
      }

      if (response.status === 204) return undefined as T;
      const result = await response.json() as T;
      if (authenticated && getAuthSnapshot().revision !== revision) {
        throw new DOMException('Session changed', 'AbortError');
      }
      return result;
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        if (!timedOut) throw new ApiError('Yêu cầu đã được hủy.', 0, 'REQUEST_CANCELLED');
        throw new ApiError(
          `Yêu cầu tới Backend (${this.baseUrl}) đã quá thời gian (${timeoutMs / 1000}s). ` +
          'Có thể dịch vụ Render đang khởi động (Cold Start).',
          504,
          'RENDER_COLD_START_TIMEOUT',
          undefined,
          true,
        );
      }
      throw new ApiError(
        'Không thể kết nối Backend. Vui lòng kiểm tra kết nối và thử lại.',
        0,
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abort);
      this.protectedRequests.delete(controller);
    }
  }

  get<T>(path: string, timeoutMs?: number, authenticated = true): Promise<T> {
    return this.request<T>(path, { method: 'GET' }, timeoutMs, authenticated);
  }

  post<T>(path: string, body?: unknown, timeoutMs?: number, authenticated = true): Promise<T> {
    return this.request<T>(
      path,
      { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) },
      timeoutMs,
      authenticated,
    );
  }

  delete<T>(path: string, timeoutMs?: number, authenticated = true): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' }, timeoutMs, authenticated);
  }
}

export const apiClient = new ApiClient();
