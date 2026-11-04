/**
 * 渲染优化与格式化 — 影子测试迁移（批次 33a）
 *
 * ── 一、绑定真源 ──
 * | 本文件符号 | 生产文件:行 | 契约 |
 * |---|---|---|
 * | 颜色插值 | frontend/src/utils/chartAnimation.ts:62-79 | lerpColor(start, end, t)：hex 逐通道 Math.round(lerp(...))，输出小写 6 位 hex（#000000→#ffffff 0.5 = #808080，与旧内联同式）。 |
 * | 可见范围 | frontend/src/utils/virtualScroll.ts:28-49 | calculateVirtualRange(config)：startIndex=max(0, floor(st/ih)-overscan)（:33）、endIndex=min(totalCount-1, rawStart+ceil(ch/ih)+overscan)（:34，含端点）、totalHeight=totalCount*ih（:45）、offsetY=startIndex*ih（:46）。 |
 * | 总高度 | frontend/src/utils/virtualScroll.ts:45 | totalHeight = config.totalCount * config.itemHeight。 |
 * | 缓动函数 | frontend/src/utils/chartAnimation.ts:32-43 | easings.linear / easeIn(t²) / easeOut(t(2-t)) / easeInOut（:36）/ bounce（:37-42，7.5625 分段）。 |
 * | 数值插值 | frontend/src/utils/chartAnimation.ts:48-50 | lerp(start, end, t) = start + (end-start)*t。 |
 * | 翻译 | frontend/src/utils/i18nEngine.ts:213-245 | createTranslator(locale, customMessages).t(key, params)：嵌套键由 flattenMessages 压平（:247-258），缺 key 返回 key（:229），params 逐键 replace 且缺参保留占位符（:231-235）。 |
 * | 复数 | frontend/src/utils/i18nEngine.ts:411-429 | pluralize(count, rule, locale='zh-CN')：zero > one > other（:418-426），最后 replace('{n}', count)（:428）。 |
 * | 数字格式化 | frontend/src/i18n/i18nManager.ts:151-157 | formatNumber(value, locale='zh-CN', options={}) → Intl.NumberFormat，NaN→'NaN'、Infinity→'∞'。 |
 * | 日期格式化 | frontend/src/i18n/i18nManager.ts:134-146 | formatDate(date, locale='zh-CN', options={}) → Intl.DateTimeFormat(locale, {year:'numeric', month:'2-digit', day:'2-digit'})，zh-CN 输出 2024/01/15。 |
 *
 * 为何选 i18nManager 而非 exportEngine：本文件断言是 UI 展示格式化（Intl 本地化），
 * 与 i18nManager.formatNumber/formatDate 同契约；exportEngine.ts:73-81 的 formatNumber 是固定 zh-CN 千分位、
 * null/undefined→'-'、NaN→String(value)，bloombergExportEngine.ts:112-120 同款，均为导出场景专用，语义不符。
 *
 * ── 二、旧断言订正（旧值 → 生产值 + file:line）──
 * 1. 虚拟可见范围终值：旧 end=min(totalItems, start+ceil(ch/ih)+4) 为排他终值 → 生产 endIndex=min(totalCount-1, ...) 为含端点索引（virtualScroll.ts:34）。5 项列表：旧 end 5 → 生产 endIndex 4；空列表：旧 0 → 生产 endIndex -1（totalCount-1=-1）。
 * 2. 虚拟配置字段：totalItems → totalCount，overscan 由生产 config 显式传入（virtualScroll.ts:8-14、:29、:33-34）；旧内联写死 overscan=2。夹具统一补 overscan:2，数值与旧端一致（旧 end 排他 = 新 endIndex+1）。
 * 3. 数字格式化弱断言：toContain('1') / toContain('0') → 生产精确值 '1,234,567' / '0.123'（i18nManager.ts:156）；另按生产绑定 NaN→'NaN'、Infinity→'∞'。
 * 4. 日期格式化弱断言：toContain('2024') → 生产 '2024/01/15'（i18nManager.ts:140-145，month/day 均为 2-digit）；夹具 new Date('2024-01-15')（UTC 解析，跨时区会漂移）改为 new Date(2024, 0, 15)（本地构造，确定）。
 * 5. 翻译签名：t(key, messages, params) → createTranslator(locale, messages).t(key, params)（i18nEngine.ts:213-238）；语义不变（缺 key 返回 key、缺参保留占位符、多参逐个替换）。
 * 6. 复数签名：pluralize(count, singular, plural) → pluralize(count, {one, other})（i18nEngine.ts:411-429）；无 {n} 占位时结果与旧一致，另补带占位符断言。
 * 7. 缓动绑定：easeOutBounce → easings.bounce（chartAnimation.ts:37-42 同式）；easeInQuad/easeOutQuad/easeInOutQuad → easings.easeIn/easeOut/easeInOut（:33-36 同式），边界值不变。
 *
 * ── 三、未迁移·生产缺口 ──
 * - simplifyPoints / perpendicularDistance：非测试源码 0 命中（rg 仅命中本测试）；chartPerformance.ts:33 sampleLTTB 是按桶均值取三角面积的另一算法，契约不同，保留内联。
 * - calculateTickPositions：生产无 nice tick 导出（rg calculateTickPositions|niceTicks 0 命中），保留内联。
 * - viewportClip / dataToPixel / calculateAspectRatio：非测试源码 0 命中（rg），保留内联。
 * - scrollToIndex：生产 virtualScrollEngine.ts:294-317 的 scrollToIndex 返回 {targetScrollTop, shouldScroll} 且按「居中滚动」计算（:310-315）；本文件契约是 clamp(index,0,total-1)*itemHeight，语义不同，保留内联。
 * - isInViewport：非测试源码 0 命中，保留内联。
 * - easeInCubic / easeOutCubic：生产 easings 仅有 linear/easeIn/easeOut/easeInOut/bounce（chartAnimation.ts:32-43），保留内联。
 * - animate：生产无标量 animate 导出（chartAnimation.ts:85 createDataAnimator 为 rAF 版），改为 lerp（生产 :48-50）+ 传入缓动（生产 easings）组合，只保留时间归一化。
 * - totalHeight：生产无独立导出，改为 calculateVirtualRange(config).totalHeight（virtualScroll.ts:45）。
 */
