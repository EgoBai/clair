/**
 * 大宗商品价差引擎
 * 分析期货价差、基差、跨品种套利
 */

export interface CommodityPrice {
  commodity: string;
  contract: string; // 合约代码
  price: number;
  date: string;
  deliveryMonth: string; // 交割月
  volume: number;
  openInterest: number;
}

export interface SpreadAnalysis {
  commodity: string;
  spreadType: 'calendar' | 'intercommodity' | 'crack' | 'crush';
  nearPrice: number;
  farPrice: number;
  spread: number;
  spreadPercent: number;
  historicalAvg: number;
  zScore: number;
  signal: 'buy_spread' | 'sell_spread' | 'neutral';
  contango: boolean;
}

export interface BasisAnalysis {
  commodity: string;
  spotPrice: number;
  futuresPrice: number;
  basis: number;
  basisPercent: number;
  daysToDelivery: number;
  annualizedBasis: number;
  convergenceSignal: 'backwardation' | 'contango' | 'normal';
}

export class CommoditySpreadEngine {
  /**
   * 分析跨期价差
   */
  analyzeCalendarSpread(
    nearContract: CommodityPrice,
    farContract: CommodityPrice,
    historicalAvg: number = 0
  ): SpreadAnalysis {
    const spread = farContract.price - nearContract.price;
    const midPrice = (nearContract.price + farContract.price) / 2;
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    const zScore = historicalAvg !== 0 
      ? (spread - historicalAvg) / Math.abs(historicalAvg) 
      : 0;

    let signal: SpreadAnalysis['signal'] = 'neutral';
    if (zScore > 1.5) signal = 'sell_spread'; // 价差过大，做空远月
    else if (zScore < -1.5) signal = 'buy_spread'; // 价差过小，做多远月

    return {
      commodity: nearContract.commodity,
      spreadType: 'calendar',
      nearPrice: nearContract.price,
      farPrice: farContract.price,
      spread,
      spreadPercent,
      historicalAvg,
      zScore,
      signal,
      contango: spread > 0
    };
  }

  /**
   * 跨品种价差
   */
  analyzeIntercommoditySpread(
    commodity1: CommodityPrice,
    commodity2: CommodityPrice,
    ratio: number = 1 // 配比
  ): SpreadAnalysis {
    const adjustedPrice2 = commodity2.price * ratio;
    const spread = commodity1.price - adjustedPrice2;
    const midPrice = (commodity1.price + adjustedPrice2) / 2;
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    return {
      commodity: `${commodity1.commodity}/${commodity2.commodity}`,
      spreadType: 'intercommodity',
      nearPrice: commodity1.price,
      farPrice: adjustedPrice2,
      spread,
      spreadPercent,
      historicalAvg: 0,
      zScore: 0,
      signal: 'neutral',
      contango: spread > 0
    };
  }

  /**
   * 基差分析
   */
  analyzeBasis(
    spotPrice: number,
    futuresPrice: number,
    deliveryDate: string,
    currentDate: string = new Date().toISOString().split('T')[0]
  ): BasisAnalysis {
    const basis = spotPrice - futuresPrice;
    const basisPercent = futuresPrice > 0 ? (basis / futuresPrice) * 100 : 0;

    const daysToDelivery = Math.max(0, 
      Math.round((new Date(deliveryDate).getTime() - new Date(currentDate).getTime()) / (1000 * 60 * 60 * 24))
    );
    
    const annualizedBasis = daysToDelivery > 0 
      ? (basisPercent / daysToDelivery) * 365 
      : 0;

    let convergenceSignal: BasisAnalysis['convergenceSignal'] = 'normal';
    if (basis > 0 && basisPercent > 2) convergenceSignal = 'backwardation';
    else if (basis < 0 && basisPercent < -2) convergenceSignal = 'contango';

    return {
      commodity: '',
      spotPrice,
      futuresPrice,
      basis,
      basisPercent,
      daysToDelivery,
      annualizedBasis,
      convergenceSignal
    };
  }

