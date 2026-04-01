import { describe, it, expect } from 'vitest';

// 行业景气轮动预测引擎
interface IndustryCycle {
  industry: string;
  phase: 'recovery' | 'expansion' | 'peak' | 'contraction';
  duration: number; // months in current phase
  avgCycleLength: number;
  pmi: number;
  pmiTrend: number;
  inventoryCycle: number;
  capexGrowth: number;
}

interface CyclePrediction {
  industry: string;
  currentPhase: string;
  predictedNextPhase: string;
  monthsToTransition: number;
  confidence: number;
  leadingSignals: string[];
}

function predictNextPhase(cycle: IndustryCycle): CyclePrediction {
  let predictedNextPhase: string;
  let monthsToTransition: number;
  const confidence: number[] = [];
  const leadingSignals: string[] = [];

  switch (cycle.phase) {
    case 'recovery':
      predictedNextPhase = 'expansion';
      monthsToTransition = Math.max(1, cycle.avgCycleLength * 0.3 - cycle.duration);
      if (cycle.pmi > 50) confidence.push(0.3);
      if (cycle.pmiTrend > 0) { confidence.push(0.2); leadingSignals.push('PMI回升'); }
      if (cycle.capexGrowth > 0) { confidence.push(0.2); leadingSignals.push('资本开支回升'); }
      if (cycle.inventoryCycle < 0) { confidence.push(0.15); leadingSignals.push('去库存尾声'); }
      break;
    case 'expansion':
      predictedNextPhase = 'peak';
      monthsToTransition = Math.max(1, cycle.avgCycleLength * 0.4 - cycle.duration);
      if (cycle.pmi > 52) confidence.push(0.2);
      if (cycle.pmiTrend < 0) { confidence.push(0.3); leadingSignals.push('PMI见顶'); }
      if (cycle.inventoryCycle > 0.5) { confidence.push(0.2); leadingSignals.push('库存累积'); }
      if (cycle.capexGrowth > 20) { confidence.push(0.15); leadingSignals.push('过度投资'); }
      break;
    case 'peak':
      predictedNextPhase = 'contraction';
      monthsToTransition = Math.max(1, cycle.avgCycleLength * 0.15 - cycle.duration);
      if (cycle.pmi < 51) confidence.push(0.3);
      if (cycle.pmiTrend < 0) confidence.push(0.25);
      if (cycle.inventoryCycle > 0.3) { confidence.push(0.2); leadingSignals.push('库存高企'); }
      leadingSignals.push('周期见顶');
      break;
    case 'contraction':
      predictedNextPhase = 'recovery';
      monthsToTransition = Math.max(1, cycle.avgCycleLength * 0.35 - cycle.duration);
      if (cycle.pmi < 48) confidence.push(0.2);
      if (cycle.pmiTrend > 0) { confidence.push(0.3); leadingSignals.push('PMI企稳'); }
      if (cycle.inventoryCycle < -0.2) { confidence.push(0.25); leadingSignals.push('去库存'); }
      if (cycle.capexGrowth < 0) { confidence.push(0.1); leadingSignals.push('投资见底'); }
      break;
    default:
      predictedNextPhase = 'recovery';
      monthsToTransition = 6;
  }

  return {
    industry: cycle.industry,
    currentPhase: cycle.phase,
    predictedNextPhase,
    monthsToTransition: Math.max(1, Math.round(monthsToTransition)),
    confidence: Math.min(1, confidence.reduce((s, c) => s + c, 0)),
    leadingSignals,
  };
}

function rankByCyclePosition(cycles: IndustryCycle[]): { industry: string; advantage: number }[] {
  return cycles.map(c => {
    let advantage = 0;
    if (c.phase === 'recovery') advantage = 3;
    else if (c.phase === 'expansion' && c.duration < c.avgCycleLength * 0.5) advantage = 2;
    else if (c.phase === 'expansion') advantage = 1;
    else if (c.phase === 'contraction' && c.duration > c.avgCycleLength * 0.5) advantage = 0.5;
    else advantage = -1;
    return { industry: c.industry, advantage };
  }).sort((a, b) => b.advantage - a.advantage);
}

describe('行业景气轮动预测引擎', () => {
  const cycles: IndustryCycle[] = [
    { industry: '半导体', phase: 'recovery', duration: 3, avgCycleLength: 36, pmi: 51, pmiTrend: 1, inventoryCycle: -0.3, capexGrowth: 5 },
    { industry: '消费', phase: 'expansion', duration: 12, avgCycleLength: 30, pmi: 53, pmiTrend: 0.5, inventoryCycle: 0.1, capexGrowth: 10 },
    { industry: '地产', phase: 'contraction', duration: 18, avgCycleLength: 48, pmi: 45, pmiTrend: -0.5, inventoryCycle: -0.1, capexGrowth: -15 },
    { industry: '新能源', phase: 'expansion', duration: 8, avgCycleLength: 24, pmi: 55, pmiTrend: -0.3, inventoryCycle: 0.6, capexGrowth: 25 },
  ];

  it('应预测下一阶段', () => {
    cycles.forEach(c => {
      const pred = predictNextPhase(c);
      expect(pred.predictedNextPhase).toBeTruthy();
      expect(pred.monthsToTransition).toBeGreaterThan(0);
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('复苏阶段应预测扩张', () => {
    const pred = predictNextPhase(cycles[0]);
    expect(pred.predictedNextPhase).toBe('expansion');
  });

  it('扩张阶段应预测见顶', () => {
    const pred = predictNextPhase(cycles[1]);
    expect(pred.predictedNextPhase).toBe('peak');
  });

  it('收缩阶段应预测复苏', () => {
    const pred = predictNextPhase(cycles[2]);
    expect(pred.predictedNextPhase).toBe('recovery');
  });

  it('应有领先信号', () => {
    const pred = predictNextPhase(cycles[0]);
    expect(pred.leadingSignals.length).toBeGreaterThan(0);
  });

  it('应按周期位置排名', () => {
    const ranked = rankByCyclePosition(cycles);
    expect(ranked.length).toBe(cycles.length);
    // 半导体复苏应排第一
    expect(ranked[0].industry).toBe('半导体');
  });

  it('领先信号应包含PMI趋势', () => {
    const pred = predictNextPhase(cycles[0]);
    expect(pred.leadingSignals.some(s => s.includes('PMI'))).toBe(true);
  });

  it('过度投资应触发信号', () => {
    const pred = predictNextPhase(cycles[3]);
    expect(pred.leadingSignals.some(s => s.includes('投资'))).toBe(true);
  });

  it('置信度应在0-1之间', () => {
    cycles.forEach(c => {
      const pred = predictNextPhase(c);
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('转换月数应为正', () => {
    cycles.forEach(c => {
      const pred = predictNextPhase(c);
      expect(pred.monthsToTransition).toBeGreaterThan(0);
    });
  });
});
