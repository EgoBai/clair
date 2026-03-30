import { describe, it, expect } from 'vitest';

// ==================== 组合策略管理器 ====================

interface StrategyComponent {
  name: string;
  weight: number; // 0-1
  params: Record<string, number>;
  type: 'trend' | 'momentum' | 'meanReversion' | 'volatility';
}

interface PortfolioStrategy {
  id: string;
  name: string;
  components: StrategyComponent[];
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly';
  riskBudget: number;
  maxPositions: number;
}

interface AllocationResult {
  strategy: string;
  allocation: number;
  expectedReturn: number;
  expectedRisk: number;
  contribution: number;
}

interface CombinationMetrics {
  expectedReturn: number;
  expectedRisk: number;
  sharpeRatio: number;
  diversificationRatio: number;
  maxComponentWeight: number;
  minComponentWeight: number;
  effectiveN: number; // 有效策略数
}

class PortfolioStrategyManager {
  private strategies: Map<string, PortfolioStrategy> = new Map();
  private allocations: Map<string, AllocationResult[]> = new Map();

  /** 创建组合策略 */
  createStrategy(strategy: PortfolioStrategy): void {
    // 验证权重总和
    const totalWeight = strategy.components.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(totalWeight - 1) > 0.001) {
      throw new Error(`权重总和必须为1，当前为${totalWeight.toFixed(4)}`);
    }
    this.strategies.set(strategy.id, { ...strategy });
  }

  /** 更新组合策略 */
  updateStrategy(id: string, updates: Partial<PortfolioStrategy>): void {
    const existing = this.strategies.get(id);
    if (!existing) throw new Error(`策略 ${id} 不存在`);
    this.strategies.set(id, { ...existing, ...updates });
  }

  /** 删除策略 */
  removeStrategy(id: string): boolean {
    this.allocations.delete(id);
    return this.strategies.delete(id);
  }

  /** 获取策略 */
  getStrategy(id: string): PortfolioStrategy | undefined {
    return this.strategies.get(id);
  }

  /** 列出所有策略 */
  listStrategies(): PortfolioStrategy[] {
    return Array.from(this.strategies.values());
  }

  /** 等权重分配 */
  equalWeightAllocation(id: string): AllocationResult[] {
    const strategy = this.strategies.get(id);
    if (!strategy) throw new Error(`策略 ${id} 不存在`);

    const n = strategy.components.length;
    const weight = 1 / n;
    return strategy.components.map(c => ({
      strategy: c.name,
      allocation: Math.round(weight * 10000) / 10000,
      expectedReturn: Math.round(c.weight * 10 * 100) / 100,
      expectedRisk: Math.round(c.weight * 15 * 100) / 100,
      contribution: Math.round(weight * c.weight * 100 * 100) / 100,
    }));
  }

  /** 风险平价分配 */
  riskParityAllocation(id: string): AllocationResult[] {
    const strategy = this.strategies.get(id);
    if (!strategy) throw new Error(`策略 ${id} 不存在`);

    // 简化: 根据类型估算风险
    const riskEstimates = strategy.components.map(c => {
      switch (c.type) {
        case 'trend': return 0.20;
        case 'momentum': return 0.25;
        case 'meanReversion': return 0.15;
        case 'volatility': return 0.30;
        default: return 0.20;
      }
    });

    // 风险贡献 = 1/风险
    const invRisk = riskEstimates.map(r => 1 / r);
    const totalInvRisk = invRisk.reduce((s, v) => s + v, 0);
    const weights = invRisk.map(v => v / totalInvRisk);

    return strategy.components.map((c, i) => ({
      strategy: c.name,
      allocation: Math.round(weights[i] * 10000) / 10000,
      expectedReturn: Math.round(weights[i] * 10 * 100) / 100,
      expectedRisk: Math.round(riskEstimates[i] * 100 * 100) / 100,
      contribution: Math.round(weights[i] * riskEstimates[i] * 100 * 100) / 100,
    }));
  }

  /** 均值方差优化 (简化版) */
  meanVarianceOptimize(id: string, targetReturn: number = 0.1): AllocationResult[] {
    const strategy = this.strategies.get(id);
    if (!strategy) throw new Error(`策略 ${id} 不存在`);

    const n = strategy.components.length;
    const returns = strategy.components.map(c => {
      switch (c.type) {
        case 'trend': return 0.12;
        case 'momentum': return 0.18;
        case 'meanReversion': return 0.08;
        case 'volatility': return 0.15;
        default: return 0.10;
      }
    });

    // 最大化夏普比率的简化分配
    const excessReturns = returns.map(r => r - 0.03);
    const totalExcess = excessReturns.reduce((s, v) => s + Math.max(0, v), 0);

    let weights: number[];
    if (totalExcess > 0) {
      weights = excessReturns.map(r => Math.max(0, r) / totalExcess);
    } else {
      weights = Array(n).fill(1 / n);
    }

    // 归一化
    const wTotal = weights.reduce((s, v) => s + v, 0);
    weights = weights.map(w => w / wTotal);

    return strategy.components.map((c, i) => ({
      strategy: c.name,
      allocation: Math.round(weights[i] * 10000) / 10000,
      expectedReturn: Math.round(returns[i] * 100 * 100) / 100,
      expectedRisk: Math.round((0.1 + Math.random() * 0.1) * 100 * 100) / 100,
      contribution: Math.round(weights[i] * returns[i] * 100 * 100) / 100,
    }));
  }

  /** 计算组合指标 */
  calculateMetrics(id: string): CombinationMetrics {
    const strategy = this.strategies.get(id);
    if (!strategy) throw new Error(`策略 ${id} 不存在`);

    const weights = strategy.components.map(c => c.weight);
    const returns = strategy.components.map(c => {
      switch (c.type) {
        case 'trend': return 0.12;
        case 'momentum': return 0.18;
        case 'meanReversion': return 0.08;
        case 'volatility': return 0.15;
        default: return 0.10;
      }
    });
    const risks = strategy.components.map(c => {
      switch (c.type) {
        case 'trend': return 0.20;
        case 'momentum': return 0.25;
        case 'meanReversion': return 0.15;
        case 'volatility': return 0.30;
        default: return 0.20;
      }
    });

    const expectedReturn = weights.reduce((s, w, i) => s + w * returns[i], 0);
    const expectedRisk = Math.sqrt(weights.reduce((s, w, i) => s + Math.pow(w * risks[i], 2), 0));
    const sharpeRatio = expectedRisk > 0 ? (expectedReturn - 0.03) / expectedRisk : 0;
    const avgRisk = weights.reduce((s, w, i) => s + w * risks[i], 0);
    const diversificationRatio = expectedRisk > 0 ? avgRisk / expectedRisk : 1;

    return {
      expectedReturn: Math.round(expectedReturn * 10000) / 10000,
      expectedRisk: Math.round(expectedRisk * 10000) / 10000,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      diversificationRatio: Math.round(diversificationRatio * 100) / 100,
      maxComponentWeight: Math.max(...weights),
      minComponentWeight: Math.min(...weights),
      effectiveN: Math.round(1 / weights.reduce((s, w) => s + w * w, 0) * 100) / 100,
    };
  }

  /** 再平衡信号检测 */
  checkRebalanceNeeded(
    id: string,
    currentWeights: Record<string, number>,
    threshold: number = 0.05
  ): { needed: boolean; drifts: Record<string, number>; maxDrift: number } {
    const strategy = this.strategies.get(id);
    if (!strategy) throw new Error(`策略 ${ id } 不存在`);

    const drifts: Record<string, number> = {};
    let maxDrift = 0;

    for (const comp of strategy.components) {
      const current = currentWeights[comp.name] || 0;
      const drift = Math.abs(current - comp.weight);
      drifts[comp.name] = Math.round(drift * 10000) / 10000;
      if (drift > maxDrift) maxDrift = drift;
    }

    return { needed: maxDrift > threshold, drifts, maxDrift: Math.round(maxDrift * 10000) / 10000 };
  }

  /** 策略分组 */
  groupByType(): Map<string, PortfolioStrategy[]> {
    const groups = new Map<string, PortfolioStrategy[]>();
    for (const strategy of this.strategies.values()) {
      for (const comp of strategy.components) {
        if (!groups.has(comp.type)) groups.set(comp.type, []);
        const list = groups.get(comp.type)!;
        if (!list.find(s => s.id === strategy.id)) {
          list.push(strategy);
        }
      }
    }
    return groups;
  }

  /** 保存分配结果 */
  saveAllocation(id: string, results: AllocationResult[]): void {
    this.allocations.set(id, results);
  }

  /** 获取历史分配 */
  getAllocationHistory(id: string): AllocationResult[] {
    return this.allocations.get(id) || [];
  }
}

