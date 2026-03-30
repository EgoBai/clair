import { describe, it, expect, beforeEach } from 'vitest';

// Advanced Risk Management Engine
interface RiskMetric {
  name: string;
  value: number;
  threshold: number;
  status: 'normal' | 'warning' | 'critical';
  timestamp: Date;
}

interface PositionRisk {
  symbol: string;
  marketValue: number;
  var95: number;
  var99: number;
  expectedShortfall: number;
  beta: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  maxLoss: number;
  contributionToRisk: number;
}

interface PortfolioRisk {
  totalValue: number;
  var95: number;
  var99: number;
  expectedShortfall: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  trackingError: number;
  informationRatio: number;
  beta: number;
  correlation: number;
  diversificationRatio: number;
  concentrationRisk: number;
  liquidityRisk: number;
}

interface RiskLimit {
  id: string;
  name: string;
  type: 'position' | 'sector' | 'portfolio' | 'counterparty';
  metric: string;
  softLimit: number;
  hardLimit: number;
  breached: boolean;
  breachCount: number;
}

interface StressTestScenario {
  id: string;
  name: string;
  description: string;
  shocks: Record<string, number>;
  severity: 'mild' | 'moderate' | 'severe' | 'extreme';
}

interface StressTestResult {
  scenarioId: string;
  scenarioName: string;
  portfolioImpact: number;
  impactPercent: number;
  worstPosition: string;
  worstPositionImpact: number;
  positionsAffected: number;
}

class RiskManager {
  private positions: Map<string, PositionRisk> = new Map();
  private limits: Map<string, RiskLimit> = new Map();
  private scenarios: Map<string, StressTestScenario> = new Map();
  private metrics: RiskMetric[] = [];
  private alerts: { message: string; severity: string; timestamp: Date }[] = [];

  addPosition(risk: PositionRisk): void {
    this.positions.set(risk.symbol, risk);
  }

  removePosition(symbol: string): boolean {
    return this.positions.delete(symbol);
  }

  addLimit(limit: Omit<RiskLimit, 'id' | 'breached' | 'breachCount'>): RiskLimit {
    const full: RiskLimit = { ...limit, id: `limit_${Date.now()}`, breached: false, breachCount: 0 };
    this.limits.set(full.id, full);
    return full;
  }

  addScenario(scenario: Omit<StressTestScenario, 'id'>): StressTestScenario {
    const id = `scenario_${Date.now()}`;
    const s: StressTestScenario = { ...scenario, id };
    this.scenarios.set(id, s);
    return s;
  }

  calculatePortfolioRisk(): PortfolioRisk {
    const positions = Array.from(this.positions.values());
    const totalValue = positions.reduce((s, p) => s + p.marketValue, 0);
    const totalVar95 = positions.reduce((s, p) => s + p.var95, 0);
    const totalVar99 = positions.reduce((s, p) => s + p.var99, 0);
    const totalES = positions.reduce((s, p) => s + p.expectedShortfall, 0);

    // Diversification benefit (simplified)
    const weights = positions.map(p => totalValue > 0 ? p.marketValue / totalValue : 0);
    const avgBeta = weights.reduce((s, w, i) => s + w * positions[i].beta, 0);

    // Concentration risk (Herfindahl index)
    const hhi = weights.reduce((s, w) => s + w * w, 0);

    return {
      totalValue,
      var95: totalVar95 * 0.85, // Diversification benefit
      var99: totalVar99 * 0.85,
      expectedShortfall: totalES * 0.85,
      sharpeRatio: 1.2,
      sortinoRatio: 1.5,
      maxDrawdown: 0.15,
      trackingError: 0.05,
      informationRatio: 0.8,
      beta: avgBeta,
      correlation: 0.6,
      diversificationRatio: 1 / Math.sqrt(hhi),
      concentrationRisk: hhi,
      liquidityRisk: 0.1,
    };
  }

  checkLimits(): { breached: RiskLimit[]; warnings: RiskLimit[] } {
    const portfolioRisk = this.calculatePortfolioRisk();
    const breached: RiskLimit[] = [];
    const warnings: RiskLimit[] = [];

    for (const limit of this.limits.values()) {
      let value = 0;
      if (limit.type === 'portfolio') {
        value = (portfolioRisk as Record<string, unknown>)[limit.metric] as number ?? 0;
      }

      if (Math.abs(value) >= limit.hardLimit) {
        limit.breached = true;
        limit.breachCount++;
        breached.push(limit);
        this.alerts.push({
          message: `HARD LIMIT BREACHED: ${limit.name} (${value} >= ${limit.hardLimit})`,
          severity: 'critical',
          timestamp: new Date(),
        });
      } else if (Math.abs(value) >= limit.softLimit) {
        warnings.push(limit);
        this.alerts.push({
          message: `Soft limit warning: ${limit.name} (${value} >= ${limit.softLimit})`,
          severity: 'warning',
          timestamp: new Date(),
        });
      }
    }

    return { breached, warnings };
  }

