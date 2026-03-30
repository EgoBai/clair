/**
 * 板块轮动信号引擎
 * 行业轮动检测、板块动量分析、风格切换信号
 */

export interface SectorPerformance {
  sector: string;
  dayReturn: number;
  weekReturn: number;
  monthReturn: number;
  quarterReturn: number;
  yearReturn: number;
  volume: number;
  turnoverRate: number;
  advanceDeclineRatio: number; // 涨跌比
  momentum: number;
}

export interface RotationSignal {
  type: 'rotate_in' | 'rotate_out' | 'hold' | 'watch';
  fromSector: string;
  toSector: string;
  strength: number; // 0-100
  reason: string;
  phase: 'early' | 'mid' | 'late';
}

export interface SectorMomentum {
  sector: string;
  momentum1w: number;
  momentum1m: number;
  momentum3m: number;
  compositeMomentum: number;
  rank: number;
  trend: 'rising' | 'falling' | 'sideways';
  acceleration: number;
}

export interface StyleRotation {
  style: 'growth' | 'value' | 'momentum' | 'quality';
  favorability: number; // 0-100
  trend: 'improving' | 'deteriorating' | 'stable';
  signal: string;
}

/**
 * 板块动量计算
 */
export function calculateSectorMomentum(sectors: SectorPerformance[]): SectorMomentum[] {
  const results = sectors.map((s) => {
    const m1w = s.weekReturn;
    const m1m = s.monthReturn;
    const m3m = s.quarterReturn;

    // 加权复合动量 (近期权重更高)
    const composite = m1w * 0.5 + m1m * 0.3 + m3m * 0.2;

    // 加速度 = 近期收益 - 远期收益
    const acceleration = m1w - m1m / 4;

    let trend: 'rising' | 'falling' | 'sideways';
    if (composite > 2) trend = 'rising';
    else if (composite < -2) trend = 'falling';
    else trend = 'sideways';

    return {
      sector: s.sector,
      momentum1w: Math.round(m1w * 100) / 100,
      momentum1m: Math.round(m1m * 100) / 100,
      momentum3m: Math.round(m3m * 100) / 100,
      compositeMomentum: Math.round(composite * 100) / 100,
      rank: 0,
      trend,
      acceleration: Math.round(acceleration * 100) / 100,
    };
  });

  // 排名
  results.sort((a, b) => b.compositeMomentum - a.compositeMomentum);
  results.forEach((r, i) => (r.rank = i + 1));

  return results;
}

/**
 * 检测轮动信号
 */
export function detectRotationSignals(
  sectors: SectorPerformance[],
  previousSectors: SectorPerformance[]
): RotationSignal[] {
  const signals: RotationSignal[] = [];

  const prevMap = new Map(previousSectors.map((s) => [s.sector, s]));

  // 寻找强势承接板块
  const momentumRanking = calculateSectorMomentum(sectors);
  const rising = momentumRanking.filter((s) => s.trend === 'rising');
  const falling = momentumRanking.filter((s) => s.trend === 'falling');

  // 板块切换: 从弱势板块切换到强势板块
  for (const weak of falling.slice(0, 3)) {
    for (const strong of rising.slice(0, 3)) {
      const prevStrong = prevMap.get(strong.sector);
      const prevWeak = prevMap.get(weak.sector);

      if (prevStrong && prevWeak) {
        const strongImprovement = strong.compositeMomentum - prevStrong.monthReturn / 4;
        const weakDeterioration = weak.compositeMomentum - prevWeak.monthReturn / 4;

        if (strongImprovement > 0 && weakDeterioration < 0) {
          let phase: 'early' | 'mid' | 'late';
          if (strong.momentum1w > strong.momentum1m) phase = 'early';
          else if (strong.compositeMomentum > 5) phase = 'mid';
          else phase = 'late';

          signals.push({
            type: 'rotate_in',
            fromSector: weak.sector,
            toSector: strong.sector,
            strength: Math.min(100, Math.round(Math.abs(strongImprovement - weakDeterioration) * 10)),
            reason: `${strong.sector}动量增强(${strong.compositeMomentum.toFixed(1)}%)，${weak.sector}动量减弱(${weak.compositeMomentum.toFixed(1)}%)`,
            phase,
          });
        }
      }
    }
  }

  // 成交量异动信号
  for (const sector of sectors) {
    const prev = prevMap.get(sector.sector);
    if (prev && sector.volume > prev.volume * 1.5) {
      signals.push({
        type: 'watch',
        fromSector: '',
        toSector: sector.sector,
        strength: Math.min(100, Math.round((sector.volume / prev.volume - 1) * 50)),
        reason: `${sector.sector}成交量放大${(sector.volume / prev.volume).toFixed(1)}倍，关注资金动向`,
        phase: 'early',
      });
    }
  }

  // 涨跌比异动
  for (const sector of sectors) {
    if (sector.advanceDeclineRatio > 3 && sector.dayReturn > 1) {
      signals.push({
        type: 'rotate_in',
        fromSector: '',
        toSector: sector.sector,
        strength: Math.min(85, 50 + sector.advanceDeclineRatio * 10),
        reason: `${sector.sector}涨跌比${sector.advanceDeclineRatio.toFixed(1)}，全面走强`,
        phase: 'mid',
      });
    }
  }

  return signals.sort((a, b) => b.strength - a.strength);
}

