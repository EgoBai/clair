/**
 * 用户个人中心增强模块
 * 头像管理、偏好设置深度、操作日志、两步验证
 * Round 105-113
 */

import crypto from 'crypto';

// ==================== 头像管理器 ====================
interface AvatarRecord {
  userId: string;
  avatarUrl: string;
  thumbnailUrl: string;
  size: number;
  mimeType: string;
  uploadedAt: number;
  isDefault: boolean;
}

const DEFAULT_AVATARS = [
  'default_avatar_1.png',
  'default_avatar_2.png',
  'default_avatar_3.png',
  'default_avatar_4.png',
  'default_avatar_5.png',
  'default_avatar_6.png',
];

class AvatarManager {
  private avatars = new Map<string, AvatarRecord>();
  private allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  private maxSizeBytes = 5 * 1024 * 1024; // 5MB
  private maxDimension = 2048;

  /**
   * 上传头像
   */
  uploadAvatar(
    userId: string,
    mimeType: string,
    size: number,
    width?: number,
    height?: number
  ): { success: boolean; avatar?: AvatarRecord; message: string } {
    if (!this.allowedTypes.includes(mimeType)) {
      return { success: false, message: '不支持的图片格式，支持 JPEG/PNG/WebP/GIF' };
    }
    if (size > this.maxSizeBytes) {
      return { success: false, message: '图片大小不能超过5MB' };
    }
    if (width && width > this.maxDimension) {
      return { success: false, message: `图片宽度不能超过${this.maxDimension}px` };
    }
    if (height && height > this.maxDimension) {
      return { success: false, message: `图片高度不能超过${this.maxDimension}px` };
    }

    const avatarId = crypto.randomBytes(16).toString('hex');
    const record: AvatarRecord = {
      userId,
      avatarUrl: `/avatars/${userId}/${avatarId}.webp`,
      thumbnailUrl: `/avatars/${userId}/${avatarId}_thumb.webp`,
      size,
      mimeType,
      uploadedAt: Date.now(),
      isDefault: false,
    };

    this.avatars.set(userId, record);
    return { success: true, avatar: record, message: '头像上传成功' };
  }

  /**
   * 设置默认头像
   */
  setDefaultAvatar(userId: string, index: number): { success: boolean; avatar?: AvatarRecord; message: string } {
    if (index < 0 || index >= DEFAULT_AVATARS.length) {
      return { success: false, message: '无效的默认头像索引' };
    }

    const record: AvatarRecord = {
      userId,
      avatarUrl: `/defaults/${DEFAULT_AVATARS[index]}`,
      thumbnailUrl: `/defaults/${DEFAULT_AVATARS[index]}`,
      size: 0,
      mimeType: 'image/png',
      uploadedAt: Date.now(),
      isDefault: true,
    };

    this.avatars.set(userId, record);
    return { success: true, avatar: record, message: '已设置默认头像' };
  }

  /**
   * 获取用户头像
   */
  getAvatar(userId: string): AvatarRecord | undefined {
    return this.avatars.get(userId);
  }

  /**
   * 删除头像（恢复默认）
   */
  removeAvatar(userId: string): boolean {
    return this.avatars.delete(userId);
  }

  /**
   * 获取所有默认头像
   */
  getDefaultAvatars(): string[] {
    return [...DEFAULT_AVATARS];
  }

  /**
   * 验证图片尺寸（裁剪参数）
   */
  validateCropParams(
    x: number, y: number, width: number, height: number,
    imageWidth: number, imageHeight: number
  ): { valid: boolean; message: string } {
    if (x < 0 || y < 0) return { valid: false, message: '裁剪坐标不能为负' };
    if (width < 50 || height < 50) return { valid: false, message: '裁剪区域最小为50x50' };
    if (x + width > imageWidth) return { valid: false, message: '裁剪区域超出图片宽度' };
    if (y + height > imageHeight) return { valid: false, message: '裁剪区域超出图片高度' };
    return { valid: true, message: '裁剪参数有效' };
  }
}

