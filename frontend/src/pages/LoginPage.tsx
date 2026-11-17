import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Snowflake, UserRound } from 'lucide-react';
import { loginAdmin } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui/Button';
import '../styles/auth.css';

export const LoginPage: React.FC = () => {
  const { session, reason } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const retrySeconds = Math.max(0, Math.ceil((retryUntil - now) / 1000));

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= retryUntil) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);

  const from: unknown = location.state?.from;
  const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') &&
    !from.includes('\\') && !/^\/login(?:[/?#]|$)/.test(from) ? from : '/';
  if (session) return <Navigate to={destination} replace />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || Date.now() < retryUntil) return;
    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setError(null);
    const controller = new AbortController();
    request.current = controller;
    // Keep whitespace exactly as entered; never persist or log the password.
    const enteredPassword = password;
    setPassword('');
    try {
      await loginAdmin(username, enteredPassword, controller.signal);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.status === 401) {
        setError('Tên đăng nhập hoặc mật khẩu không chính xác.');
      } else if (err instanceof ApiError && err.status === 429) {
        const time = Date.now();
        setNow(time);
        setRetryUntil(time + Math.max(1, err.retryAfterSeconds ?? 60) * 1000);
        setError('Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi trước khi thử lại.');
      } else {
        setError(err instanceof Error ? err.message : 'Không thể đăng nhập. Vui lòng thử lại.');
      }
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-brand" aria-label="ColdChain Insurance">
        <span className="auth-brand-icon"><Snowflake size={22} aria-hidden="true" /></span>
        <span>ColdChain<span className="auth-brand-secondary"> Insurance</span></span>
      </div>
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-card-icon"><LockKeyhole size={24} aria-hidden="true" /></div>
        <h1 id="login-title">Đăng nhập quản trị</h1>
        <p className="auth-description">Chào mừng trở lại. Đăng nhập để quản lý và giám sát các chuyến hàng.</p>
        {reason && !error && (
          <p className="auth-notice" role="status">
            {reason === 'expired' ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' :
              'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.'}
          </p>
        )}
        <form onSubmit={handleSubmit} className="auth-form" aria-busy={submitting}>
          <div>
            <label htmlFor="login-username">Tên đăng nhập</label>
            <div className="auth-input-wrap">
              <UserRound size={18} aria-hidden="true" />
              <input id="login-username" name="username" type="text" autoComplete="username"
                autoCapitalize="none" spellCheck={false} required maxLength={100}
                value={username} onChange={(event) => setUsername(event.target.value)}
                disabled={submitting} placeholder="Nhập tên đăng nhập" autoFocus />
            </div>
          </div>
          <div>
            <label htmlFor="login-password">Mật khẩu</label>
            <div className="auth-input-wrap">
              <LockKeyhole size={18} aria-hidden="true" />
              <input id="login-password" name="password" type="password" autoComplete="current-password"
                required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)}
                disabled={submitting} placeholder="Nhập mật khẩu" />
            </div>
          </div>
          {error && <div id="login-error" className="auth-error" role="alert">{error}</div>}
          {retrySeconds > 0 && <p className="auth-retry" role="status">Thử lại sau {retrySeconds} giây.</p>}
          <Button type="submit" variant="primary" size="lg" loading={submitting}
            disabled={retrySeconds > 0} className="auth-submit" aria-describedby={error ? 'login-error' : undefined}>
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            {!submitting && <ArrowRight size={18} aria-hidden="true" />}
          </Button>
        </form>
        <p className="auth-footer">Sử dụng tài khoản Admin của hệ thống.</p>
      </section>
      <p className="auth-caption">Giám sát chuỗi lạnh · Toàn vẹn dữ liệu · Bảo hiểm vận chuyển</p>
    </main>
  );
};
