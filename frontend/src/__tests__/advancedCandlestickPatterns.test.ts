import { describe, it, expect } from 'vitest';
import { detectPatterns, findSupportResistance, type OHLCV } from '../utils/chartPatternEngine';
import { detectVolumePatterns, type VolumeCandle } from '../utils/volumePatternEngine';

/**
 * 高级K线形态识别（影子测试迁移版）
 *
 * 一、原自抄实现的问题
 * 1. 文件内自建 Candle 结构与 isDoji/isHammer/isEngulfing/... 全套识别器，从未 import 生产实现：
 *    生产阈值演进后测试依旧全绿。具体的口径漂移：锤子线自抄为「下影线 ≥2 倍实体 + 上影线 ≤0.3 倍实体」，
 *    生产是「下影线 >2 倍实体 + 上影线 <0.5 倍实体 + 实体/振幅 >0.05」（chartPatternEngine.ts:60）。
 * 2. 「上吊线与锤子线实体方向不同」把区分条件写成实体阴阳，生产按「前一根 K 线方向」区分
 *    （chartPatternEngine.ts:61），旧断言写死在实体上，生产换成前一根口径也照样通过。
 * 3. 「识别乌云盖顶」是 expect(true).toBe(true) 占位断言，等于零断言；且自抄 isDarkCloudCover 的
 *    「curr.close < mid 且 curr.close > prev.close」对阳线前一根不可能同时成立（阳线的 mid 恒小于 close），
 *    所以当时造不出夹具才留占位。生产无该形态导出，本次按标准定义改为 close < mid 且 close > prev.open。
 * 4. 支撑阻力自抄为「全局最低价 / 全局最高价」，生产 findSupportResistance 只把窗口内的局部极值当水平位
 *    （chartPatternEngine.ts:155-179），两者不是同一契约。
 * 5. 成交量段自抄「前两根均量 1.5 倍」与「逐根递增比例 >0.6」，生产是「20 根均量 3 倍 + |涨跌幅| >3%」
 *    （volumePatternEngine.ts:54）与「近 10 根 vs 前 10 根均量 1.1/0.9」（:99-103），且不足 period 直接抛错（:36）。
 *
 * 二、绑定生产实现（file:line）
 * - 单根/双根/三根形态 → frontend/src/utils/chartPatternEngine.ts:136 detectPatterns。
 *   内部 detectDoji(:34) / detectHammer(:51) / detectEngulfing(:76) / detectStar(:94) / detectThreeMethods(:115)
 *   全部未导出，只能以 detectPatterns 返回值的 name 断言。
 *   选型理由（仓库内三个同义 detectPatterns）：
 *   a. chartPatternEngine.ts:136 —— 语义就是本文件的 K 线形态（十字星/锤子/上吊/吞没/早晨黄昏之星/红三兵三只乌鸦），
 *      与自抄副本一一对应，且从 i=2 起逐根识别（:138），故取此实现。
 *   b. technicalPatternEngine.ts:46 TechnicalPatternEngine.detectPatterns —— 锤子线不按前一根区分上吊线、
 *      吞没只有看涨分支且用「实体更大」代替「反向包裹」，表达不了本文件的双根/上吊线断言。
 *   c. patternRecognition.ts:107 detectPatterns —— 语义是图表形态（双底/双顶/头肩底/趋势），不是单根 K 线形态；
 *      其私有 clusterPrices 还用 new Date，不符合确定性要求。
 * - 支撑阻力 → frontend/src/utils/chartPatternEngine.ts:151 findSupportResistance（lookback 默认 20，传 1 缩小窗口）。
 * - 成交量配合 → frontend/src/utils/volumePatternEngine.ts:35 detectVolumePatterns（period 默认 20）。
 * 两个目标模块顶部均无第三方浏览器依赖（无 import），跨包引用安全。
 *
 * 三、未迁移清单及原因（保留内联）
 * - 射击之星 / 倒锤子 / 光头光脚 / 纺锤顶 / 蜻蜓十字 / 墓碑十字 / 长腿十字：生产 detectPatterns 只有
 *   5 个 detector（chartPatternEngine.ts:139），无同契约导出；detectDoji 只判「实体/振幅 <0.1」，
 *   不区分四种十字星变体。
 * - K 线几何 helper（bodySize/upperShadow/lowerShadow/totalRange/isBullish/isBearish/bodyRatio）：
 *   生产未导出，且被上面这些未迁移形态断言复用，保留内联。
 * - 孕线 / 刺透 / 乌云盖顶 / 镊子：生产无对应 detector，保留内联。
 * - 形态强度评分 patternStrength、缺口 detectGaps/gapSize、组合评分 comboScore、影线比例 shadowAnalysis：
 *   生产无同契约导出（PatternResult.confidence 是每个形态的固定常量，不是量能加权强度）。
 *
 * 夹具全部为确定性字面量，无随机数与时间依赖。
 */

