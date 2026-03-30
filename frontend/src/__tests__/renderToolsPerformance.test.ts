import { describe, it, expect } from 'vitest';

// 前端渲染工具与性能测试
describe('前端渲染工具与性能', () => {
  // 虚拟滚动计算
  function calcVirtualScroll(
    totalItems: number,
    itemHeight: number,
    containerHeight: number,
    scrollTop: number,
    overscan: number = 3
  ) {
    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const endIdx = Math.min(totalItems - 1, startIdx + visibleCount + overscan * 2);
    return {
      startIdx,
      endIdx,
      offsetY: startIdx * itemHeight,
      visibleItems: endIdx - startIdx + 1,
    };
  }

  // 颜色工具
  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return null;
    return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
  }

  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
  }

  function luminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map(c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function contrastRatio(c1: [number, number, number], c2: [number, number, number]): number {
    const l1 = luminance(...c1);
    const l2 = luminance(...c2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // 深度比较
  function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((v: any, i: number) => deepEqual(v, b[i]));
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => deepEqual(a[k], b[k]));
  }

  // 防抖
  function createDebounce(fn: Function, delay: number) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return {
      call: (...args: any[]) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      },
      cancel: () => { if (timer) { clearTimeout(timer); timer = null; } },
      flush: () => { if (timer) { clearTimeout(timer); fn(); timer = null; } },
    };
  }

  // 节流
  function createThrottle(fn: Function, interval: number) {
    let lastTime = 0;
    return {
      call: (...args: any[]) => {
        const now = Date.now();
        if (now - lastTime >= interval) {
          lastTime = now;
          fn(...args);
          return true;
        }
        return false;
      },
    };
  }

  // URL参数工具
  function buildQueryString(params: Record<string, any>): string {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  }

  function parseQueryString(qs: string): Record<string, string> {
    if (!qs || qs === '?') return {};
    const str = qs.startsWith('?') ? qs.slice(1) : qs;
    const result: Record<string, string> = {};
    for (const pair of str.split('&')) {
      const [key, value] = pair.split('=');
      if (key) result[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
    return result;
  }

  // 相对时间
  function relativeTime(timestamp: number, now: number = Date.now()): string {
    const diff = now - timestamp;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 2592000000) return `${Math.floor(diff / 86400000)}天前`;
    if (diff < 31536000000) return `${Math.floor(diff / 2592000000)}个月前`;
    return `${Math.floor(diff / 31536000000)}年前`;
  }

  describe('虚拟滚动', () => {
    it('初始渲染正确范围', () => {
      const result = calcVirtualScroll(1000, 40, 400, 0);
      expect(result.startIdx).toBe(0);
      expect(result.visibleItems).toBeGreaterThan(0);
    });

    it('滚动后偏移量更新', () => {
      const result = calcVirtualScroll(1000, 40, 400, 4000);
      expect(result.startIdx).toBeGreaterThan(0);
      expect(result.offsetY).toBeGreaterThan(0);
    });

    it('起始索引不小于0', () => {
      const result = calcVirtualScroll(100, 40, 400, 0, 10);
      expect(result.startIdx).toBeGreaterThanOrEqual(0);
    });

    it('结束索引不超过总数-1', () => {
      const result = calcVirtualScroll(10, 40, 400, 0);
      expect(result.endIdx).toBeLessThan(10);
    });

    it('overscan扩大可见范围', () => {
      const r1 = calcVirtualScroll(1000, 40, 400, 1600, 0);
      const r2 = calcVirtualScroll(1000, 40, 400, 1600, 5);
      expect(r2.visibleItems).toBeGreaterThan(r1.visibleItems);
    });

    it('单元素正确', () => {
      const result = calcVirtualScroll(1, 40, 400, 0);
      expect(result.startIdx).toBe(0);
      expect(result.endIdx).toBe(0);
    });
  });

  describe('颜色工具', () => {
    it('hex转rgb', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    });

    it('无效hex返回null', () => {
      expect(hexToRgb('xyz')).toBeNull();
      expect(hexToRgb('#ff0')).toBeNull();
    });

    it('rgb转hex', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
      expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    });

    it('rgb值钳制', () => {
      expect(rgbToHex(-10, 300, 128)).toBe('#00ff80');
    });

    it('黑白对比度最高', () => {
      const ratio = contrastRatio([0, 0, 0], [255, 255, 255]);
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('相同颜色对比度为1', () => {
      const ratio = contrastRatio([128, 128, 128], [128, 128, 128]);
      expect(ratio).toBeCloseTo(1, 5);
    });
  });

  describe('深度比较', () => {
    it('基本类型相等', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('a', 'a')).toBe(true);
    });

    it('基本类型不等', () => {
      expect(deepEqual(1, 2)).toBe(false);
    });

    it('数组深度比较', () => {
      expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
      expect(deepEqual([1, 2], [1, 3])).toBe(false);
    });

    it('对象深度比较', () => {
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('null处理', () => {
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, 0)).toBe(false);
    });

    it('数组长度不等', () => {
      expect(deepEqual([1], [1, 2])).toBe(false);
    });

    it('对象key数不等', () => {
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });
  });

  describe('URL参数', () => {
    it('构建查询串', () => {
      expect(buildQueryString({ a: 1, b: 'hello' })).toBe('a=1&b=hello');
    });

    it('跳过空值', () => {
      expect(buildQueryString({ a: 1, b: undefined, c: null, d: '' })).toBe('a=1');
    });

    it('解析查询串', () => {
      expect(parseQueryString('a=1&b=hello')).toEqual({ a: '1', b: 'hello' });
    });

    it('带问号前缀', () => {
      expect(parseQueryString('?a=1')).toEqual({ a: '1' });
    });

    it('空串返回空对象', () => {
      expect(parseQueryString('')).toEqual({});
    });

    it('特殊字符编解码', () => {
      const qs = buildQueryString({ q: 'hello world&test=1' });
      expect(qs).toContain('hello%20world');
      const parsed = parseQueryString(qs);
      expect(parsed.q).toBe('hello world&test=1');
    });
  });

  describe('相对时间', () => {
    const now = 1000000000000;

    it('刚刚', () => expect(relativeTime(now - 30000, now)).toBe('刚刚'));
    it('分钟', () => expect(relativeTime(now - 300000, now)).toBe('5分钟前'));
    it('小时', () => expect(relativeTime(now - 7200000, now)).toBe('2小时前'));
    it('天', () => expect(relativeTime(now - 172800000, now)).toBe('2天前'));
    it('月', () => expect(relativeTime(now - 5184000000, now)).toBe('2个月前'));
    it('年', () => expect(relativeTime(now - 63072000000, now)).toBe('2年前'));
  });

  describe('防抖', () => {
    it('多次调用只执行最后一次', async () => {
      let count = 0;
      const db = createDebounce(() => count++, 10);
      db.call(); db.call(); db.call();
      await new Promise(r => setTimeout(r, 20));
      expect(count).toBe(1);
    });

    it('cancel取消执行', async () => {
      let count = 0;
      const db = createDebounce(() => count++, 10);
      db.call();
      db.cancel();
      await new Promise(r => setTimeout(r, 20));
      expect(count).toBe(0);
    });
  });

  describe('节流', () => {
    it('间隔内不执行', () => {
      const results: boolean[] = [];
      const th = createThrottle(() => {}, 100);
      results.push(th.call());
      results.push(th.call());
      expect(results).toEqual([true, false]);
    });
  });
});
