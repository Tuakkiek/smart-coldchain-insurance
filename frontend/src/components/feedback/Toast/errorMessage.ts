import { ApiError } from '../../../api/client';

const TECHNICAL_ERROR_PATTERN =
  /(<html|<!doctype|traceback|syntaxerror|typeerror|referenceerror|sqlalchemy|pymysql|mysql\.|stack trace|at\s+\w+\s+\()/i;

const MAX_TOAST_ERROR_LENGTH = 220;

export function isRequestCancelled(error: unknown): boolean {
  if (error instanceof ApiError && error.code === 'REQUEST_CANCELLED') {
    return true;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  return false;
}

function sanitizeMessage(raw: string, fallback: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned || TECHNICAL_ERROR_PATTERN.test(cleaned)) {
    return fallback;
  }
  if (cleaned.length > MAX_TOAST_ERROR_LENGTH) {
    return `${cleaned.slice(0, MAX_TOAST_ERROR_LENGTH - 1)}…`;
  }
  return cleaned;
}

export function formatApiErrorMessage(error: unknown, fallback: string): string {
  if (isRequestCancelled(error)) {
    return '';
  }

  if (error instanceof ApiError) {
    if (error.isBackendColdStart || error.code === 'RENDER_COLD_START_TIMEOUT' || error.status === 504) {
      return 'Máy chủ Backend đang khởi động (Cold Start). Vui lòng đợi vài giây và thử lại.';
    }
    if (error.code === 'NETWORK_ERROR' || error.status === 0) {
      return 'Không thể kết nối tới máy chủ Backend. Vui lòng kiểm tra kết nối mạng và thử lại.';
    }
    if (error.status === 401 || error.code === 'UNAUTHORIZED') {
      return 'Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Vui lòng đăng nhập lại.';
    }
    if (error.status === 429) {
      return 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng đợi một lát trước khi thử lại.';
    }
    if (error.status >= 500 && /^Lỗi yêu cầu HTTP \d+/i.test(error.message)) {
      return fallback;
    }
    return sanitizeMessage(error.message, fallback);
  }

  if (error instanceof Error) {
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return 'Không thể kết nối tới máy chủ Backend. Vui lòng kiểm tra kết nối mạng và thử lại.';
    }
    return sanitizeMessage(error.message, fallback);
  }

  return fallback;
}
