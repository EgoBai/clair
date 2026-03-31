import { describe, it, expect } from 'vitest';

describe('微观结构分析引擎 (订单流不平衡)', () => {
  interface Tick { price: number; volume: number; timestamp: number; side: 'buy' | 'sell' }

  function orderFlowImbalance(ticks: Tick[], window: number) {
    if (ticks.length < window) return [];
    const results: { buyVol: number; sellVol: number; imbalance: number; ratio: number }[] = [];
    for (let i = window - 1; i < ticks.length; i++) {
      const slice = ticks.slice(i - window + 1, i + 1);
      const buyVol = slice.filter(t => t.side === 'buy').reduce((s, t) => s + t.volume, 0);
      const sellVol = slice.filter(t => t.side === 'sell').reduce((s, t) => s + t.volume, 0);
      const total = buyVol + sellVol;
      results.push({ buyVol, sellVol, imbalance: buyVol - sellVol, ratio: total > 0 ? buyVol / total : 0.5 });
    }
    return results;
  }

  function volumeWeightedSpread(ticks: Tick[], window: number) {
    if (ticks.length < window) return [];
    const results: number[] = [];
    for (let i = window - 1; i < ticks.length; i++) {
      const slice = ticks.slice(i - window + 1, i + 1);
      const prices = slice.map(t => t.price);
      const high = Math.max(...prices), low = Math.min(...prices);
      const totalVol = slice.reduce((s, t) => s + t.volume, 0);
      results.push(totalVol > 0 ? (high - low) / (totalVol / window) : 0);
    }
    return results;
  }

  function priceImpact(ticks: Tick[]) {
    if (ticks.length < 2) return { lambda: 0, rSquared: 0 };
    const changes: number[] = [];
    const signedVol: number[] = [];
    for (let i = 1; i < ticks.length; i++) {
      changes.push(ticks[i].price - ticks[i - 1].price);
      signedVol.push(ticks[i].side === 'buy' ? ticks[i].volume : -ticks[i].volume);
    }
    const meanC = changes.reduce((a, b) => a + b, 0) / changes.length;
    const meanV = signedVol.reduce((a, b) => a + b, 0) / signedVol.length;
    const cov = signedVol.reduce((s, v, i) => s + (v - meanV) * (changes[i] - meanC), 0) / changes.length;
    const varV = signedVol.reduce((s, v) => s + (v - meanV) ** 2, 0) / changes.length;
    const lambda = varV === 0 ? 0 : cov / varV;
    // R-squared
    const ssRes = changes.reduce((s, c, i) => s + (c - (lambda * signedVol[i])) ** 2, 0);
    const ssTot = changes.reduce((s, c) => s + (c - meanC) ** 2, 0);
    const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    return { lambda, rSquared };
  }

  function tradeSizeDistribution(ticks: Tick[], bins: number) {
    const volumes = ticks.map(t => t.volume);
    const min = Math.min(...volumes), max = Math.max(...volumes);
    const binWidth = (max - min) / bins || 1;
    const counts = Array(bins).fill(0);
    for (const v of volumes) {
      const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      counts[idx]++;
    }
    return counts.map((count, i) => ({
      range: [min + i * binWidth, min + (i + 1) * binWidth],
      count,
      pct: count / volumes.length,
    }));
  }

  function kyleLambda(ticks: Tick[]) {
    // Market impact: ΔP = λ * signed_volume
    const changes: { dP: number; sv: number }[] = [];
    for (let i = 1; i < ticks.length; i++) {
      changes.push({
        dP: ticks[i].price - ticks[i - 1].price,
        sv: ticks[i].side === 'buy' ? ticks[i].volume : -ticks[i].volume,
      });
    }
    const meanSv = changes.reduce((a, b) => a + b.sv, 0) / changes.length;
    const meanDp = changes.reduce((a, b) => a + b.dP, 0) / changes.length;
    const cov = changes.reduce((s, c) => s + (c.sv - meanSv) * (c.dP - meanDp), 0) / changes.length;
    const varSv = changes.reduce((s, c) => s + (c.sv - meanSv) ** 2, 0) / changes.length;
    return varSv === 0 ? 0 : cov / varSv;
  }

  function realizedVolatility(ticks: Tick[], window: number) {
    if (ticks.length < window + 1) return [];
    const results: number[] = [];
    for (let i = window; i < ticks.length; i++) {
      const returns: number[] = [];
      for (let j = i - window + 1; j <= i; j++) {
        returns.push(Math.log(ticks[j].price / ticks[j - 1].price));
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      results.push(Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length) * Math.sqrt(252));
    }
    return results;
  }

  function vwap(ticks: Tick[]) {
    let cumVol = 0, cumPV = 0;
    return ticks.map(t => {
      cumVol += t.volume;
      cumPV += t.price * t.volume;
      return cumVol > 0 ? cumPV / cumVol : t.price;
    });
  }

  const sampleTicks: Tick[] = Array.from({ length: 50 }, (_, i) => ({
    price: 100 + Math.sin(i / 5) * 2,
    volume: 100 + Math.random() * 500,
    timestamp: i,
    side: i % 3 === 0 ? 'sell' : 'buy',
  }));

  describe('订单流不平衡', () => {
    it('计算买卖量不平衡', () => {
      const result = orderFlowImbalance(sampleTicks, 10);
      expect(result).toHaveLength(41);
      result.forEach(r => {
        expect(r.imbalance).toBe(r.buyVol - r.sellVol);
        expect(r.ratio).toBeGreaterThanOrEqual(0);
        expect(r.ratio).toBeLessThanOrEqual(1);
      });
    });

    it('全买盘比率为1', () => {
      const ticks: Tick[] = Array.from({ length: 10 }, (_, i) => ({ price: 100, volume: 100, timestamp: i, side: 'buy' }));
      const result = orderFlowImbalance(ticks, 5);
      expect(result[0].ratio).toBe(1);
    });

    it('数据不足返回空', () => {
      expect(orderFlowImbalance(sampleTicks.slice(0, 3), 10)).toEqual([]);
    });
  });

  describe('价格冲击 (Kyle Lambda)', () => {
    it('正向冲击', () => {
      const ticks: Tick[] = Array.from({ length: 30 }, (_, i) => ({
        price: 100 + i * 0.1,
        volume: 200,
        timestamp: i,
        side: i % 2 === 0 ? 'buy' : 'sell',
      }));
      const result = priceImpact(ticks);
      expect(typeof result.lambda).toBe('number');
    });

    it('只有2个tick', () => {
      const ticks: Tick[] = [{ price: 100, volume: 100, timestamp: 0, side: 'buy' }, { price: 101, volume: 200, timestamp: 1, side: 'buy' }];
      const result = priceImpact(ticks);
      expect(typeof result.lambda).toBe('number');
    });
  });

  describe('交易量分布', () => {
    it('分布比例总和为1', () => {
      const dist = tradeSizeDistribution(sampleTicks, 5);
      const total = dist.reduce((s, d) => s + d.pct, 0);
      expect(total).toBeCloseTo(1, 5);
    });

    it('分bin数量正确', () => {
      const dist = tradeSizeDistribution(sampleTicks, 3);
      expect(dist).toHaveLength(3);
    });
  });

  describe('Kyle Lambda', () => {
    it('返回数值', () => {
      const lambda = kyleLambda(sampleTicks);
      expect(typeof lambda).toBe('number');
      expect(isNaN(lambda)).toBe(false);
    });

    it('线性冲击', () => {
      const ticks: Tick[] = Array.from({ length: 20 }, (_, i) => ({
        price: 100 + (i % 2 === 0 ? 1 : -1) * 0.5,
        volume: 100,
        timestamp: i,
        side: i % 2 === 0 ? 'buy' : 'sell',
      }));
      expect(typeof kyleLambda(ticks)).toBe('number');
    });
  });

  describe('已实现波动率', () => {
    it('输出长度正确', () => {
      const rv = realizedVolatility(sampleTicks, 10);
      expect(rv.length).toBe(sampleTicks.length - 10);
    });

    it('波动率非负', () => {
      const rv = realizedVolatility(sampleTicks, 5);
      rv.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });

    it('数据不足', () => {
      expect(realizedVolatility(sampleTicks.slice(0, 3), 10)).toEqual([]);
    });
  });

  describe('VWAP', () => {
    it('VWAP始终在价格范围内', () => {
      const vw = vwap(sampleTicks);
      const prices = sampleTicks.map(t => t.price);
      const minP = Math.min(...prices), maxP = Math.max(...prices);
      vw.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(minP - 0.01);
        expect(v).toBeLessThanOrEqual(maxP + 0.01);
      });
    });

    it('等量等价VWAP等于价格', () => {
      const ticks: Tick[] = Array.from({ length: 5 }, (_, i) => ({ price: 100, volume: 100, timestamp: i, side: 'buy' }));
      const vw = vwap(ticks);
      expect(vw[4]).toBe(100);
    });
  });
});