import { describe, it, expect } from 'vitest';
import { easings, lerp, lerpColor } from '../utils/chartAnimation';
import {
  calculateVirtualRange,
  type VirtualScrollConfig,
} from '../utils/virtualScroll';
import { createTranslator, pluralize } from '../utils/i18nEngine';
import { formatDate, formatNumber } from '../i18n/i18nManager';

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
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(lerpColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(lerpColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
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
  const configWith = (overrides: Partial<VirtualScrollConfig>): VirtualScrollConfig => ({
    itemHeight: 40,
    containerHeight: 400,
    totalCount: 1000,
    scrollTop: 0,
    overscan: 2,
    ...overrides,
  });

  // 生产无 clamp 版 scrollToIndex（virtualScrollEngine.ts:294-317 为居中滚动），保留内联
  function scrollToIndex(config: VirtualScrollConfig, index: number): number {
    return Math.max(0, Math.min(index, config.totalCount - 1)) * config.itemHeight;
  }

  // 生产无 isInViewport 导出，保留内联
  function isInViewport(config: VirtualScrollConfig, index: number): boolean {
    const top = index * config.itemHeight;
    return top >= config.scrollTop && top < config.scrollTop + config.containerHeight;
  }

  it('应计算可见范围', () => {
    const range = calculateVirtualRange(configWith({ scrollTop: 0 }));
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBeGreaterThan(0);
    expect(range.offsetY).toBe(0);
  });

  it('滚动后可见范围应更新', () => {
    const range = calculateVirtualRange(configWith({ scrollTop: 400 }));
    expect(range.startIndex).toBeGreaterThan(0);
    expect(range.offsetY).toBeGreaterThan(0);
  });

  it('应计算总高度', () => {
    expect(calculateVirtualRange(configWith({ itemHeight: 50, containerHeight: 500, totalCount: 100 })).totalHeight).toBe(5000);
  });

  it('应计算滚动到索引的位置', () => {
    const config = configWith({});
    expect(scrollToIndex(config, 10)).toBe(400);
  });

  it('越界索引应限制', () => {
    const config = configWith({ totalCount: 10 });
    expect(scrollToIndex(config, -1)).toBe(0);
    expect(scrollToIndex(config, 100)).toBe(360);
  });

  it('应判断是否在视口内', () => {
    const config = configWith({});
    expect(isInViewport(config, 5)).toBe(true);
    expect(isInViewport(config, 50)).toBe(false);
  });

  it('零高度项应正确处理', () => {
    const config = configWith({ itemHeight: 0, containerHeight: 400, totalCount: 100 });
    expect(calculateVirtualRange(config).totalHeight).toBe(0);
  });

  it('空列表应返回零范围', () => {
    const config = configWith({ totalCount: 0 });
    const range = calculateVirtualRange(config);
    // 生产 endIndex = min(totalCount-1, ...) = -1（virtualScroll.ts:34），旧内联排他终值为 0
    expect(range.endIndex).toBe(-1);
    expect(range.items).toHaveLength(0);
  });
});