// ==================== 用户偏好设置管理器 ====================
interface UserPreferences {
  // 布局偏好
  layout: {
    sidebarCollapsed: boolean;
    dashboardLayout: 'default' | 'compact' | 'expanded';
    defaultPage: string;
    showQuickActions: boolean;
  };
  // 图表偏好
  chart: {
    defaultType: 'candlestick' | 'line' | 'area' | 'bar';
    defaultPeriod: '1m' | '5m' | '15m' | '30m' | '60m' | 'day' | 'week' | 'month';
    showMA: boolean;
    showVolume: boolean;
    maLines: number[];
    colorScheme: 'redUp' | 'greenUp';
    chartHeight: number;
  };
  // 表格偏好
  table: {
    pageSize: number;
    columns: string[];
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    stickyHeader: boolean;
  };
  // 预警偏好
  alerts: {
    soundEnabled: boolean;
    desktopNotification: boolean;
    defaultThresholdPercent: number;
    autoExpireDays: number;
    maxAlertsPerStock: number;
  };
  // 数据偏好
  data: {
    autoRefresh: boolean;
    refreshInterval: number; // 秒
    dataPrecision: number; // 小数位
    showAfterHours: boolean;
    timezone: string;
  };
}

function defaultPreferences(): UserPreferences {
  return {
    layout: {
      sidebarCollapsed: false,
      dashboardLayout: 'default',
      defaultPage: 'dashboard',
      showQuickActions: true,
    },
    chart: {
      defaultType: 'candlestick',
      defaultPeriod: 'day',
      showMA: true,
      showVolume: true,
      maLines: [5, 10, 20, 60],
      colorScheme: 'redUp',
      chartHeight: 400,
    },
    table: {
      pageSize: 20,
      columns: ['code', 'name', 'price', 'change', 'volume', 'turnover'],
      sortBy: 'change',
      sortOrder: 'desc',
      stickyHeader: true,
    },
    alerts: {
      soundEnabled: true,
      desktopNotification: true,
      defaultThresholdPercent: 5,
      autoExpireDays: 30,
      maxAlertsPerStock: 10,
    },
    data: {
      autoRefresh: true,
      refreshInterval: 5,
      dataPrecision: 2,
      showAfterHours: false,
      timezone: 'Asia/Shanghai',
    },
  };
}

class UserPreferenceManager {
  private preferences = new Map<string, UserPreferences>();

  /**
   * 获取用户偏好（含默认值合并）
   */
  getPreferences(userId: string): UserPreferences {
    const userPrefs = this.preferences.get(userId);
    if (!userPrefs) return defaultPreferences();

    // 深度合并默认值
    return this.deepMerge(defaultPreferences(), userPrefs) as UserPreferences;
  }

  /**
   * 更新偏好（部分更新）
   */
  updatePreferences(
    userId: string,
    updates: Partial<UserPreferences>
  ): UserPreferences {
    const current = this.getPreferences(userId);
    const merged = this.deepMerge(current, updates) as UserPreferences;
    this.preferences.set(userId, merged);
    return merged;
  }

  /**
   * 重置偏好为默认值
   */
  resetPreferences(userId: string): UserPreferences {
    const defaults = defaultPreferences();
    this.preferences.set(userId, defaults);
    return defaults;
  }

