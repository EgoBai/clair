import { describe, it, expect } from 'vitest';

// 智能风控预警引擎
interface RiskRule {
  id: string;
  name: string;
  type: 'position' | 'drawdown' | 'concentration' | 'volatility' | 'liquidity' | 'correlation';
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

interface RiskAlert {
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

interface PortfolioRiskMetrics {
  totalValue: number;
  maxDrawdown: number;
  currentDrawdown: number;
  concentration: Record<string, number>;
  dailyVol: number;
  var95: number;
  beta: number;
  sharpeRatio: number;
}

function evaluateRiskRules(metrics: PortfolioRiskMetrics, rules: RiskRule[]): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const now = Date.now();

  rules.filter(r => r.enabled).forEach(rule => {
    let value = 0;
    let message = '';

    switch (rule.type) {
      case 'drawdown':
        value = metrics.currentDrawdown;
        if (value > rule.threshold) {
          message = `当前回撤 ${(value * 100).toFixed(1)}% 超过阈值 ${(rule.threshold * 100).toFixed(1)}%`;
        }
        break;
      case 'position':
        value = Math.max(...Object.values(metrics.concentration), 0);
        if (value > rule.threshold) {
          message = `最大持仓集中度 ${(value * 100).toFixed(1)}% 超过阈值 ${(rule.threshold * 100).toFixed(1)}%`;
        }
        break;
      case 'volatility':
        value = metrics.dailyVol;
        if (value > rule.threshold) {
          message = `日波动率 ${(value * 100).toFixed(2)}% 超过阈值 ${(rule.threshold * 100).toFixed(2)}%`;
        }
        break;
      case 'concentration':
        const sectors = Object.entries(metrics.concentration);
        const maxSector = sectors.reduce((max, [k, v]) => v > max[1] ? [k, v] : max, ['', 0]);
        value = maxSector[1];
        if (value > rule.threshold) {
          message = `行业集中度 ${maxSector[0]} ${(value * 100).toFixed(1)}% 超过阈值`;
        }
        break;
      case 'liquidity':
        value = metrics.var95 / metrics.totalValue;
        if (value > rule.threshold) {
          message = `VaR占比 ${(value * 100).toFixed(1)}% 超过阈值`;
        }
        break;
      case 'correlation':
        value = Math.abs(metrics.beta - 1);
        if (value > rule.threshold) {
          message = `Beta偏离度 ${value.toFixed(2)} 超过阈值`;
        }
        break;
    }

    if (value > rule.threshold) {
      alerts.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        message,
        value,
        threshold: rule.threshold,
        timestamp: now,
      });
    }
  });

  return alerts.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity as keyof typeof order] || 4) - (order[b.severity as keyof typeof order] || 4);
  });
}

function calcRiskScore(alerts: RiskAlert[]): number {
  let score = 100;
  alerts.forEach(a => {
    switch (a.severity) {
      case 'critical': score -= 30; break;
      case 'high': score -= 20; break;
      case 'medium': score -= 10; break;
      case 'low': score -= 5; break;
    }
  });
  return Math.max(0, score);
}

function generateRiskReport(metrics: PortfolioRiskMetrics, alerts: RiskAlert[]): string {
  const score = calcRiskScore(alerts);
  const lines = [
    `风控报告 | 评分: ${score}/100`,
    `组合价值: ${metrics.totalValue.toLocaleString()}`,
    `当前回撤: ${(metrics.currentDrawdown * 100).toFixed(2)}%`,
    `日波动率: ${(metrics.dailyVol * 100).toFixed(2)}%`,
    `VaR(95%): ${metrics.var95.toLocaleString()}`,
    `Beta: ${metrics.beta.toFixed(2)}`,
    `Sharpe: ${metrics.sharpeRatio.toFixed(2)}`,
  ];

  if (alerts.length > 0) {
    lines.push(`\n⚠️ ${alerts.length} 个风险预警:`);
    alerts.forEach(a => {
      lines.push(`  [${a.severity.toUpperCase()}] ${a.ruleName}: ${a.message}`);
    });
  } else {
    lines.push('\n✅ 无风险预警');
  }

  return lines.join('\n');
}

