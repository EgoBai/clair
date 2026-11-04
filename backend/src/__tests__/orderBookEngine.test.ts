import { describe, it, expect } from 'vitest';
import {
  OrderBookAnalyzer,
  type OrderBook,
  type OrderBookLevel,
} from '../services/orderBookAnalyzer';

// ===== 订单簿计算引擎测试 =====
// 绑定生产 backend/src/services/orderBookAnalyzer.ts 的 OrderBookAnalyzer：
//   价差 / 价差百分比 / 加权中间价 / 盘口不平衡度 → analyzeImbalance()
//   大单检测 → setLargeOrderThreshold() + detectLargeOrders()
//   市场冲击 → getMarketImpact()
// 注意生产数据结构：OrderBookLevel 用 quantity/orderCount（不是 volume/orders），
// OrderBook 用 stockCode/ISO 字符串 timestamp（不是 symbol/数值 timestamp）。
// 生产无同契约导出而保留内联实现的段：①按目标成交量吃档的 VWAP；②带 depth 参数的不平衡度
// （生产 analyzeImbalance 的 depth 固定为 min(买档数, 卖档数)，没有 depth 入参）。
// 时间夹具统一用固定 ISO 字符串，保证确定性。

const FIXED_TS = '2024-01-02T09:30:00.000Z';

const makeBook = (overrides: Partial<OrderBook> = {}): OrderBook => ({
  stockCode: 'x',
  timestamp: FIXED_TS,
  bids: [],
  asks: [],
  ...overrides,
});

const makeAnalyzer = (book: OrderBook): OrderBookAnalyzer => {
  const analyzer = new OrderBookAnalyzer();
  analyzer.addOrderBook(book);
  return analyzer;
};

const imbalanceOf = (analyzer: OrderBookAnalyzer, stockCode: string) => {
  const imbalance = analyzer.analyzeImbalance(stockCode);
  if (!imbalance) throw new Error(`OrderBookAnalyzer 未返回 ${stockCode} 的盘口分析`);
  return imbalance;
};

// 生产无同契约导出：OrderBookAnalyzer 没有带 depth 参数的盘口不平衡度 API，
// 该内联实现仅服务下方「自定义深度」用例。
const calculateOrderBookImbalance = (book: OrderBook, depth: number = 5): number => {
  const bidVol = book.bids.slice(0, depth).reduce((s, b) => s + b.quantity, 0);
  const askVol = book.asks.slice(0, depth).reduce((s, a) => s + a.quantity, 0);
  const total = bidVol + askVol;
  if (total === 0) return 0;
  return (bidVol - askVol) / total;
};

