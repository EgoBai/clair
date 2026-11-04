/**
 * 用户中心影子测试 -> 生产契约测试（个人资料 / 头像 / 偏好 / 操作日志 / 两步验证 /
 * 登录安全 / 通知偏好 / 响应式 / 可访问性）。
 *
 * 一、原自抄实现的问题
 * 1. 868 行全部内联自造：formatProfileDate、accountAge、uploadAvatar 校验、偏好选项、
 *    CATEGORY_CONFIG、formatLogTime、两步验证向导/formatCode、passwordStrength、
 *    isInQuietHours、设置页布局等，全部是测试文件里另写一套，与生产实现没有调用关系；
 *    生产改阈值、改文案、改字段名时这些用例仍然全绿。
 * 2. 墙钟与随机依赖：:29 new Date(dateStr)、:35 无参 new Date、:48/54/60/365/366/367/418
 *    Date.now、:362 new Date(timestamp)、:412 new Date(log.timestamp).toLocaleDateString、
 *    :547 new Date.toLocaleString()，结果随运行时刻/时区漂移。
 * 3. 旧断言与生产不一致（逐条在用例内注释旧断言错在哪），主要有：
 *    - 账户年龄字段名 alertsActive，生产 UserActivityStats 是 alertsCreated；
 *    - 头像默认项是 6 个色块名/颜色，生产只有 default_avatar_1..6.png 文件名；
 *    - 上传失败文案 '不支持的格式'/'文件过大'，生产是
 *      '不支持的图片格式，支持 JPEG/PNG/WebP/GIF'/'图片大小不能超过5MB'；
 *    - 头像裁剪强制 1:1，生产 validateCropParams 只校验坐标非负、最小 50x50、越界；
 *    - 偏好里 theme/language 字段生产 UserPreferences 不存在；
 *    - 日志时间阈值 1 分钟，生产 formatRelativeTime 是 5 分钟；
 *    - 日志搜索 detail.includes，生产 query 只按 action 精确匹配；
 *    - 备用码正则 [A-Z0-9]，生产只生成大写十六进制 [0-9A-F]；
 *    - 密码强度 0-5 打分与 极弱/弱/一般/强/很强，生产 validatePassword 只返回 errors；
 *    - WCAG 比值硬编码 4.6/4.5/4.8（自抄实现配合造假），生产 checkContrast 实测
 *      2.21/2.99/2.95/1.83，均不满足 AA normal；
 *    - 通知渠道含 wechat、事件含 weekly_report/security，生产 NotificationChannel 无 wechat，
 *      NotificationType 9 类也不含这两类。
 *
 * 二、绑定生产实现（file:line 与选型理由）
 * - backend/src/utils/userDeepDive.ts:759-763（头像/偏好/操作日志/两步验证/用户统计单例）
 *   :38 uploadAvatar、:76 setDefaultAvatar、:112 getDefaultAvatars、:119 validateCropParams、
 *   :223 getPreferences、:234 updatePreferences、:247 resetPreferences、:256 validatePreferences、
 *   :368 log、:392 query、:435 getStats、:460 exportCSV、:481 getSecurityEvents、
 *   :521 generateSecret、:545 verifyAndEnable、:570 verifyLogin、:611 isEnabled、
 *   :632 getRemainingBackupCodes、:639 generateTOTP、:708 recordLogin、:727 getStats、:731 updateStats。
 *   选型理由：个人中心的唯一生产实现；文件顶部只 import crypto，无浏览器第三方依赖，
 *   D43（frontend CI 只装 backend 依赖）下可解析，本轮已实测 vitest 可跨包加载。
 * - backend/src/utils/userEnhanced.ts:547 sessionManager：:283 createSession、:352 getUserSessions、
 *   :390 destroyOtherSessions、:409 destroyAllUserSessions。选型理由：userDeepDive 无设备会话管理，
 *   userEnhanced 顶部同样只 import crypto。
 * - backend/src/services/notification/types.ts:5/18/63（NotificationType/NotificationChannel/
 *   NotificationPreferences，纯类型零依赖）与 templates.ts:78 DEFAULT_TEMPLATES（只 import ./types）。
 *   选型理由：事件配置的真源；未选 notification/service.ts，该模块会拉入 channels.ts 的第三方依赖。
 * - frontend/src/utils/securityEngine.ts:192 validatePassword。选型理由：同语义的
 *   backend/src/middleware/auth.ts 在模块加载时解析 JWT_SECRET（缺失即 throw）且 import express，
 *   frontend CI 不可用；securityEngine 是前端可用的纯函数。
 * - frontend/src/utils/formatters.ts:70 formatDate、:266 formatRelativeTime。选型理由：同语义另有
 *   enhancedFormatters.ts:9（需 Locale 且 import '../i18n'）、i18nEngine.ts:376（需 locale）、
 *   i18nManager.ts:176（Intl 输出"1分钟前"、支持未来时态、无 5 分钟"刚刚"阈值）。旧用例描述的是
 *   日志时间轴（刚刚/分钟前/小时前/日期），只有 formatters 版形状与阈值对得上。
 * - frontend/src/utils/responsiveUtils.ts:58 getCurrentBreakpoint、:70 isBelow、:77 isAbove、
 *   :84 responsiveValue、:99 getGridConfig。选型理由：唯一纯函数断点/栅格实现。
 * - frontend/src/utils/scrollInteractionEngine.ts:149 InfiniteScrollController（:176 shouldTrigger、
 *   :199 loadSuccess、:262 getPagination）。选型理由：默认 threshold 200/pageSize 20 正是旧断言字段；
 *   shouldTrigger 接受显式 now，天然确定性。
 * - frontend/src/utils/a11yEngine.ts:70 createAriaAttributes、:344 createAnnouncement、
 *   :399 createFocusTrap、:58 FocusManagementOptions。
 * - frontend/src/utils/accessibility.ts:18 ariaLabel、:137 checkContrast。选型理由：同语义另有
 *   a11yEngine.ts:213 checkColorContrast，但 checkContrast 返回 ratio/passes/required，正是旧用例
 *   "是否满足 WCAG"的形状，且旧断言硬编码比值，必须用生产计算订正。
 *
 * 三、未迁移清单及原因
 * - accountAge（天/月/年）：生产只有 userStatsManager.lastLoginAt，没有账户年龄导出。
 * - 头像首字母/头像取色：生产无导出（纯 UI 派生）。
 * - 裁剪比例 1:1/4:3/16:9：生产 validateCropParams 只校验尺寸与越界，不校验比例，故按生产语义断言。
 * - theme/language 选项：生产 UserPreferences 无这两个字段（后端 api/user.ts 的 settings 另属，
 *   该模块 import express/bcrypt 且加载即挂 router，拒绝引入）。
 * - K 线周期的 minutes 映射：生产只有 defaultPeriod 字符串联合类型，无分钟映射。
 * - action 到中文文案映射、日志分类图标、失败日志高亮色：生产 action 是自由字符串，图标/颜色纯 UI。
 * - 按 detail 关键词搜索：生产 auditLogManager.query 只支持 action 精确匹配，无全文搜索契约。
 * - 两步验证向导步骤、formatCode、autoSubmit、复制备用码、下载文本、App 推荐：生产无对应导出；
 *   validateTOTPFormat 是私有方法（userDeepDive.ts:667），只能通过 verifyAndEnable 间接验证。
 * - 密码 0-5 打分与中文标签：生产 validatePassword 只给 errors。
 * - 改密 24 小时冷却：userEnhanced.loginSecurityManager 只有登录失败锁定，没有改密冷却。
 * - 通知免打扰判断：subscriptionManager.ts:269 isInQuietHours 是 private 且内部无参 new Date
 *   取墙钟，无法从测试调用；保留内联纯函数（显式传当前时刻），断言语义与生产跨午夜分支一致。
 * - 通知频率三档（realtime/hourly/daily）与渠道默认开关：生产只有 dailyDigest/maxDailyNotifications
 *   与模板 defaultChannels，无该枚举。
 * - 响应式 tabPosition/maxWidth/表单纵向布局：纯组件布局，生产只有断点与栅格。
 * - 昵称/个人简介校验：backend/src/api/user.ts:273 有昵称规则，但该模块 import express/bcrypt、
 *   加载即挂 router，frontend CI 不可引入，保留内联（文案与生产一致）。
 *
 * 四、确定性约定
 * - 时间基准 FIXED_NOW 用带参 new Date(2025, 0, 15, 10, 30, 0) 本地构造，相对时间用例用
 *   vi.setSystemTime 固定，afterEach 还原真实时钟。
 * - 生产单例（Map 存储）跨用例共享：每个 it 使用独立 userId，避免顺序耦合。
 * - TOTP 用例不用假时钟（生产 verifyCode 读 Date.now），generateTOTP 与 verifyAndEnable
 *   在同一 30 秒窗口内调用，且 verifyCode 回看前一窗口。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  avatarManager,
  preferenceManager,
  auditLogManager,
  twoFactorManager,
  userStatsManager,
  type AuditLogEntry,
  type UserPreferences,
} from '../../../backend/src/utils/userDeepDive';
import { sessionManager } from '../../../backend/src/utils/userEnhanced';
import { DEFAULT_TEMPLATES } from '../../../backend/src/services/notification/templates';
import type {
  NotificationChannel,
  NotificationPreferences,
  NotificationType,
} from '../../../backend/src/services/notification/types';
import { validatePassword } from '../utils/securityEngine';
import { formatDate, formatRelativeTime } from '../utils/formatters';
import {
  getCurrentBreakpoint,
  getGridConfig,
  isAbove,
  isBelow,
  responsiveValue,
} from '../utils/responsiveUtils';
import { InfiniteScrollController } from '../utils/scrollInteractionEngine';
import { ariaLabel, checkContrast } from '../utils/accessibility';
import {
  createAnnouncement,
  createAriaAttributes,
  createFocusTrap,
  type FocusManagementOptions,
} from '../utils/a11yEngine';

const FIXED_NOW = new Date(2025, 0, 15, 10, 30, 0).getTime();
const NL = String.fromCharCode(10);

afterEach(() => {
  vi.useRealTimers();
});

// ==================== 内联纯函数（生产无同契约导出，见文件头第三节） ====================

function accountAge(createdAt: number, now: number): string {
  const days = Math.floor((now - createdAt) / 86400000);
  if (days < 30) return days + '天';
  if (days < 365) return Math.floor(days / 30) + '个月';
  return Math.floor(days / 365) + '年' + Math.floor((days % 365) / 30) + '个月';
}

function avatarInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? Array.from(trimmed)[0].toUpperCase() : '?';
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return '#' + (hash % 0xffffff).toString(16).padStart(6, '0');
}

function validateNickname(value: string): string | null {
  if (value.length < 2) return '昵称至少2个字符';
  if (value.length > 20) return '昵称最多20个字符';
  if (!/^[^!@#$%^&*]+$/.test(value)) return '昵称只能包含中文、字母、数字和下划线';
  return null;
}

function validateBio(value: string): string | null {
  return value.length > 200 ? '个人简介不能超过200个字符' : null;
}

function formatCode(raw: string): string {
  const digits = raw
    .split('')
    .filter((ch) => ch >= '0' && ch <= '9')
    .slice(0, 6)
    .join('');
  return digits.length > 3 ? digits.slice(0, 3) + ' ' + digits.slice(3) : digits;
}

function shouldAutoSubmit(raw: string): boolean {
  return formatCode(raw).replace(' ', '').length === 6;
}

function buildBackupCodesText(codes: string[], generatedAt: string): string {
  return ['两步验证备用码', '生成时间：' + generatedAt, '', ...codes, '', '每个备用码只能使用一次。'].join(NL);
}

function backupCodeWarning(remaining: number): { level: 'error' | 'warning' | null; message: string } {
  if (remaining === 0) return { level: 'error', message: '备用码已用完，请重新生成' };
  if (remaining <= 2) return { level: 'warning', message: '仅剩' + remaining + '个备用码' };
  return { level: null, message: '' };
}

function isInQuietHours(start: string, end: string, current: string): boolean {
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function canChangePassword(lastChangedAt: number, now: number): boolean {
  return now - lastChangedAt >= 24 * 3600000;
}

// ==================== 1. 个人信息展示 ====================

describe('个人中心 - 个人信息展示（绑定 userStatsManager / formatters）', () => {
  it('应格式化注册日期（生产 formatters.ts:70 固定 yyyy-MM-dd）', () => {
    // 旧断言用 toLocaleDateString('zh-CN') 断言含 '2024'，锁定的是自抄的 long 格式；
    // 生产 formatDate 只有 yyyy-MM-dd，长日期格式不是生产契约。
    expect(formatDate('2024-01-15T12:00:00')).toBe('2024-01-15');
    expect(formatDate(null)).toBe('--');
  });

  it('应计算账户年龄-天（生产无同契约导出，内联纯函数显式传 now）', () => {
    expect(accountAge(FIXED_NOW - 3 * 86400000, FIXED_NOW)).toBe('3天');
  });

  it('应计算账户年龄-月（生产无同契约导出）', () => {
    expect(accountAge(FIXED_NOW - 90 * 86400000, FIXED_NOW)).toBe('3个月');
  });

  it('应计算账户年龄-年（生产无同契约导出）', () => {
    expect(accountAge(FIXED_NOW - 730 * 86400000, FIXED_NOW)).toBe('2年0个月');
    expect(accountAge(FIXED_NOW - 800 * 86400000, FIXED_NOW)).toBe('2年2个月');
  });

  it('应生成用户统计数据标签（绑定 userStatsManager，字段名以生产为准）', () => {
    // 旧断言断言 stats.alertsActive，生产 UserActivityStats 字段是 alertsCreated
    // （backend/src/utils/userDeepDive.ts:741 起的 createDefaultStats）。
    userStatsManager.updateStats('dd_stats_user', {
      totalLogins: 150,
      stocksViewed: 500,
      watchlistSize: 30,
      alertsCreated: 8,
      backtestsRun: 12,
    });
    const stats = userStatsManager.getStats('dd_stats_user');
    const items = [
      { key: 'totalLogins', label: '登录次数', value: stats.totalLogins },
      { key: 'stocksViewed', label: '浏览股票', value: stats.stocksViewed },
      { key: 'watchlistSize', label: '自选股', value: stats.watchlistSize },
      { key: 'alertsCreated', label: '活跃预警', value: stats.alertsCreated },
      { key: 'backtestsRun', label: '回测次数', value: stats.backtestsRun },
    ];
    expect(items).toHaveLength(5);
    expect(items[0]).toEqual({ key: 'totalLogins', label: '登录次数', value: 150 });
    expect(stats.alertsCreated).toBe(8);
    userStatsManager.recordLogin('dd_stats_user');
    expect(userStatsManager.getStats('dd_stats_user').totalLogins).toBe(151);
  });

  it('应处理缺失个人信息（纯 UI 兜底，生产无同契约）', () => {
    const displayName = (profile: { displayName?: string }): string => profile.displayName?.trim() || '用户';
    expect(displayName({ displayName: '   ' })).toBe('用户');
    expect(displayName({ displayName: '张三' })).toBe('张三');
  });

  it('应验证个人资料编辑表单（生产在 api/user.ts:273 但该模块 import express 不可引入）', () => {
    expect(validateNickname('a')).toBe('昵称至少2个字符');
    expect(validateNickname('张三')).toBeNull();
    expect(validateNickname('张三!')).toBe('昵称只能包含中文、字母、数字和下划线');
    expect(validateNickname('a'.repeat(21))).toBe('昵称最多20个字符');
  });

  it('应验证个人简介长度（生产无同契约）', () => {
    expect(validateBio('a'.repeat(200))).toBeNull();
    expect(validateBio('a'.repeat(201))).toBe('个人简介不能超过200个字符');
  });
});

// ==================== 2. 头像管理 ====================

describe('头像管理（绑定 avatarManager）', () => {
  it('应生成默认头像选项（生产只有文件名，不是色块名/颜色）', () => {
    // 旧断言是 6 个色块名（深蓝/翠绿/...）与颜色值，生产 DEFAULT_AVATARS
    // （userDeepDive.ts:20-27）只有 default_avatar_1..6.png。
    const defaults = avatarManager.getDefaultAvatars();
    expect(defaults).toHaveLength(6);
    expect(defaults[0]).toBe('default_avatar_1.png');
    const result = avatarManager.setDefaultAvatar('dd_avatar_default', 0);
    expect(result.success).toBe(true);
    expect(result.avatar?.avatarUrl).toBe('/defaults/default_avatar_1.png');
    expect(result.avatar?.isDefault).toBe(true);
  });

  it('应拒绝无效的默认头像索引（生产 :77-79）', () => {
    const result = avatarManager.setDefaultAvatar('dd_avatar_bad_index', 6);
    expect(result.success).toBe(false);
    expect(result.message).toBe('无效的默认头像索引');
  });

  it('应验证上传文件类型与大小（生产文案与旧断言不同）', () => {
    // 旧断言是 '不支持的格式' / '文件过大'；生产 uploadAvatar（:45-50）文案如下。
    const badType = avatarManager.uploadAvatar('dd_avatar_bad', 'image/svg+xml', 1024);
    expect(badType.success).toBe(false);
    expect(badType.message).toBe('不支持的图片格式，支持 JPEG/PNG/WebP/GIF');
    expect(avatarManager.uploadAvatar('dd_avatar_big', 'image/png', 6 * 1024 * 1024).message).toBe(
      '图片大小不能超过5MB'
    );
    expect(avatarManager.uploadAvatar('dd_avatar_wide', 'image/png', 1024, 2049, 100).message).toBe(
      '图片宽度不能超过2048px'
    );
    const ok = avatarManager.uploadAvatar('dd_avatar_ok', 'image/png', 1024, 800, 600);
    expect(ok.success).toBe(true);
    expect(ok.avatar?.avatarUrl.startsWith('/avatars/dd_avatar_ok/')).toBe(true);
    expect(ok.avatar?.avatarUrl.slice('/avatars/dd_avatar_ok/'.length)).toMatch(/^[0-9a-f]{32}[.]webp$/);
    expect(ok.avatar?.thumbnailUrl.endsWith('_thumb.webp')).toBe(true);
    expect(ok.avatar?.mimeType).toBe('image/png');
    expect(ok.avatar?.isDefault).toBe(false);
    expect(typeof ok.avatar?.uploadedAt).toBe('number');
  });

  it('应生成头像首字母（生产无导出）', () => {
    expect(avatarInitial('张三')).toBe('张');
    expect(avatarInitial('Alice')).toBe('A');
    expect(avatarInitial('')).toBe('?');
  });

  it('应生成头像颜色（生产无导出，确定性哈希）', () => {
    expect(avatarColor('张三')).toMatch(/^#[0-9a-f]{6}$/);
    expect(avatarColor('张三')).toBe(avatarColor('张三'));
  });

  it('应预览裁剪框（生产 validateCropParams 不强制 1:1）', () => {
    // 旧断言假定生产强制 1:1；生产 :119-127 只校验坐标非负、最小 50x50、越界。
    expect(avatarManager.validateCropParams(50, 50, 200, 200, 400, 400)).toEqual({
      valid: true,
      message: '裁剪参数有效',
    });
    expect(avatarManager.validateCropParams(0, 0, 300, 200, 400, 400).valid).toBe(true);
    expect(avatarManager.validateCropParams(-1, 0, 100, 100, 400, 400).message).toBe('裁剪坐标不能为负');
    expect(avatarManager.validateCropParams(0, 0, 49, 100, 400, 400).message).toBe('裁剪区域最小为50x50');
    expect(avatarManager.validateCropParams(300, 300, 200, 200, 400, 400).message).toBe(
      '裁剪区域超出图片宽度'
    );
  });

  it('应支持头像裁剪比例（比例映射为内联 UI 计算，落点走生产校验）', () => {
    const ratios = [
      { name: '1:1', width: 200, height: 200 },
      { name: '4:3', width: 300, height: 225 },
      { name: '16:9', width: 320, height: 180 },
    ];
    ratios.forEach((ratio) => {
      expect(avatarManager.validateCropParams(0, 0, ratio.width, ratio.height, 800, 600).valid).toBe(true);
    });
    expect(ratios).toHaveLength(3);
  });
});

// ==================== 3. 偏好设置 ====================

describe('偏好设置（绑定 preferenceManager / UserPreferences）', () => {
  it('应有主题选项（生产 UserPreferences 无 theme 字段，保留 UI 内联）', () => {
    const themeOptions = ['light', 'dark', 'system'];
    expect(themeOptions).toHaveLength(3);
    expect(themeOptions).toContain('system');
  });

  it('应有 K 线周期选项（8 档取值受生产 defaultPeriod 联合类型约束）', () => {
    const periods: Array<{ value: UserPreferences['chart']['defaultPeriod']; minutes: number }> = [
      { value: '1m', minutes: 1 },
      { value: '5m', minutes: 5 },
      { value: '15m', minutes: 15 },
      { value: '30m', minutes: 30 },
      { value: '60m', minutes: 60 },
      { value: 'day', minutes: 1440 },
      { value: 'week', minutes: 10080 },
      { value: 'month', minutes: 43200 },
    ];
    expect(periods).toHaveLength(8);
    expect(periods.find((p) => p.value === 'day')?.minutes).toBe(1440);
    expect(preferenceManager.getPreferences('dd_prefs_period').chart.defaultPeriod).toBe('day');
  });

  it('应有图表类型选项（生产默认 candlestick）', () => {
    const types: UserPreferences['chart']['defaultType'][] = ['candlestick', 'line', 'area', 'bar'];
    expect(types).toHaveLength(4);
    const user = 'dd_prefs_type';
    const base = preferenceManager.getPreferences(user);
    expect(base.chart.defaultType).toBe('candlestick');
    const updated = preferenceManager.updatePreferences(user, { chart: { ...base.chart, defaultType: 'line' } });
    expect(updated.chart.defaultType).toBe('line');
  });

  it('应有配色方案（生产默认 redUp，可切 greenUp）', () => {
    const user = 'dd_prefs_color';
    const base = preferenceManager.getPreferences(user);
    expect(base.chart.colorScheme).toBe('redUp');
    expect(
      preferenceManager.updatePreferences(user, { chart: { ...base.chart, colorScheme: 'greenUp' } }).chart.colorScheme
    ).toBe('greenUp');
  });

  it('应有表格页面大小选项（生产默认 20，合法区间 5-100）', () => {
    const user = 'dd_prefs_pagesize';
    const base = preferenceManager.getPreferences(user);
    expect(base.table.pageSize).toBe(20);
    [10, 20, 50, 100].forEach((size) => {
      expect(preferenceManager.validatePreferences({ table: { ...base.table, pageSize: size } }).valid).toBe(true);
    });
    const invalid = preferenceManager.validatePreferences({ table: { ...base.table, pageSize: 4 } });
    expect(invalid.errors).toContain('每页条数应在5-100之间');
  });

  it('应有刷新间隔选项（生产默认 5 秒，区间 1-300）', () => {
    const user = 'dd_prefs_refresh';
    const base = preferenceManager.getPreferences(user);
    expect(base.data.refreshInterval).toBe(5);
    expect(preferenceManager.validatePreferences({ data: { ...base.data, refreshInterval: 0 } }).errors).toContain(
      '刷新间隔应在1-300秒之间'
    );
    expect(preferenceManager.validatePreferences({ data: { ...base.data, refreshInterval: 301 } }).errors).toContain(
      '刷新间隔应在1-300秒之间'
    );
  });

  it('应有 MA 线选项（生产默认 [5,10,20,60]，区间 1-500）', () => {
    const user = 'dd_prefs_ma';
    const base = preferenceManager.getPreferences(user);
    expect(base.chart.maLines).toEqual([5, 10, 20, 60]);
    expect(preferenceManager.validatePreferences({ chart: { ...base.chart, maLines: [0, 10] } }).errors).toContain(
      'MA周期应在1-500之间'
    );
  });

  it('应有数据精度选项（生产默认 2，区间 0-8）', () => {
    const user = 'dd_prefs_precision';
    const base = preferenceManager.getPreferences(user);
    expect(base.data.dataPrecision).toBe(2);
    expect(preferenceManager.validatePreferences({ data: { ...base.data, dataPrecision: -1 } }).errors).toContain(
      '数据精度应在0-8位之间'
    );
    expect(preferenceManager.validatePreferences({ data: { ...base.data, dataPrecision: 9 } }).errors).toContain(
      '数据精度应在0-8位之间'
    );
  });

  it('应有语言选项（生产 UserPreferences 无 language 字段，保留 UI 内联）', () => {
    expect(['zh-CN', 'en-US']).toHaveLength(2);
    expect(['zh-CN', 'en-US']).toContain('zh-CN');
  });

  it('应有默认页面选项（生产默认 dashboard，可持久化切换）', () => {
    const user = 'dd_prefs_default_page';
    const base = preferenceManager.getPreferences(user);
    expect(base.layout.defaultPage).toBe('dashboard');
    expect(
      preferenceManager.updatePreferences(user, { layout: { ...base.layout, defaultPage: 'stocks' } }).layout.defaultPage
    ).toBe('stocks');
  });

  it('应支持偏好变更检测（深合并后 JSON 可比较）', () => {
    const user = 'dd_prefs_change';
    const before = preferenceManager.getPreferences(user);
    preferenceManager.updatePreferences(user, { chart: { ...before.chart, chartHeight: 500 } });
    const after = preferenceManager.getPreferences(user);
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
    expect(after.chart.chartHeight).toBe(500);
  });

  it('应检测无变更并支持重置（空更新深合并等价默认值）', () => {
    const user = 'dd_prefs_same';
    const before = preferenceManager.getPreferences(user);
    const merged = preferenceManager.updatePreferences(user, {});
    expect(JSON.stringify(merged)).toBe(JSON.stringify(before));
    const reset = preferenceManager.resetPreferences(user);
    expect(JSON.stringify(reset)).toBe(JSON.stringify(before));
  });
});

// ==================== 4. 操作日志 ====================

const LOG_CATEGORIES: AuditLogEntry['category'][] = [
  'auth',
  'profile',
  'settings',
  'trading',
  'alert',
  'watchlist',
  'system',
];

const CATEGORY_CONFIG: Record<AuditLogEntry['category'], { label: string; icon: string }> = {
  auth: { label: '认证', icon: '🔐' },
  profile: { label: '个人', icon: '👤' },
  settings: { label: '设置', icon: '⚙️' },
  trading: { label: '交易', icon: '💹' },
  alert: { label: '预警', icon: '🔔' },
  watchlist: { label: '自选', icon: '⭐' },
  system: { label: '系统', icon: '🖥' },
};

describe('操作日志（绑定 auditLogManager）', () => {
  it('应有完整分类配置（生产 category 为 7 类联合类型）', () => {
    expect(Object.keys(CATEGORY_CONFIG)).toHaveLength(7);
    expect(CATEGORY_CONFIG.auth.label).toBe('认证');
    const userId = 'dd_log_category';
    LOG_CATEGORIES.forEach((category, index) => {
      auditLogManager.log({
        userId,
        action: 'action_' + index,
        category,
        detail: '分类探针' + index,
        ip: '127.0.0.1',
        userAgent: 'vitest',
        status: 'success',
      });
    });
    const stats = auditLogManager.getStats(userId);
    expect(Object.keys(stats.byCategory).sort()).toEqual([...LOG_CATEGORIES].sort());
  });

  it('应格式化日志时间（生产阈值 5 分钟，旧断言按 1 分钟算）', () => {
    // 旧内联 formatLogTime 阈值 1 分钟；生产 formatters.ts:266 是 5 分钟，
    // 因此 4 分钟前生产仍返回 '刚刚'，旧实现会返回 '4分钟前'。
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    expect(formatRelativeTime(FIXED_NOW - 30 * 1000)).toBe('刚刚');
    expect(formatRelativeTime(FIXED_NOW - 4 * 60 * 1000)).toBe('刚刚');
    expect(formatRelativeTime(FIXED_NOW - 5 * 60 * 1000)).toBe('5分钟前');
    expect(formatRelativeTime(FIXED_NOW - 2 * 3600 * 1000)).toBe('2小时前');
    expect(formatRelativeTime(new Date(2024, 11, 31, 12, 0, 0))).toBe('2024-12-31');
  });

  it('应生成日志筛选选项（选项为 UI 内联，过滤能力走生产 query）', () => {
    const timeRanges = ['1h', '24h', '7d', '30d', 'all'];
    expect(timeRanges).toHaveLength(5);
    expect(Object.keys(CATEGORY_CONFIG)).toHaveLength(7);
    expect(['success', 'failure']).toHaveLength(2);
  });

  it('应支持日志筛选查询（生产 query 的 category/status/time/page）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const userId = 'dd_log_filter';
    const base = {
      userId,
      detail: '筛选探针',
      ip: '10.0.0.1',
      userAgent: 'vitest',
      resource: '',
    };
    auditLogManager.log({ ...base, action: 'login', category: 'auth', status: 'success' });
    auditLogManager.log({ ...base, action: 'logout', category: 'auth', status: 'failure' });
    auditLogManager.log({ ...base, action: 'view_stock', category: 'trading', status: 'success' });
    expect(auditLogManager.query(userId, { category: 'auth' }).total).toBe(2);
    expect(auditLogManager.query(userId, { status: 'failure' }).total).toBe(1);
    expect(auditLogManager.query(userId, { startTime: FIXED_NOW + 1 }).total).toBe(0);
    expect(auditLogManager.query(userId, { page: 2, pageSize: 2 }).items).toHaveLength(1);
    expect(auditLogManager.query(userId, { pageSize: 101 }).pageSize).toBe(100);
  });

  it('应高亮失败日志（纯样式，生产无同契约）', () => {
    const rowStyle = (status: 'success' | 'failure') => ({
      backgroundColor: status === 'failure' ? '#fff2f0' : '#ffffff',
    });
    expect(rowStyle('failure').backgroundColor).toBe('#fff2f0');
    expect(rowStyle('success').backgroundColor).toBe('#ffffff');
  });

  it('应按日期分组日志（固定时钟，生产时间戳 + formatters.formatDate）', () => {
    vi.useFakeTimers();
    const userId = 'dd_log_group';
    vi.setSystemTime(new Date(2025, 0, 14, 9, 0, 0).getTime());
    auditLogManager.log({ userId, action: 'login', category: 'auth', detail: '第一天', ip: '1.1.1.1', userAgent: 'vitest', status: 'success' });
    auditLogManager.log({ userId, action: 'logout', category: 'auth', detail: '第一天', ip: '1.1.1.1', userAgent: 'vitest', status: 'success' });
    vi.setSystemTime(new Date(2025, 0, 15, 9, 0, 0).getTime());
    auditLogManager.log({ userId, action: 'login', category: 'auth', detail: '第二天', ip: '1.1.1.1', userAgent: 'vitest', status: 'success' });
    const entries = auditLogManager.query(userId, { pageSize: 100 }).items;
    const groups = new Map<string, number>();
    entries.forEach((entry) => {
      const key = formatDate(entry.timestamp);
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    expect(Array.from(groups.keys()).sort()).toEqual(['2025-01-14', '2025-01-15']);
    expect(groups.get('2025-01-14')).toBe(2);
    expect(groups.get('2025-01-15')).toBe(1);
  });

  it('应支持日志搜索（生产只按 action 精确匹配，旧 detail.includes 无契约）', () => {
    const userId = 'dd_log_search';
    const entry = { userId, category: 'trading' as const, detail: '贵州茅台 600519 详情', ip: '1.1.1.1', userAgent: 'vitest', status: 'success' as const };
    auditLogManager.log({ ...entry, action: 'view_stock' });
    auditLogManager.log({ ...entry, action: 'add_watchlist' });
    expect(auditLogManager.query(userId, { action: 'view_stock' }).total).toBe(1);
    expect(auditLogManager.query(userId, { action: 'view_stock' }).items[0].action).toBe('view_stock');
    expect(auditLogManager.query(userId, { action: 'not_exist' }).total).toBe(0);
  });

  it('应有操作类型到显示文本映射（生产 action 为自由字符串，映射为 UI 内联）', () => {
    const actionLabels: Record<string, string> = {
      login: '登录',
      logout: '登出',
      register: '注册',
      password_change: '修改密码',
      update_settings: '更新设置',
      upload_avatar: '上传头像',
      view_stock: '查看股票',
      add_watchlist: '添加自选',
      remove_watchlist: '移除自选',
      set_alert: '设置预警',
      run_backtest: '运行回测',
    };
    expect(actionLabels.login).toBe('登录');
    expect(Object.keys(actionLabels)).toHaveLength(11);
  });

  it('应统计日志分布（生产 getStats 的 byCategory/byStatus/recentActions）', () => {
    const userId = 'dd_log_stats';
    const base = { userId, ip: '1.1.1.1', userAgent: 'vitest', detail: '统计' };
    auditLogManager.log({ ...base, action: 'login', category: 'auth', status: 'success' });
    auditLogManager.log({ ...base, action: 'logout', category: 'auth', status: 'success' });
    auditLogManager.log({ ...base, action: 'password_change', category: 'auth', status: 'failure' });
    auditLogManager.log({ ...base, action: 'view_stock', category: 'trading', status: 'success' });
    const stats = auditLogManager.getStats(userId);
    expect(stats.total).toBe(4);
    expect(stats.byCategory).toEqual({ auth: 3, trading: 1 });
    expect(stats.byStatus).toEqual({ success: 3, failure: 1 });
    expect(stats.recentActions[0]).toBe('view_stock');
  });

  it('应导出日志 CSV（生产表头与 ISO 时间）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const userId = 'dd_log_csv';
    auditLogManager.log({
      userId,
      action: 'view_stock',
      category: 'trading',
      detail: '查看股票详情',
      ip: '1.1.1.1',
      userAgent: 'vitest',
      status: 'success',
    });
    const rows = auditLogManager.exportCSV(userId).split(NL);
    expect(rows[0]).toBe('ID,用户ID,操作,分类,资源,详情,IP,状态,时间');
    expect(rows).toHaveLength(2);
    expect(rows[1].startsWith('log_')).toBe(true);
    expect(rows[1].endsWith(new Date(FIXED_NOW).toISOString())).toBe(true);
  });

  it('应筛选安全事件（生产 24h 窗口 + auth 失败/lock/suspicious）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const userId = 'dd_log_security';
    const base = { userId, ip: '1.1.1.1', userAgent: 'vitest', detail: '安全事件' };
    auditLogManager.log({ ...base, action: 'login', category: 'auth', status: 'failure' });
    auditLogManager.log({ ...base, action: 'account_locked', category: 'system', status: 'success' });
    auditLogManager.log({ ...base, action: 'view_stock', category: 'trading', status: 'success' });
    vi.setSystemTime(FIXED_NOW + 25 * 3600000);
    auditLogManager.log({ ...base, action: 'login', category: 'auth', status: 'failure' });
    expect(auditLogManager.getSecurityEvents(userId, 24)).toHaveLength(1);
    expect(auditLogManager.getSecurityEvents(userId, 26)).toHaveLength(3);
  });
});

// ==================== 5. 两步验证 ====================

describe('两步验证（绑定 twoFactorManager）', () => {
  it('应有两步验证设置向导步骤（生产无向导导出，保留 UI 内联）', () => {
    const steps = ['生成密钥', '输入验证码', '保存备用码', '完成'];
    expect(steps).toHaveLength(4);
    expect(steps[0]).toBe('生成密钥');
  });

  it('应格式化验证码输入（生产无导出）', () => {
    expect(formatCode('123456')).toBe('123 456');
    expect(formatCode('123abc456')).toBe('123 456');
    expect(formatCode('123456789')).toBe('123 456');
    expect(formatCode('123')).toBe('123');
  });

  it('应自动提交 6 位验证码（生产校验为私有 validateTOTPFormat）', () => {
    expect(shouldAutoSubmit('123456')).toBe(true);
    expect(shouldAutoSubmit('123 456')).toBe(true);
    expect(shouldAutoSubmit('12345')).toBe(false);
  });

  it('应显示备用码列表（生产只生成大写十六进制，旧正则 [A-Z0-9] 过宽）', () => {
    const { backupCodes } = twoFactorManager.generateSecret('dd_2fa_codes');
    expect(backupCodes).toHaveLength(10);
    backupCodes.forEach((code) => {
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    });
    expect(new Set(backupCodes).size).toBe(10);
  });

  it('应支持复制备用码（生产无导出）', () => {
    const copied = ['A1B2-C3D4', 'E5F6-A7B8'].join(NL);
    expect(copied).toBe('A1B2-C3D4' + NL + 'E5F6-A7B8');
  });

  it('应支持下载备用码为文本（旧实现用无参 new Date，改为固定生成时间）', () => {
    const text = buildBackupCodesText(['A1B2-C3D4'], '2025-01-15 10:30:00');
    expect(text).toContain('备用码');
    expect(text).toContain('2025-01-15 10:30:00');
  });

  it('应验证二维码 URL 格式（生产 generateSecret 的 qrUrl）', () => {
    const { secret, qrUrl } = twoFactorManager.generateSecret('dd_2fa_qr');
    expect(secret.length).toBeGreaterThan(0);
    expect(qrUrl.startsWith('otpauth://totp/')).toBe(true);
    expect(qrUrl).toContain('secret=' + secret);
    expect(qrUrl).toContain('issuer=AStock');
    expect(qrUrl).toContain('algorithm=SHA1');
    expect(qrUrl).toContain('digits=6');
    expect(qrUrl).toContain('period=30');
  });

  it('应有验证器 App 推荐（纯 UI 文案）', () => {
    const apps = ['Google Authenticator', 'Microsoft Authenticator', '1Password'];
    expect(apps).toHaveLength(3);
    expect(apps[0]).toBe('Google Authenticator');
  });

  it('应显示两步验证状态（生产 isEnabled/verifyAndEnable/disable）', () => {
    const userId = 'dd_2fa_state';
    expect(twoFactorManager.isEnabled(userId)).toBe(false);
    const { secret } = twoFactorManager.generateSecret(userId);
    const enabled = twoFactorManager.verifyAndEnable(userId, twoFactorManager.generateTOTP(secret));
    expect(enabled.success).toBe(true);
    expect(enabled.message).toBe('两步验证已启用');
    expect(twoFactorManager.isEnabled(userId)).toBe(true);
    expect(twoFactorManager.disable(userId)).toBe(true);
    expect(twoFactorManager.isEnabled(userId)).toBe(false);
  });

  it('应显示剩余备用码警告（生产 getRemainingBackupCodes/verifyLogin）', () => {
    const userId = 'dd_2fa_backup';
    const { secret, backupCodes } = twoFactorManager.generateSecret(userId);
    twoFactorManager.verifyAndEnable(userId, twoFactorManager.generateTOTP(secret));
    expect(twoFactorManager.getRemainingBackupCodes(userId)).toBe(10);
    const used = twoFactorManager.verifyLogin(userId, backupCodes[0]);
    expect(used.success).toBe(true);
    expect(used.method).toBe('backup');
    expect(used.message).toBe('备用码验证成功');
    expect(twoFactorManager.getRemainingBackupCodes(userId)).toBe(9);
    expect(backupCodeWarning(0).level).toBe('error');
    expect(backupCodeWarning(2)).toEqual({ level: 'warning', message: '仅剩2个备用码' });
    expect(backupCodeWarning(8).level).toBeNull();
  });

  it('应拒绝非 6 位验证码（生产 verifyAndEnable 的格式校验）', () => {
    const userId = 'dd_2fa_format';
    twoFactorManager.generateSecret(userId);
    expect(twoFactorManager.verifyAndEnable(userId, '12345').message).toBe('验证码格式不正确');
    expect(twoFactorManager.verifyAndEnable(userId, 'abcdef').message).toBe('验证码格式不正确');
  });

  it('应拒绝未启用时的登录验证（生产 verifyLogin）', () => {
    const result = twoFactorManager.verifyLogin('dd_2fa_never', '123456');
    expect(result.success).toBe(false);
    expect(result.message).toBe('两步验证未启用');
    expect(result.method).toBe('totp');
  });
});

// ==================== 6. 登录安全 ====================

describe('登录安全（绑定 sessionManager / securityEngine / auditLogManager）', () => {
  it('应显示登录设备信息（生产 Session.deviceInfo/ip）', () => {
    const session = sessionManager.createSession('dd_sec_device', 'Chrome 120 / macOS 14.0', '192.168.1.1');
    expect(session.id.startsWith('sess_')).toBe(true);
    expect(session.deviceInfo).toBe('Chrome 120 / macOS 14.0');
    expect(session.ip).toBe('192.168.1.1');
    expect(sessionManager.getSession(session.id)?.deviceInfo).toBe('Chrome 120 / macOS 14.0');
  });

  it('应标记当前设备（生产 getUserSessions 的 current 标记）', () => {
    const user = 'dd_sec_current';
    const first = sessionManager.createSession(user, 'Chrome 120 / macOS 14.0', '10.0.0.1');
    const second = sessionManager.createSession(user, 'Safari 17 / iOS 17', '10.0.0.2');
    sessionManager.createSession(user, 'Edge 120 / Windows 11', '10.0.0.3');
    const sessions = sessionManager.getUserSessions(user, second.id);
    expect(sessions).toHaveLength(3);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(sessions.find((s) => s.current)?.id).toBe(second.id);
    expect(sessions.some((s) => s.id === first.id)).toBe(true);
  });

  it('应有强制登出其他设备选项（生产 destroyOtherSessions/destroyAllUserSessions）', () => {
    const user = 'dd_sec_logout';
    const keep = sessionManager.createSession(user, 'Chrome 120 / macOS 14.0', '10.0.1.1');
    sessionManager.createSession(user, 'Safari 17 / iOS 17', '10.0.1.2');
    sessionManager.createSession(user, 'Edge 120 / Windows 11', '10.0.1.3');
    expect(sessionManager.destroyOtherSessions(user, keep.id)).toBe(2);
    expect(sessionManager.getUserSessions(user)).toHaveLength(1);
    expect(sessionManager.destroyAllUserSessions(user)).toBe(1);
  });

  it('应显示密码强度指示器（生产 validatePassword 只给 errors，无 0-5 打分）', () => {
    // 旧断言是 level 0/3/5 与 极弱/弱/一般/强/很强，生产 securityEngine.ts:192
    // 只返回 { valid, errors, sanitized }，没有评分与标签。
    const weak = validatePassword('abc');
    expect(weak.valid).toBe(false);
    expect(weak.errors).toHaveLength(4);
    expect(weak.errors).toContain('密码长度不能少于8位');
    const medium = validatePassword('Abc12345');
    expect(medium.errors).toEqual(['密码需包含特殊字符']);
    const strong = validatePassword('Abc12345!@#$');
    expect(strong.valid).toBe(true);
    expect(strong.errors).toEqual([]);
  });

  it('应有密码变更历史限制（生产无改密冷却导出，内联显式 now）', () => {
    expect(canChangePassword(FIXED_NOW - 23 * 3600000, FIXED_NOW)).toBe(false);
    expect(canChangePassword(FIXED_NOW - 24 * 3600000, FIXED_NOW)).toBe(true);
  });

  it('应有登录历史显示（生产 auditLogManager.query/getSecurityEvents）', () => {
    const userId = 'dd_sec_history';
    const base = { userId, ip: '10.0.2.1', userAgent: 'vitest', detail: '登录历史' };
    auditLogManager.log({ ...base, action: 'login', category: 'auth', status: 'success' });
    auditLogManager.log({ ...base, action: 'login', category: 'auth', status: 'success' });
    auditLogManager.log({ ...base, action: 'login', category: 'auth', status: 'failure' });
    expect(auditLogManager.query(userId, { category: 'auth', status: 'failure' }).total).toBe(1);
    expect(auditLogManager.query(userId, { category: 'auth' }).total).toBe(3);
    expect(auditLogManager.getSecurityEvents(userId, 24)).toHaveLength(1);
  });
});

// ==================== 7. 通知偏好 ====================

describe('通知偏好（绑定 NotificationChannel/NotificationType/DEFAULT_TEMPLATES）', () => {
  it('应有通知渠道配置（生产 5 渠道，无 wechat；旧断言 4 渠道含 wechat 错）', () => {
    const channelConfig: Record<NotificationChannel, { label: string; icon: string }> = {
      push: { label: '推送', icon: '📱' },
      email: { label: '邮件', icon: '✉️' },
      sms: { label: '短信', icon: '💬' },
      websocket: { label: '实时', icon: '⚡' },
      in_app: { label: '站内', icon: '🔔' },
    };
    expect(Object.keys(channelConfig)).toHaveLength(5);
    expect(Object.keys(channelConfig)).toEqual(['push', 'email', 'sms', 'websocket', 'in_app']);
    expect(Object.keys(channelConfig)).not.toContain('wechat');
  });

  it('应有通知事件配置（生产 DEFAULT_TEMPLATES 覆盖 9 个类型）', () => {
    const expectedTypes: NotificationType[] = [
      'price_alert',
      'news',
      'system',
      'trade',
      'report',
      'watchlist_update',
      'limit_up',
      'limit_down',
      'volume_surge',
    ];
    const usedTypes = Array.from(new Set(DEFAULT_TEMPLATES.map((t) => t.type))).sort();
    expect(usedTypes).toEqual([...expectedTypes].sort());
    expect(DEFAULT_TEMPLATES).toHaveLength(10);
    const priceAlert = DEFAULT_TEMPLATES.filter((t) => t.type === 'price_alert');
    expect(priceAlert).toHaveLength(2);
    expect(priceAlert.every((t) => t.defaultChannels.join(',') === 'websocket,push,in_app')).toBe(true);
    const channels: NotificationChannel[] = ['push', 'email', 'sms', 'websocket', 'in_app'];
    expect(DEFAULT_TEMPLATES.every((t) => t.defaultChannels.every((c) => channels.includes(c)))).toBe(true);
  });

  it('应有免打扰时段设置（生产判断为私有且读墙钟，内联显式传当前时刻）', () => {
    // 生产 subscriptionManager.ts:269-278 isInQuietHours 是 private 且内部 new Date，
    // 无法从测试调用；内联实现断言语义与生产跨午夜分支一致。
    expect(isInQuietHours('23:00', '07:00', '23:30')).toBe(true);
    expect(isInQuietHours('23:00', '07:00', '12:00')).toBe(false);
    expect(isInQuietHours('23:00', '07:00', '06:59')).toBe(true);
    const prefs: Pick<NotificationPreferences, 'quietHoursEnabled' | 'quietHoursStart' | 'quietHoursEnd'> = {
      quietHoursEnabled: true,
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
    };
    expect(prefs.quietHoursEnabled).toBe(true);
  });

  it('应有通知频率限制选项（生产只有 dailyDigest/maxDailyNotifications，无三档枚举）', () => {
    const frequencies = ['realtime', 'hourly', 'daily'];
    expect(frequencies).toHaveLength(3);
    const digestPrefs: Pick<NotificationPreferences, 'dailyDigest' | 'maxDailyNotifications'> = {
      dailyDigest: true,
      maxDailyNotifications: 5,
    };
    expect(digestPrefs.dailyDigest).toBe(true);
    expect(digestPrefs.maxDailyNotifications).toBe(5);
  });

  it('应有价格预警通知阈值（生产默认 5%，区间 0.1-50）', () => {
    const user = 'dd_notify_threshold';
    const base = preferenceManager.getPreferences(user);
    expect(base.alerts.defaultThresholdPercent).toBe(5);
    expect([1, 3, 5, 10]).toContain(base.alerts.defaultThresholdPercent);
    expect(preferenceManager.validatePreferences({ alerts: { ...base.alerts, defaultThresholdPercent: 0.05 } }).errors).toContain(
      '预警阈值应在0.1%-50%之间'
    );
    expect(preferenceManager.validatePreferences({ alerts: { ...base.alerts, defaultThresholdPercent: 5 } }).valid).toBe(true);
  });
});

// ==================== 8. 响应式布局 ====================

describe('响应式布局（绑定 responsiveUtils / InfiniteScrollController）', () => {
  it('应有移动端设置布局（断点 xs，单列栅格）', () => {
    expect(getCurrentBreakpoint(375)).toBe('xs');
    expect(getGridConfig(375).columns).toBe(1);
    expect(isBelow(375, 'md')).toBe(true);
  });

  it('应有桌面端设置布局（断点 xl，四列栅格）', () => {
    expect(getCurrentBreakpoint(1440)).toBe('xl');
    expect(getGridConfig(1440).columns).toBe(4);
    expect(isAbove(1440, 'md')).toBe(true);
    expect(getGridConfig(1440).padding).toBe(24);
  });

  it('表单应有移动端优化（768 为 md 下界，responsiveValue 向下取最近档）', () => {
    expect(getCurrentBreakpoint(768)).toBe('md');
    expect(responsiveValue(375, { xs: 1, lg: 2 })).toBe(1);
    expect(responsiveValue(1024, { xs: 1, lg: 2 })).toBe(2);
  });

  it('操作历史应有无限滚动（生产默认 threshold 200/pageSize 20）', () => {
    const controller = new InfiniteScrollController<number>();
    expect(controller.shouldTrigger(500, 1000, 300, FIXED_NOW)).toBe(true);
    expect(controller.shouldTrigger(499, 1000, 300, FIXED_NOW)).toBe(false);
    controller.startLoading(FIXED_NOW);
    expect(controller.shouldTrigger(500, 1000, 300, FIXED_NOW + 1000)).toBe(false);
    const firstPage = Array.from({ length: 20 }, (_, index) => index);
    expect(controller.loadSuccess(firstPage).totalCount).toBe(20);
    expect(controller.getPagination()).toEqual({ page: 1, totalLoaded: 20, hasMore: true });
    const second = controller.loadSuccess([1, 2, 3]);
    expect(second.totalCount).toBe(40);
    expect(second.items).toHaveLength(23);
    expect(controller.getPagination().hasMore).toBe(false);
  });
});

// ==================== 9. 可访问性 ====================

describe('可访问性（绑定 a11yEngine / accessibility）', () => {
  it('表单应有 aria 标签（生产 createAriaAttributes 映射）', () => {
    const fields = ['请输入邮箱地址', '请输入手机号', '请输入密码'];
    fields.forEach((label) => {
      expect(createAriaAttributes({ label })).toEqual({ 'aria-label': label });
    });
    expect(createAriaAttributes({ label: '请输入邮箱地址', required: true })).toEqual({
      'aria-label': '请输入邮箱地址',
      'aria-required': true,
    });
    expect(ariaLabel('请输入邮箱地址')).toEqual({ 'aria-label': '请输入邮箱地址' });
  });

  it('按钮应有描述性文本（生产 ariaLabel）', () => {
    const buttons = ['删除设备', '退出登录', '保存设置'];
    buttons.forEach((label) => {
      expect(ariaLabel(label)).toEqual({ 'aria-label': label });
    });
  });

  it('状态变更应有屏幕阅读器公告（生产 createAnnouncement）', () => {
    const polite = createAnnouncement('设置已保存');
    expect(polite.message).toBe('设置已保存');
    expect(polite.priority).toBe('polite');
    expect(createAnnouncement('登录失败', 'assertive').priority).toBe('assertive');
  });

  it('模态框应正确管理焦点（生产 createFocusTrap 实测）', () => {
    const options: FocusManagementOptions = {
      trapFocus: true,
      restoreFocus: true,
      escapeDeactivates: true,
    };
    expect(options.trapFocus).toBe(true);
    const container = document.createElement('div');
    const first = document.createElement('button');
    const second = document.createElement('button');
    container.appendChild(first);
    container.appendChild(second);
    document.body.appendChild(container);
    try {
      const trap = createFocusTrap(container);
      trap.activate();
      expect(trap.isActive).toBe(true);
      expect(document.activeElement).toBe(first);
      trap.deactivate();
      expect(trap.isActive).toBe(false);
    } finally {
      container.remove();
    }
  });

  it('颜色对比度应满足 WCAG 标准（旧断言硬编码比值 4.6/4.5/4.8，生产实测全部不通过）', () => {
    // checkContrast（accessibility.ts:137）实测：success 2.21、error 2.99、info 2.95、
    // warning 1.83，均低于 AA normal 的 4.5；旧用例的 4.6/4.5/4.8 是自抄实现配合出来的假通过。
    expect(checkContrast('#52c41a', '#f6ffed')).toEqual({ ratio: 2.21, passes: false, required: 4.5 });
    expect(checkContrast('#ff4d4f', '#fff2f0')).toEqual({ ratio: 2.99, passes: false, required: 4.5 });
    expect(checkContrast('#1890ff', '#e6f7ff')).toEqual({ ratio: 2.95, passes: false, required: 4.5 });
    expect(checkContrast('#faad14', '#fffbe6')).toEqual({ ratio: 1.83, passes: false, required: 4.5 });
    expect(checkContrast('#52c41a', '#f6ffed', 'AAA')).toEqual({ ratio: 2.21, passes: false, required: 7 });
    expect(checkContrast('not-a-color', '#ffffff')).toEqual({ ratio: 0, passes: false, required: 4.5 });
  });
});