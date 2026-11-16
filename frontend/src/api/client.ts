import { ApiErrorResponse } from '../types/api';
import { endSession, getActiveSession, getAuthSnapshot, subscribeAuth } from '../auth/session';

// Local development uses the Backend that is running alongside Vite. Production
// uses its configured Render origin; never silently switch servers after login fails.
const DEFAULT_API_BASE = import.meta.env.DEV
  ? 'http://127.0.0.1:8000'
  : 'https://smart-coldchain-insurance.onrender.com';

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
    retryAfterSeconds?: number
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
  private useMock: boolean;
  private protectedRequests = new Set<AbortController>();

  constructor() {
    this.baseUrl = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
    this.useMock =
      import.meta.env.VITE_USE_MOCKS === 'true' ||
      import.meta.env.VITE_USE_MOCK === 'true' ||
      import.meta.env.VITE_USE_MOCKS === true ||
      import.meta.env.VITE_USE_MOCK === true;
    subscribeAuth(() => {
      this.protectedRequests.forEach((controller) => controller.abort());
      this.protectedRequests.clear();
    });
  }

  isMockEnabled(): boolean {
    return this.useMock;
  }

  setMockEnabled(enabled: boolean): void {
    this.useMock = enabled;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  buildUrl(path: string): string {
    let cleanPath = path.startsWith('/') ? path : `/${path}`;
    // If baseUrl already ends with /api/v1 and path starts with /api/v1, avoid duplication
    if (this.baseUrl.endsWith('/api/v1') && cleanPath.startsWith('/api/v1/')) {
      cleanPath = cleanPath.substring('/api/v1'.length);
    }
    return `${this.baseUrl}${cleanPath}`;
  }

  async request<T>(path: string, options: RequestInit = {}, timeoutMs = 15000,
    authenticated = true): Promise<T> {
    const session = authenticated ? getActiveSession() : null;
    if (authenticated && !session) {
      throw new ApiError('Vui lòng đăng nhập lại để tiếp tục.', 401, 'UNAUTHORIZED');
    }
    const revision = getAuthSnapshot().revision;
    const url = this.buildUrl(path);
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    // Callers cannot override the current token or attach one to public login.
    headers.delete('Authorization');
    if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);

    const controller = new AbortController();
    if (authenticated) this.protectedRequests.add(controller);
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    let timedOut = false;
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

    const checkCurrentSession = () => {
      if (controller.signal.aborted || (authenticated && getAuthSnapshot().revision !== revision)) {
        throw new DOMException('Request cancelled', 'AbortError');
      }
      if (authenticated) {
        getActiveSession();
        if (getAuthSnapshot().revision !== revision) throw new DOMException('Session expired', 'AbortError');
      }
    };

    try {
      checkCurrentSession();
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        cache: 'no-store',
      });
      checkCurrentSession();

      if (!response.ok) {
        let errBody: ApiErrorResponse | null = null;
        try {
          errBody = (await response.json()) as ApiErrorResponse;
        } catch {
          // If response is not JSON
        }
        checkCurrentSession();
        if (authenticated && response.status === 401) endSession('unauthorized');

        const message = errBody?.error?.message || `Lỗi yêu cầu HTTP ${response.status}: ${response.statusText}`;
        const code = errBody?.error?.code || `HTTP_${response.status}`;
        const details = errBody?.error?.details;

        const retryHeader = response.headers.get('Retry-After');
        let retryAfterSeconds: number | undefined;
        if (retryHeader) {
          const seconds = Number(retryHeader);
          const value = Number.isFinite(seconds) ? seconds : (Date.parse(retryHeader) - Date.now()) / 1000;
          if (Number.isFinite(value)) retryAfterSeconds = Math.max(0, Math.ceil(value));
        }
        throw new ApiError(message, response.status, code, details, false, retryAfterSeconds);
      }

      const result = await response.json() as T;
      checkCurrentSession();
      return result;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }

      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        if (!timedOut) throw new ApiError('Yêu cầu đã được hủy.', 0, 'REQUEST_CANCELLED');
        throw new ApiError(
          `Yêu cầu tới Backend (${this.baseUrl}) đã quá thời gian (${timeoutMs / 1000}s). Có thể dịch vụ Render đang khởi động (Cold Start).`,
          504,
          'RENDER_COLD_START_TIMEOUT',
          undefined,
          true
        );
      }

      throw new ApiError(
        'Không thể kết nối Backend. Vui lòng kiểm tra kết nối và thử lại.',
        0,
        'NETWORK_ERROR'
      );
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abort);
      this.protectedRequests.delete(controller);
    }
  }

  get<T>(path: string, timeoutMs?: number, authenticated = true): Promise<T> {
    return this.request<T>(
      path,
      {
        method: 'GET',
      },
      timeoutMs,
      authenticated
    );
  }

  post<T>(
    path: string,
    body?: unknown,
    timeoutMs?: number,
    authenticated = true
  ): Promise<T> {
    return this.request<T>(
      path,
      {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      timeoutMs,
      authenticated
    );
  }
}

export const apiClient = new ApiClient();
