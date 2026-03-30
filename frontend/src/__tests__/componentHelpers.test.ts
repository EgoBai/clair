import { describe, it, expect } from 'vitest';

describe('Component Helper Functions', () => {
  // Size utilities
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
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return null;
    return {
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16),
    };
  };

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
  const breakpoints = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 };

  const getBreakpoint = (width: number): string => {
    if (width >= breakpoints.xxl) return 'xxl';
    if (width >= breakpoints.xl) return 'xl';
    if (width >= breakpoints.lg) return 'lg';
    if (width >= breakpoints.md) return 'md';
    if (width >= breakpoints.sm) return 'sm';
    return 'xs';
  };

  const isMobile = (width: number): boolean => width < breakpoints.md;
  const isTablet = (width: number): boolean => width >= breakpoints.md && width < breakpoints.lg;
  const isDesktop = (width: number): boolean => width >= breakpoints.lg;

  // Responsive grid
  const calculateColumns = (containerWidth: number, minItemWidth: number, gap: number): number => {
    const availableWidth = containerWidth + gap;
    const itemWidth = minItemWidth + gap;
    return Math.max(1, Math.floor(availableWidth / itemWidth));
  };

  // Animation utilities
  const calculateAnimationDuration = (distance: number, speed: number): number => {
    return distance / speed;
  };

  const springAnimation = (current: number, target: number, stiffness = 0.1, damping = 0.8): number => {
    const velocity = (target - current) * stiffness;
    return current + velocity * damping;
  };

  // Table utilities
  const paginateData = <T>(data: T[], page: number, pageSize: number): T[] => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  };

  const getTotalPages = (totalItems: number, pageSize: number): number => {
    return Math.ceil(totalItems / pageSize);
  };

  // Form utilities
  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    return /^1[3-9]\d{9}$/.test(phone);
  };

  const validateStockCode = (code: string): boolean => {
    return /^(sh|sz|bj)\d{6}$/i.test(code) || /^\d{6}$/.test(code);
  };

  const formatPhoneNumber = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 11) return phone;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  };

  // Notification utilities
  const createNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string) => ({
    id: Math.random().toString(36).slice(2),
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
      expect(getBreakpoint(375)).toBe('xs');
      expect(isMobile(375)).toBe(true);
    });

    it('should identify tablet', () => {
      expect(getBreakpoint(800)).toBe('md');
      expect(isTablet(800)).toBe(true);
    });

    it('should identify desktop', () => {
      expect(getBreakpoint(1200)).toBe('xl');
      expect(isDesktop(1200)).toBe(true);
    });

    it('should identify xxl', () => {
      expect(getBreakpoint(1920)).toBe('xxl');
    });
  });

  describe('Grid Calculation', () => {
    it('should calculate columns', () => {
      expect(calculateColumns(1200, 200, 16)).toBe(5);
    });

    it('should return at least 1', () => {
      expect(calculateColumns(100, 200, 16)).toBe(1);
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
    });

    it('should validate stock code', () => {
      expect(validateStockCode('600519')).toBe(true);
      expect(validateStockCode('sh600519')).toBe(true);
      expect(validateStockCode('sz000001')).toBe(true);
      expect(validateStockCode('12345')).toBe(false);
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