/**
 * 风格轮动分析
 */
export function analyzeStyleRotation(sectors: SectorPerformance[]): StyleRotation[] {
  // 按板块特征分组 (简化：用收益表现推断)
  const growthSectors = sectors.filter(
    (s) => s.sector.includes('科技') || s.sector.includes('半导体') || s.sector.includes('新能源') || s.sector.includes('AI')
  );
  const valueSectors = sectors.filter(
    (s) => s.sector.includes('银行') || s.sector.includes('地产') || s.sector.includes('煤炭') || s.sector.includes('钢铁')
  );

  const avgGrowth = growthSectors.length > 0
    ? growthSectors.reduce((s, g) => s + g.monthReturn, 0) / growthSectors.length
    : 0;
  const avgValue = valueSectors.length > 0
    ? valueSectors.reduce((s, v) => s + v.monthReturn, 0) / valueSectors.length
    : 0;

  const styles: StyleRotation[] = [
    {
      style: 'growth',
      favorability: Math.min(100, Math.max(0, 50 + avgGrowth * 5)),
      trend: avgGrowth > avgValue ? 'improving' : avgGrowth < avgValue - 2 ? 'deteriorating' : 'stable',
      signal: avgGrowth > avgValue
        ? '成长风格占优，关注高景气赛道'
        : '成长风格承压，等待风格切换',
    },
    {
      style: 'value',
      favorability: Math.min(100, Math.max(0, 50 + avgValue * 5)),
      trend: avgValue > avgGrowth ? 'improving' : avgValue < avgGrowth - 2 ? 'deteriorating' : 'stable',
      signal: avgValue > avgGrowth
        ? '价值风格占优，低估值板块受关注'
        : '价值风格偏弱，等待估值修复',
    },
    {
      style: 'momentum',
      favorability: Math.min(
        100,
        Math.max(
          0,
          50 + sectors.filter((s) => s.momentum > 0).length / Math.max(1, sectors.length) * 50
        )
      ),
      trend: 'stable',
      signal: '动量策略持续跟踪强势板块',
    },
    {
      style: 'quality',
      favorability: Math.min(100, Math.max(0, 50 + sectors.filter((s) => s.turnoverRate < 3).reduce((sum, s) => sum + s.monthReturn, 0) / 3)),
      trend: 'stable',
      signal: '质量因子持续筛选低换手优质标的',
    },
  ];

  return styles;
}

/**
 * 行业配置建议
 */
export interface AllocationAdvice {
  sector: string;
  recommendation: 'overweight' | 'neutral' | 'underweight';
  confidence: number;
  reasoning: string;
}

export function generateAllocationAdvice(
  momentum: SectorMomentum[],
  signals: RotationSignal[]
): AllocationAdvice[] {
  const signalSectors = new Set(signals.filter((s) => s.type === 'rotate_in').map((s) => s.toSector));

  return momentum.map((m) => {
    let recommendation: 'overweight' | 'neutral' | 'underweight';
    let confidence: number;
    let reasoning: string;

    if (m.trend === 'rising' && m.acceleration > 0) {
      recommendation = 'overweight';
      confidence = Math.min(90, 50 + m.compositeMomentum * 3);
      reasoning = `${m.sector}动量强劲，趋势向上加速`;
    } else if (m.trend === 'falling' && m.acceleration < 0) {
      recommendation = 'underweight';
      confidence = Math.min(90, 50 + Math.abs(m.compositeMomentum) * 3);
      reasoning = `${m.sector}动量减弱，趋势向下加速`;
    } else {
      recommendation = 'neutral';
      confidence = 50;
      reasoning = `${m.sector}走势平稳，维持标配`;
    }

    if (signalSectors.has(m.sector) && recommendation !== 'overweight') {
      confidence = Math.min(confidence + 10, 95);
      reasoning += '，获轮动信号支撑';
    }

    return { sector: m.sector, recommendation, confidence: Math.round(confidence), reasoning };
  });
}