// 国际化引擎
describe('国际化引擎', () => {
  const messages = {
    greeting: '你好{name}',
    items: { zero: '无项目', one: '{count}个项目', many: '{count}个项目' },
    error: { notFound: '未找到', forbidden: '禁止访问' },
  };

  const { t } = createTranslator('zh-CN', messages);

  it('应翻译简单key', () => {
    expect(t('greeting')).toBe('你好{name}');
  });

  it('应替换参数', () => {
    expect(t('greeting', { name: '世界' })).toBe('你好世界');
  });

  it('应翻译嵌套key', () => {
    expect(t('error.notFound')).toBe('未找到');
  });

  it('不存在的key应返回key本身', () => {
    expect(t('missing.key')).toBe('missing.key');
  });

  it('应单复数化', () => {
    expect(pluralize(1, { one: 'item', other: 'items' })).toBe('item');
    expect(pluralize(0, { one: 'item', other: 'items' })).toBe('items');
    expect(pluralize(2, { one: 'item', other: 'items' })).toBe('items');
    expect(pluralize(3, { other: '{n} 个项目' })).toBe('3 个项目');
  });

  it('应格式化数字', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(0.123)).toBe('0.123');
    expect(formatNumber(NaN)).toBe('NaN');
    expect(formatNumber(Infinity)).toBe('∞');
  });

  it('应格式化日期', () => {
    const date = new Date(2024, 0, 15); // 本地构造，跨时区确定
    expect(formatDate(date)).toBe('2024/01/15');
  });

  it('多参数替换应正确', () => {
    const { t: tMsg } = createTranslator('zh-CN', { msg: '{a} + {b} = {c}' });
    expect(tMsg('msg', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
  });

  it('缺少参数应保留占位符', () => {
    const { t: tHello } = createTranslator('zh-CN', { msg: 'hello {name}' });
    expect(tHello('msg', {})).toBe('hello {name}');
  });
});

// 动画缓动引擎
describe('动画缓动引擎', () => {
  const { linear, easeIn, easeOut, easeInOut, bounce } = easings;

  function easeInCubic(t: number): number { return t * t * t; }
  function easeOutCubic(t: number): number { return (--t) * t * t + 1; }

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
    expect(easeIn(0.5)).toBeLessThan(linear(0.5));
  });

  it('easeOutQuad在t=0.5应大于linear', () => {
    expect(easeOut(0.5)).toBeGreaterThan(linear(0.5));
  });

  it('easeInOutQuad在t=0.5应等于linear', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
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
    expect(bounce(0)).toBeCloseTo(0);
    expect(bounce(1)).toBeCloseTo(1);
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
    const fns = [linear, easeIn, easeOut, easeInOut, easeInCubic, easeOutCubic, bounce];
    for (const fn of fns) {
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    }
  });
});