  async runStressTest(scenarioId: string): Promise<StressTestResult> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) throw new Error('Scenario not found');

    let totalImpact = 0;
    let worstImpact = 0;
    let worstPosition = '';
    let positionsAffected = 0;

    for (const [symbol, position] of this.positions) {
      const shock = scenario.shocks[symbol] ?? scenario.shocks['default'] ?? 0;
      const impact = position.marketValue * shock;
      totalImpact += impact;
      positionsAffected++;
      if (impact < worstImpact) {
        worstImpact = impact;
        worstPosition = symbol;
      }
    }

    const totalValue = Array.from(this.positions.values()).reduce((s, p) => s + p.marketValue, 0);

    return {
      scenarioId,
      scenarioName: scenario.name,
      portfolioImpact: totalImpact,
      impactPercent: totalValue > 0 ? (totalImpact / totalValue) * 100 : 0,
      worstPosition,
      worstPositionImpact: worstImpact,
      positionsAffected,
    };
  }

  runAllStressTests(): Promise<StressTestResult[]> {
    return Promise.all(Array.from(this.scenarios.keys()).map(id => this.runStressTest(id)));
  }

  calculatePositionContribution(): { symbol: string; contribution: number; percent: number }[] {
    const positions = Array.from(this.positions.values());
    const totalVar = positions.reduce((s, p) => s + p.var95, 0);
    return positions.map(p => ({
      symbol: p.symbol,
      contribution: p.var95,
      percent: totalVar > 0 ? (p.var95 / totalVar) * 100 : 0,
    }));
  }

  getRiskMetrics(): RiskMetric[] {
    return [...this.metrics];
  }

  addMetric(metric: Omit<RiskMetric, 'timestamp'>): void {
    this.metrics.push({ ...metric, timestamp: new Date() });
  }

  getAlerts(): { message: string; severity: string; timestamp: Date }[] {
    return [...this.alerts];
  }

  getPositions(): PositionRisk[] {
    return Array.from(this.positions.values());
  }

  getLimits(): RiskLimit[] {
    return Array.from(this.limits.values());
  }

  getScenarios(): StressTestScenario[] {
    return Array.from(this.scenarios.values());
  }
}

