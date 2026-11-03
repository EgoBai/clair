/**
 * 影子测试迁移（批次 20）
 *
 * 绑定实现：
 * - validateEmail/validatePhone/validateStockCode ← frontend/src/utils/securityEngine.ts:150/163/177
 *   （生产返回 {valid,errors,sanitized}，本文件用 .valid 适配为旧 boolean 口径）
 * - hexToRgb ← frontend/src/utils/a11yEngine.ts:153 parseColor
 *   （生产支持 3/6 位 hex 与 rgb()，旧内联仅支持 6 位 hex）
 * - calculateColumns ← frontend/src/utils/responsiveUtils.ts:130（生产带 maxColumns=6 上限）
 * - 断点判定 ← frontend/src/utils/responsiveUtils.ts:58 getCurrentBreakpoint / :258 getAdaptiveConfig
 *
 * 未迁移（生产无对应导出，保留内联 helper）：
 * - parseSize/getSizeUnit：生产无 CSS 尺寸解析导出
 * - rgbToHex/adjustBrightness/isLightColor：生产无对应导出；isLightColor 的简单亮度口径
 *   与 a11yEngine.relativeLuminance:186 的 WCAG 公式不同，未强行替换
 * - paginateData/getTotalPages：生产无分页纯函数导出
 * - calculateAnimationDuration/springAnimation：生产 chartAnimation.ts 只有缓动/lerpColor，无该动画模型
 * - formatPhoneNumber：securityEngine.maskPhone:291 是脱敏而非格式化
 * - createNotification/filterNotifications/countUnread：生产无前端通知工厂导出；
 *   id 的 Math.random 已改确定性序号（禁随机）
 * - clamp：工具报告指向 backend/src/utils/futureValueUtils.ts:255，但前端测试不跨包 import backend；
 *   且旧文件中它是 adjustBrightness 内嵌箭头函数，不是文件级符号
 *
 * 旧断言错在哪（旧值→生产值）：
 * - getBreakpoint(1200): 'xl' → 'lg'（生产 BREAKPOINTS.xl=1280）
 * - getBreakpoint(1920): 'xxl' → '2xl'（生产命名 2xl，阈值 1536）
 * - 断点阈值：旧 576/768/992/1200/1600 → 生产 640/768/1024/1280/1536；
 *   isTablet 上界 992→1024、isDesktop 下界 992→1024
 * - 旧 validateEmail/validatePhone/validateStockCode 返回 boolean → 生产 {valid,errors,sanitized}，
 *   此处包装取 .valid，断言值本身未变
 * - validatePhone 旧不接受分隔符 → 生产先去除空格/连字符（'138-0013-8000' 旧 false → 生产 true）
 * - validateStockCode 旧不 trim → 生产 trim+toUpperCase（' sh600519 ' 旧 false → 生产 true）
 * - calculateColumns 旧无上限 → 生产 maxColumns=6
 */
import { describe, it, expect } from 'vitest';
import { parseColor as hexToRgb } from '../utils/a11yEngine';
import {
  validateEmail as validateEmailResult,
  validatePhone as validatePhoneResult,
  validateStockCode as validateStockCodeResult,
} from '../utils/securityEngine';
import { calculateColumns, getAdaptiveConfig, getCurrentBreakpoint } from '../utils/responsiveUtils';

