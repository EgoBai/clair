/**
 * 宏观经济Nowcasting引擎
 * - 高频数据综合
 * - GDP Nowcasting
 * - 通胀预测
 * - 货币政策预期
 * - 经济周期定位
 */
export interface MacroIndicator {
  name: string;
  category: 'production' | 'consumption' | 'investment' | 'trade' | 'monetary' | 'fiscal';
  value: number;
  priorValue: number;
  consensus?: number;
  weight: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  date: string;
}

export interface NowcastResult {
  gdpNowcast: number;
  gdpConfidence: number;
  inflationNowcast: number;
  cpiTrend: 'rising' | 'falling' | 'stable';
  monetaryPolicyProb: {
    ease: number;
    hold: number;
    tighten: number;
  };
  economicCycle: 'expansion' | 'peak' | 'contraction' | 'trough';
  cyclePosition: number; // 0-1 (0=trough, 1=peak)
  leadingIndicators: Array<{ name: string; signal: 'positive' | 'negative' | 'neutral'; momentum: number }>;
  compositeScore: number; // -100 to 100
  alerts: string[];
}

export function nowcastMacro(indicators: MacroIndicator[]): NowcastResult {
  if (indicators.length === 0) throw new Error('宏观指标不能为空');

  // GDP Nowcasting (加权惊喜指数)
  let gdpSum = 0, totalWeight = 0;
  for (const ind of indicators) {
    const surprise = ind.consensus !== undefined
      ? (ind.value - ind.consensus) / Math.max(Math.abs(ind.consensus), 1)
      : (ind.value - ind.priorValue) / Math.max(Math.abs(ind.priorValue), 1);
    gdpSum += surprise * ind.weight;
    totalWeight += ind.weight;
  }
  const gdpNowcast = totalWeight > 0 ? 5.0 + gdpSum / totalWeight * 2 : 5.0; // 基准5%
  const gdpConfidence = Math.min(0.95, 0.5 + indicators.length * 0.05);

  // 通胀预测
  const inflationInds = indicators.filter(i =>
    ['consumption', 'trade', 'monetary'].includes(i.category)
  );
  let inflationSum = 0;
  for (const ind of inflationInds) {
    inflationSum += (ind.value - ind.priorValue) / Math.max(Math.abs(ind.priorValue), 1) * ind.weight;
  }
  const inflationNowcast = 2.5 + inflationSum * 2;
  const cpiTrend = inflationNowcast > 3 ? 'rising' : inflationNowcast < 2 ? 'falling' : 'stable';

  // 货币政策预期
  const monetaryInds = indicators.filter(i => i.category === 'monetary');
  let monetaryScore = 0;
  for (const ind of monetaryInds) {
    monetaryScore += (ind.value - ind.priorValue) * ind.weight;
  }
  const ease = Math.max(0, Math.min(1, 0.5 - monetaryScore * 2));
  const tighten = Math.max(0, Math.min(1, 0.5 + monetaryScore * 2));
  const hold = 1 - ease - tighten;

  // 经济周期
  const productionScore = indicators.filter(i => i.category === 'production')
    .reduce((s, i) => s + (i.value - i.priorValue) / Math.max(Math.abs(i.priorValue), 1) * i.weight, 0);
  const consumptionScore = indicators.filter(i => i.category === 'consumption')
    .reduce((s, i) => s + (i.value - i.priorValue) / Math.max(Math.abs(i.priorValue), 1) * i.weight, 0);
  const cycleScore = (productionScore + consumptionScore) / 2;

  let economicCycle: 'expansion' | 'peak' | 'contraction' | 'trough';
  if (cycleScore > 0.02) economicCycle = 'expansion';
  else if (cycleScore > 0 && gdpNowcast > 5) economicCycle = 'peak';
  else if (cycleScore < -0.02) economicCycle = 'contraction';
  else economicCycle = 'trough';

  const cyclePosition = Math.max(0, Math.min(1, 0.5 + cycleScore * 10));

  // 先行指标
  const leadingIndicators = indicators.filter(i =>
    ['production', 'investment'].includes(i.category)
  ).map(i => {
    const momentum = (i.value - i.priorValue) / Math.max(Math.abs(i.priorValue), 1);
    return {
      name: i.name,
      signal: momentum > 0.02 ? 'positive' as const : momentum < -0.02 ? 'negative' as const : 'neutral' as const,
      momentum,
    };
  });

  // 综合分数
  const compositeScore = Math.max(-100, Math.min(100,
    (gdpNowcast - 5) * 10 + (inflationNowcast - 2.5) * -5 + cycleScore * 100
  ));

  const alerts: string[] = [];
  if (gdpNowcast < 3) alerts.push('GDP增速预测偏低');
  if (inflationNowcast > 4) alerts.push('通胀压力上升');
  if (cpiTrend === 'rising' && ease < 0.3) alerts.push('滞胀风险');
  if (economicCycle === 'contraction') alerts.push('经济进入收缩期');

  return {
    gdpNowcast, gdpConfidence, inflationNowcast, cpiTrend,
    monetaryPolicyProb: { ease, hold, tighten },
    economicCycle, cyclePosition, leadingIndicators, compositeScore, alerts,
  };
}