describe('Order Book Engine', () => {
  const sampleBook: OrderBook = makeBook({
    stockCode: '600519',
    bids: [
      { price: 1800.00, quantity: 500, orderCount: 10 },
      { price: 1799.99, quantity: 800, orderCount: 15 },
      { price: 1799.98, quantity: 300, orderCount: 5 },
      { price: 1799.50, quantity: 1200, orderCount: 20 },
      { price: 1799.00, quantity: 600, orderCount: 8 },
    ],
    asks: [
      { price: 1800.01, quantity: 400, orderCount: 8 },
      { price: 1800.02, quantity: 600, orderCount: 12 },
      { price: 1800.50, quantity: 900, orderCount: 18 },
      { price: 1801.00, quantity: 200, orderCount: 4 },
      { price: 1801.50, quantity: 700, orderCount: 10 },
    ],
  });

  describe('价差计算', () => {
    it('基本价差', () => {
      // 生产口径：analyzeImbalance().spread = 最优卖价 - 最优买价，与原内联 calculateSpread 一致。
      const imbalance = imbalanceOf(makeAnalyzer(sampleBook), '600519');
      expect(imbalance.spread).toBeCloseTo(0.01, 2);
    });

    it('价差百分比', () => {
      // 生产口径：spreadPercent = (最优卖价 - 最优买价) / 最优买价 * 100，分母是最优买价而非中间价。
      // 旧断言只检查 0 < x < 0.01，数值仍成立，故保留；另补一条精确口径断言。
      const { spreadPercent } = imbalanceOf(makeAnalyzer(sampleBook), '600519');
      expect(spreadPercent).toBeGreaterThan(0);
      expect(spreadPercent).toBeLessThan(0.01);
      expect(spreadPercent).toBeCloseTo((0.01 / 1800) * 100, 6);
    });

    it('空盘口价差为0', () => {
      // 生产 analyzeImbalance 对空盘口仍返回对象：bestBid = bestAsk = 0 → spread = 0。
      const analyzer = makeAnalyzer(makeBook({ stockCode: 'empty' }));
      expect(imbalanceOf(analyzer, 'empty').spread).toBe(0);
    });

    it('价差应为正数', () => {
      expect(imbalanceOf(makeAnalyzer(sampleBook), '600519').spread).toBeGreaterThan(0);
    });
  });

  describe('加权中间价', () => {
    it('应按全盘口成交量加权（可超出最优买卖价）', () => {
      // 旧断言「应在买卖价之间」是错的：生产 weightedMidPrice 是全部买卖档的 Σ(价×量)/Σ量，
      // 卖盘深度更靠外时结果会高于最优卖价（本例 1800.081 > 1800.01），并不是最优买卖价的加权中值。
      const { weightedMidPrice } = imbalanceOf(makeAnalyzer(sampleBook), '600519');
      expect(weightedMidPrice).toBeGreaterThan(1799.00);
      expect(weightedMidPrice).toBeLessThan(1801.50);
      expect(weightedMidPrice).toBeCloseTo(1800.081, 3);
    });

    it('买卖量相等时接近中间价', () => {
      const book = makeBook({
        bids: [{ price: 100, quantity: 500, orderCount: 10 }],
        asks: [{ price: 101, quantity: 500, orderCount: 10 }],
      });
      // 单档且买卖量相等时，生产全盘口加权公式退化为 (100*500 + 101*500) / 1000 = 100.5。
      const wmid = imbalanceOf(makeAnalyzer(book), 'x').weightedMidPrice;
      expect(wmid).toBeCloseTo(100.5, 1);
    });
  });

  describe('盘口不平衡度', () => {
    it('买盘更多时应大于1', () => {
      const book = makeBook({
        bids: [{ price: 100, quantity: 1000, orderCount: 10 }],
        asks: [{ price: 101, quantity: 500, orderCount: 5 }],
      });
      // 旧断言只要求 >0 太弱；生产 imbalanceRatio = 买量 / 卖量，买盘占优的充要条件是比值 > 1。
      const { imbalanceRatio } = imbalanceOf(makeAnalyzer(book), 'x');
      expect(imbalanceRatio).toBeGreaterThan(1);
      expect(imbalanceRatio).toBeCloseTo(2, 6);
    });

    it('卖盘更多时应小于1', () => {
      const book = makeBook({
        bids: [{ price: 100, quantity: 200, orderCount: 5 }],
        asks: [{ price: 101, quantity: 800, orderCount: 10 }],
      });
      // 旧断言 toBeLessThan(0) 是错的：生产比值恒为正，卖盘占优表现为 0 < 比值 < 1（本例 0.25）。
      const { imbalanceRatio } = imbalanceOf(makeAnalyzer(book), 'x');
      expect(imbalanceRatio).toBeGreaterThan(0);
      expect(imbalanceRatio).toBeLessThan(1);
      expect(imbalanceRatio).toBeCloseTo(0.25, 6);
    });

    it('均衡时比值应为1', () => {
      const book = makeBook({
        bids: [{ price: 100, quantity: 500, orderCount: 10 }],
        asks: [{ price: 101, quantity: 500, orderCount: 10 }],
      });
      // 旧断言 toBeCloseTo(0) 是错的：生产均衡口径是买量/卖量 = 1，不是带符号不平衡度 0。
      expect(imbalanceOf(makeAnalyzer(book), 'x').imbalanceRatio).toBeCloseTo(1, 6);
    });

    it('空盘口比值约定为1', () => {
      // 旧断言 toBe(0) 是错的：生产在买卖量都为 0 时按约定返回 1（analyzeImbalance 的三元分支）。
      const analyzer = makeAnalyzer(makeBook({ stockCode: 'empty' }));
      expect(imbalanceOf(analyzer, 'empty').imbalanceRatio).toBe(1);
    });

    it('自定义深度', () => {
      // 生产无同契约导出：analyzeImbalance 没有 depth 参数，depth 恒为 min(买档数, 卖档数)，
      // 无法表达「只看前 N 档」，故本用例继续使用内联实现，不硬套生产 API。
      const imbalance2 = calculateOrderBookImbalance(sampleBook, 2);
      const imbalance5 = calculateOrderBookImbalance(sampleBook, 5);
      expect(typeof imbalance2).toBe('number');
      expect(typeof imbalance5).toBe('number');
      expect(imbalance2).toBeGreaterThan(imbalance5);
    });
  });

  describe('VWAP计算', () => {
    // 生产无同契约导出：OrderBookAnalyzer 只有 analyzeOrderFlow 内的全盘口 vwap
    // （Σ价格×量 / Σ量，没有目标成交量参数），getMarketImpact 内部算均价但不导出；
    // 没有「按目标成交量逐档吃单」的 VWAP，故本节保留内联实现。
    const calculateVWAP = (levels: OrderBookLevel[], targetVolume: number): number | null => {
      let cumVol = 0, cumTPV = 0;
      for (const level of levels) {
        const vol = Math.min(level.quantity, targetVolume - cumVol);
        cumTPV += level.price * vol;
        cumVol += vol;
        if (cumVol >= targetVolume) break;
      }
      return cumVol > 0 ? cumTPV / cumVol : null;
    };

    it('计算买单VWAP', () => {
      const vwap = calculateVWAP(sampleBook.asks, 1000);
      expect(vwap).toBeGreaterThan(sampleBook.asks[0].price);
    });

    it('计算卖单VWAP', () => {
      const vwap = calculateVWAP(sampleBook.bids, 1000);
      expect(vwap).toBeLessThan(sampleBook.bids[0].price);
    });

    it('空盘口返回null', () => {
      expect(calculateVWAP([], 100)).toBeNull();
    });

    it('小单量返回第一档价格', () => {
      const vwap = calculateVWAP(sampleBook.asks, 100);
      expect(vwap).toBe(sampleBook.asks[0].price);
    });
  });

  describe('市场冲击', () => {
    const impactOf = (side: 'buy' | 'sell', quantity: number): number =>
      makeAnalyzer(sampleBook).getMarketImpact('600519', side, quantity);

    it('买单冲击应为正', () => {
      // 生产口径：getMarketImpact 返回 |成交均价 - 最优价| / 最优价（相对比例，不是百分比）。
      expect(impactOf('buy', 1000)).toBeGreaterThan(0);
    });

    it('卖单冲击也应为正（方向由 side 选择盘口体现）', () => {
      // 旧断言 toBeLessThan(0) 是错的：生产对买卖两侧都取绝对值，卖出冲击不以负数表示。
      expect(impactOf('sell', 1000)).toBeGreaterThan(0);
    });

    it('大单冲击更大', () => {
      const small = impactOf('buy', 100);
      const large = impactOf('buy', 2000);
      expect(large).toBeGreaterThan(small);
    });

    it('流动性不足返回 Infinity', () => {
      // 生产口径：目标量超过盘口可成交量时返回 Infinity；旧内联实现会静默按已成交量截断。
      expect(impactOf('buy', 99999)).toBe(Infinity);
    });
  });

  describe('异常检测', () => {
    it('大单应被检测', () => {
      // 生产口径：大单阈值由 setLargeOrderThreshold 设置，判定条件是单档 quantity >= 阈值。
      const analyzer = new OrderBookAnalyzer();
      analyzer.setLargeOrderThreshold(10_000);
      analyzer.addOrderBook(makeBook({
        bids: [{ price: 100, quantity: 50_000, orderCount: 1 }],
        asks: [{ price: 101, quantity: 100, orderCount: 5 }],
      }));
      // 旧断言调用内联 detectSpoofing（volume > 阈值，只返回 side/level）；生产 detectLargeOrders
      // 返回完整 LargeOrder（price/quantity/side/ratio/timestamp），故补充字段断言。
      const alerts = analyzer.detectLargeOrders('x');
      expect(alerts.length).toBe(1);
      expect(alerts[0].side).toBe('bid');
      expect(alerts[0].quantity).toBe(50_000);
      expect(alerts[0].ratio).toBe(1);
    });

    it('正常盘口无警报', () => {
      const analyzer = new OrderBookAnalyzer();
      analyzer.setLargeOrderThreshold(10_000);
      analyzer.addOrderBook(sampleBook);
      expect(analyzer.detectLargeOrders('600519')).toEqual([]);
    });
  });
});

