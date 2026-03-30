import { describe, it, expect } from 'vitest';

// 市场深度分析测试 - 订单簿聚合、盘口压力/支撑、资金流向计算

interface OrderLevel {
  price: number;
  volume: number;
  orders: number;
}

interface OrderBook {
  symbol: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
  timestamp: number;
}

interface DepthAnalysis {
  bidVolume: number;
  askVolume: number;
  bidValue: number;
  askValue: number;
  imbalance: number;
  spread: number;
  spreadPercent: number;
  weightedBidPrice: number;
  weightedAskPrice: number;
  pressureScore: number;
}

interface FlowData {
  date: string;
  mainInflow: number;
  mainOutflow: number;
  superInflow: number;
  superOutflow: number;
  bigInflow: number;
  bigOutflow: number;
  midInflow: number;
  midOutflow: number;
  smallInflow: number;
  smallOutflow: number;
}

function analyzeDepth(book: OrderBook): DepthAnalysis {
  const bidVolume = book.bids.reduce((s, b) => s + b.volume, 0);
  const askVolume = book.asks.reduce((s, a) => s + a.volume, 0);
  const bidValue = book.bids.reduce((s, b) => s + b.price * b.volume, 0);
  const askValue = book.asks.reduce((s, a) => s + a.price * a.volume, 0);
  const bestBid = book.bids[0]?.price || 0;
  const bestAsk = book.asks[0]?.price || 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;
  const imbalance = bidVolume > 0 || askVolume > 0
    ? (bidVolume - askVolume) / (bidVolume + askVolume)
    : 0;
  const weightedBidPrice = bidVolume > 0 ? bidValue / bidVolume : 0;
  const weightedAskPrice = askVolume > 0 ? askValue / askVolume : 0;
  const pressureScore = imbalance * 50 + 50;

  return {
    bidVolume,
    askVolume,
    bidValue,
    askValue,
    imbalance,
    spread,
    spreadPercent: midPrice > 0 ? (spread / midPrice) * 100 : 0,
    weightedBidPrice: Math.round(weightedBidPrice * 100) / 100,
    weightedAskPrice: Math.round(weightedAskPrice * 100) / 100,
    pressureScore: Math.round(pressureScore * 100) / 100,
  };
}

function calculateNetFlow(flow: FlowData) {
  return {
    mainNet: flow.mainInflow - flow.mainOutflow,
    superNet: flow.superInflow - flow.superOutflow,
    bigNet: flow.bigInflow - flow.bigOutflow,
    midNet: flow.midInflow - flow.midOutflow,
    smallNet: flow.smallInflow - flow.smallOutflow,
    totalNet: (flow.mainInflow + flow.superInflow + flow.bigInflow + flow.midInflow + flow.smallInflow)
      - (flow.mainOutflow + flow.superOutflow + flow.bigOutflow + flow.midOutflow + flow.smallOutflow),
  };
}

function aggregateFlows(flows: FlowData[]) {
  return flows.reduce(
    (acc, f) => {
      const net = calculateNetFlow(f);
      acc.mainNet += net.mainNet;
      acc.superNet += net.superNet;
      acc.bigNet += net.bigNet;
      acc.midNet += net.midNet;
      acc.smallNet += net.smallNet;
      acc.totalNet += net.totalNet;
      acc.days++;
      return acc;
    },
    { mainNet: 0, superNet: 0, bigNet: 0, midNet: 0, smallNet: 0, totalNet: 0, days: 0 }
  );
}