  /**
   * 裂解价差 (原油→成品油)
   */
  analyzeCrackSpread(
    crudeOilPrice: number,
    gasolinePrice: number,
    dieselPrice: number,
    ratio: number = 3 // 3:2:1 比例
  ): {
    crackSpread: number;
    crackMargin: number;
    signal: 'refine_more' | 'refine_less' | 'neutral';
    profitability: number;
  } {
    // 裂解价差 = 成品油收入 - 原油成本
    const productRevenue = (gasolinePrice * 2 + dieselPrice) / 3;
    const crudeCost = crudeOilPrice;
    const crackSpread = productRevenue - crudeCost;
    const crackMargin = crudeCost > 0 ? (crackSpread / crudeCost) * 100 : 0;

    let signal: 'refine_more' | 'refine_less' | 'neutral' = 'neutral';
    if (crackMargin > 15) signal = 'refine_more';
    else if (crackMargin < 5) signal = 'refine_less';

    const profitability = Math.max(0, Math.min(100, crackMargin * 5));

    return { crackSpread, crackMargin, signal, profitability };
  }

  /**
   * 压榨价差 (大豆→豆粕+豆油)
   */
  analyzeCrushSpread(
    soybeanPrice: number,
    mealPrice: number,
    oilPrice: number,
    crushRatio: number = 0.8 // 出粕率
  ): {
    crushSpread: number;
    crushMargin: number;
    signal: 'crush_more' | 'crush_less' | 'neutral';
  } {
    // 压榨利润 = 豆粕价格 × 出粕率 + 豆油价格 × 出油率 - 大豆价格
    const productValue = mealPrice * crushRatio + oilPrice * 0.18;
    const crushSpread = productValue - soybeanPrice;
    const crushMargin = soybeanPrice > 0 ? (crushSpread / soybeanPrice) * 100 : 0;

    let signal: 'crush_more' | 'crush_less' | 'neutral' = 'neutral';
    if (crushMargin > 10) signal = 'crush_more';
    else if (crushMargin < -5) signal = 'crush_less';

    return { crushSpread, crushMargin, signal };
  }

  /**
   * 库存-价差关系
   */
  analyzeInventorySpreadRelation(
    inventory: { date: string; level: number }[],
    spreads: { date: string; spread: number }[]
  ): {
    correlation: number;
    elasticity: number; // 库存变动对价差的弹性
    signal: string;
  } {
    const invMap = new Map(inventory.map(i => [i.date, i.level]));
    const matched: { inv: number; spread: number }[] = [];

    for (const s of spreads) {
      const inv = invMap.get(s.date);
      if (inv !== undefined) matched.push({ inv, spread: s.spread });
    }

    if (matched.length < 2) return { correlation: 0, elasticity: 0, signal: '数据不足' };

    const n = matched.length;
    const avgInv = matched.reduce((s, m) => s + m.inv, 0) / n;
    const avgSpread = matched.reduce((s, m) => s + m.spread, 0) / n;

    const cov = matched.reduce((s, m) => s + (m.inv - avgInv) * (m.spread - avgSpread), 0) / n;
    const stdInv = Math.sqrt(matched.reduce((s, m) => s + Math.pow(m.inv - avgInv, 2), 0) / n);
    const stdSpread = Math.sqrt(matched.reduce((s, m) => s + Math.pow(m.spread - avgSpread, 2), 0) / n);

    const correlation = stdInv > 0 && stdSpread > 0 ? cov / (stdInv * stdSpread) : 0;
    const elasticity = stdInv > 0 ? cov / (stdInv * stdInv) : 0;

    let signal = '正常';
    if (correlation < -0.5) signal = '库存下降推动价差扩大';
    else if (correlation > 0.5) signal = '库存上升推动价差扩大';

    return { correlation, elasticity, signal };
  }
}
