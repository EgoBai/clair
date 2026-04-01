/**
 * 宏观经济先行指标引擎
 * 分析PMI、社融、M2等宏观先行指标对市场的影响
 */

export interface MacroIndicator {
  name: string;
  category: 'leading' | 'coincident' | 'lagging';
  value: number;
  previousValue: number;
  date: string;
  unit: string;
  weight: number; // 在综合评分中的权重
}

export interface MacroSignal {
  date: string;
  compositeScore: number; // -100到100
  signal: 'expansion' | 'recovery' | 'contraction' | 'stagflation';
  leadingIndex: number;
  coincidentIndex: number;
  laggingIndex: number;
  rateOfChange: number; // 综合变化率
  confidence: number;
}

export interface MacroRegime {
  regime: 'bull' | 'bear' | 'transition';
  duration: number; // 持续月数
  probability: number;
  keyDrivers: string[];
  historicalPattern: string;
}

export interface MacroCorrelation {
  indicator: string;
  marketCorrelation: number; // -1到1
  leadLagMonths: number; // 领先/滞后月数
  predictivePower: number; // 0-100
  stability: number; // 相关性稳定性
}

export class MacroIndicatorEngine {
  /**
   * 计算综合宏观信号
   */
  calculateSignal(indicators: MacroIndicator[]): MacroSignal {
    if (indicators.length === 0) {
      return {
        date: '',
        compositeScore: 0,
        signal: 'recovery',
        leadingIndex: 50,
        coincidentIndex: 50,
        laggingIndex: 50,
        rateOfChange: 0,
        confidence: 0
      };
    }

    // 分类计算
    const leading = indicators.filter(i => i.category === 'leading');
    const coincident = indicators.filter(i => i.category === 'coincident');
    const lagging = indicators.filter(i => i.category === 'lagging');

    const leadingIndex = this.calculateCategoryIndex(leading);
    const coincidentIndex = this.calculateCategoryIndex(coincident);
    const laggingIndex = this.calculateCategoryIndex(lagging);

    // 综合评分
    const totalWeight = indicators.reduce((s, i) => s + i.weight, 0);
    const compositeScore = totalWeight > 0
      ? indicators.reduce((s, i) => {
          const normalized = this.normalizeIndicator(i);
          return s + normalized * i.weight;
        }, 0) / totalWeight
      : 0;

    // 变化率
    const changes = indicators.map(i => 
      i.previousValue !== 0 ? ((i.value - i.previousValue) / Math.abs(i.previousValue)) * 100 : 0
    );
    const rateOfChange = changes.reduce((a, b) => a + b, 0) / changes.length;

    // 信号判断
    let signal: MacroSignal['signal'] = 'recovery';
    if (leadingIndex > 55 && coincidentIndex > 50) signal = 'expansion';
    else if (leadingIndex < 45 && coincidentIndex > 50) signal = 'contraction';
    else if (leadingIndex < 45 && coincidentIndex < 50) signal = 'stagflation';
    else signal = 'recovery';

    const confidence = Math.min(100, indicators.length * 15);

    const latestDate = indicators
      .map(i => i.date)
      .sort()
      .pop() || '';

    return {
      date: latestDate,
      compositeScore,
      signal,
      leadingIndex,
      coincidentIndex,
      laggingIndex,
      rateOfChange,
      confidence
    };
  }

  /**
   * 标准化指标值到0-100
   */
  private normalizeIndicator(indicator: MacroIndicator): number {
    // PMI: 50为荣枯线，映射到0-100
    if (indicator.name.includes('PMI')) {
      return Math.max(0, Math.min(100, (indicator.value - 30) / 20 * 100));
    }
    // M2增速、社融等
    if (indicator.unit === '%') {
      return Math.max(0, Math.min(100, (indicator.value + 5) / 20 * 100));
    }
    // 其他指标
    return Math.max(0, Math.min(100, 50 + indicator.value));
  }

  /**
   * 计算分类指数
   */
  private calculateCategoryIndex(indicators: MacroIndicator[]): number {
    if (indicators.length === 0) return 50;
    const scores = indicators.map(i => this.normalizeIndicator(i));
    const weights = indicators.map(i => i.weight);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    return totalWeight > 0
      ? scores.reduce((s, v, i) => s + v * weights[i], 0) / totalWeight
      : 50;
  }

