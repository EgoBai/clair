import { describe, it, expect } from 'vitest';

// Market breadth calculations
function calculateMarketBreadth(advancers: number, decliners: number, unchanged: number) {
  const total = advancers + decliners + unchanged;
  const adLine = advancers - decliners;
  const adRatio = decliners === 0 ? Infinity : advancers / decliners;
  const advancePercent = (advancers / total) * 100;
  const declinePercent = (decliners / total) * 100;
  const unchangedPercent = (unchanged / total) * 100;
  return { total, adLine, adRatio, advancePercent, declinePercent, unchangedPercent };
}

function calculateMcClellanOscillator(ema19: number, ema39: number) {
  return ema19 - ema39;
}

function calculateArmsIndex(upVolume: number, downVolume: number, upIssues: number, downIssues: number) {
  if (downVolume === 0 || downIssues === 0) return Infinity;
  return (upVolume / downVolume) / (upIssues / downIssues);
}

function calculateNewHighsLowsRatio(newHighs: number, newLows: number) {
  if (newLows === 0) return newHighs > 0 ? Infinity : 0;
  return newHighs / newLows;
}

function classifyBreadthSignal(breadth: ReturnType<typeof calculateMarketBreadth>) {
  if (breadth.adRatio > 2) return 'strong_bullish';
  if (breadth.adRatio > 1.2) return 'bullish';
  if (breadth.adRatio > 0.8) return 'neutral';
  if (breadth.adRatio > 0.5) return 'bearish';
  return 'strong_bearish';
}

function calculateVolumeBreadth(upVolume: number, downVolume: number, neutralVolume: number) {
  const total = upVolume + downVolume + neutralVolume;
  if (total === 0) return { upPercent: 0, downPercent: 0, neutralPercent: 0, force: 0 };
  return {
    upPercent: (upVolume / total) * 100,
    downPercent: (downVolume / total) * 100,
    neutralPercent: (neutralVolume / total) * 100,
    force: (upVolume - downVolume) / total,
  };
}

function detectDivergence(priceTrend: 'up' | 'down', breadthTrend: 'up' | 'down') {
  if (priceTrend === 'up' && breadthTrend === 'down') return 'bearish_divergence';
  if (priceTrend === 'down' && breadthTrend === 'up') return 'bullish_divergence';
  return 'no_divergence';
}

