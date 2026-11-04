/**
 * 影子测试迁移（批次 34b）
 *
 * 旧文件只 import vitest，自抄 normalizeStockData / resampleKLine / calcVWAP / detectCandlePattern /
 * formatAmount / formatVolume / 行业指数 / 技术信号 / 收益计算九组实现，断言对象是副本。
 * 本批把 resampleKLine、formatAmount、formatVolume 三组改为 import 产品仓真实实现；
 * 其余符号生产仓无同契约导出，保留本地 helper 并在「未迁移」节逐条注明。
 *
 * 已绑定生产实现（唯一真源）：
 * - K线重采样 → backend/src/services/chartDataEngine.ts:8-23 aggregateKlines(data, factor)
 *   （按 factor 分块：date/open 取首、high/low 取极值、close 取末、volume 求和；factor<=1 直接返回原数组引用，:9）。
 * - 金额格式化 → frontend/src/utils/dataTransformUtils.ts:45-50 formatAmount(amount)
 *   （万亿/亿/万三档 + toFixed(2)；无 Math.abs、无 decimals 参数、无 null 守卫）。
 * - 成交量格式化 → frontend/src/utils/dataTransformUtils.ts:52-56 formatVolume(volume)
 *   （亿手/万手/手三档；与 backend/src/services/dataFormatEngine.ts:24-28 完全同口径）。
 *
 * formatAmount / formatVolume 选型理由（三处口径对比）：
 * 1. frontend/src/utils/dataTransformUtils.ts:45-56：formatAmount 与旧副本逐字符同口径（无 Math.abs），
 *    formatVolume 单位为「手」，两个格式化符号可绑定同一模块，不引入额外语义差异。
 * 2. backend/src/services/dataFormatEngine.ts:6-11 formatNumber 用 Math.abs(n) 判档且多 decimals 参数，
 *    负数口径与旧副本不同（负数按绝对值缩档）；其 :24-28 formatVolume 与 dataTransformUtils 完全同口径。
 * 3. frontend/src/utils/bloombergExportEngine.ts:184-191 formatVolume(value: unknown) 为亿/万/无单位、
 *    null/undefined/NaN→'-'，与断言语义不符，不选。
 * 跨包 import 先例：backend/src/__tests__/movingAverageSystem.test.ts:33 已 import
 * frontend/src/utils/chartDataProcessing（见该文件「已绑定生产实现」节）。
 * 成交量单位：三处生产实现均无「股」口径，旧断言的「亿股/万股/股」是自抄实现自造单位。
 *
 * 旧断言订正（旧值 → 生产值 + 依据）：
 * 1. 成交量亿档单位：'3.00亿股' → '3.00亿手'（frontend/src/utils/dataTransformUtils.ts:53）。
 * 2. 成交量万档单位：'5.00万股' → '5.00万手'（frontend/src/utils/dataTransformUtils.ts:54）。
 * 3. 成交量个位档单位：'500股' → '500手'（frontend/src/utils/dataTransformUtils.ts:55，volume + '手' 不做 toFixed）。
 * 4. formatAmount 四条断言与生产一致，未改（dataTransformUtils.ts:45-50）；新增分档边界用例绑定 1e4 阈值。
 * 5. resampleKLine 两条断言与 aggregateKlines 一致，未改；新增 factor<=1 返回原数组引用的契约断言
 *    （chartDataEngine.ts:9）。
 *
 * 未迁移（生产无同契约导出，保留本地 helper）：
 * - normalizeStockData：rg normalizeStockData|normalizeQuote|normalizeStock 0 命中；生产只有
 *   backend/src/utils/symbolUtils.ts:7 normalizeSymbol（仅规整证券代码，不处理价格/量/换手/PE/PB）。
 * - calcVWAP（K线→标量）：frontend/src/utils/featureEngineeringEngine.ts:172-190 calculateVWAP 返回累计序列、
 *   零成交量回退 close[i]；frontend/src/utils/indicatorCalc.ts:188 为模块私有（未导出）；
 *   frontend/src/utils/marketMicrostructureEngine.ts:104 与 backend/src/services/orderBookAnalyzer.ts:163
 *   为逐笔/订单簿口径。无「K线→标量、总成交量 0→0」导出。
 * - detectCandlePattern：无同名导出；frontend/src/utils/technicalPatternEngine.ts:74 仅在类方法内部内联
 *   engulfing 判断，无 doji/hammer/shooting_star 通用导出。
 * - calcSectorIndex / calcEqualWeightIndex：rg 0 命中；backend/src/services/sectorService.ts 与
 *   sectorMomentumService.ts 只做行情排序与聚合摘要，无加权/等权指数计算导出。
 * - detectGoldenCross：frontend/src/utils/trendFollowingEngine.ts:114 detectCrossovers 入参 MAValues[]、
 *   按固定 5/10/20/60/120 五对均线返回 TrendSignal[]；frontend/src/components/Charts/KLineChart.tsx:149
 *   为组件内联。无 (number[], number[]) → number[] 导出。
 * - detectDivergence：backend/src/services/momentumDivergenceEngine.ts:164 detectDivergences 为 pivot 多点检测、
 *   返回 MomentumSignal[]；无「3 点趋势比较 → bullish|bearish|null」导出。
 * - detectSupportResistance：frontend/src/utils/strategy.ts:68 calcSupportResistance 入参 KLine[] 且合并相近极值；
 *   frontend/src/utils/technicalPatternEngine.ts:137 为类方法、返回 SupportResistance[]；
 *   无 number[] → {support, resistance} 导出。
 * - calcCompoundReturn / calcAnnualizedReturn / calcMaxDrawdownSeries：rg 0 命中导出；annualized 仅内联于
 *   backend/src/services/rotationEngine.ts:311 与 frontend/src/utils/eventDrivenBacktestEngine.ts:77；
 *   maxDrawdown 仅 backend/src/services/riskBudgetEngine.ts:147 类方法（入参为收益率序列，
 *   返回 peakIndex/troughIndex，不返回 peak/trough 值），契约不同。
 */

