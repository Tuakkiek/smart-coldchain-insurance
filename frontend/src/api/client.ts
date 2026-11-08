import { ApiErrorResponse } from '../types/api';

const DEFAULT_API_BASE = 'https://smart-coldchain-insurance.onrender.com';

export class ApiError extends Error {
  code: string;
  details?: Array<{ field?: string; message: string }>;
  status: number;
  isBackendColdStart?: boolean;

  constructor(
    message: string,
    status: number,
    code: string = 'API_ERROR',
    details?: Array<{ field?: string; message: string }>,
    isBackendColdStart = false
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isBackendColdStart = isBackendColdStart;
  }
}

class ApiClient {
  private baseUrl: string;
  private useMock: boolean;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
    this.useMock =
      import.meta.env.VITE_USE_MOCKS === 'true' ||
      import.meta.env.VITE_USE_MOCK === 'true' ||
      import.meta.env.VITE_USE_MOCKS === true ||
      import.meta.env.VITE_USE_MOCK === true;
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

  async request<T>(path: string, options: RequestInit = {}, timeoutMs = 15000): Promise<T> {
    const url = this.buildUrl(path);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errBody: ApiErrorResponse | null = null;
        try {
          errBody = (await response.json()) as ApiErrorResponse;
        } catch {
          // If response is not JSON
        }

        const message = errBody?.error?.message || `Lỗi yêu cầu HTTP ${response.status}: ${response.statusText}`;
        const code = errBody?.error?.code || `HTTP_${response.status}`;
        const details = errBody?.error?.details;

        throw new ApiError(message, response.status, code, details);
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof ApiError) {
        throw err;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError(
          `Yêu cầu tới Backend (${this.baseUrl}) đã quá thời gian (${timeoutMs / 1000}s). Có thể dịch vụ Render đang khởi động (Cold Start).`,
          504,
          'RENDER_COLD_START_TIMEOUT',
          undefined,
          true
        );
      }

      const networkMessage = err instanceof Error ? err.message : 'Không thể kết nối đến máy chủ Backend';
      throw new ApiError(
        `Không thể kết nối Backend (${this.baseUrl}): ${networkMessage}. Lưu ý: Lỗi máy chủ không phản ánh trạng thái thiết bị ngoại vi.`,
        0,
        'NETWORK_ERROR'
      );
    }
  }

  getAdminKey(): string | null {
    return (
      localStorage.getItem('coldchain_admin_api_key') ||
      import.meta.env.VITE_ADMIN_API_KEY ||
      null
    );
  }

  setAdminKey(key: string): void {
    if (key && key.trim()) {
      localStorage.setItem('coldchain_admin_api_key', key.trim());
    } else {
      localStorage.removeItem('coldchain_admin_api_key');
    }
  }

  get<T>(path: string, timeoutMs?: number, customHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>(
      path,
      {
        method: 'GET',
        headers: customHeaders,
      },
      timeoutMs
    );
  }

  post<T>(
    path: string,
    body?: unknown,
    timeoutMs?: number,
    customHeaders?: Record<string, string>
  ): Promise<T> {
    return this.request<T>(
      path,
      {
        method: 'POST',
        headers: customHeaders,
        body: body ? JSON.stringify(body) : undefined,
      },
      timeoutMs
    );
  }
}

export const apiClient = new ApiClient();
