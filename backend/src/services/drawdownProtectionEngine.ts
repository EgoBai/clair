/**
 * DrawdownProtectionEngine - 回撤保护引擎
 * 计算最大回撤、当前回撤、回撤恢复状态，提供风控信号
 */

export interface EquityPoint {
  date: string;
  nav: number; // 净值
}

export interface DrawdownResult {
  maxDrawdown: number;          // 最大回撤 (0~1)
  maxDrawdownDate: string;      // 最大回撤发生日
  currentDrawdown: number;      // 当前回撤
  peakNav: number;              // 历史峰值
  troughNav: number;            // 最低谷值
  recoveryDays: number;         // 恢复天数 (-1表示未恢复)
  drawdownDuration: number;     // 回撤持续天数
  protectionSignal: 'normal' | 'warning' | 'critical' | 'halt';
  riskScore: number;            // 0~100
}

export interface DrawdownConfig {
  warningThreshold: number;     // 警告阈值 (默认0.05)
  criticalThreshold: number;    // 危险阈值 (默认0.10)
  haltThreshold: number;        // 停止阈值 (默认0.15)
  lookbackDays: number;         // 回看天数 (默认252)
}

const DEFAULT_CONFIG: DrawdownConfig = {
  warningThreshold: 0.05,
  criticalThreshold: 0.10,
  haltThreshold: 0.15,
  lookbackDays: 252,
};

export function computeDrawdown(
  equity: EquityPoint[],
  config: Partial<DrawdownConfig> = {}
): DrawdownResult | null {
  if (equity.length < 2) return null;
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { warningThreshold, criticalThreshold, haltThreshold, lookbackDays } = cfg;

  const slice = equity.slice(-lookbackDays);
  if (slice.length < 2) return null;

  let peakNav = slice[0].nav;
  let peakDate = slice[0].date;
  let maxDrawdown = 0;
  let maxDrawdownDate = slice[0].date;
  let troughNav = slice[0].nav;
  let currentDrawdownStartIdx = 0;
  let inDrawdown = false;
  let recoveryDays = -1;
  let drawdownDuration = 0;

  for (let i = 0; i < slice.length; i++) {
    const nav = slice[i].nav;
    if (nav > peakNav) {
      peakNav = nav;
      peakDate = slice[i].date;
      if (inDrawdown) {
        recoveryDays = i - currentDrawdownStartIdx;
        inDrawdown = false;
      }
    } else {
      if (!inDrawdown) {
        inDrawdown = true;
        currentDrawdownStartIdx = i;
      }
      const dd = (peakNav - nav) / peakNav;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDrawdownDate = slice[i].date;
        troughNav = nav;
      }
    }
  }

  if (inDrawdown) {
    drawdownDuration = slice.length - currentDrawdownStartIdx;
    recoveryDays = -1;
  }

  const currentDrawdown = peakNav > 0 ? (peakNav - slice[slice.length - 1].nav) / peakNav : 0;

  let protectionSignal: DrawdownResult['protectionSignal'];
  if (currentDrawdown >= haltThreshold) protectionSignal = 'halt';
  else if (currentDrawdown >= criticalThreshold) protectionSignal = 'critical';
  else if (currentDrawdown >= warningThreshold) protectionSignal = 'warning';
  else protectionSignal = 'normal';

  const riskScore = Math.min(100, Math.round(
    (currentDrawdown / haltThreshold) * 60 +
    (maxDrawdown / haltThreshold) * 25 +
    (drawdownDuration > 60 ? 15 : drawdownDuration / 60 * 15)
  ));

  return {
    maxDrawdown,
    maxDrawdownDate,
    currentDrawdown,
    peakNav,
    troughNav,
    recoveryDays,
    drawdownDuration,
    protectionSignal,
    riskScore,
  };
}

export function calmarRatio(
  equity: EquityPoint[],
  annualizedReturn: number,
  config: Partial<DrawdownConfig> = {}
): number | null {
  const dd = computeDrawdown(equity, config);
  if (!dd || dd.maxDrawdown === 0) return null;
  return annualizedReturn / dd.maxDrawdown;
}

export function ulcerIndex(equity: EquityPoint[]): number | null {
  if (equity.length < 2) return null;
  let peak = equity[0].nav;
  const squaredDd: number[] = [];

  for (const pt of equity) {
    if (pt.nav > peak) peak = pt.nav;
    const dd = peak > 0 ? ((peak - pt.nav) / peak) * 100 : 0;
    squaredDd.push(dd * dd);
  }

  return Math.sqrt(squaredDd.reduce((s, v) => s + v, 0) / squaredDd.length);
}
