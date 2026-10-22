/**
 * 用户系统 API
 * 注册/登录/设置/操作历史/RBAC集成
 * 对标Linear用户体系 + Notion权限管理
 */

import { NextFunction, Request, Response, Router } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { signAccessToken, generateRefreshToken, consumeRefreshToken } from '../middleware/auth';
import { validateBody, validateQuery, schemas } from '../middleware/validation';

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）：顶层 dataSource 与 data 内同源。
 *
 * 关键：**保持 `data` 的原有形状**（对象仍是对象、数组仍是数组），
 * 只在顶层补 dataSource、在对象型载荷内部补同名行级字段 —— 不破坏既有前端契约
 * （`/api/user/profile` → `data.data`；`/api/user/history` → `data.data.items`；
 *   登录/注册 → `data.data.token` / `data.data.user`）。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: unknown,
  statusCode = 200,
  extra?: Record<string, unknown>,
): void {
  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>), dataSource }
      : data;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json({
    success: true,
    dataSource,
    data: payload,
    timestamp: new Date().toISOString(),
    ...(extra ?? {}),
  });
}

/**
 * 失败响应统一出口：**保留原 HTTP 语义**（400/401/404/409/500 不变），
 * 只补顶层 dataSource。`message` 字段保持存在（原实现只用 message，前端读它）。
 */
function sendUnavailable(
  res: Response,
  statusCode: number,
  error: string,
  message?: string,
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json({
    success: false,
    dataSource: 'unavailable',
    error,
    message: message ?? error,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 用户数据存于**服务进程内存**（未落库，见上方 users/tokens/sessions Map）——
 * 成功响应统一附带的性质说明。
 */
const STORAGE_NOTE =
  '用户数据存于服务进程内存（未落库），服务重启即丢失；返回的是当前进程内的真实用户数据';

/**
 * 对外暴露用户信息时的脱敏投影。
 *
 * 安全：绝不外泄 `passwordHash`（bcrypt 摘要）、`mfaSecret`、`lockedUntil`
 * 等内部字段。注册/登录/资料页一律走这个投影。
 */
function publicUser(user: User): Record<string, unknown> {
  return {
    id: user.id,
    email: maskEmail(user.email),
    nickname: user.nickname,
    avatar: user.avatar,
    roles: user.roles,
    status: user.status,
    settings: user.settings,
    mfaEnabled: user.mfaEnabled,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

// ==================== 内存用户存储（生产环境应使用数据库）====================

interface User {
  id: string;
  email: string;
  phone?: string;
  nickname: string;
  avatar?: string;
  roles: string[];          // RBAC角色列表
  status: 'active' | 'inactive' | 'banned' | 'pending';
  /** bcrypt 密码哈希（禁止存明文/可逆摘要） */
  passwordHash: string;
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

/** bcrypt 代价因子（F06：替换原 SHA-256+固定盐弱哈希） */
const BCRYPT_ROUNDS = 12;

/** 用于用户不存在时做等时比对，避免通过响应时间枚举账号 */
const DUMMY_HASH = bcrypt.hashSync('clair-dummy-password', BCRYPT_ROUNDS);

/**
 * 密码哈希（bcrypt，自动随机盐）
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * 密码校验；hash 缺失时仍执行一次等时比对再返回 false
 */
async function verifyPassword(password: string, hash?: string): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
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
  userId: string;
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = token ? tokens.get(token) : undefined;
  if (!token || !userId) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  (req as AuthenticatedRequest).userId = userId;
  next();
}

/**
 * 用户注册
 * POST /api/user/register
 */
router.post('/user/register', async (req: Request, res: Response) => {
  try {
    const { email, phone, password, nickname } = req.body;

    if (!email && !phone) {
      return sendUnavailable(res, 400, '请提供邮箱或手机号');
    }
    if (!password || password.length < 6) {
      return sendUnavailable(res, 400, '密码至少6位');
    }
    if (!nickname || nickname.length < 2) {
      return sendUnavailable(res, 400, '昵称至少2个字符');
    }

    // 检查邮箱重复
    for (const user of users.values()) {
      if (email && user.email === email) {
        return sendUnavailable(res, 409, '邮箱已注册');
      }
      if (phone && user.phone === phone) {
        return sendUnavailable(res, 409, '手机号已注册');
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
      passwordHash: await hashPassword(password),
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

    sendHonest(
      res,
      'real',
      {
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
      201,
      { storageNote: STORAGE_NOTE },
    );
  } catch (error) {
    console.error('注册失败:', error);
    sendUnavailable(res, 500, '注册失败');
  }
});

/**
 * 用户登录
 * POST /api/user/login
 */
router.post('/user/login', async (req: Request, res: Response) => {
  try {
    const { email, phone, password } = req.body;

    if (!password) {
      return sendUnavailable(res, 400, '请输入密码');
    }

    let foundUser: User | undefined;
    for (const user of users.values()) {
      if (email && user.email === email) { foundUser = user; break; }
      if (phone && user.phone === phone) { foundUser = user; break; }
    }

    // F06: 必须校验密码；用户不存在时也走一次等时比对，响应文案保持一致
    const passwordOk = await verifyPassword(password, foundUser?.passwordHash);
    if (!foundUser || !passwordOk) {
      return sendUnavailable(res, 401, '用户不存在或密码错误');
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

    sendHonest(
      res,
      'real',
      {
        user: safeUser,
        token,                  // 旧格式兼容
        accessToken,            // JWT 访问令牌
        refreshToken,           // 刷新令牌
        expiresIn: 900,         // 15分钟（秒）
      },
      200,
      { storageNote: STORAGE_NOTE },
    );
  } catch (error) {
    console.error('登录失败:', error);
    sendUnavailable(res, 500, '登录失败');
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
    return sendUnavailable(res, 404, '用户不存在');
  }
  // 脱敏投影：绝不外泄 passwordHash / mfaSecret 等内部字段
  sendHonest(res, 'real', publicUser(user), 200, { storageNote: STORAGE_NOTE });
});

/**
 * 更新用户设置
 * PUT /api/user/settings
 */
router.put('/user/settings', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const user = users.get(userId);
  if (!user) {
    return sendUnavailable(res, 404, '用户不存在');
  }

  const { theme, language, notifications, display } = req.body;
  if (theme) user.settings.theme = theme;
  if (language) user.settings.language = language;
  if (notifications) user.settings.notifications = { ...user.settings.notifications, ...notifications };
  if (display) user.settings.display = { ...user.settings.display, ...display };

  sendHonest(res, 'real', user.settings as unknown as Record<string, unknown>, 200, {
    storageNote: STORAGE_NOTE,
  });
});

/**
 * 记录操作历史
 * POST /api/user/history
 */
router.post('/user/history', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { type, target, detail } = req.body;

  if (!type || !target) {
    return sendUnavailable(res, 400, '缺少必要参数');
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

  sendHonest(res, 'real', action as unknown as Record<string, unknown>, 200, {
    storageNote: STORAGE_NOTE,
  });
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

  sendHonest(
    res,
    'real',
    {
      items: data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    },
    200,
    { storageNote: STORAGE_NOTE },
  );
});

/**
 * 登出
 * POST /api/user/logout
 */
router.post('/user/logout', authMiddleware, (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) tokens.delete(token);
  sendHonest(res, 'real', { message: '已登出' }, 200, { message: '已登出' });
});

export { authMiddleware, users, tokens };
export default router;