describe('智能风控预警引擎', () => {
  const metrics: PortfolioRiskMetrics = {
    totalValue: 1000000,
    maxDrawdown: 0.15,
    currentDrawdown: 0.08,
    concentration: { '科技': 0.4, '金融': 0.3, '消费': 0.3 },
    dailyVol: 0.025,
    var95: 50000,
    beta: 1.2,
    sharpeRatio: 1.5,
  };

  const rules: RiskRule[] = [
    { id: 'r1', name: '回撤预警', type: 'drawdown', threshold: 0.05, severity: 'high', enabled: true },
    { id: 'r2', name: '集中度预警', type: 'position', threshold: 0.35, severity: 'medium', enabled: true },
    { id: 'r3', name: '波动率预警', type: 'volatility', threshold: 0.02, severity: 'medium', enabled: true },
    { id: 'r4', name: 'Beta偏离', type: 'correlation', threshold: 0.3, severity: 'low', enabled: true },
    { id: 'r5', name: '已禁用规则', type: 'drawdown', threshold: 0.01, severity: 'critical', enabled: false },
  ];

  it('应评估风险规则并生成预警', () => {
    const alerts = evaluateRiskRules(metrics, rules);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('已禁用规则不应触发', () => {
    const alerts = evaluateRiskRules(metrics, rules);
    expect(alerts.some(a => a.ruleId === 'r5')).toBe(false);
  });

  it('预警应按严重程度排序', () => {
    const alerts = evaluateRiskRules(metrics, rules);
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < alerts.length; i++) {
      expect(order[alerts[i].severity as keyof typeof order]).toBeGreaterThanOrEqual(
        order[alerts[i - 1].severity as keyof typeof order]
      );
    }
  });

  it('应计算风险评分', () => {
    const alerts = evaluateRiskRules(metrics, rules);
    const score = calcRiskScore(alerts);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('无预警时评分为100', () => {
    expect(calcRiskScore([])).toBe(100);
  });

  it('关键预警应大幅扣分', () => {
    const criticalAlert: RiskAlert = {
      ruleId: 'c1', ruleName: 'test', severity: 'critical',
      message: 'test', value: 1, threshold: 0, timestamp: Date.now(),
    };
    expect(calcRiskScore([criticalAlert])).toBe(70);
  });

  it('应生成风控报告', () => {
    const alerts = evaluateRiskRules(metrics, rules);
    const report = generateRiskReport(metrics, alerts);
    expect(report).toContain('风控报告');
    expect(report).toContain('评分');
    expect(report).toContain('1,000,000');
  });

  it('安全组合报告应无预警', () => {
    const safeMetrics: PortfolioRiskMetrics = {
      ...metrics, currentDrawdown: 0.01, dailyVol: 0.01, beta: 1.05,
      concentration: { 'A': 0.2, 'B': 0.2, 'C': 0.2, 'D': 0.2, 'E': 0.2 },
    };
    const safeRules: RiskRule[] = rules.map(r => ({ ...r, threshold: r.threshold * 2 }));
    const alerts = evaluateRiskRules(safeMetrics, safeRules);
    const report = generateRiskReport(safeMetrics, alerts);
    expect(report).toContain('无风险预警');
  });

  it('每个预警应有完整信息', () => {
    const alerts = evaluateRiskRules(metrics, rules);
    alerts.forEach(a => {
      expect(a.ruleId).toBeTruthy();
      expect(a.ruleName).toBeTruthy();
      expect(a.severity).toBeTruthy();
      expect(a.message).toBeTruthy();
      expect(a.timestamp).toBeGreaterThan(0);
    });
  });

  it('空规则列表应无预警', () => {
    expect(evaluateRiskRules(metrics, [])).toEqual([]);
  });
});
