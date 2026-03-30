import { describe, it, expect } from 'vitest';

describe('交易成本模型', () => {
  interface Trade { price: number; quantity: number; side: 'buy' | 'sell'; }
  const COMMISSION_RATE = 0.0003;
  const STAMP_TAX_BUY = 0;
  const STAMP_TAX_SELL = 0.001;
  const SLIPPAGE_BPS = 5;

  function calcCommission(trade: Trade): number {
    const base = trade.price * trade.quantity * COMMISSION_RATE;
    return Math.max(base, 5); // 最低5元
  }
  function calcStampTax(trade: Trade): number {
    const rate = trade.side === 'buy' ? STAMP_TAX_BUY : STAMP_TAX_SELL;
    return trade.price * trade.quantity * rate;
  }
  function calcSlippage(trade: Trade): number {
    const bps = SLIPPAGE_BPS / 10000;
    return trade.price * trade.quantity * bps;
  }
  function calcTotalCost(trade: Trade): number {
    return calcCommission(trade) + calcStampTax(trade) + calcSlippage(trade);
  }
  function calcBreakEvenPrice(buyPrice: number): number {
    const buyCost = calcTotalCost({ price: buyPrice, quantity: 100, side: 'buy' });
    const sellCost = calcTotalCost({ price: buyPrice, quantity: 100, side: 'sell' });
    return buyPrice + (buyCost + sellCost) / 100;
  }
  function calcTurnoverRate(volume: number, totalShares: number): number {
    if (totalShares <= 0) return 0;
    return volume / totalShares * 100;
  }
  function calcVolumeWeightedPrice(trades: Trade[]): number {
    const totalVol = trades.reduce((s, t) => s + t.quantity, 0);
    if (totalVol === 0) return 0;
    return trades.reduce((s, t) => s + t.price * t.quantity, 0) / totalVol;
  }
  function calcPnL(buyPrice: number, sellPrice: number, quantity: number): number {
    const buyCost = calcTotalCost({ price: buyPrice, quantity, side: 'buy' });
    const sellCost = calcTotalCost({ price: sellPrice, quantity, side: 'sell' });
    return (sellPrice - buyPrice) * quantity - buyCost - sellCost;
  }
  function calcAnnualizedReturn(pnl: number, capital: number, days: number): number {
    if (capital <= 0 || days <= 0) return 0;
    return (pnl / capital) * (365 / days);
  }

  it('计算佣金 - 大额', () => {
    const comm = calcCommission({ price: 100, quantity: 1000, side: 'buy' });
    expect(comm).toBeCloseTo(30, 2);
  });

  it('计算佣金 - 小额最低5元', () => {
    const comm = calcCommission({ price: 5, quantity: 10, side: 'buy' });
    expect(comm).toBe(5);
  });

  it('买入不收印花税', () => {
    expect(calcStampTax({ price: 100, quantity: 100, side: 'buy' })).toBe(0);
  });

  it('卖出收千一印花税', () => {
    expect(calcStampTax({ price: 100, quantity: 100, side: 'sell' })).toBe(10);
  });

  it('计算滑点成本', () => {
    const slippage = calcSlippage({ price: 50, quantity: 200, side: 'buy' });
    expect(slippage).toBeCloseTo(5, 2);
  });

  it('计算总交易成本', () => {
    const total = calcTotalCost({ price: 100, quantity: 100, side: 'sell' });
    expect(total).toBeGreaterThan(0);
  });

  it('买入成本低于卖出', () => {
    const buy = calcTotalCost({ price: 100, quantity: 100, side: 'buy' });
    const sell = calcTotalCost({ price: 100, quantity: 100, side: 'sell' });
    expect(buy).toBeLessThan(sell); // 卖出有印花税
  });

  it('计算保本价', () => {
    const bep = calcBreakEvenPrice(10);
    expect(bep).toBeGreaterThan(10);
  });

  it('换手率计算', () => {
    expect(calcTurnoverRate(1000000, 10000000)).toBeCloseTo(10, 2);
  });

  it('换手率0总股本', () => {
    expect(calcTurnoverRate(100, 0)).toBe(0);
  });

  it('成交量加权均价', () => {
    const trades: Trade[] = [
      { price: 10, quantity: 100, side: 'buy' },
      { price: 11, quantity: 200, side: 'buy' },
    ];
    expect(calcVolumeWeightedPrice(trades)).toBeCloseTo(10.667, 2);
  });

  it('VWAP空交易', () => {
    expect(calcVolumeWeightedPrice([])).toBe(0);
  });

  it('计算盈亏', () => {
    const pnl = calcPnL(10, 11, 100);
    expect(pnl).toBeLessThan(100); // 扣除交易成本
  });

  it('亏损交易', () => {
    const pnl = calcPnL(11, 10, 100);
    expect(pnl).toBeLessThan(0);
  });

  it('盈亏含成本', () => {
    const pnl = calcPnL(10, 10, 100); // 同价卖出
    expect(pnl).toBeLessThan(0); // 纯亏交易成本
  });

  it('计算年化收益率', () => {
    const ann = calcAnnualizedReturn(1000, 100000, 30);
    expect(ann).toBeCloseTo(0.1217, 2);
  });

  it('年化收益0本金', () => {
    expect(calcAnnualizedReturn(100, 0, 30)).toBe(0);
  });

  it('年化收益0天', () => {
    expect(calcAnnualizedReturn(100, 10000, 0)).toBe(0);
  });

  it('换手率100%', () => {
    expect(calcTurnoverRate(5000000, 5000000)).toBe(100);
  });

  it('成本随金额增大', () => {
    const small = calcTotalCost({ price: 10, quantity: 100, side: 'sell' });
    const large = calcTotalCost({ price: 100, quantity: 100, side: 'sell' });
    expect(large).toBeGreaterThan(small);
  });
});
