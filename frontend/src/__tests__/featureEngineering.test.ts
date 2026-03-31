import { describe, it, expect } from 'vitest';

/**
 * 机器学习特征工程 / 模型评估逻辑测试
 */

describe('FeatureEngineering', () => {
  describe('技术指标特征', () => {
    const features = {
      rsi_14: 65,
      macd_signal: 'bullish',
      bb_position: 0.7,
      volume_ratio: 1.5,
      price_to_ma20: 1.02,
    };

    it('应该有 RSI 特征', () => {
      expect(features.rsi_14).toBeGreaterThanOrEqual(0);
      expect(features.rsi_14).toBeLessThanOrEqual(100);
    });

    it('应该有 MACD 信号特征', () => {
      expect(['bullish', 'bearish', 'neutral']).toContain(features.macd_signal);
    });

    it('应该有布林带位置特征', () => {
      expect(features.bb_position).toBeGreaterThanOrEqual(0);
      expect(features.bb_position).toBeLessThanOrEqual(1);
    });

    it('应该有量比特征', () => {
      expect(features.volume_ratio).toBeGreaterThan(0);
    });
  });

  describe('特征归一化', () => {
    const minMaxScale = (values: number[]) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      return values.map(v => (v - min) / range);
    };

    it('应该归一化到 0-1 范围', () => {
      const scaled = minMaxScale([10, 20, 30, 40, 50]);
      expect(scaled[0]).toBe(0);
      expect(scaled[4]).toBe(1);
    });

    it('相同值应该全部为 0', () => {
      const scaled = minMaxScale([5, 5, 5, 5]);
      expect(scaled.every(v => v === 0)).toBe(true);
    });
  });

  describe('时序特征', () => {
    const calcLagFeatures = (series: number[], lags: number[]) => {
      return lags.map(lag => ({
        lag,
        values: series.slice(lag),
      }));
    };

    it('应该计算滞后特征', () => {
      const series = [1, 2, 3, 4, 5, 6, 7, 8];
      const lags = calcLagFeatures(series, [1, 2, 3]);
      expect(lags[0].values).toHaveLength(7);
      expect(lags[1].values).toHaveLength(6);
      expect(lags[2].values).toHaveLength(5);
    });
  });

  describe('交叉特征', () => {
    const createCrossFeatures = (f1: number[], f2: number[]) => {
      return f1.map((v, i) => v * f2[i]);
    };

    it('应该计算交叉特征（乘积）', () => {
      const result = createCrossFeatures([1, 2, 3], [4, 5, 6]);
      expect(result).toEqual([4, 10, 18]);
    });
  });
});

describe('ModelEvaluation', () => {
  describe('分类指标', () => {
    const calcMetrics = (tp: number, fp: number, fn: number, tn: number) => {
      const accuracy = (tp + tn) / (tp + fp + fn + tn);
      const precision = tp / (tp + fp) || 0;
      const recall = tp / (tp + fn) || 0;
      const f1 = 2 * precision * recall / (precision + recall) || 0;
      return { accuracy, precision, recall, f1 };
    };

    it('应该计算准确率', () => {
      const { accuracy } = calcMetrics(80, 10, 10, 900);
      expect(accuracy).toBe(0.98);
    });

    it('应该计算精确率', () => {
      const { precision } = calcMetrics(80, 10, 10, 900);
      expect(precision).toBeCloseTo(0.889, 1);
    });

    it('应该计算召回率', () => {
      const { recall } = calcMetrics(80, 10, 10, 900);
      expect(recall).toBeCloseTo(0.889, 1);
    });

    it('应该计算 F1 分数', () => {
      const { f1 } = calcMetrics(80, 10, 10, 900);
      expect(f1).toBeGreaterThan(0);
      expect(f1).toBeLessThanOrEqual(1);
    });
  });

  describe('回归指标', () => {
    const calcRegressionMetrics = (actual: number[], predicted: number[]) => {
      const n = actual.length;
      const errors = actual.map((a, i) => a - predicted[i]);
      const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / n;
      const mse = errors.reduce((s, e) => s + e ** 2, 0) / n;
      const rmse = Math.sqrt(mse);
      const mean = actual.reduce((a, b) => a + b) / n;
      const ssRes = errors.reduce((s, e) => s + e ** 2, 0);
      const ssTot = actual.reduce((s, a) => s + (a - mean) ** 2, 0);
      const r2 = 1 - ssRes / ssTot;
      return { mae, mse, rmse, r2 };
    };

    const actual = [100, 110, 120, 130, 140];
    const predicted = [102, 108, 122, 128, 142];
    const metrics = calcRegressionMetrics(actual, predicted);

    it('应该计算 MAE', () => {
      expect(metrics.mae).toBeGreaterThan(0);
    });

    it('应该计算 RMSE', () => {
      expect(metrics.rmse).toBeGreaterThan(0);
      expect(metrics.rmse).toBeGreaterThanOrEqual(metrics.mae);
    });

    it('应该计算 R²', () => {
      expect(metrics.r2).toBeLessThanOrEqual(1);
      expect(metrics.r2).toBeGreaterThan(0.9); // 预测较好
    });
  });

  describe('混淆矩阵', () => {
    const confusionMatrix = (predictions: number[], actuals: number[]) => {
      let tp = 0, fp = 0, fn = 0, tn = 0;
      predictions.forEach((p, i) => {
        if (p === 1 && actuals[i] === 1) tp++;
        else if (p === 1 && actuals[i] === 0) fp++;
        else if (p === 0 && actuals[i] === 1) fn++;
        else tn++;
      });
      return { tp, fp, fn, tn };
    };

    it('应该正确计算混淆矩阵', () => {
      const cm = confusionMatrix([1, 1, 0, 0], [1, 0, 1, 0]);
      expect(cm.tp).toBe(1);
      expect(cm.fp).toBe(1);
      expect(cm.fn).toBe(1);
      expect(cm.tn).toBe(1);
    });
  });
});
