import { describe, it, expect } from 'vitest';
import { analyzeOrderBook } from '../utils/orderBookEngine';
import { analyzeOrderFlow, type TickTrade } from '../utils/orderFlowEngine';
import { orderBookVWAP } from '../utils/marketDepthEngine';
import { calculateDepthImbalance } from '../utils/orderBookDepthEngine';
import { detectOutliers, zScore } from '../../../backend/src/services/zScoreEngine';
import {
  formatMarketCap,
  formatCurrency,
  formatChangePercent,
  formatPercent,
} from '../utils/formatters';

/**
 * 市场数据工具测试（影子测试迁移，批次 41b）
 *
 * 已绑定生产实现（唯一真源）：
 * - frontend/src/utils/orderBookEngine.ts:34 analyzeOrderBook(book)
 *   契约：spread 保留 2 位；spreadPct 为 spread/midPrice 的比率（保留 4 位，不是百分数）；
 *   imbalance=(bidDepth-askDepth)/(bidDepth+askDepth) 保留 3 位；pressure 阈值 ±0.1；买/卖盘任一侧为空时全 0。
 *   覆盖：买卖价差 / 价差百分比 / 买卖不平衡度 / 买方深度更大时不平衡为正 / 空订单簿价差为零 / 不平衡度范围[-1,1]。
 *   选型理由：frontend/src/utils/orderBookDepthEngine.ts:39 也有不平衡计算，但它要求盘口带 symbol、
 *   且价差口径是百分数；本测试的模拟盘口没有 symbol，与 orderBookEngine 的 OrderBook 接口一一对应。
 * - frontend/src/utils/marketDepthEngine.ts:326 orderBookVWAP(snapshot)
 *   契约：买卖双边 Σ(price*volume)/Σvolume；Σvolume===0 时回退 snapshot.lastPrice（不是 0）。
 *   覆盖：全盘口VWAP。注意这不是旧 helper 的单边 levels VWAP。
 *   选型理由：orderFlowEngine 的 vwap 来自逐笔成交；orderBookDepthEngine.ts:163 approximateVWAP 需指定
 *   side 与 quantity、按档位消耗成交量；「整本盘口双边量价加权」只有 orderBookVWAP 这一份。
 * - frontend/src/utils/orderBookDepthEngine.ts:39 calculateDepthImbalance(book)
 *   契约：bidVolume/askVolume/ratio(=bidVolume/total，不取整)/spreadPercent(=spread/mid*100，保留 2 位)。
 *   覆盖：深度不平衡（生产口径）。
 *   选型理由：它要求带 symbol 的完整盘口，且同时给出 ratio 与百分数价差，正好覆盖 :34 analyzeOrderBook
 *   之外的另一种盘口形状；两者口径差异在用例注释里显式标注。
 * - frontend/src/utils/orderFlowEngine.ts:57 analyzeOrderFlow(trades)
 *   契约：buyVolume/sellVolume/netFlow(=delta=buy-sell)/vwap(保留 2 位)/buyPressure；
 *   TickTrade 形状为 {price, volume, time, direction, amount}；空数组 buyPressure 0.5、netFlow 0。
 *   覆盖：买卖量统计 / 净流入为负（卖盘主导） / 空逐笔订单流。
 *   选型理由：frontend/src/utils/highFrequencyEngine.ts:98 calculateOrderFlowImbalance 同样按 direction 累计买卖量，
 *   但返回字段叫 netVolume、入参是 TickData；orderFlowEngine 的 netFlow 与旧 helper 返回字段逐字一致，故选它。
 * - backend/src/services/zScoreEngine.ts:18 detectOutliers(data, threshold=2) 与 :6 zScore(value, mean, std)
 *   契约：总体标准差（除以 n）；|z| > threshold 为严格大于；返回 {indices, values}，不返回 normal 分区。
 *   覆盖：无异常值 / 检测异常值 / 空数组 / 单值 / 相同值无异常 / Z分数计算 / 零标准差Z分数为零 / 阈值影响检测结果。
 *   选型理由：同名口径还有 frontend/src/utils/dataQualityEngine.ts:164 detectOutliers(values, threshold=3)，
 *   它返回 AnomalyRecord[]（含 deviation/type，默认阈值 3 且 std===0 直接跳过）；旧 helper 默认 2 且严格大于，
 *   与 backend zScoreEngine 逐字一致，故选它。
 * - frontend/src/utils/formatters.ts:24 formatMarketCap / :99 formatCurrency / :148 formatChangePercent / :60 formatPercent
 *   覆盖：常规价格 / 高价转万 / 高价转万边界 / 零价格 / 货币格式化 / 小金额货币 /
 *   百分比正数 / 百分比负数 / 百分比零 / 百分比自定义小数位 / 百分比入参口径。
 *   选型理由：frontend/src/utils/dataTransformUtils.ts:45 formatAmount 与 :69 formatChangePercent 是同名重复实现，
 *   且没有 null/NaN 处理；formatters.ts 文件头自述「集中管理所有格式化函数」，是唯一收敛点，故选它。
 *   口径提醒：旧 helper 的 formatCurrency(amount, currency='¥') 第二参是符号；生产 formatCurrency(amount, currency='CNY')
 *   第二参是 ISO 货币代码，符号由 Intl 生成。
 *
 * 旧断言错在哪（生产正确）：
 * - 价差百分比：旧 helper 返回百分数 0.09995（已乘 100），生产 analyzeOrderBook().spreadPct 返回比率 0.001；
 *   旧断言只写 0 < x < 1，两种口径都能通过，属口径未锁定的弱断言 → 现改为精确断言 0.001。
 * - 高价转万：旧 helper 以 1e6 为万阈值，生产 formatMarketCap 以 1e4 为阈值；1500000 两者同为 '150.00万'，
 *   但 15000 生产输出 '1.50万'（旧 helper 会输出 '15000.00'）→ 新增边界断言，旧口径不再成立。
 * - 百分比零：旧 helper 只在 >0 时加 '+'，输出 '0.00%'；生产 formatChangePercent 用 >=0，输出 '+0.00%'。
 * - 百分比自定义小数位：旧 helper 接受 decimals=3，输出 '+5.678%'；生产固定 2 位且不接受小数位参数，输出 '+5.68%'。
 * - 异常值检测：旧 helper 返回 {normal, outliers}；生产 detectOutliers 返回 {indices, values}，
 *   只报异常索引与异常值（normal 需由 data.length - values.length 推得），不再是分区结构。
 *
 * 未迁移（生产无同契约导出，保留本地 helper）：
 * - calculateVWAP(levels)：生产 orderBookVWAP 合并买卖双边、空量回退 lastPrice；
 *   orderBookDepthEngine.ts:163 approximateVWAP(book, side, quantity) 是按成交量消耗的成交均价（需要数量、按档位累计），
 *   都不是「单边全部档位的量价加权均值」→ 保留内联。
 * - calculateDepthAtLevel(orderBook, priceRange)：生产 orderBookDepthEngine.ts:110 calculateMarketDepth(book, depthLevels)
 *   按档位数累计，不是按 mid±priceRange 过滤 → 契约不同，保留内联。
 * - classifyTradeSide(price, prevPrice)：tick rule 判定，rg 'classifyTradeSide' 全仓仅本测试命中，生产无此导出 → 保留内联。
 * - calculateTickDirection(ticks)：涨跌笔数差，生产无同契约导出（rg 'tickDirection|upTicks|downTicks' 仅命中测试）→ 保留内联。
 * - calculateIndexWeights / calculateWeightedReturn / calculateEqualWeightReturn：
 *   rg 'IndexWeights|WeightedReturn|EqualWeightReturn' 全仓仅本测试命中；生产只有 adjustWeightsByIC 等不同契约 → 保留内联。
 * - linearInterpolate(x, x1, y1, x2, y2)：生产 frontend/src/utils/indicatorOverlayEngine.ts:245
 *   interpolateAtTimestamp(series, targetTs) 是「指标序列 + 目标时间戳」契约，不是纯四点插值 → 保留内联。
 * - fillMissingDates(dates, values)：rg 'fillMissing|forwardFill|fillForward' 在 frontend/src/utils 与 backend/src 零命中 → 保留内联。
 */