import { describe, it, expect } from 'vitest';
import { aggregateKlines, type OHLCV } from '../services/chartDataEngine';
import { formatAmount, formatVolume } from '../../../frontend/src/utils/dataTransformUtils';

// 金融数据转换引擎测试
describe('Financial Data Transformation Engine', () => {
  // 数据标准化
  describe('Data Normalization', () => {
    // 未迁移：生产无 normalizeStockData/normalizeQuote 导出（见文件头「未迁移」节）。
    const normalizeStockData = (raw: any) => ({
      symbol: String(raw.symbol || '').trim(),
      name: String(raw.name || '').trim(),
      price: Number(raw.price) || 0,
      change: Number(raw.change) || 0,
      changePercent: Number(raw.changePercent) || 0,
      volume: Math.max(0, Math.floor(Number(raw.volume) || 0)),
      amount: Math.max(0, Number(raw.amount) || 0),
      high: Number(raw.high) || 0,
      low: Number(raw.low) || 0,
      open: Number(raw.open) || 0,
      prevClose: Number(raw.prevClose) || 0,
      turnover: Math.min(100, Math.max(0, Number(raw.turnover) || 0)),
      pe: raw.pe !== null && raw.pe !== undefined ? Number(raw.pe) : null,
      pb: raw.pb !== null && raw.pb !== undefined ? Number(raw.pb) : null,
      marketCap: Math.max(0, Number(raw.marketCap) || 0),
    });

    it('should normalize valid data', () => {
      const raw = { symbol: '600519', name: '贵州茅台', price: 1800, change: 50, changePercent: 2.86, volume: 50000, amount: 90000000 };
      const norm = normalizeStockData(raw);
      expect(norm.symbol).toBe('600519');
      expect(norm.price).toBe(1800);
    });

    it('should handle missing fields with defaults', () => {
      const norm = normalizeStockData({});
      expect(norm.symbol).toBe('');
      expect(norm.price).toBe(0);
      expect(norm.volume).toBe(0);
    });

    it('should floor volume to integer', () => {
      const norm = normalizeStockData({ volume: 12345.7 });
      expect(norm.volume).toBe(12345);
    });

    it('should clamp turnover to 0-100', () => {
      expect(normalizeStockData({ turnover: -5 }).turnover).toBe(0);
      expect(normalizeStockData({ turnover: 150 }).turnover).toBe(100);
    });

    it('should handle null PE/PB', () => {
      expect(normalizeStockData({ pe: null }).pe).toBeNull();
      expect(normalizeStockData({ pb: undefined }).pb).toBeNull();
    });

    it('should handle string numbers', () => {
      const norm = normalizeStockData({ price: '1800.5', volume: '50000' });
      expect(norm.price).toBe(1800.5);
      expect(norm.volume).toBe(50000);
    });

    it('should trim whitespace from strings', () => {
      const norm = normalizeStockData({ symbol: '  600519  ', name: ' 贵州茅台 ' });
      expect(norm.symbol).toBe('600519');
      expect(norm.name).toBe('贵州茅台');
    });
  });

  // K线数据处理
  describe('K-Line Data Processing', () => {
    // 已绑定生产类型：生产 OHLCV 与旧本地 KLine 结构一致（chartDataEngine.ts:6）。
    type KLine = OHLCV;

    // 未迁移：生产无「K线→标量 VWAP、总成交量 0→0」导出（见文件头「未迁移」节）。
    const calcVWAP = (data: KLine[]): number => {
      let totalTPV = 0;
      let totalVol = 0;
      for (const k of data) {
        const tp = (k.high + k.low + k.close) / 3;
        totalTPV += tp * k.volume;
        totalVol += k.volume;
      }
      return totalVol === 0 ? 0 : totalTPV / totalVol;
    };

    // 未迁移：生产无 K 线形态通用导出（见文件头「未迁移」节）。
    const detectCandlePattern = (prev: KLine, curr: KLine): string => {
      const body = Math.abs(curr.close - curr.open);
      const range = curr.high - curr.low;
      const prevBody = Math.abs(prev.close - prev.open);

      if (range === 0) return 'doji';
      if (body / range < 0.1) return 'doji';

      const isBullish = curr.close > curr.open;
      const isPrevBullish = prev.close > prev.open;

      if (isBullish !== isPrevBullish && body > prevBody * 1.5) {
        return isBullish ? 'bullish_engulfing' : 'bearish_engulfing';
      }

      const upperShadow = curr.high - Math.max(curr.open, curr.close);
      const lowerShadow = Math.min(curr.open, curr.close) - curr.low;

      if (lowerShadow > body * 2 && upperShadow < body * 0.5) return 'hammer';
      if (upperShadow > body * 2 && lowerShadow < body * 0.5) return 'shooting_star';

      return 'normal';
    };

    it('resample should reduce data points', () => {
      const data: KLine[] = Array.from({ length: 10 }, (_, i) => ({
        date: '2024-01-' + String(i + 1).padStart(2, '0'),
        open: 100 + i, high: 105 + i, low: 95 + i, close: 102 + i, volume: 1000 + i * 100,
      }));
      const resampled = aggregateKlines(data, 3);
      expect(resampled.length).toBe(4);
    });

    it('resampled OHLC should be correct', () => {
      const data: KLine[] = [
        { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: '2024-01-02', open: 105, high: 115, low: 95, close: 110, volume: 2000 },
      ];
      const resampled = aggregateKlines(data, 2);
      expect(resampled[0].open).toBe(100);
      expect(resampled[0].high).toBe(115);
      expect(resampled[0].low).toBe(90);
      expect(resampled[0].close).toBe(110);
      expect(resampled[0].volume).toBe(3000);
    });

    it('重采样系数<=1应返回原数组引用', () => {
      const data: KLine[] = [
        { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: '2024-01-02', open: 105, high: 115, low: 95, close: 110, volume: 2000 },
      ];
      // 生产契约：factor <= 1 时不做分块重建，直接返回入参引用（chartDataEngine.ts:9）。
      expect(aggregateKlines(data, 1)).toBe(data);
    });

    it('VWAP should be within high-low range', () => {
      const data: KLine[] = [
        { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: '2024-01-02', open: 105, high: 115, low: 95, close: 110, volume: 2000 },
      ];
      const vwap = calcVWAP(data);
      expect(vwap).toBeGreaterThan(90);
      expect(vwap).toBeLessThan(115);
    });

    it('VWAP with zero volume', () => {
      const data: KLine[] = [
        { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, volume: 0 },
      ];
      expect(calcVWAP(data)).toBe(0);
    });

    it('doji detection', () => {
      const prev: KLine = { date: 'd1', open: 100, high: 110, low: 90, close: 105, volume: 1000 };
      const curr: KLine = { date: 'd2', open: 105, high: 115, low: 95, close: 105, volume: 1000 };
      expect(detectCandlePattern(prev, curr)).toBe('doji');
    });

    it('bullish engulfing detection', () => {
      const prev: KLine = { date: 'd1', open: 110, high: 112, low: 105, close: 106, volume: 1000 };
      const curr: KLine = { date: 'd2', open: 104, high: 115, low: 103, close: 114, volume: 2000 };
      expect(detectCandlePattern(prev, curr)).toBe('bullish_engulfing');
    });

    it('hammer detection', () => {
      const prev: KLine = { date: 'd1', open: 100, high: 110, low: 90, close: 105, volume: 1000 };
      const curr: KLine = { date: 'd2', open: 100, high: 104, low: 85, close: 103, volume: 1000 };
      expect(detectCandlePattern(prev, curr)).toBe('hammer');
    });
  });

  // 金额格式化（已绑定生产实现，见文件头「已绑定生产实现」）
  describe('Amount Formatting', () => {
    it('万亿 format', () => {
      expect(formatAmount(2.5e12)).toBe('2.50万亿');
    });

    it('亿 format', () => {
      expect(formatAmount(5e8)).toBe('5.00亿');
    });

    it('万 format', () => {
      expect(formatAmount(15000)).toBe('1.50万');
    });

    it('small amount', () => {
      expect(formatAmount(500)).toBe('500.00');
    });

    it('金额分档边界', () => {
      // 生产以 1e4 为「万」档阈值（dataTransformUtils.ts:47-48）。
      expect(formatAmount(9999)).toBe('9999.00');
      expect(formatAmount(10000)).toBe('1.00万');
    });

    it('亿手 format', () => {
      expect(formatVolume(3e8)).toBe('3.00亿手');
    });

    it('万手 format', () => {
      expect(formatVolume(50000)).toBe('5.00万手');
    });

    it('small volume', () => {
      expect(formatVolume(500)).toBe('500手');
    });
  });

  // 行业指数计算
  describe('Sector Index Calculation', () => {
    // 未迁移：生产无加权/等权行业指数计算导出（见文件头「未迁移」节）。
    const calcSectorIndex = (stocks: Array<{ weight: number; changePercent: number }>): number => {
      if (stocks.length === 0) return 0;
      const totalWeight = stocks.reduce((s, st) => s + st.weight, 0);
      if (totalWeight === 0) return 0;
      return stocks.reduce((s, st) => s + (st.weight / totalWeight) * st.changePercent, 0);
    };

    const calcEqualWeightIndex = (stocks: Array<{ changePercent: number }>): number => {
      if (stocks.length === 0) return 0;
      return stocks.reduce((s, st) => s + st.changePercent, 0) / stocks.length;
    };

    it('weighted sector index', () => {
      const stocks = [
        { weight: 0.5, changePercent: 2 },
        { weight: 0.3, changePercent: -1 },
        { weight: 0.2, changePercent: 3 },
      ];
      const idx = calcSectorIndex(stocks);
      expect(idx).toBeCloseTo(1.3, 1);
    });

    it('equal weight index', () => {
      const stocks = [{ changePercent: 2 }, { changePercent: 4 }];
      expect(calcEqualWeightIndex(stocks)).toBe(3);
    });

    it('empty sector should return 0', () => {
      expect(calcSectorIndex([])).toBe(0);
      expect(calcEqualWeightIndex([])).toBe(0);
    });

    it('single stock sector', () => {
      const stocks = [{ weight: 1, changePercent: 5 }];
      expect(calcSectorIndex(stocks)).toBe(5);
    });

    it('zero weight should return 0', () => {
      const stocks = [{ weight: 0, changePercent: 5 }];
      expect(calcSectorIndex(stocks)).toBe(0);
    });
  });

  // 技术信号检测
  describe('Technical Signal Detection', () => {
    // 未迁移：生产无 (number[], number[]) → number[] 交叉导出（见文件头「未迁移」节）。
    const detectGoldenCross = (short: number[], long: number[]): number[] => {
      const signals: number[] = [];
      for (let i = 1; i < Math.min(short.length, long.length); i++) {
        if (short[i] > long[i] && short[i - 1] <= long[i - 1]) signals.push(i);
      }
      return signals;
    };

    // 未迁移：生产 detectDivergences 为 pivot 多点检测、返回信号数组（见文件头「未迁移」节）。
    const detectDivergence = (prices: number[], indicator: number[]): 'bullish' | 'bearish' | null => {
      if (prices.length < 3 || indicator.length < 3) return null;
      const pTrend = prices[prices.length - 1] - prices[prices.length - 3];
      const iTrend = indicator[indicator.length - 1] - indicator[indicator.length - 3];
      if (pTrend < 0 && iTrend > 0) return 'bullish';
      if (pTrend > 0 && iTrend < 0) return 'bearish';
      return null;
    };

    // 未迁移：生产无 number[] → {support, resistance} 导出（见文件头「未迁移」节）。
    const detectSupportResistance = (prices: number[], lookback: number = 20): { support: number; resistance: number } => {
      const recent = prices.slice(-lookback);
      return {
        support: Math.min(...recent),
        resistance: Math.max(...recent),
      };
    };

    it('golden cross detection', () => {
      const short = [10, 11, 12, 13, 14];
      const long = [12, 12, 12, 12, 12];
      const signals = detectGoldenCross(short, long);
      expect(signals.length).toBeGreaterThan(0);
    });

    it('no golden cross in downtrend', () => {
      const short = [20, 18, 16, 14, 12];
      const long = [15, 14, 13, 12, 11];
      const signals = detectGoldenCross(short, long);
      expect(signals.length).toBe(0);
    });

    it('bullish divergence', () => {
      const prices = [100, 95, 90];
      const indicator = [30, 35, 40];
      expect(detectDivergence(prices, indicator)).toBe('bullish');
    });

    it('bearish divergence', () => {
      const prices = [90, 95, 100];
      const indicator = [70, 65, 60];
      expect(detectDivergence(prices, indicator)).toBe('bearish');
    });

    it('no divergence', () => {
      const prices = [90, 95, 100];
      const indicator = [30, 35, 40];
      expect(detectDivergence(prices, indicator)).toBeNull();
    });

    it('support and resistance', () => {
      const prices = [100, 105, 95, 110, 92, 108];
      const sr = detectSupportResistance(prices, 6);
      expect(sr.support).toBe(92);
      expect(sr.resistance).toBe(110);
    });

    it('insufficient data for divergence', () => {
      expect(detectDivergence([1], [1])).toBeNull();
    });
  });

  // 收益计算
  describe('Return Calculations', () => {
    // 未迁移：生产无 compound/annualized/maxDrawdownSeries 同契约导出（见文件头「未迁移」节）。
    const calcCompoundReturn = (returns: number[]): number => {
      return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
    };

    const calcAnnualizedReturn = (totalReturn: number, days: number): number => {
      if (days <= 0) return 0;
      return Math.pow(1 + totalReturn, 365 / days) - 1;
    };

    const calcMaxDrawdownSeries = (equity: number[]): { maxDd: number; peak: number; trough: number } => {
      let peak = equity[0], trough = equity[0], maxDd = 0, currentPeak = equity[0];
      for (const v of equity) {
        if (v > currentPeak) currentPeak = v;
        const dd = (currentPeak - v) / currentPeak;
        if (dd > maxDd) {
          maxDd = dd;
          peak = currentPeak;
          trough = v;
        }
      }
      return { maxDd, peak, trough };
    };

    it('compound return calculation', () => {
      expect(calcCompoundReturn([0.1, 0.1])).toBeCloseTo(0.21, 2);
      expect(calcCompoundReturn([0, 0, 0])).toBe(0);
    });

    it('negative compound return', () => {
      expect(calcCompoundReturn([-0.1, -0.1])).toBeCloseTo(-0.19, 2);
    });

    it('annualized return 1 year', () => {
      expect(calcAnnualizedReturn(0.1, 365)).toBeCloseTo(0.1, 3);
    });

    it('annualized return half year', () => {
      const ar = calcAnnualizedReturn(0.05, 182);
      expect(ar).toBeGreaterThan(0.05);
    });

    it('max drawdown calculation', () => {
      const equity = [100, 110, 105, 120, 90, 95, 130];
      const { maxDd, peak, trough } = calcMaxDrawdownSeries(equity);
      expect(maxDd).toBeCloseTo(0.25, 2);
      expect(peak).toBe(120);
      expect(trough).toBe(90);
    });

    it('rising equity should have zero drawdown', () => {
      const equity = [100, 110, 120, 130, 140];
      expect(calcMaxDrawdownSeries(equity).maxDd).toBe(0);
    });

    it('zero days annualized should be 0', () => {
      expect(calcAnnualizedReturn(0.1, 0)).toBe(0);
    });
  });
});
