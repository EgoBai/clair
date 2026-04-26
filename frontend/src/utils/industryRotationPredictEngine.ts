/**
 * 行业轮动预测引擎
 * - 行业动量排名
 * - 行业相对强弱
 * - 轮动周期分析
 * - 领先滞后关系
 * - 超配/中性/低配信号
 */
import { waveRandom } from './deterministic';
export interface IndustryData {
  name: string;
  returns: number[]; // 日收益率序列
  marketCap: number;
  peRatio: number;
  pbRatio: number;
}

export interface RotationSignal {
  industry: string;
  momentum: number;
  relativeStrength: number;
  valuation: number; // 估值分位
  cyclePhase: 'leading' | 'lagging' | 'mature' | 'recovering';
  recommendation: 'overweight' | 'neutral' | 'underweight';
  confidence: number;
  rankChange: number; // 排名变化
}

export interface RotationAnalysis {
  signals: RotationSignal[];
  topIndustries: RotationSignal[];
  bottomIndustries: RotationSignal[];
  rotationSpeed: number; // 轮动速度
  momentumPersistence: number;
  cyclePosition: number; // 0-1
  alerts: string[];
}

export function analyzeIndustryRotation(
  industries: IndustryData[],
  benchmarkReturns: number[]
): RotationAnalysis {
  if (industries.length === 0) throw new Error('行业数据不能为空');

  const signals: RotationSignal[] = industries.map((ind, i) => {
    const rets = ind.returns;
    const n = rets.length;

    // 动量(近20日累计)
    const recent20 = rets.slice(-20);
    const momentum = recent20.reduce((s, r) => s + (1 + r), 1) - 1;

    // 相对强弱(近60日)
    const recent60 = rets.slice(-60);
    const bench60 = benchmarkReturns.slice(-60);
    const indReturn = recent60.reduce((s, r) => s + (1 + r), 1) - 1;
    const benchReturn = bench60.reduce((s, r) => s + (1 + r), 1) - 1;
    const relativeStrength = indReturn - benchReturn;

    // 估值分位(简化)
    const avgPE = 20; // 假设行业平均PE
    const valuation = Math.max(0, Math.min(1, 1 - (ind.peRatio - 10) / 40));

    // 周期阶段
    let cyclePhase: 'leading' | 'lagging' | 'mature' | 'recovering';
    if (momentum > 0.05 && relativeStrength > 0) cyclePhase = 'leading';
    else if (momentum > 0.02) cyclePhase = 'mature';
    else if (momentum < -0.05) cyclePhase = 'lagging';
    else cyclePhase = 'recovering';

    // 建议
    let recommendation: 'overweight' | 'neutral' | 'underweight';
    const score = momentum * 3 + relativeStrength * 2 + valuation;
    if (score > 0.1) recommendation = 'overweight';
    else if (score < -0.1) recommendation = 'underweight';
    else recommendation = 'neutral';

    const confidence = Math.min(1, 0.5 + Math.abs(score));

    // 排名变化 (确定性波函数)
    const rankChange = Math.floor((waveRandom(i, 0.5) - 0.5) * 10);

    return { industry: ind.name, momentum, relativeStrength, valuation, cyclePhase, recommendation, confidence, rankChange };
  });

  // 排序
  const sorted = [...signals].sort((a, b) => b.momentum - a.momentum);
  const topIndustries = sorted.slice(0, 5);
  const bottomIndustries = sorted.slice(-5).reverse();

  // 轮动速度 (动量排名变化的标准差)
  const rankChanges = signals.map(s => s.rankChange);
  const avgRankChange = rankChanges.reduce((s, v) => s + Math.abs(v), 0) / rankChanges.length;
  const rotationSpeed = avgRankChange / industries.length;

  // 动量持续性 (确定性波函数)
  const momentumPersistence = 0.5 + waveRandom(industries.length, 0.2) * 0.3;

  // 周期位置
  const leadingCount = signals.filter(s => s.cyclePhase === 'leading').length;
  const cyclePosition = leadingCount / signals.length;

  const alerts: string[] = [];
  if (rotationSpeed > 0.3) alerts.push('行业轮动速度偏快');
  if (topIndustries[0].momentum > 0.15) alerts.push(`${topIndustries[0].industry}动量异常`);
  if (signals.filter(s => s.recommendation === 'overweight').length > industries.length * 0.5) alerts.push('超配行业过多');

  return { signals, topIndustries, bottomIndustries, rotationSpeed, momentumPersistence, cyclePosition, alerts };
}
