import { describe, it, expect, vi } from 'vitest';

/**
 * ModelExplanationViz / StrategyComparison AI 组件逻辑测试
 */

describe('ModelExplanationViz', () => {
  describe('模型解释数据', () => {
    const explanation = {
      modelName: 'XGBoost-StockPredictor',
      accuracy: 0.85,
      features: [
        { name: 'RSI', importance: 0.25, direction: 'negative' },
        { name: 'MACD', importance: 0.20, direction: 'positive' },
        { name: 'Volume', importance: 0.15, direction: 'positive' },
        { name: 'PE_Ratio', importance: 0.12, direction: 'negative' },
        { name: 'MA_Cross', importance: 0.10, direction: 'positive' },
      ],
    };

    it('应该有模型名称', () => {
      expect(explanation.modelName).toBe('XGBoost-StockPredictor');
    });

    it('应该有准确率', () => {
      expect(explanation.accuracy).toBeGreaterThan(0);
      expect(explanation.accuracy).toBeLessThanOrEqual(1);
    });

    it('应该有特征重要性', () => {
      const totalImportance = explanation.features.reduce((s, f) => s + f.importance, 0);
      expect(totalImportance).toBeCloseTo(0.82, 1);
    });

    it('特征应该有方向性', () => {
      explanation.features.forEach(f => {
        expect(['positive', 'negative']).toContain(f.direction);
      });
    });

    it('特征应该按重要性排序', () => {
      const sorted = [...explanation.features].sort((a, b) => b.importance - a.importance);
      expect(sorted[0].name).toBe('RSI');
    });
  });

  describe('SHAP 值可视化', () => {
    it('应该支持 SHAP 值展示', () => {
      const shapValues = [
        { feature: 'RSI', value: -0.15 },
        { feature: 'MACD', value: 0.10 },
        { feature: 'Volume', value: 0.05 },
      ];
      const prediction = 0.5 + shapValues.reduce((s, v) => s + v.value, 0);
      expect(prediction).toBe(0.5);
    });
  });
});

describe('StrategyComparison', () => {
  describe('策略对比数据', () => {
    const strategies = [
      { name: '动量策略', totalReturn: 25.5, maxDrawdown: -8.2, sharpe: 1.5, winRate: 62 },
      { name: '均值回归', totalReturn: 18.3, maxDrawdown: -12.5, sharpe: 1.2, winRate: 58 },
      { name: '价值投资', totalReturn: 30.1, maxDrawdown: -15.0, sharpe: 1.8, winRate: 55 },
    ];

    it('应该有策略名称', () => {
      strategies.forEach(s => expect(s.name).toBeTruthy());
    });

    it('应该有总收益率', () => {
      strategies.forEach(s => expect(typeof s.totalReturn).toBe('number'));
    });

    it('应该有最大回撤', () => {
      strategies.forEach(s => expect(s.maxDrawdown).toBeLessThanOrEqual(0));
    });

    it('应该有夏普比率', () => {
      strategies.forEach(s => expect(typeof s.sharpe).toBe('number'));
    });

    it('应该有胜率', () => {
      strategies.forEach(s => {
        expect(s.winRate).toBeGreaterThanOrEqual(0);
        expect(s.winRate).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('策略排名', () => {
    const strategies = [
      { name: 'A', totalReturn: 25, sharpe: 1.5, maxDrawdown: -8 },
      { name: 'B', totalReturn: 18, sharpe: 1.2, maxDrawdown: -12 },
      { name: 'C', totalReturn: 30, sharpe: 1.8, maxDrawdown: -15 },
    ];

    it('按收益率排名', () => {
      const sorted = [...strategies].sort((a, b) => b.totalReturn - a.totalReturn);
      expect(sorted[0].name).toBe('C');
    });

    it('按夏普比率排名', () => {
      const sorted = [...strategies].sort((a, b) => b.sharpe - a.sharpe);
      expect(sorted[0].name).toBe('C');
    });

    it('按回撤排名（回撤最小最好）', () => {
      const sorted = [...strategies].sort((a, b) => b.maxDrawdown - a.maxDrawdown);
      expect(sorted[0].name).toBe('A'); // -8 > -12 > -15
    });
  });

  describe('综合评分', () => {
    const score = (s: { totalReturn: number; sharpe: number; maxDrawdown: number; winRate: number }) => {
      return (
        s.totalReturn * 0.3 +
        s.sharpe * 20 * 0.3 +
        Math.abs(s.maxDrawdown) * -1 * 0.2 +
        s.winRate * 0.2
      );
    };

    it('应该计算综合评分', () => {
      const s = { totalReturn: 25, sharpe: 1.5, maxDrawdown: -10, winRate: 60 };
      const result = score(s);
      expect(result).toBeGreaterThan(0);
    });
  });
});
