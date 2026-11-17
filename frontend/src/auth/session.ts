export interface AdminSession {
  readonly accessToken: string;
  readonly username: string;
  readonly expiresAt: number;
}

export interface AuthSnapshot {
  readonly session: AdminSession | null;
  readonly reason: 'expired' | 'unauthorized' | null;
  readonly revision: number;
  readonly initializing: boolean;
}

const STORAGE_KEY = 'coldchain_admin_session';
const listeners = new Set<() => void>();

// Decode only the display name and expiry for UX. The Backend verifies the JWT
// signature, algorithm, claims and Admin identity on every protected request.
function readSession(accessToken: string): AdminSession | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!claims || typeof claims !== 'object' || !('sub' in claims) || !('exp' in claims)) return null;
    if (typeof claims.sub !== 'string' || !claims.sub.trim() ||
        typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) ||
        claims.exp <= 0 || claims.exp > Number.MAX_SAFE_INTEGER / 1000) return null;
    return { accessToken, username: claims.sub, expiresAt: claims.exp * 1000 };
  } catch {
    return null;
  }
}

function persist(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled. The current page still works with memory only.
  }
}

function restore(): AuthSnapshot {
  let accessToken: string | null = null;
  try {
    // Remove the previous credential without reading or reusing it.
    window.localStorage.removeItem('coldchain_admin_api_key');
    // Migrate away from the old per-tab access-token storage without reusing it.
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* Storage may be disabled. */ }
  try {
    accessToken = window.localStorage.getItem(STORAGE_KEY);
  } catch { /* Continue with an in-memory session. */ }
  const session = accessToken ? readSession(accessToken) : null;
  if (session && session.expiresAt > Date.now()) {
    return { session, reason: null, revision: 0, initializing: false };
  }
  persist(null);
  return {
    session: null,
    reason: session ? 'expired' : null,
    revision: 0,
    initializing: true,
  };
}

let snapshot = restore();

export function getAuthSnapshot(): AuthSnapshot { return snapshot; }

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function startSession(accessToken: string): void {
  const session = readSession(accessToken);
  if (!session || session.expiresAt <= Date.now()) {
    throw new Error('Phản hồi đăng nhập không hợp lệ hoặc token đã hết hạn. Vui lòng thử lại.');
  }
  persist(accessToken);
  snapshot = { session, reason: null, revision: snapshot.revision + 1, initializing: false };
  listeners.forEach((listener) => listener());
}

export function endSession(reason: AuthSnapshot['reason'] = null): void {
  persist(null);
  if (!snapshot.session && snapshot.reason === reason && !snapshot.initializing) return;
  snapshot = {
    session: null,
    reason,
    revision: snapshot.revision + 1,
    initializing: false,
  };
  listeners.forEach((listener) => listener());
}

export function finishSessionInitialization(reason: AuthSnapshot['reason'] = snapshot.reason): void {
  if (!snapshot.initializing) return;
  snapshot = {
    session: null,
    reason,
    revision: snapshot.revision + 1,
    initializing: false,
  };
  listeners.forEach((listener) => listener());
}

export function getActiveSession(): AdminSession | null {
  if (snapshot.session && snapshot.session.expiresAt <= Date.now()) endSession('expired');
  return snapshot.session;
}
