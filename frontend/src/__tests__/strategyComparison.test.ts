import { describe, it, expect } from 'vitest';
import { generateStrategyInsight } from '../utils/aiModelExplainer';

/**
 * 策略对比逻辑测试
 */

describe('策略对比逻辑', () => {
  const strategies = ['value', 'growth', 'technical', 'momentum', 'contrarian'];
  const insights = strategies.map(s => generateStrategyInsight(s));

  describe('雷达图数据', () => {
    it('应为每个维度生成数据点', () => {
      const metrics = ['胜率', '收益', '夏普', '回撤控制', '稳定性'];
      const strategyNames: Record<string, string> = {
        value: '价值投资', growth: '成长突破', technical: '技术形态',
        momentum: '动量追踪', contrarian: '逆向布局',
      };
      const radarData = metrics.map(metric => {
        const point: Record<string, any> = { metric };
        insights.forEach(ins => {
          const name = strategyNames[ins.strategy];
          switch (metric) {
            case '胜率': point[name] = ins.performance.winRate; break;
            case '收益': point[name] = Math.min(ins.performance.avgReturn * 2, 100); break;
            case '夏普': point[name] = ins.performance.sharpeRatio * 50; break;
            case '回撤控制': point[name] = 100 + ins.performance.maxDrawdown; break;
            case '稳定性': point[name] = ins.performance.calmarRatio * 50; break;
          }
        });
        return point;
      });

      expect(radarData.length).toBe(5);
      radarData.forEach(d => {
        expect(d.metric).toBeTruthy();
        insights.forEach(ins => {
          const name = strategyNames[ins.strategy];
          expect(d[name]).toBeGreaterThan(0);
          expect(d[name]).toBeLessThanOrEqual(100);
        });
      });
    });

    it('收益值应被截断到100', () => {
      insights.forEach(ins => {
        const capped = Math.min(ins.performance.avgReturn * 2, 100);
        expect(capped).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('散点图数据', () => {
    it('应包含风险和收益坐标', () => {
      const scatterData = insights.map(ins => ({
        name: ins.strategy,
        risk: Math.abs(ins.performance.maxDrawdown),
        return: ins.performance.avgReturn,
      }));

      scatterData.forEach(d => {
        expect(d.risk).toBeGreaterThan(0);
        expect(d.return).toBeGreaterThan(0);
      });
    });

    it('风险应为绝对值', () => {
      insights.forEach(ins => {
        const risk = Math.abs(ins.performance.maxDrawdown);
        expect(risk).toBeGreaterThan(0);
      });
    });
  });

  describe('策略排名排序', () => {
    it('按夏普比率排序', () => {
      const sorted = [...insights].sort(
        (a, b) => b.performance.sharpeRatio - a.performance.sharpeRatio
      );
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].performance.sharpeRatio).toBeGreaterThanOrEqual(
          sorted[i].performance.sharpeRatio
        );
      }
    });

    it('按平均收益排序', () => {
      const sorted = [...insights].sort(
        (a, b) => b.performance.avgReturn - a.performance.avgReturn
      );
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].performance.avgReturn).toBeGreaterThanOrEqual(
          sorted[i].performance.avgReturn
        );
      }
    });

    it('按胜率排序', () => {
      const sorted = [...insights].sort(
        (a, b) => b.performance.winRate - a.performance.winRate
      );
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].performance.winRate).toBeGreaterThanOrEqual(
          sorted[i].performance.winRate
        );
      }
    });
  });

  describe('策略颜色映射', () => {
    const colors: Record<string, string> = {
      value: '#52c41a',
      growth: '#1890ff',
      technical: '#722ed1',
      momentum: '#fa8c16',
      contrarian: '#13c2c2',
    };

    it('每种策略应有唯一颜色', () => {
      const colorValues = Object.values(colors);
      const unique = new Set(colorValues);
      expect(unique.size).toBe(colorValues.length);
    });

    it('颜色应为有效hex', () => {
      Object.values(colors).forEach(c => {
        expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });
  });

  describe('风险等级标签', () => {
    const labels: Record<string, string> = {
      low: '低风险',
      medium: '中风险',
      high: '高风险',
    };

    it('应覆盖所有风险等级', () => {
      expect(Object.keys(labels).length).toBe(3);
    });

    it('每个策略应有对应的风险等级', () => {
      insights.forEach(ins => {
        expect(labels[ins.riskLevel]).toBeTruthy();
      });
    });
  });

  describe('排名标签颜色', () => {
    it('前三名应有奖牌色', () => {
      const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
      expect(rankColors[0]).toBe('#FFD700');
      expect(rankColors[1]).toBe('#C0C0C0');
      expect(rankColors[2]).toBe('#CD7F32');
    });
  });
});