  /**
   * 验证偏好值
   */
  validatePreferences(prefs: Partial<UserPreferences>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (prefs.chart) {
      if (prefs.chart.chartHeight !== undefined) {
        if (prefs.chart.chartHeight < 200 || prefs.chart.chartHeight > 1200) {
          errors.push('图表高度应在200-1200之间');
        }
      }
      if (prefs.chart.maLines) {
        if (prefs.chart.maLines.some(v => v < 1 || v > 500)) {
          errors.push('MA周期应在1-500之间');
        }
      }
    }

    if (prefs.table) {
      if (prefs.table.pageSize !== undefined) {
        if (prefs.table.pageSize < 5 || prefs.table.pageSize > 100) {
          errors.push('每页条数应在5-100之间');
        }
      }
    }

    if (prefs.alerts) {
      if (prefs.alerts.defaultThresholdPercent !== undefined) {
        if (prefs.alerts.defaultThresholdPercent < 0.1 || prefs.alerts.defaultThresholdPercent > 50) {
          errors.push('预警阈值应在0.1%-50%之间');
        }
      }
      if (prefs.alerts.maxAlertsPerStock !== undefined) {
        if (prefs.alerts.maxAlertsPerStock < 1 || prefs.alerts.maxAlertsPerStock > 50) {
          errors.push('每只股票最大预警数应在1-50之间');
        }
      }
    }

    if (prefs.data) {
      if (prefs.data.refreshInterval !== undefined) {
        if (prefs.data.refreshInterval < 1 || prefs.data.refreshInterval > 300) {
          errors.push('刷新间隔应在1-300秒之间');
        }
      }
      if (prefs.data.dataPrecision !== undefined) {
        if (prefs.data.dataPrecision < 0 || prefs.data.dataPrecision > 8) {
          errors.push('数据精度应在0-8位之间');
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 导出偏好为JSON
   */
  exportPreferences(userId: string): string {
    return JSON.stringify(this.getPreferences(userId), null, 2);
  }

  /**
   * 从JSON导入偏好
   */
  importPreferences(userId: string, json: string): { success: boolean; message: string } {
    try {
      const prefs = JSON.parse(json);
      const validation = this.validatePreferences(prefs);
      if (!validation.valid) {
        return { success: false, message: validation.errors.join('; ') };
      }
      this.updatePreferences(userId, prefs);
      return { success: true, message: '偏好导入成功' };
    } catch {
      return { success: false, message: '无效的JSON格式' };
    }
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}

// ==================== 操作日志管理器 ====================
interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  category: 'auth' | 'profile' | 'settings' | 'trading' | 'alert' | 'watchlist' | 'system';
  resource?: string;
  detail: string;
  ip: string;
  userAgent: string;
  timestamp: number;
  status: 'success' | 'failure';
  metadata?: Record<string, any>;
}

class AuditLogManager {
  private logs = new Map<string, AuditLogEntry[]>(); // userId -> logs
  private maxLogsPerUser = 1000;

  /**
   * 记录操作日志
   */
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: Date.now(),
    };

    let userLogs = this.logs.get(entry.userId);
    if (!userLogs) {
      userLogs = [];
      this.logs.set(entry.userId, userLogs);
    }

    userLogs.unshift(fullEntry);
    if (userLogs.length > this.maxLogsPerUser) {
      userLogs.length = this.maxLogsPerUser;
    }

    return fullEntry;
  }

  /**
   * 查询日志（支持过滤）
   */
  query(
    userId: string,
    filters?: {
      category?: string;
      action?: string;
      status?: 'success' | 'failure';
      startTime?: number;
      endTime?: number;
      page?: number;
      pageSize?: number;
    }
  ): { items: AuditLogEntry[]; total: number; page: number; pageSize: number } {
    let logs = this.logs.get(userId) || [];

    if (filters) {
      if (filters.category) {
        logs = logs.filter(l => l.category === filters.category);
      }
      if (filters.action) {
        logs = logs.filter(l => l.action === filters.action);
      }
      if (filters.status) {
        logs = logs.filter(l => l.status === filters.status);
      }
      if (filters.startTime) {
        logs = logs.filter(l => l.timestamp >= filters.startTime!);
      }
      if (filters.endTime) {
        logs = logs.filter(l => l.timestamp <= filters.endTime!);
      }
    }

    const total = logs.length;
    const page = filters?.page || 1;
    const pageSize = Math.min(filters?.pageSize || 20, 100);
    const items = logs.slice((page - 1) * pageSize, page * pageSize);

    return { items, total, page, pageSize };
  }

  /**
   * 获取日志统计
   */
  getStats(userId: string): {
    total: number;
    byCategory: Record<string, number>;
    byStatus: { success: number; failure: number };
    recentActions: string[];
  } {
    const logs = this.logs.get(userId) || [];
    const byCategory: Record<string, number> = {};
    let success = 0;
    let failure = 0;

    for (const log of logs) {
      byCategory[log.category] = (byCategory[log.category] || 0) + 1;
      if (log.status === 'success') success++;
      else failure++;
    }

    const recentActions = logs.slice(0, 5).map(l => l.action);

    return { total: logs.length, byCategory, byStatus: { success, failure }, recentActions };
  }

  /**
   * 导出日志为CSV格式
   */
  exportCSV(userId: string, filters?: { startTime?: number; endTime?: number }): string {
    const { items } = this.query(userId, { ...filters, pageSize: 1000 });
    const header = 'ID,用户ID,操作,分类,资源,详情,IP,状态,时间';
    const rows = items.map(item =>
      `${item.id},${item.userId},${item.action},${item.category},${item.resource || ''},${item.detail},${item.ip},${item.status},${new Date(item.timestamp).toISOString()}`
    );
    return [header, ...rows].join('\n');
  }

  /**
   * 清除用户日志
   */
  clearLogs(userId: string): number {
    const count = this.logs.get(userId)?.length || 0;
    this.logs.delete(userId);
    return count;
  }

  /**
   * 获取安全事件（登录失败等）
   */
  getSecurityEvents(userId: string, hours = 24): AuditLogEntry[] {
    const cutoff = Date.now() - hours * 3600 * 1000;
    const logs = this.logs.get(userId) || [];
    return logs.filter(
      l => l.timestamp > cutoff &&
        (l.category === 'auth' && l.status === 'failure' ||
         l.action.includes('lock') ||
         l.action.includes('suspicious'))
    );
  }
}

// ==================== 两步验证管理器 (TOTP) ====================
interface TOTPSecret {
  userId: string;
  secret: string;
  backupCodes: string[];
  enabled: boolean;
  createdAt: number;
  lastUsedAt?: number;
  verifiedAt?: number;
}

interface TOTPVerification {
  userId: string;
  code: string;
  timestamp: number;
  valid: boolean;
}

class TwoFactorManager {
  private secrets = new Map<string, TOTPSecret>();
  private usedCodes = new Map<string, Set<string>>(); // userId -> used codes (防重放)
  private codeWindow = 30; // 30秒窗口
  private codeDigits = 6;
  private backupCodeCount = 10;

  /**
   * 生成 TOTP 密钥
   */
  generateSecret(userId: string): { secret: string; qrUrl: string; backupCodes: string[] } {
    // 生成16字节随机密钥
    const secret = crypto.randomBytes(16).toString('base64').replace(/=/g, '');
    const backupCodes = this.generateBackupCodes();

    const record: TOTPSecret = {
      userId,
      secret,
      backupCodes: [...backupCodes],
      enabled: false,
      createdAt: Date.now(),
    };

    this.secrets.set(userId, record);

    // 生成 otpauth URL（兼容 Google Authenticator）
    const otpUrl = `otpauth://totp/AStock:${userId}?secret=${secret}&issuer=AStock&algorithm=SHA1&digits=${this.codeDigits}&period=${this.codeWindow}`;

    return { secret, qrUrl: otpUrl, backupCodes };
  }

  /**
   * 验证 TOTP 码并启用两步验证
   */
  verifyAndEnable(userId: string, code: string): { success: boolean; message: string } {
    const record = this.secrets.get(userId);
    if (!record) {
      return { success: false, message: '请先生成密钥' };
    }

    if (!this.validateTOTPFormat(code)) {
      return { success: false, message: '验证码格式不正确' };
    }

    // 验证 TOTP 码（允许前后各一个窗口的偏差）
    const isValid = this.verifyCode(record.secret, code);
    if (!isValid) {
      return { success: false, message: '验证码不正确' };
    }

    record.enabled = true;
    record.verifiedAt = Date.now();

    return { success: true, message: '两步验证已启用' };
  }

  /**
   * 验证登录时的两步验证
   */
  verifyLogin(userId: string, code: string): { success: boolean; message: string; method: 'totp' | 'backup' } {
    const record = this.secrets.get(userId);
    if (!record || !record.enabled) {
      return { success: false, message: '两步验证未启用', method: 'totp' };
    }

    // 防重放攻击
    const usedSet = this.usedCodes.get(userId) || new Set<string>();
    if (usedSet.has(code)) {
      return { success: false, message: '验证码已被使用', method: 'totp' };
    }

    // 尝试 TOTP 验证
    if (this.validateTOTPFormat(code) && this.verifyCode(record.secret, code)) {
      usedSet.add(code);
      this.usedCodes.set(userId, usedSet);
      record.lastUsedAt = Date.now();
      return { success: true, message: '验证成功', method: 'totp' };
    }

    // 尝试备用码
    const backupIndex = record.backupCodes.indexOf(code);
    if (backupIndex !== -1) {
      record.backupCodes.splice(backupIndex, 1); // 一次性使用
      record.lastUsedAt = Date.now();
      return { success: true, message: '备用码验证成功', method: 'backup' };
    }

    return { success: false, message: '验证码不正确', method: 'totp' };
  }

  /**
   * 禁用两步验证
   */
  disable(userId: string): boolean {
    return this.secrets.delete(userId);
  }

  /**
   * 检查是否启用
   */
  isEnabled(userId: string): boolean {
    return this.secrets.get(userId)?.enabled ?? false;
  }

  /**
   * 重新生成备用码
   */
  regenerateBackupCodes(userId: string): { success: boolean; codes?: string[]; message: string } {
    const record = this.secrets.get(userId);
    if (!record || !record.enabled) {
      return { success: false, message: '两步验证未启用' };
    }

    const newCodes = this.generateBackupCodes();
    record.backupCodes = [...newCodes];
    return { success: true, codes: newCodes, message: '备用码已重新生成' };
  }

  /**
   * 获取剩余备用码数量
   */
  getRemainingBackupCodes(userId: string): number {
    return this.secrets.get(userId)?.backupCodes.length ?? 0;
  }

  /**
   * 生成 TOTP 码（测试用）
   */
  generateTOTP(secret: string, time?: number): string {
    const t = Math.floor((time || Date.now()) / 1000 / this.codeWindow);
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base64'));
    hmac.update(this.intToBytes(t));
    const hash = hmac.digest();

    const offset = hash[hash.length - 1] & 0x0f;
    const code = (
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)
    ) % Math.pow(10, this.codeDigits);

    return code.toString().padStart(this.codeDigits, '0');
  }

  private verifyCode(secret: string, code: string): boolean {
    const now = Date.now();
    // 允许前后各一个窗口
    for (const offset of [-1, 0, 1]) {
      const testTime = now + offset * this.codeWindow * 1000;
      const expectedCode = this.generateTOTP(secret, testTime);
      if (expectedCode === code) return true;
    }
    return false;
  }

  private validateTOTPFormat(code: string): boolean {
    return new RegExp(`^\\d{${this.codeDigits}}$`).test(code);
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < this.backupCodeCount; i++) {
      // 格式: XXXX-XXXX
      const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      codes.push(`${part1}-${part2}`);
    }
    return codes;
  }