// 订单簿模拟（夹具结构；时间戳用常量，避免测试内出现时间戳生成调用）
const ORDER_BOOK_TS = 1700000000000;

interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

// 生产无同契约导出：单边全部档位的量价加权均值，保留内联
function calculateVWAP(levels: OrderBookLevel[]): number {
  const totalValue = levels.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const totalQty = levels.reduce((sum, l) => sum + l.quantity, 0);
  if (totalQty === 0) return 0;
  return totalValue / totalQty;
}

// 生产无同契约导出：生产 calculateMarketDepth 按档位累计，不按价格区间过滤，保留内联
function calculateDepthAtLevel(orderBook: OrderBook, priceRange: number): {
  bidDepth: number;
  askDepth: number;
} {
  if (orderBook.bids.length === 0 || orderBook.asks.length === 0) {
    return { bidDepth: 0, askDepth: 0 };
  }
  const midPrice = (orderBook.asks[0].price + orderBook.bids[0].price) / 2;
  return {
    bidDepth: orderBook.bids
      .filter(l => l.price >= midPrice - priceRange)
      .reduce((sum, l) => sum + l.quantity, 0),
    askDepth: orderBook.asks
      .filter(l => l.price <= midPrice + priceRange)
      .reduce((sum, l) => sum + l.quantity, 0)
  };
}

