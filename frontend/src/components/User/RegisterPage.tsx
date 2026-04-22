/**
 * 注册页面组件
 */
import { useState, useMemo } from 'react';

interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  nickname: string;
}

interface PasswordStrength {
  level: number;
  label: string;
  color: string;
}

export function RegisterPage({ onRegister, onLogin }: {
  onRegister: (form: RegisterForm) => Promise<void>;
  onLogin: () => void;
}) {
  const [form, setForm] = useState<RegisterForm>({
    email: '', password: '', confirmPassword: '', nickname: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const passwordStrength = useMemo<PasswordStrength>(() => {
    const pwd = form.password;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    if (score <= 2) return { level: 1, label: '弱', color: '#ef4444' };
    if (score <= 4) return { level: 2, label: '中', color: '#f59e0b' };
    return { level: 3, label: '强', color: '#22c55e' };
  }, [form.password]);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validateNickname = (n: string) => n.length >= 2 && n.length <= 20;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!validateEmail(form.email)) newErrors.email = '请输入有效的邮箱';
    if (!form.password || form.password.length < 8) newErrors.password = '密码至少8位';
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = '两次密码不一致';
    if (!validateNickname(form.nickname)) newErrors.nickname = '昵称2-20个字符';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setLoading(true);
    try {
      await onRegister(form);
    } catch (err: unknown) {
      setErrors({ form: err instanceof Error ? err.message : '注册失败' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-card">
        <h1>注册 A股分析</h1>
        <p className="subtitle">创建账户，开始您的投资之旅</p>

        {errors.form && <div className="error-banner">{errors.form}</div>}

        <form onSubmit={handleSubmit}>
          <div className={`form-field ${errors.email ? 'error' : ''}`}>
            <label htmlFor="email">邮箱 *</label>
            <input
              id="email"
              type="email"
              placeholder="请输入邮箱"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              disabled={loading}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className={`form-field ${errors.nickname ? 'error' : ''}`}>
            <label htmlFor="nickname">昵称 *</label>
            <input
              id="nickname"
              type="text"
              placeholder="2-20个字符"
              value={form.nickname}
              onChange={e => setForm({ ...form, nickname: e.target.value })}
              disabled={loading}
              maxLength={20}
            />
            {errors.nickname && <span className="field-error">{errors.nickname}</span>}
          </div>

          <div className={`form-field ${errors.password ? 'error' : ''}`}>
            <label htmlFor="password">密码 *</label>
            <input
              id="password"
              type="password"
              placeholder="至少8位，包含字母和数字"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              disabled={loading}
            />
            {form.password && (
              <div className="password-strength">
                <div className="strength-bar">
                  <div
                    className="strength-fill"
                    style={{
                      width: `${(passwordStrength.level / 3) * 100}%`,
                      backgroundColor: passwordStrength.color,
                    }}
                  />
                </div>
                <span style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
              </div>
            )}
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <div className={`form-field ${errors.confirmPassword ? 'error' : ''}`}>
            <label htmlFor="confirmPassword">确认密码 *</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="再次输入密码"
              value={form.confirmPassword}
              onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
              disabled={loading}
            />
            {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
          </div>

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="switch-auth">
          已有账户？
          <button type="button" className="link-button" onClick={onLogin}>
            立即登录
          </button>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