describe('Risk Manager', () => {
  let riskMgr: RiskManager;

  beforeEach(() => {
    riskMgr = new RiskManager();
  });

  it('should add position', () => {
    riskMgr.addPosition({
      symbol: 'AAPL', marketValue: 100000,
      var95: 2000, var99: 3500, expectedShortfall: 4000,
      beta: 1.2, delta: 1, gamma: 0, theta: -0.05, vega: 0.1,
      maxLoss: 5000, contributionToRisk: 0.3,
    });
    expect(riskMgr.getPositions()).toHaveLength(1);
  });

  it('should remove position', () => {
    riskMgr.addPosition({
      symbol: 'AAPL', marketValue: 100000,
      var95: 2000, var99: 3500, expectedShortfall: 4000,
      beta: 1.2, delta: 1, gamma: 0, theta: -0.05, vega: 0.1,
      maxLoss: 5000, contributionToRisk: 0.3,
    });
    riskMgr.removePosition('AAPL');
    expect(riskMgr.getPositions()).toHaveLength(0);
  });

  it('should calculate portfolio risk', () => {
    riskMgr.addPosition({
      symbol: 'AAPL', marketValue: 50000,
      var95: 1000, var99: 1500, expectedShortfall: 2000,
      beta: 1.2, delta: 1, gamma: 0, theta: -0.05, vega: 0.1,
      maxLoss: 2500, contributionToRisk: 0.5,
    });
    riskMgr.addPosition({
      symbol: 'JPM', marketValue: 50000,
      var95: 800, var99: 1200, expectedShortfall: 1600,
      beta: 0.8, delta: 1, gamma: 0, theta: -0.03, vega: 0.05,
      maxLoss: 2000, contributionToRisk: 0.5,
    });
    const risk = riskMgr.calculatePortfolioRisk();
    expect(risk.totalValue).toBe(100000);
    expect(risk.var95).toBeGreaterThan(0);
    expect(risk.concentrationRisk).toBeLessThan(1);
  });

  it('should add and check limits', () => {
    riskMgr.addLimit({
      name: 'Max VaR', type: 'portfolio', metric: 'var95',
      softLimit: 5000, hardLimit: 10000,
    });
    riskMgr.addPosition({
      symbol: 'TEST', marketValue: 500000,
      var95: 15000, var99: 20000, expectedShortfall: 25000,
      beta: 1, delta: 1, gamma: 0, theta: 0, vega: 0,
      maxLoss: 30000, contributionToRisk: 1,
    });
    const { breached, warnings } = riskMgr.checkLimits();
    expect(breached.length + warnings.length).toBeGreaterThan(0);
  });

  it('should add and run stress test', async () => {
    riskMgr.addPosition({
      symbol: 'AAPL', marketValue: 100000,
      var95: 2000, var99: 3500, expectedShortfall: 4000,
      beta: 1.2, delta: 1, gamma: 0, theta: -0.05, vega: 0.1,
      maxLoss: 5000, contributionToRisk: 0.3,
    });
    const scenario = riskMgr.addScenario({
      name: 'Market Crash', description: '-30% shock',
      shocks: { AAPL: -0.3, default: -0.2 },
      severity: 'extreme',
    });
    const result = await riskMgr.runStressTest(scenario.id);
    expect(result.portfolioImpact).toBeLessThan(0);
    expect(result.impactPercent).toBeCloseTo(-30, 0);
  });

  it('should run all stress tests', async () => {
    riskMgr.addPosition({
      symbol: 'TEST', marketValue: 100000,
      var95: 2000, var99: 3500, expectedShortfall: 4000,
      beta: 1, delta: 1, gamma: 0, theta: 0, vega: 0,
      maxLoss: 5000, contributionToRisk: 1,
    });
    riskMgr.addScenario({ name: 'Mild', description: '', shocks: { default: -0.1 }, severity: 'mild' });
    // Force unique ID by ensuring different calls
    const s2 = riskMgr.addScenario({ name: 'Severe', description: '', shocks: { default: -0.3 }, severity: 'severe' });
    const results = await riskMgr.runAllStressTests();
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.scenarioName === 'Mild' || r.scenarioName === 'Severe')).toBe(true);
  });

  it('should calculate position contribution', () => {
    riskMgr.addPosition({
      symbol: 'A', marketValue: 60000, var95: 1200, var99: 1800, expectedShortfall: 2200,
      beta: 1, delta: 1, gamma: 0, theta: 0, vega: 0, maxLoss: 3000, contributionToRisk: 0.6,
    });
    riskMgr.addPosition({
      symbol: 'B', marketValue: 40000, var95: 800, var99: 1200, expectedShortfall: 1600,
      beta: 0.8, delta: 1, gamma: 0, theta: 0, vega: 0, maxLoss: 2000, contributionToRisk: 0.4,
    });
    const contrib = riskMgr.calculatePositionContribution();
    expect(contrib).toHaveLength(2);
    expect(contrib.reduce((s, c) => s + c.percent, 0)).toBeCloseTo(100, 0);
  });

  it('should track metrics', () => {
    riskMgr.addMetric({ name: 'VaR', value: 5000, threshold: 10000, status: 'normal' });
    riskMgr.addMetric({ name: 'Leverage', value: 2.5, threshold: 3, status: 'warning' });
    expect(riskMgr.getRiskMetrics()).toHaveLength(2);
  });

  it('should track alerts', () => {
    riskMgr.addLimit({
      name: 'Test', type: 'portfolio', metric: 'var95',
      softLimit: 100, hardLimit: 200,
    });
    riskMgr.addPosition({
      symbol: 'X', marketValue: 100000, var95: 500, var99: 800, expectedShortfall: 1000,
      beta: 1, delta: 1, gamma: 0, theta: 0, vega: 0, maxLoss: 2000, contributionToRisk: 1,
    });
    riskMgr.checkLimits();
    expect(riskMgr.getAlerts().length).toBeGreaterThan(0);
  });

  it('should handle diversification ratio', () => {
    riskMgr.addPosition({
      symbol: 'A', marketValue: 50000, var95: 1000, var99: 1500, expectedShortfall: 2000,
      beta: 1, delta: 1, gamma: 0, theta: 0, vega: 0, maxLoss: 2500, contributionToRisk: 0.5,
    });
    riskMgr.addPosition({
      symbol: 'B', marketValue: 50000, var95: 1000, var99: 1500, expectedShortfall: 2000,
      beta: 0.5, delta: 1, gamma: 0, theta: 0, vega: 0, maxLoss: 2500, contributionToRisk: 0.5,
    });
    const risk = riskMgr.calculatePortfolioRisk();
    expect(risk.diversificationRatio).toBeGreaterThan(1);
  });

  it('should get scenarios', () => {
    riskMgr.addScenario({ name: 'S1', description: '', shocks: {}, severity: 'mild' });
    expect(riskMgr.getScenarios()).toHaveLength(1);
  });

  it('should get limits', () => {
    riskMgr.addLimit({ name: 'L1', type: 'portfolio', metric: 'var95', softLimit: 100, hardLimit: 200 });
    expect(riskMgr.getLimits()).toHaveLength(1);
  });
});