describe('订单簿分析', () => {
  const orderBook: OrderBook = {
    bids: [
      { price: 10.00, quantity: 5000, orders: 3 },
      { price: 9.99, quantity: 8000, orders: 5 },
      { price: 9.98, quantity: 3000, orders: 2 }
    ],
    asks: [
      { price: 10.01, quantity: 4000, orders: 2 },
      { price: 10.02, quantity: 6000, orders: 4 },
      { price: 10.03, quantity: 2000, orders: 1 }
    ],
    timestamp: ORDER_BOOK_TS
  };

  it('买卖价差', () => {
    expect(analyzeOrderBook(orderBook).spread).toBe(0.01);
  });

  it('价差百分比', () => {
    // 旧断言错在哪（生产正确）：旧 helper 返回百分数 0.09995，生产 spreadPct 是比率 0.001；
    // 旧断言 0 < x < 1 对两种口径都成立，无法暴露单位错误。
    const spreadPct = analyzeOrderBook(orderBook).spreadPct;
    expect(spreadPct).toBe(0.001);
    expect(spreadPct).toBeGreaterThan(0);
  });

  it('买卖不平衡度', () => {
    const imbalance = analyzeOrderBook(orderBook).imbalance;
    expect(imbalance).toBe(0.143);
    expect(imbalance).toBeGreaterThan(-1);
    expect(imbalance).toBeLessThan(1);
  });

  it('买方深度更大时不平衡为正', () => {
    const analysis = analyzeOrderBook(orderBook);
    expect(analysis.bidDepth).toBe(16000);
    expect(analysis.askDepth).toBe(12000);
    expect(analysis.imbalance).toBeGreaterThan(0);
    // 生产语义：imbalance > 0.1 判为买方压力
    expect(analysis.pressure).toBe('buy');
  });

  it('买方VWAP', () => {
    const vwap = calculateVWAP(orderBook.bids);
    expect(vwap).toBeGreaterThan(9.98);
    expect(vwap).toBeLessThan(10.01);
  });

  it('卖方VWAP', () => {
    const vwap = calculateVWAP(orderBook.asks);
    expect(vwap).toBeGreaterThan(10);
    expect(vwap).toBeLessThan(10.04);
  });

  it('空订单簿价差为零', () => {
    const empty: OrderBook = { bids: [], asks: [], timestamp: 0 };
    const analysis = analyzeOrderBook(empty);
    expect(analysis.spread).toBe(0);
    expect(analysis.spreadPct).toBe(0);
    expect(analysis.pressure).toBe('neutral');
  });

  it('深度计算', () => {
    const depth = calculateDepthAtLevel(orderBook, 0.02);
    expect(depth.bidDepth).toBeGreaterThan(0);
    expect(depth.askDepth).toBeGreaterThan(0);
  });

  it('空订单簿深度为零', () => {
    const empty: OrderBook = { bids: [], asks: [], timestamp: 0 };
    const depth = calculateDepthAtLevel(empty, 0.01);
    expect(depth.bidDepth).toBe(0);
    expect(depth.askDepth).toBe(0);
  });

  it('VWAP空层级返回零', () => {
    expect(calculateVWAP([])).toBe(0);
  });

  it('不平衡度范围[-1, 1]', () => {
    const ob1: OrderBook = {
      bids: [{ price: 10, quantity: 100000, orders: 1 }],
      asks: [{ price: 10.01, quantity: 0, orders: 0 }],
      timestamp: 0
    };
    expect(analyzeOrderBook(ob1).imbalance).toBe(1);
    expect(analyzeOrderBook(ob1).pressure).toBe('buy');

    const ob2: OrderBook = {
      bids: [{ price: 10, quantity: 0, orders: 0 }],
      asks: [{ price: 10.01, quantity: 100000, orders: 1 }],
      timestamp: 0
    };
    expect(analyzeOrderBook(ob2).imbalance).toBe(-1);
    expect(analyzeOrderBook(ob2).pressure).toBe('sell');
  });

  it('全盘口VWAP（生产 orderBookVWAP）', () => {
    const snapshot = {
      timestamp: ORDER_BOOK_TS,
      symbol: 'TEST',
      lastPrice: 10.005,
      bids: [
        { price: 10.00, volume: 5000, orders: 3 },
        { price: 9.99, volume: 8000, orders: 5 },
        { price: 9.98, volume: 3000, orders: 2 }
      ],
      asks: [
        { price: 10.01, volume: 4000, orders: 2 },
        { price: 10.02, volume: 6000, orders: 4 },
        { price: 10.03, volume: 2000, orders: 1 }
      ],
    };
    // 双边量价加权：280080 / 28000 = 10.002857...（生产不取整）
    expect(orderBookVWAP(snapshot)).toBeCloseTo(10.0029, 4);
    // 空量时生产回退 lastPrice，而不是返回 0（与旧 helper 不同，故旧 helper 不能直接替换）
    expect(orderBookVWAP({ ...snapshot, bids: [], asks: [], lastPrice: 12.34 })).toBe(12.34);
  });

  it('深度不平衡（生产 calculateDepthImbalance）', () => {
    const book = {
      symbol: 'TEST',
      timestamp: ORDER_BOOK_TS,
      bids: [
        { price: 10.00, quantity: 5000, orders: 3 },
        { price: 9.99, quantity: 8000, orders: 5 },
        { price: 9.98, quantity: 3000, orders: 2 }
      ],
      asks: [
        { price: 10.01, quantity: 4000, orders: 2 },
        { price: 10.02, quantity: 6000, orders: 4 },
        { price: 10.03, quantity: 2000, orders: 1 }
      ],
    };
    const depth = calculateDepthImbalance(book);
    expect(depth.bidVolume).toBe(16000);
    expect(depth.askVolume).toBe(12000);
    expect(depth.ratio).toBeCloseTo(0.5714, 4);
    // 同名多口径：这一份把价差做成百分数 0.1，orderBookEngine 的 spreadPct 是比率 0.001
    expect(depth.spreadPercent).toBe(0.1);
  });
});

