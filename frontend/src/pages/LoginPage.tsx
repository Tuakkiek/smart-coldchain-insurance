import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Snowflake, UserRound } from 'lucide-react';
import { loginAdmin } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui/Button';
import { PasswordInput } from '../components/ui/PasswordInput';
import { formatApiErrorMessage, useToast } from '../components/feedback/Toast';
import '../styles/auth.css';

export const LoginPage: React.FC = () => {
  const { session, reason } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const notifiedReasonRef = useRef<string | null>(null);
  const retrySeconds = Math.max(0, Math.ceil((retryUntil - now) / 1000));

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!reason || session) {
      notifiedReasonRef.current = null;
      return;
    }
    if (notifiedReasonRef.current === reason) return;
    notifiedReasonRef.current = reason;

    if (reason === 'expired') {
      toast.warning('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', {
        title: 'Phiên đăng nhập hết hạn',
        dedupKey: 'auth-reason-expired',
      });
    } else {
      toast.warning('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.', {
        title: 'Phiên đăng nhập không hợp lệ',
        dedupKey: 'auth-reason-unauthorized',
      });
    }
  }, [reason, session, toast]);

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
      toast.warning('Vui lòng nhập tên đăng nhập và mật khẩu.', {
        title: 'Thông tin chưa đầy đủ',
      });
      return;
    }
    busy.current = true;
    setSubmitting(true);
    const controller = new AbortController();
    request.current = controller;
    // Keep whitespace exactly as entered; never persist or log the password.
    const enteredPassword = password;
    setPassword('');
    try {
      await loginAdmin(username, enteredPassword, controller.signal);
      toast.success('Đăng nhập hệ thống quản trị thành công.', { title: 'Đăng nhập thành công' });
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Tên đăng nhập hoặc mật khẩu không chính xác.', {
          title: 'Đăng nhập thất bại',
        });
      } else if (err instanceof ApiError && err.status === 429) {
        const time = Date.now();
        setNow(time);
        setRetryUntil(time + Math.max(1, err.retryAfterSeconds ?? 60) * 1000);
        toast.error('Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi trước khi thử lại.', {
          title: 'Quá nhiều yêu cầu',
        });
      } else {
        const msg = formatApiErrorMessage(err, 'Không thể kết nối đến máy chủ. Vui lòng thử lại.');
        if (msg) {
          toast.error(msg, { title: 'Đăng nhập thất bại' });
        }
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
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={256}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              placeholder="Nhập mật khẩu"
              leftIcon={<LockKeyhole size={18} aria-hidden="true" />}
            />
          </div>
          {retrySeconds > 0 && <p className="auth-retry" role="status">Thử lại sau {retrySeconds} giây.</p>}
          <Button type="submit" variant="primary" size="lg" loading={submitting}
            disabled={retrySeconds > 0} className="auth-submit">
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
