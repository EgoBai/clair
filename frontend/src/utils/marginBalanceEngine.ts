/**
 * 融资融券余额分析引擎
 * - 融资余额/融券余额趋势
 * - 融资买入额/偿还额分析
 * - 融资融券比
 * - 杠杆率评估
 * - 多空信号
 */
export interface MarginData {
  date: string;
 融资余额: number;
  融券余额: number;
  融资买入额: number;
  融资偿还额: number;
  融券卖出量: number;
  融券偿还量: number;
}

export interface MarginAnalysis {
  currentMargin: MarginData;
 融资余额变化率: number;
  融资净买入: number;
  融资融券比: number;
  杠杆率: number;
  融资余额趋势: 'rising' | 'falling' | 'stable';
  融券余额趋势: 'rising' | 'falling' | 'stable';
  多空信号: 'bullish' | 'bearish' | 'neutral';
  signalStrength: number; // 0-100
  alerts: string[];
}

export function analyzeMarginTrading(
  data: MarginData[],
  marketCap?: number
): MarginAnalysis {
  if (data.length === 0) throw new Error('数据不能为空');

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : current;

  const 融资余额变化率 = prev.融资余额 > 0
    ? (current.融资余额 - prev.融资余额) / prev.融资余额
    : 0;
  const 融资净买入 = current.融资买入额 - current.融资偿还额;
  const 融资融券比 = current.融券余额 > 0
    ? current.融资余额 / current.融券余额
    : Infinity;
  const 杠杆率 = marketCap && marketCap > 0
    ? current.融资余额 / marketCap
    : 0;

  // 趋势判断 (最近5天)
  const recent5 = sorted.slice(-5);
  const 融资余额趋势 = detectTrend(recent5.map(d => d.融资余额));
  const 融券余额趋势 = detectTrend(recent5.map(d => d.融券余额));

  // 多空信号
  let signalScore = 50;
  if (融资净买入 > 0) signalScore += 15;
  if (融资余额变化率 > 0.01) signalScore += 15;
  if (融资余额趋势 === 'rising') signalScore += 10;
  if (融资净买入 < 0) signalScore -= 15;
  if (融资余额变化率 < -0.01) signalScore -= 15;
  if (融资余额趋势 === 'falling') signalScore -= 10;

  const 多空信号 = signalScore > 60 ? 'bullish' : signalScore < 40 ? 'bearish' : 'neutral';
  const signalStrength = Math.abs(signalScore - 50) * 2;

  const alerts: string[] = [];
  if (Math.abs(融资余额变化率) > 0.05) alerts.push('融资余额大幅波动');
  if (杠杆率 > 0.05) alerts.push('杠杆率偏高');
  if (融资融券比 > 50) alerts.push('融资融券比异常');

  return {
    currentMargin: current,
    融资余额变化率,
    融资净买入,
    融资融券比,
    杠杆率,
    融资余额趋势,
    融券余额趋势,
    多空信号,
    signalStrength,
    alerts,
  };
}

function detectTrend(values: number[]): 'rising' | 'falling' | 'stable' {
  if (values.length < 2) return 'stable';
  const first = values[0];
  const last = values[values.length - 1];
  const change = first > 0 ? (last - first) / first : 0;
  if (change > 0.02) return 'rising';
  if (change < -0.02) return 'falling';
  return 'stable';
}