  private intToBytes(num: number): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(0, 0);
    buf.writeUInt32BE(num, 4);
    return buf;
  }
}

// ==================== 个人中心统计 ====================
interface UserActivityStats {
  userId: string;
  totalLogins: number;
  lastLoginAt: number;
  totalActions: number;
  stocksViewed: number;
  alertsCreated: number;
  watchlistSize: number;
  backtestsRun: number;
  daysActive: number;
  averageSessionMinutes: number;
  favoriteCategories: { category: string; count: number }[];
}

class UserStatsManager {
  private stats = new Map<string, UserActivityStats>();

  recordLogin(userId: string): void {
    let s = this.stats.get(userId);
    if (!s) {
      s = this.createDefaultStats(userId);
      this.stats.set(userId, s);
    }
    s.totalLogins++;
    s.lastLoginAt = Date.now();
  }

  recordAction(userId: string, category: string): void {
    let s = this.stats.get(userId);
    if (!s) {
      s = this.createDefaultStats(userId);
      this.stats.set(userId, s);
    }
    s.totalActions++;
  }

  getStats(userId: string): UserActivityStats {
    return this.stats.get(userId) || this.createDefaultStats(userId);
  }

  updateStats(userId: string, updates: Partial<UserActivityStats>): UserActivityStats {
    let s = this.stats.get(userId);
    if (!s) {
      s = this.createDefaultStats(userId);
      this.stats.set(userId, s);
    }
    Object.assign(s, updates);
    return s;
  }

  private createDefaultStats(userId: string): UserActivityStats {
    return {
      userId,
      totalLogins: 0,
      lastLoginAt: 0,
      totalActions: 0,
      stocksViewed: 0,
      alertsCreated: 0,
      watchlistSize: 0,
      backtestsRun: 0,
      daysActive: 0,
      averageSessionMinutes: 0,
      favoriteCategories: [],
    };
  }
}

// 导出
export const avatarManager = new AvatarManager();
export const preferenceManager = new UserPreferenceManager();
export const auditLogManager = new AuditLogManager();
export const twoFactorManager = new TwoFactorManager();
export const userStatsManager = new UserStatsManager();

export {
  AvatarManager,
  UserPreferenceManager,
  AuditLogManager,
  TwoFactorManager,
  UserStatsManager,
  type AvatarRecord,
  type UserPreferences,
  type AuditLogEntry,
  type TOTPSecret,
  type UserActivityStats,
};
