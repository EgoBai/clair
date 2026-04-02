/**
 * OrderFlowToxicityEngine - 订单流毒性引擎
 * VPIN、订单不平衡等微观结构指标
 */

export interface Trade { price: number; volume: number; timestamp: number; }

export function classifyTrade(trade: Trade, prevPrice: number): 'BUY' | 'SELL' {
  return trade.price >= prevPrice ? 'BUY' : 'SELL';
}

export function orderImbalance(trades: Trade[]): number {
  if (trades.length < 2) return 0;
  let buyVol = 0, sellVol = 0;
  for (let i = 1; i < trades.length; i++) {
    const side = classifyTrade(trades[i], trades[i - 1].price);
    if (side === 'BUY') buyVol += trades[i].volume;
    else sellVol += trades[i].volume;
  }
  const total = buyVol + sellVol;
  return total === 0 ? 0 : (buyVol - sellVol) / total;
}

export function calcVPIN(trades: Trade[], bucketSize: number): number[] {
  if (trades.length < 2) return [];
  const vpin: number[] = [];
  let buyVol = 0, sellVol = 0;
  for (let i = 1; i < trades.length; i++) {
    const side = classifyTrade(trades[i], trades[i - 1].price);
    if (side === 'BUY') buyVol += trades[i].volume;
    else sellVol += trades[i].volume;
    const total = buyVol + sellVol;
    if (total >= bucketSize) {
      vpin.push(Math.abs(buyVol - sellVol) / total);
      buyVol = 0; sellVol = 0;
    }
  }
  return vpin;
}

export function tradeIntensity(trades: Trade[], windowMs: number): number[] {
  if (trades.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i < trades.length; i++) {
    let count = 0;
    for (let j = i; j >= 0; j--) {
      if (trades[i].timestamp - trades[j].timestamp <= windowMs) count++;
      else break;
    }
    result.push(count);
  }
  return result;
}
