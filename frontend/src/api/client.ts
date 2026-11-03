import { ApiErrorResponse } from '../types/api';

const DEFAULT_API_BASE = 'http://localhost:8000';

export class ApiError extends Error {
  code: string;
  details?: Array<{ field?: string; message: string }>;
  status: number;

  constructor(message: string, status: number, code: string = 'API_ERROR', details?: Array<{ field?: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class ApiClient {
  private baseUrl: string;
  private useMock: boolean;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
    this.useMock = import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === true;
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

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

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
      if (err instanceof ApiError) {
        throw err;
      }
      const networkMessage = err instanceof Error ? err.message : 'Không thể kết nối đến máy chủ Backend';
      throw new ApiError(
        `Không thể kết nối Backend (${this.baseUrl}): ${networkMessage}`,
        0,
        'NETWORK_ERROR'
      );
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

export const apiClient = new ApiClient();

