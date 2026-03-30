import { describe, it, expect } from 'vitest';

// 图表渲染优化引擎
describe('图表渲染优化引擎', () => {
  interface DataPoint { x: number; y: number }

  function simplifyPoints(points: DataPoint[], tolerance: number): DataPoint[] {
    if (points.length <= 2) return [...points];
    let maxDist = 0, maxIdx = 0;
    const first = points[0]!, last = points[points.length - 1]!;
    for (let i = 1; i < points.length - 1; i++) {
      const dist = perpendicularDistance(points[i]!, first, last);
      if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }
    if (maxDist > tolerance) {
      const left = simplifyPoints(points.slice(0, maxIdx + 1), tolerance);
      const right = simplifyPoints(points.slice(maxIdx), tolerance);
      return [...left.slice(0, -1), ...right];
    }
    return [first, last];
  }

  function perpendicularDistance(p: DataPoint, a: DataPoint, b: DataPoint): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function interpolateColor(color1: string, color2: string, t: number): string {
    const parse = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const [r1, g1, b1] = parse(color1);
    const [r2, g2, b2] = parse(color2);
    const r = Math.round(r1! + (r2! - r1!) * t);
    const g = Math.round(g1! + (g2! - g1!) * t);
    const b = Math.round(b1! + (b2! - b1!) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function calculateTickPositions(min: number, max: number, count: number): number[] {
    if (count <= 0 || min === max) return [min];
    const range = max - min;
    const rough = range / count;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const nice = Math.ceil(rough / magnitude) * magnitude;
    const start = Math.floor(min / nice) * nice;
    const ticks: number[] = [];
    for (let v = start; v <= max + nice * 0.5; v += nice) ticks.push(Math.round(v * 1e6) / 1e6);
    return ticks;
  }

  function viewportClip(data: DataPoint[], xMin: number, xMax: number): DataPoint[] {
    return data.filter(p => p.x >= xMin && p.x <= xMax);
  }

  function dataToPixel(data: DataPoint[], width: number, height: number, xRange: [number, number], yRange: [number, number]): { x: number; y: number }[] {
    const [xMin, xMax] = xRange;
    const [yMin, yMax] = yRange;
    return data.map(p => ({
      x: (p.x - xMin) / (xMax - xMin) * width,
      y: height - (p.y - yMin) / (yMax - yMin) * height,
    }));
  }

  function calculateAspectRatio(width: number, height: number): number {
    return width / height;
  }

  it('应简化折线保留关键点', () => {
    const points: DataPoint[] = [
      { x: 0, y: 0 }, { x: 1, y: 0.1 }, { x: 2, y: 0 },
      { x: 3, y: 5 }, { x: 4, y: 5.1 }, { x: 5, y: 5 },
    ];
    const simplified = simplifyPoints(points, 1);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it('两个点应直接返回', () => {
    const points: DataPoint[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(simplifyPoints(points, 0.1)).toEqual(points);
  });

  it('空数组应返回空', () => {
    expect(simplifyPoints([], 1)).toHaveLength(0);
  });

  it('应计算垂直距离', () => {
    const dist = perpendicularDistance({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(dist).toBeCloseTo(1);
  });

  it('相同端点距离应等于到点的距离', () => {
    expect(perpendicularDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it('应插值颜色', () => {
    expect(interpolateColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(interpolateColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(interpolateColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  it('应计算刻度位置', () => {
    const ticks = calculateTickPositions(0, 100, 5);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(100);
  });

  it('单值刻度应返回一个', () => {
    expect(calculateTickPositions(10, 10, 5)).toEqual([10]);
  });

  it('应裁剪视口外数据', () => {
    const data: DataPoint[] = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }];
    expect(viewportClip(data, 3, 7)).toEqual([{ x: 5, y: 5 }]);
  });

  it('应转换数据坐标到像素', () => {
    const result = dataToPixel([{ x: 0, y: 0 }, { x: 1, y: 1 }], 100, 100, [0, 1], [0, 1]);
    expect(result[0]).toEqual({ x: 0, y: 100 });
    expect(result[1]).toEqual({ x: 100, y: 0 });
  });

  it('应计算宽高比', () => {
    expect(calculateAspectRatio(1920, 1080)).toBeCloseTo(16 / 9, 1);
  });

  it('大量数据简化应减少点数', () => {
    const points: DataPoint[] = Array.from({ length: 1000 }, (_, i) => ({
      x: i, y: Math.sin(i / 10) * 100,
    }));
    const simplified = simplifyPoints(points, 5);
    expect(simplified.length).toBeLessThan(100);
  });
});

// 虚拟滚动引擎
describe('虚拟滚动引擎', () => {
  interface VirtualScrollConfig { itemHeight: number; containerHeight: number; totalItems: number; scrollTop: number }

  function calcVisibleRange(config: VirtualScrollConfig): { start: number; end: number; offset: number } {
    const start = Math.max(0, Math.floor(config.scrollTop / config.itemHeight) - 2);
    const visibleCount = Math.ceil(config.containerHeight / config.itemHeight) + 4;
    const end = Math.min(config.totalItems, start + visibleCount);
    return { start, end, offset: start * config.itemHeight };
  }

  function totalHeight(config: VirtualScrollConfig): number {
    return config.totalItems * config.itemHeight;
  }

  function scrollToIndex(config: VirtualScrollConfig, index: number): number {
    return Math.max(0, Math.min(index, config.totalItems - 1)) * config.itemHeight;
  }

  function isInViewport(config: VirtualScrollConfig, index: number): boolean {
    const top = index * config.itemHeight;
    return top >= config.scrollTop && top < config.scrollTop + config.containerHeight;
  }

  it('应计算可见范围', () => {
    const config: VirtualScrollConfig = { itemHeight: 40, containerHeight: 400, totalItems: 1000, scrollTop: 0 };
    const range = calcVisibleRange(config);
    expect(range.start).toBe(0);
    expect(range.end).toBeGreaterThan(0);
    expect(range.offset).toBe(0);
  });

  it('滚动后可见范围应更新', () => {
    const config: VirtualScrollConfig = { itemHeight: 40, containerHeight: 400, totalItems: 1000, scrollTop: 400 };
    const range = calcVisibleRange(config);
    expect(range.start).toBeGreaterThan(0);
    expect(range.offset).toBeGreaterThan(0);
  });

  it('应计算总高度', () => {
    expect(totalHeight({ itemHeight: 50, containerHeight: 500, totalItems: 100, scrollTop: 0 })).toBe(5000);
  });

  it('应计算滚动到索引的位置', () => {
    const config: VirtualScrollConfig = { itemHeight: 40, containerHeight: 400, totalItems: 100, scrollTop: 0 };
    expect(scrollToIndex(config, 10)).toBe(400);
  });

  it('越界索引应限制', () => {
    const config: VirtualScrollConfig = { itemHeight: 40, containerHeight: 400, totalItems: 10, scrollTop: 0 };
    expect(scrollToIndex(config, -1)).toBe(0);
    expect(scrollToIndex(config, 100)).toBe(360);
  });

  it('应判断是否在视口内', () => {
    const config: VirtualScrollConfig = { itemHeight: 40, containerHeight: 400, totalItems: 100, scrollTop: 0 };
    expect(isInViewport(config, 5)).toBe(true);
    expect(isInViewport(config, 50)).toBe(false);
  });

  it('零高度项应正确处理', () => {
    const config: VirtualScrollConfig = { itemHeight: 0, containerHeight: 400, totalItems: 100, scrollTop: 0 };
    expect(totalHeight(config)).toBe(0);
  });

  it('空列表应返回零范围', () => {
    const config: VirtualScrollConfig = { itemHeight: 40, containerHeight: 400, totalItems: 0, scrollTop: 0 };
    const range = calcVisibleRange(config);
    expect(range.end).toBe(0);
  });
});

// 国际化引擎
describe('国际化引擎', () => {
  type Messages = Record<string, string | Record<string, string>>;

  function t(key: string, messages: Messages, params?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: unknown = messages;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[k];
      } else return key;
    }
    if (typeof value !== 'string') return key;
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
    }
    return value;
  }

  function pluralize(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural;
  }

  function formatNumber(n: number, locale: string = 'zh-CN'): string {
    return new Intl.NumberFormat(locale).format(n);
  }

  function formatDate(date: Date, locale: string = 'zh-CN'): string {
    return new Intl.DateTimeFormat(locale).format(date);
  }

  const messages: Messages = {
    greeting: '你好{name}',
    items: { zero: '无项目', one: '{count}个项目', many: '{count}个项目' },
    error: { notFound: '未找到', forbidden: '禁止访问' },
  };

  it('应翻译简单key', () => {
    expect(t('greeting', messages)).toBe('你好{name}');
  });

  it('应替换参数', () => {
    expect(t('greeting', messages, { name: '世界' })).toBe('你好世界');
  });

  it('应翻译嵌套key', () => {
    expect(t('error.notFound', messages)).toBe('未找到');
  });

  it('不存在的key应返回key本身', () => {
    expect(t('missing.key', messages)).toBe('missing.key');
  });

  it('应单复数化', () => {
    expect(pluralize(1, 'item', 'items')).toBe('item');
    expect(pluralize(0, 'item', 'items')).toBe('items');
    expect(pluralize(2, 'item', 'items')).toBe('items');
  });

  it('应格式化数字', () => {
    expect(formatNumber(1234567)).toContain('1');
    expect(formatNumber(0.123)).toContain('0');
  });

  it('应格式化日期', () => {
    const date = new Date('2024-01-15');
    const formatted = formatDate(date);
    expect(formatted).toContain('2024');
  });

  it('多参数替换应正确', () => {
    const msgs: Messages = { msg: '{a} + {b} = {c}' };
    expect(t('msg', msgs, { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
  });

  it('缺少参数应保留占位符', () => {
    const msgs: Messages = { msg: 'hello {name}' };
    expect(t('msg', msgs, {})).toBe('hello {name}');
  });
});

// 动画缓动引擎
describe('动画缓动引擎', () => {
  function linear(t: number): number { return t; }
  function easeInQuad(t: number): number { return t * t; }
  function easeOutQuad(t: number): number { return t * (2 - t); }
  function easeInOutQuad(t: number): number { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  function easeInCubic(t: number): number { return t * t * t; }
  function easeOutCubic(t: number): number { return (--t) * t * t + 1; }
  function easeOutBounce(t: number): number {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  }

  function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }

  function animate(from: number, to: number, duration: number, ease: (t: number) => number, time: number): number {
    const t = Math.min(1, time / duration);
    return lerp(from, to, ease(t));
  }

  it('linear应返回t', () => {
    expect(linear(0.5)).toBe(0.5);
    expect(linear(0)).toBe(0);
    expect(linear(1)).toBe(1);
  });

  it('easeInQuad在t=0.5应小于linear', () => {
    expect(easeInQuad(0.5)).toBeLessThan(linear(0.5));
  });

  it('easeOutQuad在t=0.5应大于linear', () => {
    expect(easeOutQuad(0.5)).toBeGreaterThan(linear(0.5));
  });

  it('easeInOutQuad在t=0.5应等于linear', () => {
    expect(easeInOutQuad(0.5)).toBeCloseTo(0.5);
  });

  it('easeInCubic应从0开始', () => {
    expect(easeInCubic(0)).toBe(0);
    expect(easeInCubic(1)).toBe(1);
  });

  it('easeOutCubic应在1结束', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('easeOutBounce应在边界正确', () => {
    expect(easeOutBounce(0)).toBeCloseTo(0);
    expect(easeOutBounce(1)).toBeCloseTo(1);
  });

  it('应线性插值', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 1)).toBe(100);
  });

  it('应计算动画值', () => {
    expect(animate(0, 100, 1000, linear, 500)).toBe(50);
    expect(animate(0, 100, 1000, linear, 0)).toBe(0);
    expect(animate(0, 100, 1000, linear, 1000)).toBe(100);
  });

  it('超时动画应停在结束值', () => {
    expect(animate(0, 100, 1000, linear, 2000)).toBe(100);
  });

  it('所有缓动函数边界应正确', () => {
    const fns = [linear, easeInQuad, easeOutQuad, easeInOutQuad, easeInCubic, easeOutCubic, easeOutBounce];
    for (const fn of fns) {
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    }
  });
});
