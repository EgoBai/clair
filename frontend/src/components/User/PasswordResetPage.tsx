/**
 * 密码重置页面组件
 */
import { useState, useEffect } from 'react';

type ResetStep = 'email' | 'sent' | 'reset' | 'success';

export function PasswordResetPage({ token, onRequestReset, onResetPassword, onBackToLogin }: {
  token?: string;
  onRequestReset: (email: string) => Promise<void>;
  onResetPassword: (token: string, password: string) => Promise<void>;
  onBackToLogin: () => void;
}) {
  const [step, setStep] = useState<ResetStep>(token ? 'reset' : 'email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setLoading(true);
    try {
      await onRequestReset(email);
      setStep('sent');
      setCountdown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('密码至少8位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }
    setLoading(true);
    try {
      await onResetPassword(token!, password);
      setStep('success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      await onRequestReset(email);
      setCountdown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重发失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-reset-page">
      <div className="reset-card">
        {step === 'email' && (
          <>
            <h1>重置密码</h1>
            <p className="subtitle">输入您的注册邮箱，我们将发送重置链接</p>
            {error && <div className="error-banner">{error}</div>}
            <form onSubmit={handleRequestReset}>
              <div className="form-field">
                <label htmlFor="reset-email">邮箱</label>
                <input
                  id="reset-email"
                  type="email"
                  placeholder="请输入注册邮箱"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? '发送中...' : '发送重置链接'}
              </button>
            </form>
          </>
        )}

        {step === 'sent' && (
          <>
            <div className="success-icon">📧</div>
            <h1>邮件已发送</h1>
            <p className="subtitle">
              重置链接已发送至 <strong>{email}</strong>
              <br />请查收邮件并点击链接重置密码
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={handleResend}
              disabled={countdown > 0 || loading}
            >
              {countdown > 0 ? `${countdown}秒后可重发` : '重新发送'}
            </button>
          </>
        )}

        {step === 'reset' && (
          <>
            <h1>设置新密码</h1>
            <p className="subtitle">请设置您的新密码</p>
            {error && <div className="error-banner">{error}</div>}
            <form onSubmit={handleReset}>
              <div className="form-field">
                <label htmlFor="new-password">新密码</label>
                <input
                  id="new-password"
                  type="password"
                  placeholder="至少8位，包含大小写字母和数字"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-field">
                <label htmlFor="confirm-new-password">确认新密码</label>
                <input
                  id="confirm-new-password"
                  type="password"
                  placeholder="再次输入新密码"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? '重置中...' : '重置密码'}
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="success-icon">✅</div>
            <h1>重置成功</h1>
            <p className="subtitle">您的密码已成功重置，请使用新密码登录</p>
            <button type="button" className="primary-button" onClick={onBackToLogin}>
              前往登录
            </button>
          </>
        )}

        <button type="button" className="link-button back-link" onClick={onBackToLogin}>
          ← 返回登录
        </button>
      </div>
    </div>
  );
}

export default PasswordResetPage;