// 逐笔成交分析
// 生产无同契约导出：tick rule 主动方向判定，保留内联
function classifyTradeSide(price: number, prevPrice: number): 'buy' | 'sell' | 'neutral' {
  if (price > prevPrice) return 'buy';
  if (price < prevPrice) return 'sell';
  return 'neutral';
}

// 生产无同契约导出：相邻价格涨跌笔数之差，保留内联
function calculateTickDirection(ticks: { price: number }[]): number {
  if (ticks.length < 2) return 0;
  let up = 0, down = 0;
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i].price > ticks[i - 1].price) up++;
    else if (ticks[i].price < ticks[i - 1].price) down++;
  }
  return up - down;
}

describe('逐笔成交分析', () => {
  it('判断主动买', () => {
    expect(classifyTradeSide(10.05, 10.00)).toBe('buy');
  });

  it('判断主动卖', () => {
    expect(classifyTradeSide(9.95, 10.00)).toBe('sell');
  });

  it('平盘', () => {
    expect(classifyTradeSide(10.00, 10.00)).toBe('neutral');
  });

  it('买卖量统计', () => {
    // 生产形状：TickTrade 用 direction/volume/amount/time（旧夹具是 side/quantity/timestamp）
    const ticks: TickTrade[] = [
      { price: 10, volume: 100, time: '09:30:00', direction: 'buy', amount: 1000 },
      { price: 9.9, volume: 200, time: '09:30:01', direction: 'sell', amount: 1980 },
      { price: 10.1, volume: 150, time: '09:30:02', direction: 'buy', amount: 1515 }
    ];
    const flow = analyzeOrderFlow(ticks);
    expect(flow.buyVolume).toBe(250);
    expect(flow.sellVolume).toBe(200);
    expect(flow.netFlow).toBe(50);
    // 生产 vwap = Σamount / Σvolume = 4495 / 450 = 9.9889 → 保留 2 位
    expect(flow.vwap).toBe(9.99);
  });

  it('净流入为负（卖盘主导）', () => {
    const ticks: TickTrade[] = [
      { price: 10, volume: 100, time: '09:30:00', direction: 'buy', amount: 1000 },
      { price: 9.9, volume: 500, time: '09:30:01', direction: 'sell', amount: 4950 }
    ];
    expect(analyzeOrderFlow(ticks).netFlow).toBeLessThan(0);
  });

  it('涨跌笔数', () => {
    const ticks = [
      { price: 10, quantity: 100, timestamp: 1, side: 'buy' },
      { price: 10.1, quantity: 100, timestamp: 2, side: 'buy' },
      { price: 10.05, quantity: 100, timestamp: 3, side: 'sell' }
    ];
    expect(calculateTickDirection(ticks)).toBe(0); // 1 up, 1 down
  });

  it('空逐笔返回零', () => {
    expect(calculateTickDirection([])).toBe(0);
  });

  it('单笔逐笔返回零', () => {
    expect(calculateTickDirection([{ price: 10, quantity: 100, timestamp: 1, side: 'buy' }])).toBe(0);
  });

  it('空逐笔订单流（生产 analyzeOrderFlow）', () => {
    // 生产语义：空数组不是全 0 对象，buyPressure/sellPressure 固定 0.5
    const flow = analyzeOrderFlow([]);
    expect(flow.netFlow).toBe(0);
    expect(flow.buyPressure).toBe(0.5);
    expect(flow.vwap).toBe(0);
  });
});