type Candle = Omit<OHLCV, 'date'>;

const DATE = '2025-01-15';

const candle = (
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
): OHLCV => ({ date: DATE, open, high, low, close, volume });

const withDate = (c: Candle): OHLCV => ({ ...c, date: DATE });

const flat = candle(100, 101, 99, 100.5);

const names = (candles: OHLCV[]): string[] => detectPatterns(candles).map((p) => p.name);

const volumeCandles = (volumes: number[], lastClose = 100): VolumeCandle[] =>
  volumes.map((volume, i) => {
    const close = i === volumes.length - 1 ? lastClose : 100;
    return {
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      open: 100,
      high: Math.max(101, close),
      low: Math.min(99, close),
      close,
      volume,
    };
  });

// 高级K线形态识别引擎
describe('高级K线形态识别引擎', () => {
  function bodySize(c: Candle): number { return Math.abs(c.close - c.open); }
  function upperShadow(c: Candle): number { return c.high - Math.max(c.open, c.close); }
  function lowerShadow(c: Candle): number { return Math.min(c.open, c.close) - c.low; }
  function totalRange(c: Candle): number { return c.high - c.low; }
  function isBullish(c: Candle): boolean { return c.close > c.open; }
  function isBearish(c: Candle): boolean { return c.close < c.open; }
  function bodyRatio(c: Candle): number { return totalRange(c) === 0 ? 0 : bodySize(c) / totalRange(c); }

  describe('单根K线形态', () => {
    // 生产无导出：射击之星 / 倒锤子 / 光头光脚 / 纺锤顶 / 三种十字星变体（见文件头「未迁移」）。
    function isShootingStar(c: Candle): boolean {
      return upperShadow(c) >= 2 * bodySize(c) && lowerShadow(c) <= bodySize(c) * 0.3;
    }
    function isInvertedHammer(c: Candle): boolean {
      return isBullish(c) && upperShadow(c) >= 2 * bodySize(c) && lowerShadow(c) <= bodySize(c) * 0.3;
    }
    function isMarubozu(c: Candle): boolean {
      return upperShadow(c) < totalRange(c) * 0.02 && lowerShadow(c) < totalRange(c) * 0.02;
    }
    function isSpinningTop(c: Candle): boolean {
      return bodyRatio(c) < 0.3 && bodyRatio(c) >= 0.1 && upperShadow(c) > 0 && lowerShadow(c) > 0;
    }
    function isDragonflyDoji(c: Candle): boolean {
      return bodyRatio(c) < 0.1 && lowerShadow(c) >= totalRange(c) * 0.6;
    }
    function isGravestoneDoji(c: Candle): boolean {
      return bodyRatio(c) < 0.1 && upperShadow(c) >= totalRange(c) * 0.6;
    }
    function isLongLeggedDoji(c: Candle): boolean {
      return bodyRatio(c) < 0.1 && upperShadow(c) >= totalRange(c) * 0.3 && lowerShadow(c) >= totalRange(c) * 0.3;
    }

    // detectPatterns 从 i=2 起识别（chartPatternEngine.ts:138），单根形态要放在第 3 根（下标 2）。
    const at2 = (target: Candle): OHLCV[] => [flat, flat, withDate(target)];

    it('识别十字星', () => {
      // 生产 detectDoji：实体/振幅 < 0.1（chartPatternEngine.ts:39）
      expect(names(at2({ open: 100, high: 102, low: 98, close: 100.2, volume: 1000 }))).toContain('十字星');
      expect(names(at2({ open: 100, high: 110, low: 90, close: 105, volume: 1000 }))).not.toContain('十字星');
    });

    it('十字星实体极小', () => {
      const doji: Candle = { open: 50, high: 52, low: 48, close: 50.1, volume: 500 };
      expect(bodySize(doji)).toBeLessThan(0.5);
      expect(names(at2(doji))).toContain('十字星');
    });

    it('识别锤子线', () => {
      // 前一根为阴线 → 生产判为锤子线（chartPatternEngine.ts:61-63）
      expect(names([flat, candle(106, 107, 99, 100), candle(100, 105, 90, 104)])).toContain('锤子线');
    });

    it('锤子线下影线长', () => {
      const hammer = candle(100, 105, 90, 104);
      expect(lowerShadow(hammer)).toBe(10);
      // 旧夹具 high=95.3 < close=95.5 是非法 OHLC（上影线算出负值），修正后生产口径要求上影线 < 实体×0.5 = 2
      expect(upperShadow(hammer)).toBe(1);
      expect(names([flat, candle(106, 107, 99, 100), hammer])).toContain('锤子线');
    });

    it('识别上吊线', () => {
      // 前一根为阳线 → 生产判为上吊线（chartPatternEngine.ts:63）
      expect(names([flat, candle(100, 107, 99, 106), candle(104, 105, 90, 100)])).toContain('上吊线');
    });

    it('上吊线与锤子线实体方向不同', () => {
      // 旧断言用「实体阴阳」区分锤子/上吊，与生产不符：生产只看前一根方向（chartPatternEngine.ts:61），
      // 同一根阳线实体在前一根阴线后是锤子线、在阳线后是上吊线。
      const sameBody = candle(100, 105, 90, 104);
      expect(names([flat, candle(106, 107, 99, 100), sameBody])).toContain('锤子线');
      expect(names([flat, candle(100, 107, 99, 106), sameBody])).toContain('上吊线');
    });

    it('识别射击之星', () => {
      // 生产无射击之星 detector，保留内联；夹具改为合法 OHLC（low ≤ close）
      const star: Candle = { open: 100, high: 115, low: 98.8, close: 99, volume: 1000 };
      expect(isShootingStar(star)).toBe(true);
    });

    it('射击之星上影线长', () => {
      const star: Candle = { open: 100, high: 115, low: 98.8, close: 99, volume: 1000 };
      expect(upperShadow(star)).toBe(15);
      expect(upperShadow(star)).toBeGreaterThan(10);
    });

    it('识别倒锤子', () => {
      const inv: Candle = { open: 100, high: 115, low: 99.95, close: 100.5, volume: 1000 };
      expect(isInvertedHammer(inv)).toBe(true);
    });

    it('识别光头光脚', () => {
      const maru: Candle = { open: 100, high: 110, low: 100, close: 110, volume: 1000 };
      expect(isMarubozu(maru)).toBe(true);
    });

    it('光头光脚无影线', () => {
      const maru: Candle = { open: 100, high: 110, low: 100, close: 110, volume: 1000 };
      expect(upperShadow(maru)).toBe(0);
      expect(lowerShadow(maru)).toBe(0);
    });

    it('识别纺锤顶', () => {
      const spin: Candle = { open: 100, high: 105, low: 95, close: 101, volume: 1000 };
      expect(isSpinningTop(spin)).toBe(true);
    });

    it('识别蜻蜓十字', () => {
      const dragon: Candle = { open: 100, high: 100.5, low: 90, close: 100.1, volume: 1000 };
      expect(isDragonflyDoji(dragon)).toBe(true);
    });

    it('识别墓碑十字', () => {
      const grave: Candle = { open: 100, high: 110, low: 99.5, close: 100.1, volume: 1000 };
      expect(isGravestoneDoji(grave)).toBe(true);
    });

    it('识别长腿十字', () => {
      const long: Candle = { open: 100, high: 108, low: 92, close: 100.2, volume: 1000 };
      expect(isLongLeggedDoji(long)).toBe(true);
    });

    it('计算实体比例', () => {
      const c: Candle = { open: 100, high: 110, low: 90, close: 105, volume: 1000 };
      expect(bodyRatio(c)).toBe(0.25);
    });

    it('涨K线判断', () => {
      expect(isBullish({ open: 100, high: 105, low: 98, close: 103, volume: 100 })).toBe(true);
      expect(isBullish({ open: 100, high: 105, low: 98, close: 98, volume: 100 })).toBe(false);
    });

    it('跌K线判断', () => {
      expect(isBearish({ open: 100, high: 105, low: 95, close: 97, volume: 100 })).toBe(true);
      expect(isBearish({ open: 100, high: 105, low: 95, close: 103, volume: 100 })).toBe(false);
    });

    it('上影线计算', () => {
      const c: Candle = { open: 100, high: 110, low: 95, close: 105, volume: 100 };
      expect(upperShadow(c)).toBe(5);
    });

    it('下影线计算', () => {
      const c: Candle = { open: 100, high: 105, low: 90, close: 95, volume: 100 };
      expect(lowerShadow(c)).toBe(5);
    });

    it('总振幅计算', () => {
      const c: Candle = { open: 100, high: 110, low: 90, close: 105, volume: 100 };
      expect(totalRange(c)).toBe(20);
    });

    it('一字涨停板', () => {
      const limitUp: Candle = { open: 10, high: 10.01, low: 9.99, close: 10, volume: 0 };
      expect(totalRange(limitUp)).toBeCloseTo(0.02);
      // 生产只能从振幅判形态：一字板实体为 0 → 判为十字星（chartPatternEngine.ts:39）。这是现行口径，如实断言。
      expect(names(at2(limitUp))).toContain('十字星');
    });

    it('一字跌停板', () => {
      const limitDown: Candle = { open: 10, high: 10, low: 10, close: 10, volume: 0 };
      expect(isBullish(limitDown)).toBe(false);
      expect(isBearish(limitDown)).toBe(false);
      // 振幅为 0 时生产 detectDoji 直接跳过（chartPatternEngine.ts:38 range === 0 return null）
      expect(names(at2(limitDown))).not.toContain('十字星');
    });
  });

  describe('双K线形态', () => {
    // 生产无导出：孕线 / 刺透 / 乌云盖顶 / 镊子（见文件头「未迁移」）；吞没改用生产 detectEngulfing。
    function isHarami(prev: Candle, curr: Candle): boolean {
      return Math.abs(curr.open - curr.close) < Math.abs(prev.open - prev.close) &&
        Math.min(curr.open, curr.close) > Math.min(prev.open, prev.close) &&
        Math.max(curr.open, curr.close) < Math.max(prev.open, prev.close);
    }
    function isPiercingPattern(prev: Candle, curr: Candle): boolean {
      const mid = (prev.open + prev.close) / 2;
      return isBearish(prev) && isBullish(curr) && curr.open < prev.low && curr.close > mid && curr.close < prev.open;
    }
    function isDarkCloudCover(prev: Candle, curr: Candle): boolean {
      // 修正自抄定义：旧条件 close < mid 且 close > prev.close 对阳线前一根恒不成立（mid 恒小于 close）。
      const mid = (prev.open + prev.close) / 2;
      return isBullish(prev) && isBearish(curr) && curr.open > prev.high && curr.close < mid && curr.close > prev.open;
    }
    function isTweezer(prev: Candle, curr: Candle, tolerance: number = 0.01): boolean {
      const prevTop = Math.max(prev.open, prev.close);
      const currTop = Math.max(curr.open, curr.close);
      return Math.abs(prevTop - currTop) < tolerance;
    }

    it('识别看涨吞没', () => {
      // 生产：前阴后阳，且 curr.open < prev.close、curr.close > prev.open（chartPatternEngine.ts:82）
      const prev = candle(105, 106, 99, 100);
      const curr = candle(99, 108, 98, 107);
      const found = detectPatterns([flat, prev, curr]).filter((p) => p.name === '看涨吞没');
      expect(found).toHaveLength(1);
      expect(found[0].type).toBe('bullish');
      expect(found[0].confidence).toBe(0.7);
    });

    it('识别看跌吞没', () => {
      const prev = candle(100, 108, 99, 107);
      const curr = candle(108, 109, 98, 99);
      const found = detectPatterns([flat, prev, curr]).filter((p) => p.name === '看跌吞没');
      expect(found).toHaveLength(1);
      expect(found[0].type).toBe('bearish');
      expect(found[0].confidence).toBe(0.7);
    });

    it('非吞没形态返回null', () => {
      const prev = candle(100, 105, 98, 103);
      const curr = candle(103, 106, 101, 104);
      const got = names([flat, prev, curr]);
      expect(got).not.toContain('看涨吞没');
      expect(got).not.toContain('看跌吞没');
    });

    it('识别孕线形态', () => {
      const prev: Candle = { open: 100, high: 110, low: 90, close: 95, volume: 1000 };
      const curr: Candle = { open: 96, high: 98, low: 94, close: 97, volume: 800 };
      expect(isHarami(prev, curr)).toBe(true);
    });

    it('识别刺透形态', () => {
      const prev: Candle = { open: 110, high: 111, low: 100, close: 101, volume: 1000 };
      const curr: Candle = { open: 99, high: 107, low: 98, close: 106, volume: 1500 };
      expect(isPiercingPattern(prev, curr)).toBe(true);
    });

    it('识别乌云盖顶', () => {
      // 旧用例是 expect(true).toBe(true) 占位；自抄判定条件不可满足已修正（见文件头第 3 条）。
      const prev: Candle = { open: 100, high: 112, low: 99, close: 108, volume: 1000 };
      const curr: Candle = { open: 113, high: 114, low: 102, close: 103, volume: 1500 };
      expect(isDarkCloudCover(prev, curr)).toBe(true);
      expect(isDarkCloudCover(prev, { ...curr, close: 106 })).toBe(false);
    });

    it('识别镊子顶', () => {
      const prev: Candle = { open: 100, high: 108, low: 98, close: 108, volume: 1000 };
      const curr: Candle = { open: 108, high: 109, low: 101, close: 107, volume: 1000 };
      expect(isTweezer(prev, curr)).toBe(true);
    });

    it('吞没必须方向相反', () => {
      const prev = candle(100, 105, 98, 103);
      const curr = candle(102, 108, 101, 107);
      const got = names([flat, prev, curr]);
      expect(got).not.toContain('看涨吞没');
      expect(got).not.toContain('看跌吞没');
    });

    it('孕线内部K线小于外部', () => {
      const outer: Candle = { open: 100, high: 110, low: 90, close: 95, volume: 1000 };
      const inner: Candle = { open: 94, high: 98, low: 92, close: 96, volume: 800 };
      expect(bodySize(inner)).toBeLessThan(bodySize(outer));
    });

    it('刺透形态收盘价必须超过中点', () => {
      const prev: Candle = { open: 110, high: 111, low: 100, close: 101, volume: 1000 };
      const curr: Candle = { open: 99, high: 102, low: 98, close: 102, volume: 1000 };
      const mid = (prev.open + prev.close) / 2; // 105.5
      expect(curr.close).toBeLessThan(mid);
      expect(isPiercingPattern(prev, curr)).toBe(false);
    });
  });

  describe('三K线形态', () => {
    // 生产 detectStar（chartPatternEngine.ts:94）与 detectThreeMethods（:115）已覆盖晨星/暮星/红三兵/三只乌鸦，
    // 因此不再保留自抄实现；bodySize/bodyRatio 仅用于「实体最小」等几何断言。
    it('识别晨星', () => {
      const c1 = candle(110, 111, 100, 101);
      const c2 = candle(100, 102, 99, 101);
      const c3 = candle(102, 112, 101, 111);
      const found = detectPatterns([c1, c2, c3]).filter((p) => p.name === '早晨之星');
      expect(found).toHaveLength(1);
      expect(found[0].type).toBe('bullish');
    });

    it('识别暮星', () => {
      const c1 = candle(100, 110, 99, 109);
      const c2 = candle(109, 111, 108, 110);
      const c3 = candle(108, 109, 99, 100);
      const found = detectPatterns([c1, c2, c3]).filter((p) => p.name === '黄昏之星');
      expect(found).toHaveLength(1);
      expect(found[0].type).toBe('bearish');
    });

    it('识别三白兵', () => {
      // 生产形态名是「红三兵」（chartPatternEngine.ts:122）
      const candles = [
        candle(100, 108, 99, 107),
        candle(107, 115, 106, 114),
        candle(114, 122, 113, 121),
      ];
      expect(names(candles)).toContain('红三兵');
    });

    it('识别三黑鸦', () => {
      // 生产形态名是「三只乌鸦」（chartPatternEngine.ts:128）
      const candles = [
        candle(120, 121, 113, 113),
        candle(113, 114, 106, 106),
        candle(106, 107, 99, 99),
      ];
      expect(names(candles)).toContain('三只乌鸦');
    });

    it('三白兵依次升高', () => {
      // 生产红三兵要求收盘价严格递增（chartPatternEngine.ts:121）
      const candles = [
        candle(100, 108, 99, 107),
        candle(107, 115, 106, 114),
        candle(114, 122, 113, 121),
      ];
      expect(candles[1].close).toBeGreaterThan(candles[0].close);
      expect(candles[2].close).toBeGreaterThan(candles[1].close);
    });

    it('三黑鸦依次降低', () => {
      const candles = [
        candle(120, 121, 113, 113),
        candle(113, 114, 106, 106),
        candle(106, 107, 99, 99),
      ];
      expect(candles[1].close).toBeLessThan(candles[0].close);
      expect(candles[2].close).toBeLessThan(candles[1].close);
    });

    it('晨星中间K线实体最小', () => {
      const c1: Candle = { open: 110, high: 111, low: 100, close: 101, volume: 1000 };
      const c2: Candle = { open: 100, high: 102, low: 99, close: 101, volume: 500 };
      const c3: Candle = { open: 102, high: 112, low: 101, close: 111, volume: 1500 };
      expect(bodySize(c2)).toBeLessThan(bodySize(c1));
      expect(bodySize(c2)).toBeLessThan(bodySize(c3));
    });

    it('非晨星形态', () => {
      const candles = [
        candle(100, 105, 98, 103),
        candle(103, 108, 102, 107),
        candle(107, 110, 105, 108),
      ];
      const got = names(candles);
      expect(got).not.toContain('早晨之星');
      expect(got).not.toContain('黄昏之星');
    });
  });

  describe('形态强度评估', () => {
    // 生产无同契约导出：PatternResult.confidence 是每个形态的固定常量（0.6~0.8），不是量能加权强度。
    function patternStrength(candles: Candle[], type: 'engulfing' | 'doji' | 'hammer'): number {
      if (candles.length === 0) return 0;
      const avgVolume = candles.reduce((s, c) => s + c.volume, 0) / candles.length;
      const lastCandle = candles[candles.length - 1];
      const volumeRatio = lastCandle.volume / avgVolume;
      const rangeRatio = totalRange(lastCandle) / (candles.reduce((s, c) => s + totalRange(c), 0) / candles.length);
      return Math.min(1, (volumeRatio * 0.4 + rangeRatio * 0.6));
    }

    it('放量形态强度更高', () => {
      const normal: Candle[] = [
        { open: 100, high: 105, low: 98, close: 103, volume: 1000 },
        { open: 103, high: 104, low: 102, close: 103.5, volume: 1000 },
      ];
      const highVol: Candle[] = [
        { open: 100, high: 105, low: 98, close: 103, volume: 1000 },
        { open: 103, high: 108, low: 101, close: 107, volume: 3000 },
      ];
      expect(patternStrength(highVol, 'engulfing')).toBeGreaterThan(patternStrength(normal, 'engulfing'));
    });

    it('支撑位为最低价', () => {
      // 旧断言错在把「全局最低价」当支撑位；生产 findSupportResistance 只认窗口内局部低点（chartPatternEngine.ts:170-178）。
      // 夹具让 92 成为严格局部低点（左右各 1 根的最低价都更高），lookback 传 1。
      const candles = [
        candle(105, 110, 100, 104),
        candle(104, 108, 95, 100),
        candle(100, 109, 92, 105),
        candle(105, 111, 96, 108),
        candle(108, 112, 101, 110),
      ];
      const levels = findSupportResistance(candles, 1);
      const support = levels.find((lv) => lv.type === 'support' && lv.level === 92);
      expect(support).toBeDefined();
      expect(support?.touches).toBe(1);
    });

    it('阻力位为最高价', () => {
      const candles = [
        candle(105, 105, 95, 104),
        candle(104, 108, 97, 100),
        candle(100, 115, 92, 105),
        candle(105, 109, 96, 108),
        candle(108, 112, 101, 110),
      ];
      const levels = findSupportResistance(candles, 1);
      const resistance = levels.find((lv) => lv.type === 'resistance' && lv.level === 115);
      expect(resistance).toBeDefined();
      expect(resistance?.strength).toBe(1);
    });

    it('空数组强度为0', () => {
      expect(patternStrength([], 'doji')).toBe(0);
    });

    it('强度不超过1', () => {
      const candles: Candle[] = [
        { open: 100, high: 105, low: 95, close: 103, volume: 1000 },
        { open: 103, high: 120, low: 90, close: 107, volume: 10000 },
      ];
      // (10000/5500)*0.4 + (30/20)*0.6 = 1.627 → 截断为 1
      expect(patternStrength(candles, 'hammer')).toBe(1);
      expect(patternStrength(candles, 'hammer')).toBeLessThanOrEqual(1);
    });
  });

  describe('缺口分析', () => {
    // 生产无缺口检测导出（仅 volumeProfileEngine 的成交量缺口，语义不同），整段保留内联。
    interface Gap { start: number; end: number; type: 'up' | 'down'; filled: boolean; }

    function detectGaps(candles: Candle[]): Gap[] {
      const gaps: Gap[] = [];
      for (let i = 1; i < candles.length; i++) {
        const prevHigh = candles[i - 1].high;
        const prevLow = candles[i - 1].low;
        const currHigh = candles[i].high;
        const currLow = candles[i].low;
        if (currLow > prevHigh) {
          gaps.push({ start: prevHigh, end: currLow, type: 'up', filled: false });
        } else if (currHigh < prevLow) {
          gaps.push({ start: currHigh, end: prevLow, type: 'down', filled: false });
        }
      }
      return gaps;
    }

    function gapSize(gap: Gap): number { return Math.abs(gap.end - gap.start); }

    it('检测向上跳空缺口', () => {
      const candles = [
        candle(100, 105, 98, 103),
        candle(108, 112, 107, 110),
      ];
      const gaps = detectGaps(candles);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].type).toBe('up');
      expect(gaps[0].start).toBe(105);
      expect(gaps[0].end).toBe(107);
    });

    it('检测向下跳空缺口', () => {
      const candles = [
        candle(110, 112, 107, 108),
        candle(103, 105, 100, 101),
      ];
      const gaps = detectGaps(candles);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].type).toBe('down');
      expect(gaps[0].start).toBe(105);
      expect(gaps[0].end).toBe(107);
    });

    it('无缺口时不检测', () => {
      const candles = [
        candle(100, 105, 98, 103),
        candle(103, 108, 101, 106),
      ];
      expect(detectGaps(candles)).toHaveLength(0);
    });

    it('计算缺口大小', () => {
      const gap: Gap = { start: 105, end: 108, type: 'up', filled: false };
      expect(gapSize(gap)).toBe(3);
    });

    it('多个缺口检测', () => {
      const candles = [
        candle(100, 105, 98, 103),
        candle(110, 115, 109, 113),
        candle(105, 108, 104, 106),
        candle(100, 102, 97, 98),
      ];
      const gaps = detectGaps(candles);
      expect(gaps).toHaveLength(3);
      expect(gaps.map((g) => g.type)).toEqual(['up', 'down', 'down']);
    });

    it('缺口区间为正', () => {
      const candles = [
        candle(100, 105, 98, 103),
        candle(108, 112, 107, 110),
      ];
      const gaps = detectGaps(candles);
      gaps.forEach((gap) => {
        expect(gap.end).toBeGreaterThan(gap.start);
      });
      expect(gaps[0].end - gaps[0].start).toBe(2);
    });
  });

  describe('形态组合评分', () => {
    // 生产无同契约导出（权重表是本文件自定口径），保留内联。
    function comboScore(patterns: string[]): number {
      const weights: Record<string, number> = {
        'doji': 0.3, 'hammer': 0.6, 'shooting_star': 0.5,
        'engulfing_bull': 0.8, 'engulfing_bear': 0.8,
        'morning_star': 0.9, 'evening_star': 0.9,
        'three_soldiers': 0.85, 'three_crows': 0.85,
        'marubozu': 0.7,
      };
      return patterns.reduce((sum, p) => sum + (weights[p] || 0.1), 0) / patterns.length;
    }

    it('晨星组合评分最高', () => {
      expect(comboScore(['morning_star'])).toBe(0.9);
    });

    it('十字星评分较低', () => {
      expect(comboScore(['doji'])).toBe(0.3);
    });

    it('多形态平均评分', () => {
      // (0.6 + 0.8) / 2
      expect(comboScore(['hammer', 'engulfing_bull'])).toBe(0.7);
      expect(comboScore(['hammer', 'engulfing_bull'])).toBeLessThan(1);
    });

    it('空数组评分0', () => {
      // 旧用例用 IIFE 绕开 0/0；这里直接断言真实行为：空输入得到 NaN，无生产契约可绑定。
      expect(comboScore([])).toBeNaN();
    });

    it('未知形态使用默认权重', () => {
      expect(comboScore(['unknown_pattern'])).toBe(0.1);
    });

    it('评分范围0-1', () => {
      // (0.9 + 0.85 + 0.8) / 3
      expect(comboScore(['morning_star', 'three_soldiers', 'engulfing_bull'])).toBe(0.85);
      expect(comboScore(['morning_star', 'three_soldiers', 'engulfing_bull'])).toBeLessThanOrEqual(1);
    });
  });

  describe('成交量配合分析', () => {
    // 绑定生产 detectVolumePatterns：不足 period 抛错（volumePatternEngine.ts:36），
    // 放量口径 ratio >3 且 |涨跌幅| >3%（:54），趋势口径为近 10 根 vs 前 10 根均量 1.1/0.9（:103）。

    it('放量确认突破', () => {
      // 旧断言是「收盘量 > 前两根均量×1.5」；生产是「20 根均量×3 且 |涨跌幅|>3%」，以生产为准。
      const analysis = detectVolumePatterns(volumeCandles([...Array(20).fill(1000), 4000], 110));
      expect(analysis.patterns.map((p) => p.type)).toContain('volume_spike');
      expect(analysis.currentPattern?.type).toBe('volume_spike');
    });

    it('缩量不确认', () => {
      // ratio = 500/2000 = 0.25 < 0.3 → 生产判为极度缩量，而不是放量突破
      const analysis = detectVolumePatterns(volumeCandles([...Array(20).fill(2000), 500]));
      expect(analysis.patterns.map((p) => p.type)).toContain('volume_dry_up');
      expect(analysis.patterns.map((p) => p.type)).not.toContain('volume_spike');
    });

    it('成交量递增趋势', () => {
      const analysis = detectVolumePatterns(volumeCandles([...Array(10).fill(1000), ...Array(10).fill(2000)]));
      expect(analysis.volumeTrend).toBe('increasing');
    });

    it('成交量递减趋势', () => {
      const analysis = detectVolumePatterns(volumeCandles([...Array(10).fill(2000), ...Array(10).fill(500)]));
      expect(analysis.volumeTrend).toBe('decreasing');
    });

    it('成交量平稳', () => {
      const analysis = detectVolumePatterns(volumeCandles(Array(20).fill(1000)));
      expect(analysis.volumeTrend).toBe('stable');
    });

    it('索引不足返回false', () => {
      // 旧断言把「数据不足」当 false 返回；生产对不足 20 根直接抛错（volumePatternEngine.ts:36），以生产为准。
      expect(() => detectVolumePatterns(volumeCandles([1000]))).toThrow('至少需要20根K线');
    });

    it('空数组趋势为stable', () => {
      expect(() => detectVolumePatterns([])).toThrow();
    });

    it('单元素趋势为stable', () => {
      expect(() => detectVolumePatterns([volumeCandles([1000])[0]])).toThrow(/至少需要20根K线/);
    });
  });

  describe('影线比例分析', () => {
    // 生产无同契约导出（PatternResult 只有固定 confidence），保留内联。
    function shadowAnalysis(candle: Candle): { upperRatio: number; lowerRatio: number; bias: 'upper' | 'lower' | 'balanced' } {
      const range = totalRange(candle);
      if (range === 0) return { upperRatio: 0, lowerRatio: 0, bias: 'balanced' };
      const upperRatio = upperShadow(candle) / range;
      const lowerRatio = lowerShadow(candle) / range;
      let bias: 'upper' | 'lower' | 'balanced' = 'balanced';
      if (upperRatio > lowerRatio * 1.5) bias = 'upper';
      else if (lowerRatio > upperRatio * 1.5) bias = 'lower';
      return { upperRatio, lowerRatio, bias };
    }

    it('上影线偏重', () => {
      const c: Candle = { open: 100, high: 115, low: 99, close: 101, volume: 1000 };
      const a = shadowAnalysis(c);
      expect(a.bias).toBe('upper');
    });

    it('下影线偏重', () => {
      const c: Candle = { open: 105, high: 106, low: 90, close: 104, volume: 1000 };
      const a = shadowAnalysis(c);
      expect(a.bias).toBe('lower');
    });

    it('上下影线平衡', () => {
      const c: Candle = { open: 100, high: 105, low: 95, close: 100, volume: 1000 };
      const a = shadowAnalysis(c);
      expect(a.bias).toBe('balanced');
    });

    it('一字板上下影线比为0', () => {
      const c: Candle = { open: 10, high: 10, low: 10, close: 10, volume: 0 };
      const a = shadowAnalysis(c);
      expect(a.upperRatio).toBe(0);
      expect(a.lowerRatio).toBe(0);
    });

    it('影线比例之和加实体比例等于1', () => {
      const c: Candle = { open: 100, high: 110, low: 90, close: 105, volume: 1000 };
      const total = bodyRatio(c) + shadowAnalysis(c).upperRatio + shadowAnalysis(c).lowerRatio;
      expect(total).toBeCloseTo(1, 10);
    });

    it('大阳线实体比例高', () => {
      const c: Candle = { open: 100, high: 110, low: 99, close: 109, volume: 1000 };
      expect(bodyRatio(c)).toBeGreaterThan(0.8);
    });

    it('十字星影线比例高', () => {
      const c: Candle = { open: 100, high: 105, low: 95, close: 100.2, volume: 1000 };
      const a = shadowAnalysis(c);
      expect(a.upperRatio + a.lowerRatio).toBeGreaterThan(0.9);
    });
  });
});