describe('市场深度分析测试', () => {
  const sampleBook: OrderBook = {
    symbol: '600519',
    bids: [
      { price: 1899.00, volume: 500, orders: 10 },
      { price: 1898.50, volume: 800, orders: 15 },
      { price: 1898.00, volume: 1200, orders: 20 },
      { price: 1897.50, volume: 600, orders: 8 },
      { price: 1897.00, volume: 300, orders: 5 },
    ],
    asks: [
      { price: 1900.00, volume: 400, orders: 8 },
      { price: 1900.50, volume: 700, orders: 12 },
      { price: 1901.00, volume: 1000, orders: 18 },
      { price: 1901.50, volume: 500, orders: 7 },
      { price: 1902.00, volume: 200, orders: 3 },
    ],
    timestamp: Date.now(),
  };

  describe('盘口分析', () => {
    it('买卖总量', () => {
      const analysis = analyzeDepth(sampleBook);
      expect(analysis.bidVolume).toBe(3400);
      expect(analysis.askVolume).toBe(2800);
    });

    it('买卖金额', () => {
      const analysis = analyzeDepth(sampleBook);
      expect(analysis.bidValue).toBeGreaterThan(0);
      expect(analysis.askValue).toBeGreaterThan(0);
    });

    it('盘口不平衡度', () => {
      const analysis = analyzeDepth(sampleBook);
      expect(analysis.imbalance).toBeGreaterThan(0); // 买盘多
      expect(analysis.imbalance).toBeLessThanOrEqual(1);
    });

    it('买卖价差', () => {
      const analysis = analyzeDepth(sampleBook);
      expect(analysis.spread).toBe(1.0);
      expect(analysis.spreadPercent).toBeCloseTo(0.0526, 2);
    });

    it('加权均价', () => {
      const analysis = analyzeDepth(sampleBook);
      expect(analysis.weightedBidPrice).toBeGreaterThan(1897);
      expect(analysis.weightedBidPrice).toBeLessThan(1900);
      expect(analysis.weightedAskPrice).toBeGreaterThan(1900);
    });

    it('压力分数范围', () => {
      const analysis = analyzeDepth(sampleBook);
      expect(analysis.pressureScore).toBeGreaterThanOrEqual(0);
      expect(analysis.pressureScore).toBeLessThanOrEqual(100);
    });
  });

  describe('对称盘口', () => {
    it('买卖均衡时不平衡度为0', () => {
      const book: OrderBook = {
        symbol: 'TEST',
        bids: [{ price: 100, volume: 500, orders: 5 }],
        asks: [{ price: 101, volume: 500, orders: 5 }],
        timestamp: Date.now(),
      };
      const analysis = analyzeDepth(book);
      expect(analysis.imbalance).toBe(0);
      expect(analysis.pressureScore).toBe(50);
    });
  });

  describe('单边盘口', () => {
    it('只有买盘', () => {
      const book: OrderBook = {
        symbol: 'TEST',
        bids: [{ price: 100, volume: 100, orders: 5 }],
        asks: [],
        timestamp: Date.now(),
      };
      const analysis = analyzeDepth(book);
      expect(analysis.imbalance).toBe(1);
      expect(analysis.askVolume).toBe(0);
    });

    it('只有卖盘', () => {
      const book: OrderBook = {
        symbol: 'TEST',
        bids: [],
        asks: [{ price: 101, volume: 100, orders: 5 }],
        timestamp: Date.now(),
      };
      const analysis = analyzeDepth(book);
      expect(analysis.imbalance).toBe(-1);
      expect(analysis.bidVolume).toBe(0);
    });

    it('空盘口', () => {
      const book: OrderBook = { symbol: 'TEST', bids: [], asks: [], timestamp: Date.now() };
      const analysis = analyzeDepth(book);
      expect(analysis.imbalance).toBe(0);
      expect(analysis.spread).toBe(0);
    });
  });

  describe('资金流向计算', () => {
    const sampleFlow: FlowData = {
      date: '2024-01-15',
      mainInflow: 50000000, mainOutflow: 45000000,
      superInflow: 20000000, superOutflow: 18000000,
      bigInflow: 15000000, bigOutflow: 12000000,
      midInflow: 10000000, midOutflow: 8000000,
      smallInflow: 5000000, smallOutflow: 7000000,
    };

    it('净流入计算', () => {
      const net = calculateNetFlow(sampleFlow);
      expect(net.mainNet).toBe(5000000);
      expect(net.superNet).toBe(2000000);
      expect(net.smallNet).toBe(-2000000);
    });

    it('总净流入', () => {
      const net = calculateNetFlow(sampleFlow);
      expect(net.totalNet).toBe(5000000 + 2000000 + 3000000 + 2000000 - 2000000);
    });

    it('多日聚合', () => {
      const flows: FlowData[] = [
        { ...sampleFlow, date: '01-15' },
        { ...sampleFlow, date: '01-16', mainInflow: 60000000, mainOutflow: 55000000 },
      ];
      const agg = aggregateFlows(flows);
      expect(agg.days).toBe(2);
      expect(agg.mainNet).toBe(5000000 + 5000000);
    });

    it('空数组聚合', () => {
      const agg = aggregateFlows([]);
      expect(agg.days).toBe(0);
      expect(agg.totalNet).toBe(0);
    });
  });
});