describe('Component Helper Functions', () => {
  // Size utilities
  // 生产无 CSS 尺寸解析导出，未迁移（保留内联实现）
  const parseSize = (size: string): number => {
    const match = size.match(/^(\d+(?:\.\d+)?)(px|rem|em|%)?$/);
    if (!match) return 0;
    return parseFloat(match[1]);
  };

  const getSizeUnit = (size: string): string => {
    const match = size.match(/^(\d+(?:\.\d+)?)(px|rem|em|%)?$/);
    return match?.[2] || 'px';
  };

  // Color utilities
  // hexToRgb 已改绑 a11yEngine.parseColor；rgbToHex/adjustBrightness/isLightColor 生产无对应导出，保留内联。
  const rgbToHex = (r: number, g: number, b: number): string => {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  };

  const adjustBrightness = (hex: string, amount: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    return rgbToHex(
      clamp(rgb.r + amount),
      clamp(rgb.g + amount),
      clamp(rgb.b + amount)
    );
  };

  const isLightColor = (hex: string): boolean => {
    const rgb = hexToRgb(hex);
    if (!rgb) return true;
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5;
  };

  // Breakpoint utilities
  // 已改绑 responsiveUtils（生产断点为 Tailwind 口径：sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536）。
  // 本地 breakpoints/getBreakpoint/isMobile/isTablet/isDesktop 副本已删除。

  // Responsive grid
  // calculateColumns 已改绑 responsiveUtils，本地副本已删除。

  // Animation utilities
  // 生产无对应动画模型导出，未迁移（保留内联实现）
  const calculateAnimationDuration = (distance: number, speed: number): number => {
    return distance / speed;
  };

  const springAnimation = (current: number, target: number, stiffness = 0.1, damping = 0.8): number => {
    const velocity = (target - current) * stiffness;
    return current + velocity * damping;
  };

  // Table utilities
  // 生产无分页纯函数导出，未迁移（保留内联实现）
  const paginateData = <T>(data: T[], page: number, pageSize: number): T[] => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  };

  const getTotalPages = (totalItems: number, pageSize: number): number => {
    return Math.ceil(totalItems / pageSize);
  };

  // Form utilities
  // 生产返回 {valid,errors,sanitized}；以下布尔包装只取 .valid，不复制校验逻辑。
  const validateEmail = (email: string): boolean => validateEmailResult(email).valid;
  const validatePhone = (phone: string): boolean => validatePhoneResult(phone).valid;
  const validateStockCode = (code: string): boolean => validateStockCodeResult(code).valid;

  // 生产无手机号格式化导出（maskPhone 是脱敏），未迁移（保留内联实现）
  const formatPhoneNumber = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 11) return phone;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  };

  // Notification utilities
  // 生产无前端通知工厂导出，未迁移（保留内联实现）；id 改为确定性序号，避免 Math.random。
  let notificationSequence = 0;
  const createNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string) => ({
    id: `notification-${++notificationSequence}`,
    type,
    message,
    timestamp: Date.now(),
    read: false,
  });

  const filterNotifications = (notifications: Array<{ read: boolean; type: string }>, showRead: boolean) => {
    return showRead ? notifications : notifications.filter(n => !n.read);
  };

  const countUnread = (notifications: Array<{ read: boolean }>): number => {
    return notifications.filter(n => !n.read).length;
  };

  describe('Size Parsing', () => {
    it('should parse px values', () => {
      expect(parseSize('16px')).toBe(16);
    });

    it('should parse rem values', () => {
      expect(parseSize('1.5rem')).toBe(1.5);
    });

    it('should parse plain numbers', () => {
      expect(parseSize('100')).toBe(100);
    });

    it('should return 0 for invalid', () => {
      expect(parseSize('abc')).toBe(0);
    });

    it('should extract unit', () => {
      expect(getSizeUnit('16px')).toBe('px');
      expect(getSizeUnit('1.5rem')).toBe('rem');
      expect(getSizeUnit('100')).toBe('px');
    });
  });

  describe('Color Conversion', () => {
    it('should convert hex to rgb', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should convert without hash', () => {
      expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    });

    it('should return null for invalid hex', () => {
      expect(hexToRgb('xyz')).toBeNull();
    });

    it('should parse shorthand hex (production parseColor)', () => {
      // 生产 parseColor 额外支持 3 位缩写；旧内联正则会返回 null
      expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should convert rgb to hex', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    });

    it('should handle zero values', () => {
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
    });
  });

  describe('Brightness', () => {
    it('should brighten color', () => {
      const result = adjustBrightness('#000000', 50);
      expect(result).toBe('#323232');
    });

    it('should darken color', () => {
      const result = adjustBrightness('#ffffff', -50);
      expect(result).toBe('#cdcdcd');
    });

    it('should clamp at 0', () => {
      const result = adjustBrightness('#101010', -50);
      expect(result).toBe('#000000');
    });

    it('should clamp at 255', () => {
      const result = adjustBrightness('#f0f0f0', 50);
      expect(result).toBe('#ffffff');
    });
  });

  describe('Light Color Detection', () => {
    it('should detect white as light', () => {
      expect(isLightColor('#ffffff')).toBe(true);
    });

    it('should detect black as dark', () => {
      expect(isLightColor('#000000')).toBe(false);
    });

    it('should detect yellow as light', () => {
      expect(isLightColor('#ffff00')).toBe(true);
    });

    it('should detect blue as dark', () => {
      expect(isLightColor('#0000ff')).toBe(false);
    });
  });

  describe('Breakpoints', () => {
    it('should identify mobile', () => {
      const config = getAdaptiveConfig(375);
      expect(config.breakpoint).toBe('xs');
      expect(config.isMobile).toBe(true);
    });

    it('should identify tablet', () => {
      const config = getAdaptiveConfig(800);
      expect(config.breakpoint).toBe('md');
      expect(config.isTablet).toBe(true);
    });

    it('should identify desktop', () => {
      const config = getAdaptiveConfig(1200);
      // 生产 xl 从 1280 起，1200 落在 lg（旧断言 'xl'）
      expect(config.breakpoint).toBe('lg');
      expect(config.isDesktop).toBe(true);
    });

    it('should identify 2xl', () => {
      // 生产命名 2xl、阈值 1536（旧断言 'xxl'）
      expect(getCurrentBreakpoint(1920)).toBe('2xl');
    });

    it('should match production breakpoint boundaries', () => {
      expect(getCurrentBreakpoint(639)).toBe('xs');
      expect(getCurrentBreakpoint(640)).toBe('sm');
      expect(getCurrentBreakpoint(767)).toBe('sm');
      expect(getCurrentBreakpoint(768)).toBe('md');
      expect(getCurrentBreakpoint(1023)).toBe('md');
      expect(getCurrentBreakpoint(1024)).toBe('lg');
      expect(getCurrentBreakpoint(1279)).toBe('lg');
      expect(getCurrentBreakpoint(1280)).toBe('xl');
      expect(getCurrentBreakpoint(1535)).toBe('xl');
      expect(getCurrentBreakpoint(1536)).toBe('2xl');
    });
  });

  describe('Grid Calculation', () => {
    it('should calculate columns', () => {
      expect(calculateColumns(1200, 200, 16)).toBe(5);
    });

    it('should return at least 1', () => {
      expect(calculateColumns(100, 200, 16)).toBe(1);
    });

    it('should cap at production maxColumns', () => {
      // 生产默认 maxColumns=6；旧内联无上限
      expect(calculateColumns(5000, 200, 16)).toBe(6);
    });
  });

  describe('Pagination', () => {
    it('should paginate data', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(paginateData(data, 1, 3)).toEqual([1, 2, 3]);
      expect(paginateData(data, 2, 3)).toEqual([4, 5, 6]);
      expect(paginateData(data, 4, 3)).toEqual([10]);
    });

    it('should calculate total pages', () => {
      expect(getTotalPages(10, 3)).toBe(4);
      expect(getTotalPages(9, 3)).toBe(3);
      expect(getTotalPages(0, 3)).toBe(0);
    });
  });

  describe('Form Validation', () => {
    it('should validate email', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
    });

    it('should validate phone', () => {
      expect(validatePhone('13800138000')).toBe(true);
      expect(validatePhone('12345678901')).toBe(false);
      expect(validatePhone('1380013800')).toBe(false);
      // 生产先去除空格/连字符；旧内联正则不接受分隔符（旧 false → 生产 true）
      expect(validatePhone('138-0013-8000')).toBe(true);
    });

    it('should validate stock code', () => {
      expect(validateStockCode('600519')).toBe(true);
      expect(validateStockCode('sh600519')).toBe(true);
      expect(validateStockCode('sz000001')).toBe(true);
      expect(validateStockCode('12345')).toBe(false);
      // 生产 trim+toUpperCase 后校验；旧内联不接受空白（旧 false → 生产 true）
      expect(validateStockCode(' sh600519 ')).toBe(true);
    });

    it('should format phone number', () => {
      expect(formatPhoneNumber('13800138000')).toBe('138-0013-8000');
    });
  });

  describe('Notifications', () => {
    it('should create notification with type', () => {
      const n = createNotification('success', 'Done!');
      expect(n.type).toBe('success');
      expect(n.message).toBe('Done!');
      expect(n.read).toBe(false);
    });

    it('should filter unread', () => {
      const notifications = [
        { read: false, type: 'info' },
        { read: true, type: 'info' },
        { read: false, type: 'error' },
      ];
      expect(filterNotifications(notifications, false)).toHaveLength(2);
      expect(filterNotifications(notifications, true)).toHaveLength(3);
    });

    it('should count unread', () => {
      const notifications = [
        { read: false },
        { read: true },
        { read: false },
      ];
      expect(countUnread(notifications)).toBe(2);
    });
  });

  describe('Animation Utilities', () => {
    it('should calculate duration from distance and speed', () => {
      expect(calculateAnimationDuration(100, 50)).toBe(2);
    });

    it('should animate spring toward target', () => {
      const result = springAnimation(0, 100);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100);
    });
  });
});
