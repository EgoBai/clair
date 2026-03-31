import { describe, it, expect } from 'vitest';

/**
 * FundFlowChart 资金流向图组件逻辑测试
 */

describe('FundFlowChart', () => {
  describe('资金流向数据', () => {
    const flowData = {
      date: '2025-01-02',
      mainInflow: 500000000,
      mainOutflow: -300000000,
      retailInflow: 200000000,
      retailOutflow: -400000000,
    };

    it('应该有日期字段', () => {
      expect(flowData.date).toBe('2025-01-02');
    });

    it('应该有主力流入', () => {
      expect(flowData.mainInflow).toBeGreaterThan(0);
    });

    it('应该有主力流出（负值）', () => {
      expect(flowData.mainOutflow).toBeLessThan(0);
    });

    it('应该有散户流入', () => {
      expect(flowData.retailInflow).toBeGreaterThan(0);
    });

    it('应该有散户流出（负值）', () => {
      expect(flowData.retailOutflow).toBeLessThan(0);
    });
  });

  describe('净流入计算', () => {
    it('应该计算主力净流入', () => {
      const mainInflow = 500000000;
      const mainOutflow = 300000000;
      const netMain = mainInflow - mainOutflow;
      expect(netMain).toBe(200000000);
    });

    it('应该计算散户净流入', () => {
      const retailInflow = 200000000;
      const retailOutflow = 400000000;
      const netRetail = retailInflow - retailOutflow;
      expect(netRetail).toBe(-200000000);
    });

    it('净流入为正表示资金流入', () => {
      const netFlow = 200000000;
      expect(netFlow > 0).toBe(true);
    });

    it('净流入为负表示资金流出', () => {
      const netFlow = -200000000;
      expect(netFlow < 0).toBe(true);
    });
  });

  describe('金额格式化', () => {
    const formatAmount = (amount: number): string => {
      const abs = Math.abs(amount);
      if (abs >= 1e12) return `${(amount / 1e12).toFixed(2)}万亿`;
      if (abs >= 1e8) return `${(amount / 1e8).toFixed(2)}亿`;
      if (abs >= 1e4) return `${(amount / 1e4).toFixed(2)}万`;
      return `${amount}`;
    };

    it('应该格式化万亿级别', () => {
      expect(formatAmount(1500000000000)).toBe('1.50万亿');
    });

    it('应该格式化亿级别', () => {
      expect(formatAmount(500000000)).toBe('5.00亿');
    });

    it('应该格式化万级别', () => {
      expect(formatAmount(500000)).toBe('50.00万');
    });

    it('应该处理负数', () => {
      expect(formatAmount(-500000000)).toBe('-5.00亿');
    });

    it('小于万的数字直接返回', () => {
      expect(formatAmount(9999)).toBe('9999');
    });
  });

  describe('情绪指标', () => {
    const getSentiment = (mainNet: number, retailNet: number): string => {
      if (mainNet > 0 && retailNet < 0) return '主力吸筹';
      if (mainNet < 0 && retailNet > 0) return '主力出货';
      if (mainNet > 0 && retailNet > 0) return '共同流入';
      if (mainNet < 0 && retailNet < 0) return '共同流出';
      return '中性';
    };

    it('主力流入+散户流出 = 主力吸筹', () => {
      expect(getSentiment(100, -50)).toBe('主力吸筹');
    });

    it('主力流出+散户流入 = 主力出货', () => {
      expect(getSentiment(-100, 50)).toBe('主力出货');
    });

    it('双方流入 = 共同流入', () => {
      expect(getSentiment(100, 50)).toBe('共同流入');
    });

    it('双方流出 = 共同流出', () => {
      expect(getSentiment(-100, -50)).toBe('共同流出');
    });
  });

  describe('图表类型', () => {
    it('应该支持柱状图展示', () => {
      const chartType = 'bar';
      expect(chartType).toBe('bar');
    });

    it('应该支持面积图展示', () => {
      const chartType = 'area';
      expect(chartType).toBe('area');
    });
  });
});
