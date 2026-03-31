import { describe, it, expect } from 'vitest';
import {
  fitOUProcess,
  generateStatArbSignal,
  backtestMeanReversion,
} from '../utils/statArbEngine';

// 创建均值回归序列
function makeMeanRevertingSeries(n = 200): number[] {
  const series: number[] = [100];
  for (let i = 1; i < n; i++) {
    const drift = 0.05 * (100 - series[i - 1]); // 均值回归
    series.push(series[i - 1] + drift + (Math.random() - 0.5) * 2);
  }
  return series;
}

describe('Stat Arb Engine', () => {
  describe('fitOUProcess', () => {
    it('应拟合OU参数', () => {
      const result = fitOUProcess(makeMeanRevertingSeries(100));
      expect(result.theta).toBeGreaterThan(0); // 应有正的回归速度
    });

    it('应计算长期均值', () => {
      const result = fitOUProcess(makeMeanRevertingSeries(100));
      expect(result.mu).toBeGreaterThan(90);
      expect(result.mu).toBeLessThan(110);
    });

    it('应计算半衰期', () => {
      const result = fitOUProcess(makeMeanRevertingSeries(100));
      expect(result.halfLife).toBeGreaterThan(0);
    });

    it('应计算波动率', () => {
      const result = fitOUProcess(makeMeanRevertingSeries(100));
      expect(result.sigma).toBeGreaterThan(0);
    });

    it('应处理数据不足', () => {
      const result = fitOUProcess([1, 2, 3]);
      expect(result.theta).toBe(0);
    });
  });

  describe('generateStatArbSignal', () => {
    it('应生成交易信号', () => {
      const series = makeMeanRevertingSeries(100);
      const result = generateStatArbSignal('TEST', series);
      expect(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell']).toContain(result.signal);
    });

    it('应计算Z-Score', () => {
      const series = makeMeanRevertingSeries(100);
      const result = generateStatArbSignal('TEST', series);
      expect(typeof result.zScore).toBe('number');
    });

    it('应计算目标价', () => {
      const series = makeMeanRevertingSeries(100);
      const result = generateStatArbSignal('TEST', series);
      expect(result.targetPrice).toBeGreaterThan(0);
    });

    it('应计算Kelly比例', () => {
      const series = makeMeanRevertingSeries(100);
      const result = generateStatArbSignal('TEST', series);
      expect(result.kellyFraction).toBeGreaterThanOrEqual(0);
      expect(result.kellyFraction).toBeLessThanOrEqual(1);
    });

    it('应估算Sharpe', () => {
      const series = makeMeanRevertingSeries(100);
      const result = generateStatArbSignal('TEST', series);
      expect(typeof result.sharpeEstimate).toBe('number');
    });

    it('应计算持有期', () => {
      const series = makeMeanRevertingSeries(100);
      const result = generateStatArbSignal('TEST', series);
      expect(result.holdingPeriod).toBeGreaterThan(0);
    });
  });

  describe('backtestMeanReversion', () => {
    it('应回测均值回归策略', () => {
      const result = backtestMeanReversion(makeMeanRevertingSeries(200));
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    });

    it('应计算胜率', () => {
      const result = backtestMeanReversion(makeMeanRevertingSeries(200));
      if (result.totalTrades > 0) {
        expect(result.winRate).toBeGreaterThanOrEqual(0);
        expect(result.winRate).toBeLessThanOrEqual(1);
      }
    });

    it('应计算Sharpe比率', () => {
      const result = backtestMeanReversion(makeMeanRevertingSeries(200));
      expect(typeof result.sharpeRatio).toBe('number');
    });

    it('应计算最大回撤', () => {
      const result = backtestMeanReversion(makeMeanRevertingSeries(200));
      expect(result.maxDrawdown).toBeLessThanOrEqual(0);
    });

    it('应计算盈亏比', () => {
      const result = backtestMeanReversion(makeMeanRevertingSeries(200));
      expect(result.profitFactor).toBeGreaterThanOrEqual(0);
    });

    it('应计算平均持有天数', () => {
      const result = backtestMeanReversion(makeMeanRevertingSeries(200));
      if (result.totalTrades > 0) {
        expect(result.avgHoldingDays).toBeGreaterThan(0);
      }
    });
  });
});
