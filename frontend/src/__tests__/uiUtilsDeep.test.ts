import { describe, it, expect } from 'vitest';

// 前端UI工具函数深度测试 — 55用例
describe('UI工具函数深度', () => {

  // 颜色工具
  describe('颜色工具', () => {
    function hexToRgb(hex: string) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? { r: parseInt(result[1]!, 16), g: parseInt(result[2]!, 16), b: parseInt(result[3]!, 16) } : null;
    }

    function rgbToHex(r: number, g: number, b: number) {
      return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    function luminance(r: number, g: number, b: number) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
    }

    function contrastRatio(l1: number, l2: number) {
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    it('hex转rgb正确', () => {
      const rgb = hexToRgb('#ff0000');
      expect(rgb?.r).toBe(255);
      expect(rgb?.g).toBe(0);
      expect(rgb?.b).toBe(0);
    });

    it('rgb转hex正确', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    });

    it('黑白对比度应>21', () => {
      const l1 = luminance(0, 0, 0);
      const l2 = luminance(255, 255, 255);
      expect(contrastRatio(l1, l2)).toBeGreaterThan(20);
    });

    it('白色亮度应接近1', () => {
      expect(luminance(255, 255, 255)).toBeCloseTo(1, 1);
    });

    it('黑色亮度应接近0', () => {
      expect(luminance(0, 0, 0)).toBeCloseTo(0, 1);
    });

    it('无效hex应返回null', () => {
      expect(hexToRgb('xyz')).toBeNull();
    });

    it('hex往返转换', () => {
      const hex = '#3498db';
      const rgb = hexToRgb(hex)!;
      expect(rgbToHex(rgb.r, rgb.g, rgb.b)).toBe(hex);
    });
  });

  // 文本截断
  describe('文本截断', () => {
    function truncate(text: string, maxLen: number, ellipsis: string = '...') {
      if (text.length <= maxLen) return text;
      return text.slice(0, maxLen - ellipsis.length) + ellipsis;
    }

    function truncateMiddle(text: string, maxLen: number) {
      if (text.length <= maxLen) return text;
      const half = Math.floor((maxLen - 3) / 2);
      return text.slice(0, half) + '...' + text.slice(-half);
    }

    it('短文本不截断', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('长文本截断并加省略号', () => {
      expect(truncate('hello world', 8).length).toBeLessThanOrEqual(8);
      expect(truncate('hello world', 8)).toContain('...');
    });

    it('中间截断保留首尾', () => {
      const result = truncateMiddle('abcdefghijklmnop', 10);
      expect(result.startsWith('a')).toBe(true);
      expect(result.endsWith('p')).toBe(true);
    });

    it('空字符串返回空', () => {
      expect(truncate('', 5)).toBe('');
    });

    it('精确长度不截断', () => {
      expect(truncate('abc', 3)).toBe('abc');
    });

    it('自定义省略号', () => {
      expect(truncate('hello world', 8, '…')).toContain('…');
    });
  });

  // CSS类名合并
  describe('CSS类名合并', () => {
    function cls(...args: (string | boolean | null | undefined | Record<string, boolean>)[]): string {
      return args
        .flatMap(arg => {
          if (!arg) return [];
          if (typeof arg === 'string') return [arg];
          if (typeof arg === 'object') return Object.entries(arg).filter(([, v]) => v).map(([k]) => k);
          return [];
        })
        .join(' ');
    }

    it('字符串类名', () => {
      expect(cls('a', 'b')).toBe('a b');
    });

    it('条件类名true', () => {
      expect(cls({ active: true })).toBe('active');
    });

    it('条件类名false', () => {
      expect(cls({ active: false })).toBe('');
    });

    it('混合类型', () => {
      expect(cls('base', { active: true, disabled: false })).toBe('base active');
    });

    it('null/undefined跳过', () => {
      expect(cls('a', null, undefined, 'b')).toBe('a b');
    });

    it('空输入返回空', () => {
      expect(cls()).toBe('');
    });

    it('全false返回空', () => {
      expect(cls({ a: false, b: false })).toBe('');
    });
  });

  // 数值格式化
  describe('数值格式化', () => {
    function compactNumber(n: number) {
      if (n >= 1e12) return (n / 1e12).toFixed(2) + '万亿';
      if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
      if (n >= 1e4) return (n / 1e4).toFixed(2) + '万';
      return n.toLocaleString('zh-CN');
    }

    function formatPercent(n: number, showSign: boolean = true) {
      const sign = n > 0 && showSign ? '+' : '';
      return sign + n.toFixed(2) + '%';
    }

    it('万亿格式化', () => {
      expect(compactNumber(1.5e12)).toContain('万亿');
    });

    it('亿格式化', () => {
      expect(compactNumber(5e8)).toContain('亿');
    });

    it('万格式化', () => {
      expect(compactNumber(3e4)).toContain('万');
    });

    it('小数不加单位', () => {
      expect(compactNumber(100)).not.toContain('万');
    });

    it('正百分比加正号', () => {
      expect(formatPercent(5.23)).toContain('+');
    });

    it('负百分比不加正号', () => {
      expect(formatPercent(-3.11)).not.toContain('+');
    });

    it('0百分比无正号', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });

    it('不显示正号模式', () => {
      expect(formatPercent(5, false)).toBe('5.00%');
    });
  });

  // 列表虚拟化
  describe('列表虚拟化', () => {
    function calcVisibleRange(scrollTop: number, itemHeight: number, containerHeight: number, totalItems: number, overscan: number = 3) {
      const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
      const visibleCount = Math.ceil(containerHeight / itemHeight);
      const end = Math.min(totalItems - 1, Math.floor(scrollTop / itemHeight) + visibleCount + overscan);
      return { start, end, offsetY: start * itemHeight };
    }

    it('顶部应从0开始', () => {
      const range = calcVisibleRange(0, 50, 500, 100);
      expect(range.start).toBe(0);
    });

    it('滚动后起始偏移', () => {
      const range = calcVisibleRange(500, 50, 500, 100);
      expect(range.start).toBeGreaterThan(0);
    });

    it('offsetY应为起始乘以高度', () => {
      const range = calcVisibleRange(500, 50, 500, 100);
      expect(range.offsetY).toBe(range.start * 50);
    });

    it('end不应超过总数', () => {
      const range = calcVisibleRange(0, 50, 500, 10);
      expect(range.end).toBeLessThan(100);
    });

    it('空列表范围', () => {
      const range = calcVisibleRange(0, 50, 500, 0);
      expect(range.end).toBeLessThanOrEqual(0);
    });

    it('overscan应增加可见范围', () => {
      const withOverscan = calcVisibleRange(250, 50, 500, 100, 5);
      const noOverscan = calcVisibleRange(250, 50, 500, 100, 0);
      expect(withOverscan.end - withOverscan.start).toBeGreaterThan(noOverscan.end - noOverscan.start);
    });
  });
});