// ==================== 测试数据 ====================

function createSampleStrategy(id: string): PortfolioStrategy {
  return {
    id, name: `组合策略${id}`,
    components: [
      { name: '趋势跟踪', weight: 0.4, params: { fast: 5, slow: 20 }, type: 'trend' },
      { name: '动量突破', weight: 0.3, params: { period: 14 }, type: 'momentum' },
      { name: '均值回归', weight: 0.2, params: { band: 2 }, type: 'meanReversion' },
      { name: '波动率套利', weight: 0.1, params: { threshold: 0.02 }, type: 'volatility' },
    ],
    rebalanceFrequency: 'weekly',
    riskBudget: 0.15,
    maxPositions: 10,
  };
}

// ==================== 测试 ====================

describe('PortfolioStrategyManager 组合策略管理器', () => {
  let manager: PortfolioStrategyManager;

  beforeEach(() => {
    manager = new PortfolioStrategyManager();
  });

  describe('策略CRUD', () => {
    it('应创建策略', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      expect(manager.getStrategy('s1')).toBeDefined();
    });

    it('应列出所有策略', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      manager.createStrategy(createSampleStrategy('s2'));
      expect(manager.listStrategies().length).toBe(2);
    });

    it('应更新策略', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      manager.updateStrategy('s1', { name: '更新后的策略' });
      expect(manager.getStrategy('s1')!.name).toBe('更新后的策略');
    });

    it('应删除策略', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      expect(manager.removeStrategy('s1')).toBe(true);
      expect(manager.getStrategy('s1')).toBeUndefined();
    });

    it('更新不存在策略应报错', () => {
      expect(() => manager.updateStrategy('nope', {})).toThrow('不存在');
    });

    it('权重总和不为1应报错', () => {
      const bad = createSampleStrategy('bad');
      bad.components[0].weight = 0.8; // 总和1.2
      expect(() => manager.createStrategy(bad)).toThrow('权重总和');
    });
  });

  describe('等权重分配', () => {
    it('应返回等权分配', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      const alloc = manager.equalWeightAllocation('s1');
      expect(alloc.length).toBe(4);
      for (const a of alloc) { expect(a.allocation).toBe(0.25); }
    });

    it('不存在策略应报错', () => {
      expect(() => manager.equalWeightAllocation('nope')).toThrow();
    });
  });

  describe('风险平价分配', () => {
    it('应返回风险平价分配', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      const alloc = manager.riskParityAllocation('s1');
      expect(alloc.length).toBe(4);
      const total = alloc.reduce((s, a) => s + a.allocation, 0);
      expect(total).toBeCloseTo(1, 2);
    });

    it('低风险策略应获得更高权重', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      const alloc = manager.riskParityAllocation('s1');
      const mr = alloc.find(a => a.strategy === '均值回归')!;
      const vol = alloc.find(a => a.strategy === '波动率套利')!;
      expect(mr.allocation).toBeGreaterThan(vol.allocation);
    });
  });

  describe('均值方差优化', () => {
    it('应返回优化分配', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      const alloc = manager.meanVarianceOptimize('s1');
      expect(alloc.length).toBe(4);
      const total = alloc.reduce((s, a) => s + a.allocation, 0);
      expect(total).toBeCloseTo(1, 2);
    });
  });

  describe('组合指标', () => {
    it('应计算指标', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      const metrics = manager.calculateMetrics('s1');
      expect(metrics.expectedReturn).toBeGreaterThan(0);
      expect(metrics.expectedRisk).toBeGreaterThan(0);
      expect(metrics.diversificationRatio).toBeGreaterThanOrEqual(1);
    });

    it('等权重时有效N应等于策略数', () => {
      const eq = createSampleStrategy('eq');
      eq.components.forEach(c => c.weight = 0.25);
      manager.createStrategy(eq);
      const metrics = manager.calculateMetrics('eq');
      expect(metrics.effectiveN).toBeCloseTo(4, 0);
    });

    it('集中权重时有效N应较小', () => {
      const concentrated = createSampleStrategy('con');
      concentrated.components[0].weight = 0.9;
      concentrated.components[1].weight = 0.05;
      concentrated.components[2].weight = 0.03;
      concentrated.components[3].weight = 0.02;
      manager.createStrategy(concentrated);
      const metrics = manager.calculateMetrics('con');
      expect(metrics.effectiveN).toBeLessThan(2);
    });
  });

  describe('再平衡检测', () => {
    it('无偏差时不需要再平衡', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      const result = manager.checkRebalanceNeeded('s1', {
        '趋势跟踪': 0.4, '动量突破': 0.3, '均值回归': 0.2, '波动率套利': 0.1,
      });
      expect(result.needed).toBe(false);
    });

    it('大偏差时需要再平衡', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      const result = manager.checkRebalanceNeeded('s1', {
        '趋势跟踪': 0.6, '动量突破': 0.2, '均值回归': 0.15, '波动率套利': 0.05,
      });
      expect(result.needed).toBe(true);
      expect(result.maxDrift).toBeGreaterThan(0.05);
    });

    it('应计算漂移量', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      const result = manager.checkRebalanceNeeded('s1', {
        '趋势跟踪': 0.45, '动量突破': 0.25, '均值回归': 0.2, '波动率套利': 0.1,
      });
      expect(result.drifts['趋势跟踪']).toBeCloseTo(0.05, 2);
    });
  });

  describe('策略分组', () => {
    it('应按类型分组', () => {
      manager.createStrategy(createSampleStrategy('s1'));
      const groups = manager.groupByType();
      expect(groups.has('trend')).toBe(true);
      expect(groups.has('momentum')).toBe(true);
    });
  });

  describe('分配历史', () => {
    it('应保存和获取分配', () => {
      const alloc: AllocationResult[] = [
        { strategy: 'A', allocation: 0.5, expectedReturn: 10, expectedRisk: 15, contribution: 5 },
      ];
      manager.saveAllocation('s1', alloc);
      expect(manager.getAllocationHistory('s1')).toEqual(alloc);
    });

    it('无历史时返回空', () => {
      expect(manager.getAllocationHistory('none')).toEqual([]);
    });
  });

  describe('组合组合', () => {
    it('多策略组合应有更高分散化', () => {
      const diverse = createSampleStrategy('diverse');
      diverse.components = [
        { name: 'A', weight: 0.25, params: {}, type: 'trend' },
        { name: 'B', weight: 0.25, params: {}, type: 'momentum' },
        { name: 'C', weight: 0.25, params: {}, type: 'meanReversion' },
        { name: 'D', weight: 0.25, params: {}, type: 'volatility' },
      ];
      manager.createStrategy(diverse);
      const metrics = manager.calculateMetrics('diverse');
      expect(metrics.diversificationRatio).toBeGreaterThan(1);
    });
  });
});
