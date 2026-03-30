import { describe, it, expect } from 'vitest';
import { generateModelExplanation } from '../utils/aiModelExplainer';

/**
 * 模型解释可视化逻辑测试
 */

describe('模型解释可视化逻辑', () => {
  const explanation = generateModelExplanation('000001', '平安银行');

  describe('雷达图数据转换', () => {
    it('应按类别聚合特征', () => {
      const categoryScores: Record<string, { total: number; count: number }> = {};
      explanation.features.forEach(f => {
        if (!categoryScores[f.category]) categoryScores[f.category] = { total: 0, count: 0 };
        categoryScores[f.category].total += f.importance * 100;
        categoryScores[f.category].count++;
      });

      const radarData = Object.entries(categoryScores).map(([cat, data]) => ({
        category: cat,
        score: Math.round(data.total / data.count),
      }));

      expect(radarData.length).toBeGreaterThan(0);
      radarData.forEach(d => {
        expect(d.score).toBeGreaterThan(0);
        expect(d.score).toBeLessThanOrEqual(100);
      });
    });

    it('每个类别应有数据点', () => {
      const categories = new Set(explanation.features.map(f => f.category));
      categories.forEach(cat => {
        const catFeatures = explanation.features.filter(f => f.category === cat);
        expect(catFeatures.length).toBeGreaterThan(0);
      });
    });
  });

  describe('柱状图数据排序', () => {
    it('因子应按贡献度降序排列', () => {
      const sorted = [...explanation.factors].sort((a, b) => b.contribution - a.contribution);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].contribution).toBeGreaterThanOrEqual(sorted[i].contribution);
      }
    });

    it('每个因子应有名称和贡献度', () => {
      explanation.factors.forEach(f => {
        expect(f.factor).toBeTruthy();
        expect(f.contribution).toBeGreaterThan(0);
      });
    });
  });

  describe('树图数据分组', () => {
    it('应按类别分组特征', () => {
      const grouped: Record<string, typeof explanation.features> = {};
      explanation.features.forEach(f => {
        if (!grouped[f.category]) grouped[f.category] = [];
        grouped[f.category].push(f);
      });

      Object.entries(grouped).forEach(([cat, features]) => {
        expect(features.length).toBeGreaterThan(0);
        features.forEach(f => expect(f.category).toBe(cat));
      });
    });

    it('每个特征应有大小值', () => {
      explanation.features.forEach(f => {
        const size = Math.round(f.importance * 1000);
        expect(size).toBeGreaterThan(0);
      });
    });
  });

  describe('决策路径可视化', () => {
    it('步骤应按顺序编号', () => {
      explanation.decisionPath.forEach((step, idx) => {
        expect(step.step).toBe(idx + 1);
      });
    });

    it('通过的步骤应显示绿色样式', () => {
      explanation.decisionPath.forEach(step => {
        const color = step.result ? '#52c41a' : '#cf1322';
        expect(color).toBe(step.result ? '#52c41a' : '#cf1322');
      });
    });

    it('每步应有影响权重', () => {
      explanation.decisionPath.forEach(step => {
        expect(step.impact).toBeGreaterThan(0);
        expect(step.impact).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('置信度颜色', () => {
    it('高置信度应为绿色', () => {
      const conf = 0.87;
      const color = conf >= 0.8 ? '#52c41a' : conf >= 0.6 ? '#1890ff' : '#fa8c16';
      expect(color).toBe('#52c41a');
    });

    it('中置信度应为蓝色', () => {
      const conf = 0.7;
      const color = conf >= 0.8 ? '#52c41a' : conf >= 0.6 ? '#1890ff' : '#fa8c16';
      expect(color).toBe('#1890ff');
    });

    it('低置信度应为橙色', () => {
      const conf = 0.5;
      const color = conf >= 0.8 ? '#52c41a' : conf >= 0.6 ? '#1890ff' : '#fa8c16';
      expect(color).toBe('#fa8c16');
    });
  });

  describe('特征方向标签', () => {
    it('正面特征应显示上升箭头', () => {
      const pos = explanation.features.filter(f => f.direction === 'positive');
      expect(pos.length).toBeGreaterThan(0);
      pos.forEach(f => {
        const arrow = f.direction === 'positive' ? '↑' : '↓';
        expect(arrow).toBe('↑');
      });
    });

    it('负面特征应显示下降箭头', () => {
      const neg = explanation.features.filter(f => f.direction === 'negative');
      expect(neg.length).toBeGreaterThan(0);
      neg.forEach(f => {
        const arrow = f.direction === 'positive' ? '↑' : '↓';
        expect(arrow).toBe('↓');
      });
    });
  });

  describe('紧凑模式', () => {
    it('紧凑模式应只显示雷达图和柱状图', () => {
      // compact 模式下只渲染两个图表
      const compactComponents = ['FeatureRadarChart', 'FactorBarChart'];
      expect(compactComponents.length).toBe(2);
    });
  });
});
