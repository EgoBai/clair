import { describe, it, expect } from 'vitest';
import { detectPatterns, findSupportResistance, type OHLCV } from '../../../frontend/src/utils/chartPatternEngine';
import { detectVolumePatterns } from '../../../frontend/src/utils/volumePatternEngine';

// 技术形态识别测试
// 影子测试迁移（批次 29a）：绑定生产实现
// - detectPatterns / findSupportResistance → frontend/src/utils/chartPatternEngine.ts:136 / :151
// - detectVolumePatterns → frontend/src/utils/volumePatternEngine.ts:35
//
// 旧自抄副本与生产口径差异（夹具/断言据此订正）：
// 1) detectPatterns 从 i=2 起只检测第 i 根本身（旧副本检测 bars[i-1]），返回
//    { name, type: 'bullish'|'bearish'|'neutral', confidence, startIndex, endIndex, description }，
//    没有 old 的 bullish 布尔字段（用 p.type 替代 p.bullish）。
// 2) 锤子线/上吊线由「前一根是否为阴线」区分（旧按 b1.close > b0.close）；两者 confidence 均 0.65。
// 3) 红三兵/三只乌鸦要求连续三根阳/阴线且收盘单调递增/递减；旧三只乌鸦夹具收盘递增，生产不成立。
// 4) findSupportResistance 返回扁平的 { level, type, strength, touches } 数组（非 { support, resistance }），
//    tolerance 0.005，局部极值窗口内任一 j!==i 越界即否决（相邻同价会互相否决）。
// 5) 量价背离统一用 detectVolumePatterns(period)：production 口径为价跌量增→bullish_divergence（:85）、
//    价涨量缩→bearish_divergence（:81）；旧口径「价跌量缩→看涨背离」不成立。
describe('Technical Pattern Recognition', () => {
  const candle = (
    open: number,
    high: number,
    low: number,
    close: number,
    date = '2026-01-01',
    volume = 1000,
  ): OHLCV => ({ date, open, high, low, close, volume });

  const volumeSeries = (closes: number[], volumes: number[]): OHLCV[] =>
    closes.map((close, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: close,
      high: close,
      low: close,
      close,
      volume: volumes[i],
    }));

  it('should detect doji pattern', () => {
    const bars: OHLCV[] = [
      candle(99, 102, 98, 101),
      candle(100, 103, 99, 102),
      candle(102, 105, 99, 102.05), // 十字星：第 3 根，i=2
      candle(102, 103, 99, 100),
    ];
    const patterns = detectPatterns(bars);
    // 旧夹具的 doji 在第 2 根（i=1）上，生产从 i=2 起检测，故形态根后移并按第 3 根造形
    expect(patterns.some(p => p.name === '十字星' && p.type === 'neutral' && p.startIndex === 2)).toBe(true);
  });

  it('should detect hammer pattern', () => {
    const bars: OHLCV[] = [
      candle(99, 102, 98, 101),
      candle(100, 101, 97, 98), // 前一根为阴线 → 锤子线
      candle(98.6, 98.65, 88, 98), // 小实体 + 长下影，i=2
      candle(98, 103, 97, 102),
    ];
    const patterns = detectPatterns(bars);
    expect(patterns.some(p => p.name === '锤子线' && p.type === 'bullish' && p.startIndex === 2)).toBe(true);
  });

  it('should detect bullish engulfing', () => {
    const bars: OHLCV[] = [
      candle(100, 103, 99, 102),
      candle(102, 103, 97, 98), // 阴线
      candle(96, 105, 95, 104), // 看涨吞没，i=2（生产从 i=2 起检）
    ];
    const patterns = detectPatterns(bars);
    expect(patterns.some(p => p.name === '看涨吞没' && p.type === 'bullish' && p.startIndex === 1)).toBe(true);
  });

  it('should detect bearish engulfing', () => {
    const bars: OHLCV[] = [
      candle(100, 103, 99, 102),
      candle(98, 105, 97, 104), // 阳线
      candle(106, 107, 95, 96), // 看跌吞没，i=2
    ];
    const patterns = detectPatterns(bars);
    expect(patterns.some(p => p.name === '看跌吞没' && p.type === 'bearish' && p.startIndex === 1)).toBe(true);
  });

  it('should detect three black crows', () => {
    // 生产口径：连续三根阴线且收盘递减（旧夹具收盘递增 101<102<103，生产不成立，旧断言 therefore 曾落空）
    const bars: OHLCV[] = [
      candle(105, 107, 104, 106),
      candle(106, 107, 103, 104),
      candle(104, 105, 101, 102),
      candle(102, 103, 99, 100),
      candle(100, 101, 97, 98),
    ];
    const patterns = detectPatterns(bars);
    expect(patterns.some(p => p.name === '三只乌鸦' && p.type === 'bearish' && p.startIndex === 1)).toBe(true);
  });

  it('should detect three white soldiers', () => {
    const bars: OHLCV[] = [
      candle(100, 101, 97, 98),
      candle(98, 101, 97, 100),
      candle(100, 103, 99, 102),
      candle(102, 105, 101, 104),
      candle(104, 107, 103, 106),
    ];
    const patterns = detectPatterns(bars);
    expect(patterns.some(p => p.name === '红三兵' && p.type === 'bullish' && p.startIndex === 1)).toBe(true);
  });

  it('should return empty for insufficient data', () => {
    const bars: OHLCV[] = [candle(100, 102, 99, 101)];
    expect(detectPatterns(bars)).toHaveLength(0);
  });

  it('should detect hanging man in uptrend', () => {
    const bars: OHLCV[] = [
      candle(95, 99, 94, 98),
      candle(98, 99, 96, 99), // 前一根为阳线 → 同名形态判为上吊线
      candle(98, 99.4, 88, 99), // 长下影小实体，i=2
      candle(99, 100, 96, 97),
    ];
    const patterns = detectPatterns(bars);
    expect(patterns.some(p => p.name === '上吊线' && p.type === 'bearish' && p.startIndex === 2)).toBe(true);
    expect(patterns.some(p => p.name === '锤子线')).toBe(false);
  });

  it('should assign confidence levels', () => {
    const bars: OHLCV[] = [
      candle(99, 102, 98, 101),
      candle(100, 101, 97, 98),
      candle(98.6, 98.65, 88, 98),
      candle(98, 103, 97, 102),
    ];
    const patterns = detectPatterns(bars);
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) {
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should find support levels', () => {
    // 每 10 根出现一次孤立低点（相距 10 > lookback 5），避免相邻同价互相否决
    const bars: OHLCV[] = [];
    for (let i = 0; i < 50; i++) {
      const base = i % 10 === 5 ? 95 : 100;
      bars.push(candle(base, base + 3, base - 2, base + 1));
    }
    const levels = findSupportResistance(bars, 5);
    const supports = levels.filter(level => level.type === 'support');
    // 旧夹具（i%10<3 的三连低点）在生产严格局部极值口径下 support=0，旧断言 length>=0 恒真
    expect(supports.length).toBe(1);
    expect(supports[0].level).toBeCloseTo(93, 5);
    expect(supports[0].touches).toBe(4);
  });

  it('should find resistance levels', () => {
    const bars: OHLCV[] = [];
    for (let i = 0; i < 50; i++) {
      const base = i % 10 === 5 ? 105 : 100;
      bars.push(candle(base, base + 2, base - 3, base - 1));
    }
    const levels = findSupportResistance(bars, 5);
    const resistances = levels.filter(level => level.type === 'resistance');
    expect(resistances.length).toBe(1);
    expect(resistances[0].level).toBeCloseTo(107, 5);
    expect(resistances[0].touches).toBe(4);
  });

  it('should detect bullish volume divergence', () => {
    // 生产 volumePatternEngine.ts:85：价格下跌 + 成交量放大 → bullish_divergence
    const closes = [
      ...Array.from({ length: 11 }, (_, i) => 100 + 5 * i),
      ...Array.from({ length: 11 }, (_, i) => 150 - 5 * (i + 1)),
    ];
    const volumes = [
      ...Array.from({ length: 11 }, () => 1000),
      ...Array.from({ length: 11 }, (_, i) => 3000 + 500 * i),
    ];
    const analysis = detectVolumePatterns(volumeSeries(closes, volumes), 5);
    const bullish = analysis.patterns.filter(p => p.type === 'bullish_divergence');
    expect(bullish.length).toBe(9);
    expect(bullish[0].date).toBe('2026-01-14');
  });

  it('should detect bearish volume divergence', () => {
    // 生产 volumePatternEngine.ts:81：价格上涨 + 成交量萎缩 → bearish_divergence
    const closes = [
      ...Array.from({ length: 11 }, (_, i) => 100 + 5 * i),
      ...Array.from({ length: 11 }, (_, i) => 150 + 2 * (i + 1)),
    ];
    const volumes = [
      ...Array.from({ length: 11 }, () => 1000),
      ...Array.from({ length: 11 }, () => 200),
    ];
    const analysis = detectVolumePatterns(volumeSeries(closes, volumes), 5);
    const bearish = analysis.patterns.filter(p => p.type === 'bearish_divergence');
    expect(bearish.length).toBe(5);
    expect(bearish[0].date).toBe('2026-01-12');
  });

  it('should not report bullish divergence when price falls with shrinking volume', () => {
    // 旧口径「价跌量缩 → 看涨背离」不成立：生产只认价跌量增（:85），旧夹具实测仅出 bearish_divergence
    const closes = [
      ...Array.from({ length: 10 }, (_, i) => 100 + 0.5 * i),
      ...Array.from({ length: 10 }, (_, i) => 100 - 0.5 * (i + 10)),
    ];
    const volumes = [
      ...Array.from({ length: 10 }, () => 2000),
      ...Array.from({ length: 10 }, () => 500),
    ];
    const patterns = detectVolumePatterns(volumeSeries(closes, volumes), 5).patterns;
    expect(patterns.filter(p => p.type === 'bullish_divergence')).toHaveLength(0);
    expect(patterns.filter(p => p.type === 'bearish_divergence')).toHaveLength(0);
    // 该夹具只触发缩量形态（volume_dry_up），不产生任何量价背离
    expect(patterns.every(p => p.type === 'volume_dry_up')).toBe(true);
  });

  it('should not detect patterns in flat market', () => {
    const bars: OHLCV[] = Array.from({ length: 10 }, () => candle(100, 100.5, 99.5, 100.1));
    const patterns = detectPatterns(bars);
    // 生产对 body/range < 0.1 的浮点判定（0.1/1.0 = 0.0999... < 0.1）确实识别出十字星，
    // 但平坦市场不应出现任何方向性形态，全部 confidence 0.6/neutral。
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every(p => p.type === 'neutral' && p.name === '十字星' && p.confidence === 0.6)).toBe(true);
  });

  it('should handle rising market patterns', () => {
    const bars: OHLCV[] = [];
    let price = 90;
    for (let i = 0; i < 20; i++) {
      bars.push(candle(price, price + 3, price - 1, price + 2));
      price += 2;
    }
    const patterns = detectPatterns(bars);
    expect(patterns.some(p => p.type === 'bullish')).toBe(true);
    expect(patterns.some(p => p.name === '红三兵')).toBe(true);
  });

  it('should handle falling market patterns', () => {
    const bars: OHLCV[] = [];
    let price = 110;
    for (let i = 0; i < 20; i++) {
      const close = price - 2;
      bars.push(candle(price, price + 1, close - 1, close));
      price = close;
    }
    const patterns = detectPatterns(bars);
    expect(patterns.some(p => p.name === '三只乌鸦' && p.type === 'bearish')).toBe(true);
  });

  it('should detect multiple patterns per bar', () => {
    // 同一根（i=2）同时满足十字星与锤子线/上吊线判定
    const bars: OHLCV[] = [
      candle(99, 102, 98, 101),
      candle(102, 102.5, 100, 100),
      candle(100, 100.6, 95, 100.5),
      candle(100, 101, 97, 99),
    ];
    const patterns = detectPatterns(bars);
    const namesAtBar2 = patterns.filter(p => p.startIndex === 2).map(p => p.name);
    expect(namesAtBar2).toContain('十字星');
    expect(namesAtBar2).toContain('锤子线');
  });

  it('should handle zero range bars', () => {
    const bars: OHLCV[] = [
      candle(100, 102, 99, 101),
      candle(100, 100, 100, 100), // 零振幅：生产 range===0 直接返回 null
      candle(100, 102, 99, 101),
    ];
    expect(() => detectPatterns(bars)).not.toThrow();
    expect(detectPatterns(bars)).toHaveLength(0);
  });

  it('should not find support in trending up market', () => {
    const bars: OHLCV[] = [];
    for (let i = 0; i < 50; i++) {
      bars.push(candle(90 + i, 92 + i, 89 + i, 91 + i));
    }
    const levels = findSupportResistance(bars, 5);
    expect(levels.filter(level => level.type === 'support')).toHaveLength(0);
  });
});