// ===== 分时图数据处理 =====
// 生产无同契约导出：backend 没有分时均线 / 成交量异动 / 价格区间 / 涨跌停判定的导出函数；
// marketBreadth.ts 里的 isLimitUp/isLimitDown 是模块私有函数且入参为 TencentQuoteRow，
// 与本节的 (price, prevClose) 签名和语义都不一致，故本节保留内联实现，不硬造生产代码。
describe('Time-share Chart Processing', () => {
  interface TimeSharePoint {
    time: string;
    price: number;
    avgPrice: number;
    volume: number;
    amount: number;
  }

  const calculateTimeShareMA = (points: TimeSharePoint[], window: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = points.slice(start, i + 1);
      const avg = slice.reduce((s, p) => s + p.price, 0) / slice.length;
      result.push(avg);
    }
    return result;
  };

  const detectVolumeSpikes = (points: TimeSharePoint[], threshold: number = 3): number[] => {
    if (points.length < 2) return [];
    const avgVol = points.reduce((s, p) => s + p.volume, 0) / points.length;
    const spikes: number[] = [];
    points.forEach((p, i) => { if (p.volume > avgVol * threshold) spikes.push(i); });
    return spikes;
  };

  const calculatePriceRange = (points: TimeSharePoint[]): { high: number; low: number; range: number } => {
    if (points.length === 0) return { high: 0, low: 0, range: 0 };
    let high = -Infinity, low = Infinity;
    for (const p of points) {
      if (p.price > high) high = p.price;
      if (p.price < low) low = p.price;
    }
    return { high, low, range: high - low };
  };

  const isLimitUp = (price: number, prevClose: number): boolean => {
    return Math.abs(price / prevClose - 1) >= 0.099;
  };

  const isLimitDown = (price: number, prevClose: number): boolean => {
    return Math.abs(price / prevClose - 1) >= 0.099 && price < prevClose;
  };

  const samplePoints: TimeSharePoint[] = [
    { time: '09:30', price: 100, avgPrice: 100, volume: 1000, amount: 100000 },
    { time: '09:31', price: 100.5, avgPrice: 100.25, volume: 2000, amount: 201000 },
    { time: '09:32', price: 100.3, avgPrice: 100.27, volume: 1500, amount: 150450 },
    { time: '09:33', price: 101, avgPrice: 100.45, volume: 5000, amount: 505000 },
    { time: '09:34', price: 100.8, avgPrice: 100.52, volume: 1200, amount: 120960 },
  ];

  describe('分时均线', () => {
    it('第一条均线应等于第一个价格', () => {
      const ma = calculateTimeShareMA(samplePoints, 5);
      expect(ma[0]).toBe(100);
    });

    it('均线应平滑波动', () => {
      const ma = calculateTimeShareMA(samplePoints, 3);
      expect(ma.length).toBe(5);
      for (let i = 1; i < ma.length; i++) {
        expect(Math.abs(ma[i] - ma[i - 1])).toBeLessThan(1);
      }
    });

    it('空数据应返回空', () => {
      expect(calculateTimeShareMA([], 5)).toEqual([]);
    });

    it('单点数据', () => {
      const ma = calculateTimeShareMA([samplePoints[0]], 3);
      expect(ma).toEqual([100]);
    });
  });

  describe('成交量异常', () => {
    it('应检测大成交量', () => {
      const spikes = detectVolumeSpikes(samplePoints, 2);
      expect(spikes.length).toBeGreaterThan(0);
    });

    it('空数据无异常', () => {
      expect(detectVolumeSpikes([], 3)).toEqual([]);
    });

    it('单点无异常', () => {
      expect(detectVolumeSpikes([samplePoints[0]], 3)).toEqual([]);
    });
  });

  describe('价格范围', () => {
    it('应正确计算高低', () => {
      const range = calculatePriceRange(samplePoints);
      expect(range.high).toBe(101);
      expect(range.low).toBe(100);
      expect(range.range).toBe(1);
    });

    it('空数据应为零', () => {
      const range = calculatePriceRange([]);
      expect(range.high).toBe(0);
      expect(range.low).toBe(0);
    });

    it('单点范围为0', () => {
      const range = calculatePriceRange([samplePoints[0]]);
      expect(range.range).toBe(0);
    });
  });

  describe('涨跌停检测', () => {
    it('涨停应识别', () => {
      expect(isLimitUp(11.0, 10.0)).toBe(true);
    });

    it('跌停应识别', () => {
      expect(isLimitDown(9.0, 10.0)).toBe(true);
    });

    it('正常涨跌不应为涨停', () => {
      expect(isLimitUp(10.5, 10.0)).toBe(false);
    });

    it('正常涨跌不应为跌停', () => {
      expect(isLimitDown(9.8, 10.0)).toBe(false);
    });

    it('科创板20%涨停', () => {
      const isStarLimitUp = (price: number, prevClose: number) => Math.abs(price / prevClose - 1) >= 0.199;
      expect(isStarLimitUp(12.0, 10.0)).toBe(true);
      expect(isStarLimitUp(11.5, 10.0)).toBe(false);
    });
  });
});

