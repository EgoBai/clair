/**
 * 登录页面组件
 */
import { useState } from 'react';

interface LoginForm {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface LoginError {
  field?: string;
  message: string;
}

export function LoginPage({ onLogin, onForgotPassword, onRegister }: {
  onLogin: (form: LoginForm) => Promise<void>;
  onForgotPassword: () => void;
  onRegister: () => void;
}) {
  const [form, setForm] = useState<LoginForm>({ email: '', password: '', rememberMe: false });
  const [error, setError] = useState<LoginError | null>(null);
  const [loading, setLoading] = useState(false);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateEmail(form.email)) {
      setError({ field: 'email', message: '请输入有效的邮箱地址' });
      return;
    }
    if (!form.password) {
      setError({ field: 'password', message: '请输入密码' });
      return;
    }

    setLoading(true);
    try {
      await onLogin(form);
    } catch (err: any) {
      setError({ message: err.message || '登录失败，请重试' });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit(e as any);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>登录 A股分析</h1>
        <p className="subtitle">欢迎回来，请登录您的账户</p>

        {error && <div className="error-banner">{error.message}</div>}

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <div className={`form-field ${error?.field === 'email' ? 'error' : ''}`}>
            <label htmlFor="email">邮箱</label>
            <input
              id="email"
              type="email"
              placeholder="请输入邮箱"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              disabled={loading}
              autoComplete="email"
            />
            {error?.field === 'email' && <span className="field-error">{error.message}</span>}
          </div>

          <div className={`form-field ${error?.field === 'password' ? 'error' : ''}`}>
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              placeholder="请输入密码"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              disabled={loading}
              autoComplete="current-password"
            />
            {error?.field === 'password' && <span className="field-error">{error.message}</span>}
          </div>

          <div className="form-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.rememberMe}
                onChange={e => setForm({ ...form, rememberMe: e.target.checked })}
                disabled={loading}
              />
              记住我
            </label>
            <button type="button" className="link-button" onClick={onForgotPassword}>
              忘记密码？
            </button>
          </div>

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="switch-auth">
          还没有账户？
          <button type="button" className="link-button" onClick={onRegister}>
            立即注册
          </button>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
