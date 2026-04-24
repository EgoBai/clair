/**
 * 用户系统 API
 * 注册/登录/设置/操作历史/RBAC集成
 * 对标Linear用户体系 + Notion权限管理
 */

import { Request, Response, Router } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { validateBody, validateQuery, schemas } from '../middleware/validation';
import { RBACEngine, RBACContext } from '../utils/rbacEngine';
import { authMiddleware, signAccessToken, generateRefreshToken, consumeRefreshToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const rbacEngine = new RBACEngine();

// ==================== 内存用户存储（生产环境应使用数据库）====================

interface User {
  id: string;
  email: string;
  phone?: string;
  nickname: string;
  avatar?: string;
  roles: string[];          // RBAC角色列表
  status: 'active' | 'inactive' | 'banned' | 'pending';
  failedLoginAttempts: number;
  lockedUntil?: string;
  mfaEnabled: boolean;
  mfaSecret?: string;
  settings: UserSettings;
  createdAt: string;
  lastLoginAt: string;
}

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: 'zh-CN' | 'en-US';
  notifications: {
    email: boolean;
    push: boolean;
    priceAlert: boolean;
    newsAlert: boolean;
    weeklyReport: boolean;
  };
  display: {
    defaultPageSize: number;
    chartType: 'candlestick' | 'line';
    showVolume: boolean;
    klineDefaultPeriod: string;
  };
}

interface UserAction {
  id: string;
  userId: string;
  type: string;
  target: string;
  detail: string;
  timestamp: string;
  ip?: string;
  userAgent?: string;
}

// ===== 会话管理 =====

interface Session {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  ip: string;
  userAgent: string;
  lastActiveAt: string;
}

// ===== 登录尝试限流 =====

interface LoginAttempt {
  ip: string;
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}

const users = new Map<string, User>();
const tokens = new Map<string, string>(); // token -> userId
const sessions = new Map<string, Session>(); // token -> session
const actionHistory = new Map<string, UserAction[]>();
const loginAttempts = new Map<string, LoginAttempt>(); // ip -> attempts

// 配置常量
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_DURATION = 15 * 60 * 1000; // 15分钟
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24小时
const MAX_CONCURRENT_SESSIONS = 5;
const MAX_FAILED_ATTEMPTS = 10;
const ACCOUNT_LOCK_DURATION = 30 * 60 * 1000; // 30分钟

function hashPassword(password: string): string {
  return createHash('sha256').update(password + 'a-stock-salt').digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * 敏感数据脱敏 — 邮箱
 * 将 test@example.com 转为 tes***@example.com
 */
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 3) return `${local.slice(0, 1)}***@${domain}`;
  return `${local.slice(0, 3)}***@${domain}`;
}

/**
 * 敏感数据脱敏 — 手机号
 * 将 13812345678 转为 138****5678
 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

function defaultSettings(): UserSettings {
  return {
    theme: 'system',
    language: 'zh-CN',
    notifications: {
      email: true,
      push: true,
      priceAlert: true,
      newsAlert: false,
      weeklyReport: true,
    },
    display: {
      defaultPageSize: 20,
      chartType: 'candlestick',
      showVolume: true,
      klineDefaultPeriod: 'day',
    },
  };
}

interface AuthenticatedRequest extends Request {
  userId?: string;
}

function authMiddleware(req: Request, res: Response, next: Function) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  (req as AuthenticatedRequest).userId = tokens.get(token);
  next();
}

/**
 * 用户注册
 * POST /api/user/register
 */
router.post('/user/register', (req: Request, res: Response) => {
  try {
    const { email, phone, password, nickname } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: '请提供邮箱或手机号' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: '密码至少6位' });
    }
    if (!nickname || nickname.length < 2) {
      return res.status(400).json({ success: false, message: '昵称至少2个字符' });
    }

    // 检查邮箱重复
    for (const user of users.values()) {
      if (email && user.email === email) {
        return res.status(409).json({ success: false, message: '邮箱已注册' });
      }
      if (phone && user.phone === phone) {
        return res.status(409).json({ success: false, message: '手机号已注册' });
      }
    }

    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const token = generateToken();

    const user: User = {
      id: userId,
      email: email || '',
      phone: phone || undefined,
      nickname,
      roles: ['user'],
      status: 'active',
      failedLoginAttempts: 0,
      mfaEnabled: false,
      settings: defaultSettings(),
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    users.set(userId, user);
    tokens.set(token, userId);
    actionHistory.set(userId, []);

    // 生成 JWT token
    const accessToken = signAccessToken({ sub: userId, email: email || '', roles: user.roles });
    const refreshToken = generateRefreshToken(userId, email || '');

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: maskEmail(user.email),
          nickname: user.nickname,
          roles: user.roles,
          status: user.status,
          createdAt: user.createdAt,
        },
        token,                  // 旧格式兼容
        accessToken,            // JWT 访问令牌
        refreshToken,           // 刷新令牌
        expiresIn: 900,
      },
    });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ success: false, message: '注册失败' });
  }
});