// ===== 技术形态识别增强 =====
// 生产无同契约导出：backend/src/services/patternRecognitionEngine.ts 只提供枢轴 / 缺口 / 趋势线 /
// 支撑阻力识别，没有 isShootingStar、isThreeWhiteSoldiers 等 K 线形态布尔判定导出；
// frontend/src/utils/patternRecognition.ts 的 detectPatterns 返回 PatternResult[]，
// 入参 OHLCV[] 与返回契约均不同于本节单形态判定，故保留内联实现。
describe('Candlestick Pattern Recognition Enhanced', () => {
  interface OHLC { open: number; high: number; low: number; close: number; }

  const isShootingStar = (c: OHLC): boolean => {
    const body = Math.abs(c.close - c.open);
    const upper = c.high - Math.max(c.close, c.open);
    const lower = Math.min(c.close, c.open) - c.low;
    const range = c.high - c.low;
    return range > 0 && body < range * 0.3 && upper > body * 2 && lower < body;
  };

  const isHangingMan = (c: OHLC, prev: OHLC): boolean => {
    const body = Math.abs(c.close - c.open);
    const lower = Math.min(c.close, c.open) - c.low;
    const upper = c.high - Math.max(c.close, c.open);
    const prevBullish = prev.close > prev.open;
    const bearish = c.close < c.open;
    return prevBullish && bearish && lower > body * 2 && upper < body;
  };

  const isThreeWhiteSoldiers = (c1: OHLC, c2: OHLC, c3: OHLC): boolean => {
    const bullish = (c: OHLC) => c.close > c.open;
    return bullish(c1) && bullish(c2) && bullish(c3) &&
      c2.close > c1.close && c3.close > c2.close;
  };

  const isThreeBlackCrows = (c1: OHLC, c2: OHLC, c3: OHLC): boolean => {
    const bearish = (c: OHLC) => c.close < c.open;
    return bearish(c1) && bearish(c2) && bearish(c3) &&
      c2.close < c1.close && c3.close < c2.close;
  };

  const isPiercingLine = (prev: OHLC, curr: OHLC): boolean => {
    if (prev.close >= prev.open || curr.close <= curr.open) return false;
    const mid = (prev.open + prev.close) / 2;
    return curr.close > mid && curr.open < prev.close;
  };

  const isDarkCloudCover = (prev: OHLC, curr: OHLC): boolean => {
    if (prev.close <= prev.open || curr.close >= curr.open) return false;
    const mid = (prev.open + prev.close) / 2;
    return curr.close < mid && curr.open > prev.close;
  };

  const isSpinningTop = (c: OHLC): boolean => {
    const body = Math.abs(c.close - c.open);
    const upper = c.high - Math.max(c.close, c.open);
    const lower = Math.min(c.close, c.open) - c.low;
    const range = c.high - c.low;
    return range > 0 && body < range * 0.3 && upper > body && lower > body;
  };

  const isDoji = (c: OHLC): boolean => {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    return range > 0 && body / range < 0.05;
  };

  describe('射击之星', () => {
    it('上影线长应为射击之星', () => {
      expect(isShootingStar({ open: 10, high: 10.8, low: 9.95, close: 9.9 })).toBe(true);
    });

    it('无上影线不应为射击之星', () => {
      expect(isShootingStar({ open: 10, high: 10, low: 9, close: 9.5 })).toBe(false);
    });

    it('零波动不应为射击之星', () => {
      expect(isShootingStar({ open: 10, high: 10, low: 10, close: 10 })).toBe(false);
    });
  });

  describe('黄昏之星', () => {
    it('三K线组合', () => {
      // Shooting star: small body, long upper shadow, small lower shadow
      expect(isShootingStar({ open: 10.2, high: 11.0, low: 10.15, close: 10.1 })).toBe(true);
    });
  });

  describe('三白兵', () => {
    it('连续三根阳线', () => {
      const c1 = { open: 10, high: 10.5, low: 9.9, close: 10.4 };
      const c2 = { open: 10.4, high: 10.8, low: 10.3, close: 10.7 };
      const c3 = { open: 10.7, high: 11.2, low: 10.6, close: 11 };
      expect(isThreeWhiteSoldiers(c1, c2, c3)).toBe(true);
    });

    it('含阴线不应为三白兵', () => {
      const c1 = { open: 10, high: 10.5, low: 9.9, close: 10.4 };
      const c2 = { open: 10.4, high: 10.5, low: 10, close: 10.2 };
      const c3 = { open: 10.2, high: 10.8, low: 10.1, close: 10.7 };
      expect(isThreeWhiteSoldiers(c1, c2, c3)).toBe(false);
    });
  });

  describe('三黑鸦', () => {
    it('连续三根阴线', () => {
      const c1 = { open: 11, high: 11.1, low: 10.6, close: 10.7 };
      const c2 = { open: 10.7, high: 10.8, low: 10.3, close: 10.4 };
      const c3 = { open: 10.4, high: 10.5, low: 10, close: 10.1 };
      expect(isThreeBlackCrows(c1, c2, c3)).toBe(true);
    });

    it('含阳线不应为三黑鸦', () => {
      const c1 = { open: 11, high: 11.1, low: 10.6, close: 10.7 };
      const c2 = { open: 10.7, high: 11, low: 10.6, close: 10.9 };
      const c3 = { open: 10.9, high: 11, low: 10.5, close: 10.6 };
      expect(isThreeBlackCrows(c1, c2, c3)).toBe(false);
    });
  });

  describe('刺透形态', () => {
    it('有效刺透', () => {
      const prev = { open: 11, high: 11.1, low: 10, close: 10 };
      const curr = { open: 9.8, high: 10.8, low: 9.7, close: 10.6 };
      expect(isPiercingLine(prev, curr)).toBe(true);
    });

    it('前阳线不应为刺透', () => {
      const prev = { open: 10, high: 11, low: 9.9, close: 10.8 };
      const curr = { open: 10.5, high: 11, low: 10.4, close: 10.9 };
      expect(isPiercingLine(prev, curr)).toBe(false);
    });
  });

  describe('乌云盖顶', () => {
    it('有效乌云盖顶', () => {
      const prev = { open: 10, high: 11, low: 9.9, close: 10.8 };
      const curr = { open: 11, high: 11.1, low: 10.2, close: 10.3 };
      expect(isDarkCloudCover(prev, curr)).toBe(true);
    });

    it('前阴线不应为乌云盖顶', () => {
      const prev = { open: 11, high: 11.1, low: 10, close: 10.2 };
      const curr = { open: 10, high: 10.5, low: 9.5, close: 9.6 };
      expect(isDarkCloudCover(prev, curr)).toBe(false);
    });
  });

  describe('纺锤线', () => {
    it('小实体应为纺锤线', () => {
      expect(isSpinningTop({ open: 10, high: 10.5, low: 9.5, close: 10.1 })).toBe(true);
    });

    it('大实体不应为纺锤线', () => {
      expect(isSpinningTop({ open: 10, high: 11, low: 9, close: 10.9 })).toBe(false);
    });
  });

  describe('十字星', () => {
    it('极小实体应为十字星', () => {
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10.02 })).toBe(true);
    });

    it('有实体不应为十字星', () => {
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10.4 })).toBe(false);
    });

    it('零波动不应为十字星', () => {
      expect(isDoji({ open: 10, high: 10, low: 10, close: 10 })).toBe(false);
    });
  });
});