  /**
   * 识别宏观周期
   */
  identifyRegime(
    signals: MacroSignal[],
    lookback: number = 12
  ): MacroRegime {
    if (signals.length === 0) {
      return { regime: 'transition', duration: 0, probability: 0, keyDrivers: [], historicalPattern: '' };
    }

    const recent = signals.slice(-lookback);
    const expansionCount = recent.filter(s => s.signal === 'expansion').length;
    const contractionCount = recent.filter(s => s.signal === 'contraction').length;
    const total = recent.length;

    let regime: MacroRegime['regime'] = 'transition';
    let probability = 0;

    if (expansionCount / total > 0.6) {
      regime = 'bull';
      probability = expansionCount / total;
    } else if (contractionCount / total > 0.6) {
      regime = 'bear';
      probability = contractionCount / total;
    } else {
      probability = 1 - Math.abs(expansionCount - contractionCount) / total;
    }

    // 持续月数
    let duration = 0;
    const lastSignal = recent[recent.length - 1]?.signal;
    for (let i = recent.length - 1; i >= 0; i--) {
      if (recent[i].signal === lastSignal) duration++;
      else break;
    }

    // 关键驱动因素
    const keyDrivers: string[] = [];
    if (recent[recent.length - 1]?.leadingIndex > 55) keyDrivers.push('领先指标走强');
    if (recent[recent.length - 1]?.rateOfChange > 2) keyDrivers.push('增速加快');
    if (recent[recent.length - 1]?.compositeScore > 20) keyDrivers.push('综合景气度高');

    let historicalPattern = '';
    if (regime === 'bull' && duration > 6) historicalPattern = '牛市中期';
    else if (regime === 'bull' && duration <= 3) historicalPattern = '牛市初期';
    else if (regime === 'bear' && duration > 6) historicalPattern = '熊市中期';
    else if (regime === 'bear' && duration <= 3) historicalPattern = '熊市初期';
    else historicalPattern = '震荡期';

    return { regime, duration, probability, keyDrivers, historicalPattern };
  }

  /**
   * 宏观指标与市场相关性
   */
  calculateCorrelations(
    indicators: MacroIndicator[],
    marketReturns: { date: string; return: number }[]
  ): MacroCorrelation[] {
    return indicators.map(indicator => {
      // 找到匹配的市场收益
      const matched = marketReturns.find(m => m.date === indicator.date);
      if (!matched) {
        return {
          indicator: indicator.name,
          marketCorrelation: 0,
          leadLagMonths: 0,
          predictivePower: 0,
          stability: 0
        };
      }

      // 简化相关性计算
      const indicatorChange = indicator.previousValue !== 0 
        ? (indicator.value - indicator.previousValue) / Math.abs(indicator.previousValue) 
        : 0;
      const marketReturn = matched.return;

      // 符号一致性作为相关性近似
      const correlation = indicatorChange * marketReturn > 0 ? 0.7 : -0.3;

      // 先行指标通常领先1-3个月
      const leadLagMonths = indicator.category === 'leading' ? -2 : 
        indicator.category === 'coincident' ? 0 : 2;

      // 预测力基于指标类型和相关性强度
      const predictivePower = Math.abs(correlation) * 100 * 
        (indicator.category === 'leading' ? 1.2 : indicator.category === 'lagging' ? 0.6 : 0.8);

      return {
        indicator: indicator.name,
        marketCorrelation: Math.max(-1, Math.min(1, correlation)),
        leadLagMonths,
        predictivePower: Math.min(100, predictivePower),
        stability: 70 // 假设值
      };
    });
  }

  /**
   * PMI扩散分析
   */
  analyzePMIDiffusion(
    pmi: { name: string; value: number; weight: number }[]
  ): {
    compositePMI: number;
    newOrdersMinusInventories: number;
    breadth: number; // 扩张分项占比
    momentum: number;
    signal: 'expansion' | 'neutral' | 'contraction';
  } {
    const compositePMI = pmi.reduce((s, p) => s + p.value * p.weight, 0) / 
      Math.max(1, pmi.reduce((s, p) => s + p.weight, 0));

    const newOrders = pmi.find(p => p.name.includes('新订单'));
    const inventories = pmi.find(p => p.name.includes('库存'));
    const newOrdersMinusInventories = (newOrders?.value || 50) - (inventories?.value || 50);

    const expanding = pmi.filter(p => p.value > 50).length;
    const breadth = pmi.length > 0 ? expanding / pmi.length : 0;

    const changes = pmi.map(p => p.value - 50);
    const momentum = changes.reduce((a, b) => a + b, 0) / changes.length;

    let signal: 'expansion' | 'neutral' | 'contraction' = 'neutral';
    if (compositePMI > 52 && breadth > 0.6) signal = 'expansion';
    else if (compositePMI < 48 || breadth < 0.4) signal = 'contraction';

    return { compositePMI, newOrdersMinusInventories, breadth, momentum, signal };
  }
}