/**
 * 用户登录
 * POST /api/user/login
 */
router.post('/user/login', (req: Request, res: Response) => {
  try {
    const { email, phone, password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: '请输入密码' });
    }

    let foundUser: User | undefined;
    for (const user of users.values()) {
      if (email && user.email === email) { foundUser = user; break; }
      if (phone && user.phone === phone) { foundUser = user; break; }
    }

    if (!foundUser) {
      return res.status(401).json({ success: false, message: '用户不存在或密码错误' });
    }

    // 生成本地 token（旧格式兼容）
    const token = generateToken();
    tokens.set(token, foundUser.id);
    foundUser.lastLoginAt = new Date().toISOString();

    // 生成 JWT token（新格式）
    const accessToken = signAccessToken({ sub: foundUser.id, email: foundUser.email, roles: foundUser.roles });
    const refreshToken = generateRefreshToken(foundUser.id, foundUser.email);

    // 对敏感字段脱敏再返回
    const safeUser = {
      id: foundUser.id,
      email: maskEmail(foundUser.email),
      nickname: foundUser.nickname,
      avatar: foundUser.avatar,
      roles: foundUser.roles,
      status: foundUser.status,
      settings: foundUser.settings,
      mfaEnabled: foundUser.mfaEnabled,
      createdAt: foundUser.createdAt,
      lastLoginAt: foundUser.lastLoginAt,
    };

    res.json({
      success: true,
      data: {
        user: safeUser,
        token,                  // 旧格式兼容
        accessToken,            // JWT 访问令牌
        refreshToken,           // 刷新令牌
        expiresIn: 900,         // 15分钟（秒）
      },
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

/**
 * 获取用户信息
 * GET /api/user/profile
 */
router.get('/user/profile', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const user = users.get(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }
  res.json({ success: true, data: user });
});

/**
 * 更新用户设置
 * PUT /api/user/settings
 */
router.put('/user/settings', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const user = users.get(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  const { theme, language, notifications, display } = req.body;
  if (theme) user.settings.theme = theme;
  if (language) user.settings.language = language;
  if (notifications) user.settings.notifications = { ...user.settings.notifications, ...notifications };
  if (display) user.settings.display = { ...user.settings.display, ...display };

  res.json({ success: true, data: user.settings });
});

/**
 * 记录操作历史
 * POST /api/user/history
 */
router.post('/user/history', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { type, target, detail } = req.body;

  if (!type || !target) {
    return res.status(400).json({ success: false, message: '缺少必要参数' });
  }

  const action: UserAction = {
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId,
    type,
    target,
    detail: detail || '',
    timestamp: new Date().toISOString(),
  };

  const history = actionHistory.get(userId) || [];
  history.unshift(action);
  // 保留最近500条
  if (history.length > 500) history.length = 500;
  actionHistory.set(userId, history);

  res.json({ success: true, data: action });
});

/**
 * 获取操作历史
 * GET /api/user/history?type=stock_view&page=1&pageSize=20
 */
router.get('/user/history', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const type = req.query.type as string;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

  let history = actionHistory.get(userId) || [];
  if (type) {
    history = history.filter(a => a.type === type);
  }

  const total = history.length;
  const data = history.slice((page - 1) * pageSize, page * pageSize);

  res.json({
    success: true,
    data: {
      items: data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    },
  });
});

/**
 * 登出
 * POST /api/user/logout
 */
router.post('/user/logout', authMiddleware, (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) tokens.delete(token);
  res.json({ success: true, message: '已登出' });
});

export { authMiddleware, users, tokens };
export default router;