describe('市场广度分析', () => {
  describe('涨跌家数统计', () => {
    it('应该正确计算涨跌家数', () => {
      const result = calculateMarketBreadth(300, 100, 50);
      expect(result.total).toBe(450);
      expect(result.adLine).toBe(200);
    });

    it('涨跌比应该正确', () => {
      const result = calculateMarketBreadth(200, 100, 0);
      expect(result.adRatio).toBe(2);
    });

    it('跌家为0时涨跌比应该为Infinity', () => {
      const result = calculateMarketBreadth(100, 0, 10);
      expect(result.adRatio).toBe(Infinity);
    });

    it('涨跌百分比应该总和为100', () => {
      const result = calculateMarketBreadth(300, 200, 100);
      expect(result.advancePercent + result.declinePercent + result.unchangedPercent).toBeCloseTo(100);
    });

    it('全涨市场', () => {
      const result = calculateMarketBreadth(500, 0, 0);
      expect(result.advancePercent).toBe(100);
      expect(result.declinePercent).toBe(0);
    });

    it('全跌市场', () => {
      const result = calculateMarketBreadth(0, 500, 0);
      expect(result.adLine).toBe(-500);
      expect(result.declinePercent).toBe(100);
    });

    it('均衡市场', () => {
      const result = calculateMarketBreadth(250, 250, 0);
      expect(result.adRatio).toBe(1);
      expect(result.adLine).toBe(0);
    });
  });

  describe('McClellan振荡器', () => {
    it('应该计算差值', () => {
      expect(calculateMcClellanOscillator(50, 30)).toBe(20);
    });

    it('负值应该反映看跌', () => {
      expect(calculateMcClellanOscillator(20, 40)).toBe(-20);
    });

    it('相等时为0', () => {
      expect(calculateMcClellanOscillator(30, 30)).toBe(0);
    });
  });

  describe('Arms指数(TRIN)', () => {
    it('应该正确计算', () => {
      const trin = calculateArmsIndex(200, 100, 300, 200);
      expect(trin).toBeCloseTo(1.333, 2);
    });

    it('TRIN < 1 表示看涨', () => {
      const trin = calculateArmsIndex(300, 100, 400, 100);
      expect(trin).toBeLessThan(1);
    });

    it('TRIN > 1 表示看跌', () => {
      const trin = calculateArmsIndex(100, 300, 100, 400);
      expect(trin).toBeGreaterThan(1);
    });

    it('下成交量为0时应返回Infinity', () => {
      const trin = calculateArmsIndex(100, 0, 100, 100);
      expect(trin).toBe(Infinity);
    });

    it('下家数为0时应返回Infinity', () => {
      const trin = calculateArmsIndex(100, 100, 100, 0);
      expect(trin).toBe(Infinity);
    });
  });

  describe('新高新低比率', () => {
    it('应该正确计算', () => {
      expect(calculateNewHighsLowsRatio(100, 50)).toBe(2);
    });

    it('新低为0时返回Infinity', () => {
      expect(calculateNewHighsLowsRatio(100, 0)).toBe(Infinity);
    });

    it('两者都为0时返回0', () => {
      expect(calculateNewHighsLowsRatio(0, 0)).toBe(0);
    });

    it('新低大于新高时小于1', () => {
      expect(calculateNewHighsLowsRatio(20, 80)).toBeLessThan(1);
    });
  });

  describe('广度信号分类', () => {
    it('强牛市信号', () => {
      expect(classifyBreadthSignal(calculateMarketBreadth(300, 100, 0))).toBe('strong_bullish');
    });

    it('牛市信号', () => {
      expect(classifyBreadthSignal(calculateMarketBreadth(200, 150, 0))).toBe('bullish');
    });

    it('中性信号', () => {
      expect(classifyBreadthSignal(calculateMarketBreadth(180, 170, 0))).toBe('neutral');
    });

    it('熊市信号', () => {
      expect(classifyBreadthSignal(calculateMarketBreadth(120, 200, 0))).toBe('bearish');
    });

    it('强熊市信号', () => {
      expect(classifyBreadthSignal(calculateMarketBreadth(50, 300, 0))).toBe('strong_bearish');
    });
  });

  describe('成交量广度', () => {
    it('应该正确计算涨跌成交量占比', () => {
      const result = calculateVolumeBreadth(600, 300, 100);
      expect(result.upPercent).toBe(60);
      expect(result.downPercent).toBe(30);
      expect(result.neutralPercent).toBe(10);
    });

    it('多空力道为正表示多方强', () => {
      const result = calculateVolumeBreadth(700, 200, 100);
      expect(result.force).toBeGreaterThan(0);
    });

    it('多空力道为负表示空方强', () => {
      const result = calculateVolumeBreadth(200, 700, 100);
      expect(result.force).toBeLessThan(0);
    });

    it('零成交量时所有指标为0', () => {
      const result = calculateVolumeBreadth(0, 0, 0);
      expect(result.upPercent).toBe(0);
      expect(result.force).toBe(0);
    });
  });

  describe('背离检测', () => {
    it('价格涨广度跌为顶背离', () => {
      expect(detectDivergence('up', 'down')).toBe('bearish_divergence');
    });

    it('价格跌广度涨为底背离', () => {
      expect(detectDivergence('down', 'up')).toBe('bullish_divergence');
    });

    it('同向无背离', () => {
      expect(detectDivergence('up', 'up')).toBe('no_divergence');
      expect(detectDivergence('down', 'down')).toBe('no_divergence');
    });
  });
});
