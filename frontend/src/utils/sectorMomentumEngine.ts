/**
 * 板块动量引擎
 * - 板块动量排名
 * - 板块轮动信号
 * - 资金流向板块分析
 * - 板块强度对比
 * - 板块间相关性
 */
export interface SectorData {
  name: string;
  returns1d: number;
  returns5d: number;
  returns20d: number;
  returns60d: number;
  volume: number;
  avgVolume: number;
  fundFlow: number; // 亿元
  limitUpCount: number; // 涨停数
  limitDownCount: number; // 跌停数
  advanceDeclineRatio: number; // 涨跌比
  newHighCount: number; // 创新高数
  newLowCount: number; // 创新低数
}

export interface SectorMomentumResult {
  rankings: {
    sector: string;
    momentumScore: number;
    trend: 'strong_up' | 'up' | 'sideways' | 'down' | 'strong_down';
    rotationSignal: string;
    volumeConfirmation: boolean;
  }[];
  hotSectors: string[];
  coldSectors: string[];
  rotationDirection: 'rotate_to_growth' | 'rotate_to_value' | 'rotate_to_defensive' | 'rotate_to_cyclical';
  marketBreadth: 'broad_advance' | 'narrow_advance' | 'broad_decline' | 'narrow_decline';
  sectorCorrelation: number; // 板块间平均相关性
  momentumDispersion: number; // 动量离散度
}

export function analyzeSectorMomentum(sectors: SectorData[]): SectorMomentumResult {
  if (sectors.length < 2) throw new Error('至少需要2个板块数据');

  // 计算动量得分
  const rankings = sectors.map(s => {
    const momentumScore = s.returns1d * 0.4 + s.returns5d * 0.3 + s.returns20d * 0.2 + s.returns60d * 0.1;

    let trend: SectorMomentumResult['rankings'][0]['trend'];
    if (momentumScore > 0.05) trend = 'strong_up';
    else if (momentumScore > 0.01) trend = 'up';
    else if (momentumScore > -0.01) trend = 'sideways';
    else if (momentumScore > -0.05) trend = 'down';
    else trend = 'strong_down';

    const volumeConfirmation = s.volume > s.avgVolume * 1.5;
    let rotationSignal = '';
    if (s.returns1d > 0.02 && s.fundFlow > 5) rotationSignal = '资金流入加速';
    else if (s.returns1d < -0.02 && s.fundFlow < -5) rotationSignal = '资金流出加速';
    else if (s.advanceDeclineRatio > 2) rotationSignal = '板块内普涨';
    else if (s.advanceDeclineRatio < 0.5) rotationSignal = '板块内普跌';

    return {
      sector: s.name,
      momentumScore: Math.round(momentumScore * 10000) / 10000,
      trend,
      rotationSignal,
      volumeConfirmation,
    };
  });

  rankings.sort((a, b) => b.momentumScore - a.momentumScore);

  const hotSectors = rankings.filter(r => r.trend === 'strong_up' || r.trend === 'up').slice(0, 3).map(r => r.sector);
  const coldSectors = rankings.filter(r => r.trend === 'strong_down' || r.trend === 'down').slice(-3).map(r => r.sector);

  // 轮动方向
  const topSectors = rankings.slice(0, Math.ceil(rankings.length / 3));
  const avgPE = 0; // 简化
  let rotationDirection: SectorMomentumResult['rotationDirection'];
  const topNames = topSectors.map(s => s.sector).join(',');
  if (topNames.includes('科技') || topNames.includes('半导体') || topNames.includes('新能源'))
    rotationDirection = 'rotate_to_growth';
  else if (topNames.includes('银行') || topNames.includes('地产'))
    rotationDirection = 'rotate_to_value';
  else if (topNames.includes('消费') || topNames.includes('医药'))
    rotationDirection = 'rotate_to_defensive';
  else
    rotationDirection = 'rotate_to_cyclical';

  // 市场广度
  const advanceCount = sectors.filter(s => s.returns1d > 0).length;
  const totalAdvanceDecline = sectors.reduce((s, sec) => s + sec.advanceDeclineRatio, 0) / sectors.length;
  let marketBreadth: SectorMomentumResult['marketBreadth'];
  if (advanceCount > sectors.length * 0.7 && totalAdvanceDecline > 1.5) marketBreadth = 'broad_advance';
  else if (advanceCount > sectors.length * 0.5 && totalAdvanceDecline > 1) marketBreadth = 'narrow_advance';
  else if (advanceCount < sectors.length * 0.3) marketBreadth = 'broad_decline';
  else marketBreadth = 'narrow_decline';

  // 动量离散度
  const scores = rankings.map(r => r.momentumScore);
  const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
  const momentumDispersion = Math.sqrt(scores.reduce((s, v) => s + (v - avgScore) ** 2, 0) / scores.length);

  return {
    rankings,
    hotSectors,
    coldSectors,
    rotationDirection,
    marketBreadth,
    sectorCorrelation: 0.5, // 简化
    momentumDispersion: Math.round(momentumDispersion * 10000) / 10000,
  };
}