// 指数权重计算（生产无同契约导出：全仓检索 IndexWeights/WeightedReturn/EqualWeightReturn 仅本测试命中）
function calculateIndexWeights(marketCaps: number[]): number[] {
  const total = marketCaps.reduce((a, b) => a + b, 0);
  if (total === 0) return marketCaps.map(() => 0);
  return marketCaps.map(cap => cap / total);
}

function calculateWeightedReturn(returns: number[], weights: number[]): number {
  if (returns.length !== weights.length) return 0;
  return returns.reduce((sum, r, i) => sum + r * weights[i], 0);
}

function calculateEqualWeightReturn(returns: number[]): number {
  if (returns.length === 0) return 0;
  return returns.reduce((a, b) => a + b, 0) / returns.length;
}

describe('指数权重计算', () => {
  it('权重总和为1', () => {
    const caps = [1000, 2000, 3000];
    const weights = calculateIndexWeights(caps);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('大市值权重高', () => {
    const caps = [100, 900];
    const weights = calculateIndexWeights(caps);
    expect(weights[1]).toBeGreaterThan(weights[0]);
  });

  it('零市值权重为零', () => {
    const caps = [0, 0, 0];
    const weights = calculateIndexWeights(caps);
    expect(weights.every(w => w === 0)).toBe(true);
  });

  it('加权收益率', () => {
    const returns = [0.1, -0.05, 0.02];
    const weights = [0.5, 0.3, 0.2];
    const wr = calculateWeightedReturn(returns, weights);
    // 0.1*0.5 + (-0.05)*0.3 + 0.02*0.2 = 0.05 - 0.015 + 0.004 = 0.039
    expect(wr).toBeCloseTo(0.039, 4);
  });

  it('等权收益率', () => {
    const returns = [0.1, -0.1, 0.2];
    expect(calculateEqualWeightReturn(returns)).toBeCloseTo(0.0667, 3);
  });

  it('空数组等权收益', () => {
    expect(calculateEqualWeightReturn([])).toBe(0);
  });

  it('长度不匹配返回零', () => {
    expect(calculateWeightedReturn([1, 2], [0.5])).toBe(0);
  });

  it('单成分等权收益', () => {
    expect(calculateEqualWeightReturn([0.15])).toBe(0.15);
  });
});

// 异常值检测：绑定 backend/src/services/zScoreEngine.ts:18/:6
describe('异常值检测', () => {
  it('无异常值', () => {
    const values = [10, 10.5, 9.8, 10.2, 9.9];
    const result = detectOutliers(values);
    // 旧断言读 result.normal / result.outliers；生产只返回 {indices, values}，normal 需自行推得
    expect(result.values).toHaveLength(0);
    expect(result.indices).toHaveLength(0);
    expect(values.length - result.values.length).toBe(5);
  });

  it('检测异常值', () => {
    const values = [10, 10, 10, 10, 200]; // 200 偏离均值 48 达 2 个标准差
    const result = detectOutliers(values, 1.5);
    expect(result.values).toContain(200);
    expect(result.indices).toEqual([4]);
  });

  it('空数组', () => {
    const result = detectOutliers([]);
    expect(result.values).toHaveLength(0);
    expect(result.indices).toHaveLength(0);
  });

  it('单值', () => {
    const result = detectOutliers([42]);
    // 旧断言错在哪：旧 helper 返回 normal:[42]；生产 std=0 → z=0 → 不报异常，values 为空
    expect(result.values).toEqual([]);
    expect(result.indices).toEqual([]);
  });

  it('相同值无异常', () => {
    const result = detectOutliers([5, 5, 5, 5]);
    expect(result.values).toHaveLength(0);
  });

  it('Z分数计算', () => {
    expect(zScore(15, 10, 5)).toBe(1);
    expect(zScore(0, 10, 5)).toBe(-2);
  });

  it('零标准差Z分数为零', () => {
    expect(zScore(10, 10, 0)).toBe(0);
  });

  it('阈值影响检测结果', () => {
    const values = [1, 1, 1, 1, 5];
    const r1 = detectOutliers(values, 1);
    const r2 = detectOutliers(values, 10);
    expect(r1.values.length).toBeGreaterThanOrEqual(r2.values.length);
    expect(r2.values).toHaveLength(0);
  });
});

// 数据插值
// 生产无同契约导出：interpolateAtTimestamp(series, targetTs) 是「序列 + 时间戳」契约，保留内联
function linearInterpolate(x: number, x1: number, y1: number, x2: number, y2: number): number {
  if (x2 === x1) return y1;
  return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
}

// 生产无同契约导出：rg fillMissing|forwardFill|fillForward 在 utils 与 backend/src 零命中，保留内联
function fillMissingDates(dates: string[], values: (number | null)[]): (number | null)[] {
  const result: (number | null)[] = [...values];
  let lastValidIndex = -1;

  for (let i = 0; i < result.length; i++) {
    if (result[i] !== null) {
      // 回填之前的空值
      if (lastValidIndex >= 0 && i - lastValidIndex > 1) {
        const startVal = result[lastValidIndex] as number;
        const endVal = result[i] as number;
        for (let j = lastValidIndex + 1; j < i; j++) {
          const ratio = (j - lastValidIndex) / (i - lastValidIndex);
          result[j] = startVal + (endVal - startVal) * ratio;
        }
      }
      lastValidIndex = i;
    }
  }

  return result;
}

describe('数据插值', () => {
  it('线性插值中点', () => {
    expect(linearInterpolate(5, 0, 0, 10, 10)).toBe(5);
  });

  it('线性插值精确点', () => {
    expect(linearInterpolate(0, 0, 0, 10, 10)).toBe(0);
  });

  it('相同X返回y1', () => {
    expect(linearInterpolate(5, 5, 10, 5, 20)).toBe(10);
  });

  it('填充缺失值', () => {
    const values = [10, null, null, 16, 18];
    const result = fillMissingDates([], values);
    expect(result[0]).toBe(10);
    expect(result[1]).toBeCloseTo(12, 1);
    expect(result[2]).toBeCloseTo(14, 1);
    expect(result[3]).toBe(16);
  });

  it('无缺失值不变', () => {
    const values = [10, 12, 14, 16];
    const result = fillMissingDates([], values);
    expect(result).toEqual([10, 12, 14, 16]);
  });

  it('全部为空返回全部为空', () => {
    const values = [null, null, null];
    const result = fillMissingDates([], values);
    expect(result).toEqual([null, null, null]);
  });

  it('首尾为空不填充', () => {
    const values = [null, 10, null];
    const result = fillMissingDates([], values);
    expect(result[0]).toBeNull();
    expect(result[2]).toBeNull();
    expect(result[1]).toBe(10);
  });
});

// 价格格式化：绑定 frontend/src/utils/formatters.ts
describe('价格格式化', () => {
  it('常规价格', () => {
    expect(formatMarketCap(10.5)).toBe('10.50');
  });

  it('高价转万', () => {
    expect(formatMarketCap(1500000)).toBe('150.00万');
  });

  it('高价转万边界', () => {
    // 旧断言错在哪（生产正确）：旧 helper 阈值是 1e6，15000 会输出 '15000.00'；生产阈值是 1e4 → '1.50万'
    expect(formatMarketCap(15000)).toBe('1.50万');
    expect(formatMarketCap(9999)).toBe('9999.00');
  });

  it('零价格', () => {
    expect(formatMarketCap(0)).toBe('0.00');
  });

  it('货币格式化', () => {
    // 生产第二参是 ISO 货币代码（默认 CNY），符号由 Intl 生成：¥1,234,567.89
    expect(formatCurrency(1234567.89)).toBe('¥1,234,567.89');
  });

  it('小金额货币', () => {
    expect(formatCurrency(123.4)).toBe('¥123.40');
  });

  it('百分比正数', () => {
    expect(formatChangePercent(5.67)).toBe('+5.67%');
  });

  it('百分比负数', () => {
    expect(formatChangePercent(-3.21)).toBe('-3.21%');
  });

  it('百分比零', () => {
    // 旧断言错在哪（生产正确）：旧 helper 只在 >0 时加 '+'，输出 '0.00%'；生产用 >=0，输出 '+0.00%'
    expect(formatChangePercent(0)).toBe('+0.00%');
    expect(formatChangePercent(null)).toBe('-');
  });

  it('百分比自定义小数位', () => {
    // 旧断言错在哪（生产正确）：旧 helper 支持 decimals=3 → '+5.678%'；生产固定 2 位，忽略小数位参数
    expect(formatChangePercent(5.678)).toBe('+5.68%');
  });

  it('百分比入参口径', () => {
    // 同名多口径：formatChangePercent 入参已是百分数（5.67 → '+5.67%'），formatPercent 入参是比率（0.15 → '15.00%'）
    expect(formatPercent(0.15)).toBe('15.00%');
    expect(formatPercent(-0.0321)).toBe('-3.21%');
  });
});
