import { describe, it, expect } from 'vitest';

describe('市场数据处理管道', () => {

  // K线数据标准化
  const normalizeKLine = (raw: Record<string, string | number>) => {
    return {
      date: String(raw.date),
      open: Number(raw.open),
      high: Number(raw.high),
      low: Number(raw.low),
      close: Number(raw.close),
      volume: Math.round(Number(raw.volume)),
      amount: Number(raw.amount) || 0,
    };
  };

  const validateOHLC = (kline: { open: number; high: number; low: number; close: number }) => {
    if (kline.high < kline.low) return false;
    if (kline.high < kline.open || kline.high < kline.close) return false;
    if (kline.low > kline.open || kline.low > kline.close) return false;
    return true;
  };

  describe('K线数据标准化', () => {
    it('字符串转数字', () => {
      const raw = { date: '2026-03-24', open: '100.5', high: '105', low: '99', close: '103', volume: '1000000', amount: '103000000' };
      const result = normalizeKLine(raw);
      expect(typeof result.open).toBe('number');
      expect(typeof result.volume).toBe('number');
      expect(result.open).toBe(100.5);
    });
    it('缺少amount默认0', () => {
      const raw = { date: '2026-03-24', open: 100, high: 105, low: 99, close: 103, volume: 1000000 };
      const result = normalizeKLine(raw);
      expect(result.amount).toBe(0);
    });
    it('成交量取整', () => {
      const raw = { date: '2026-03-24', open: 100, high: 105, low: 99, close: 103, volume: 1000000.7 };
      const result = normalizeKLine(raw);
      expect(Number.isInteger(result.volume)).toBe(true);
    });

    it('OHLC逻辑正确', () => {
      expect(validateOHLC({ open: 100, high: 105, low: 99, close: 103 })).toBe(true);
    });
    it('high < low 无效', () => {
      expect(validateOHLC({ open: 100, high: 95, low: 99, close: 103 })).toBe(false);
    });
    it('high < close 无效', () => {
      expect(validateOHLC({ open: 100, high: 101, low: 99, close: 105 })).toBe(false);
    });
    it('low > open 无效', () => {
      expect(validateOHLC({ open: 100, high: 105, low: 102, close: 103 })).toBe(false);
    });
  });

  // 涨跌幅计算
  const calcChangePercent = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const calcAmplitude = (high: number, low: number, previousClose: number) => {
    if (previousClose === 0) return 0;
    return ((high - low) / previousClose) * 100;
  };

  describe('涨跌幅计算', () => {
    it('上涨5%', () => {
      expect(calcChangePercent(105, 100)).toBeCloseTo(5);
    });
    it('下跌3%', () => {
      expect(calcChangePercent(97, 100)).toBeCloseTo(-3);
    });
    it('不变', () => {
      expect(calcChangePercent(100, 100)).toBe(0);
    });
    it('昨收为0', () => {
      expect(calcChangePercent(100, 0)).toBe(0);
    });
    it('振幅计算', () => {
      expect(calcAmplitude(110, 90, 100)).toBeCloseTo(20);
    });
    it('零振幅', () => {
      expect(calcAmplitude(100, 100, 100)).toBe(0);
    });
  });

  // 换手率与量比
  const calcTurnoverRate = (volume: number, totalShares: number) => {
    if (totalShares === 0) return 0;
    return (volume / totalShares) * 100;
  };

  const calcVolumeRatio = (currentVol: number, avgVol5: number) => {
    if (avgVol5 === 0) return 0;
    return currentVol / avgVol5;
  };

  describe('换手率与量比', () => {
    it('5%换手率', () => {
      expect(calcTurnoverRate(5000000, 100000000)).toBeCloseTo(5);
    });
    it('零总股本', () => {
      expect(calcTurnoverRate(1000, 0)).toBe(0);
    });
    it('量比2倍', () => {
      expect(calcVolumeRatio(2000000, 1000000)).toBeCloseTo(2);
    });
    it('零均量', () => {
      expect(calcVolumeRatio(1000, 0)).toBe(0);
    });
  });

  // 行业分类
  const classifyIndustry = (code: string): string => {
    const prefix = code.substring(0, 3);
    const mapping: Record<string, string> = {
      '600': '传统行业', '601': '金融', '603': '制造业',
      '000': '深市主板', '001': '深市主板', '002': '中小板',
      '300': '创业板', '688': '科创板',
    };
    return mapping[prefix] || '其他';
  };

  describe('行业分类', () => {
    it('上证主板', () => {
      expect(classifyIndustry('600519')).toBe('传统行业');
    });
    it('金融股', () => {
      expect(classifyIndustry('601318')).toBe('金融');
    });
    it('创业板', () => {
      expect(classifyIndustry('300750')).toBe('创业板');
    });
    it('科创板', () => {
      expect(classifyIndustry('688981')).toBe('科创板');
    });
    it('中小板', () => {
      expect(classifyIndustry('002415')).toBe('中小板');
    });
    it('未知代码', () => {
      expect(classifyIndustry('999999')).toBe('其他');
    });
  });

  // 大单识别
  const isLargeOrder = (amount: number, avgDailyAmount: number, threshold: number = 0.01) => {
    return amount >= avgDailyAmount * threshold;
  };

  const classifyOrderSize = (amount: number) => {
    if (amount >= 10000000) return '超大单';
    if (amount >= 2000000) return '大单';
    if (amount >= 500000) return '中单';
    return '小单';
  };

  describe('大单识别', () => {
    it('大单成交', () => {
      expect(isLargeOrder(5000000, 100000000)).toBe(true);
    });
    it('小单成交', () => {
      expect(isLargeOrder(50000, 100000000)).toBe(false);
    });
    it('超大单', () => {
      expect(classifyOrderSize(15000000)).toBe('超大单');
    });
    it('大单', () => {
      expect(classifyOrderSize(5000000)).toBe('大单');
    });
    it('中单', () => {
      expect(classifyOrderSize(1000000)).toBe('中单');
    });
    it('小单', () => {
      expect(classifyOrderSize(100000)).toBe('小单');
    });
  });

  // 市盈率分类
  const classifyPE = (pe: number) => {
    if (pe <= 0) return '亏损';
    if (pe < 15) return '低估';
    if (pe < 25) return '合理';
    if (pe < 50) return '偏高';
    if (pe < 100) return '高估';
    return '泡沫';
  };

  const classifyPB = (pb: number) => {
    if (pb <= 0) return '负资产';
    if (pb < 1) return '破净';
    if (pb < 2) return '合理';
    if (pb < 5) return '偏高';
    return '高估';
  };

  describe('估值分类', () => {
    it('PE低估', () => { expect(classifyPE(10)).toBe('低估'); });
    it('PE合理', () => { expect(classifyPE(20)).toBe('合理'); });
    it('PE偏高', () => { expect(classifyPE(35)).toBe('偏高'); });
    it('PE高估', () => { expect(classifyPE(80)).toBe('高估'); });
    it('PE泡沫', () => { expect(classifyPE(200)).toBe('泡沫'); });
    it('PE亏损', () => { expect(classifyPE(-5)).toBe('亏损'); });
    it('PB破净', () => { expect(classifyPB(0.8)).toBe('破净'); });
    it('PB合理', () => { expect(classifyPB(1.5)).toBe('合理'); });
    it('PB偏高', () => { expect(classifyPB(3)).toBe('偏高'); });
    it('PB高估', () => { expect(classifyPB(10)).toBe('高估'); });
    it('PB负资产', () => { expect(classifyPB(-1)).toBe('负资产'); });
  });

  // 板块轮动阶段
  const detectSectorPhase = (priceChange: number, volumeChange: number, fundFlow: number) => {
    if (priceChange > 3 && volumeChange > 50 && fundFlow > 0) return '主升';
    if (priceChange > 0 && volumeChange > 0 && fundFlow > 0) return '吸筹';
    if (priceChange < 0 && volumeChange > 30 && fundFlow < 0) return '派发';
    if (priceChange < -3 && fundFlow < 0) return '下跌';
    return '震荡';
  };

  describe('板块轮动阶段', () => {
    it('主升阶段', () => {
      expect(detectSectorPhase(5, 80, 1000000)).toBe('主升');
    });
    it('吸筹阶段', () => {
      expect(detectSectorPhase(1, 10, 500000)).toBe('吸筹');
    });
    it('派发阶段', () => {
      expect(detectSectorPhase(-2, 50, -500000)).toBe('派发');
    });
    it('下跌阶段', () => {
      expect(detectSectorPhase(-5, 20, -1000000)).toBe('下跌');
    });
    it('震荡阶段', () => {
      expect(detectSectorPhase(0, 0, 0)).toBe('震荡');
    });
  });

  // 资金流向分析
  const analyzeFundFlow = (superLarge: number, large: number, medium: number, small: number) => {
    const total = superLarge + large + medium + small;
    const mainForce = superLarge + large;
    const retail = medium + small;
    return {
      total,
      mainForce,
      retail,
      mainForceRatio: total === 0 ? 0 : (mainForce / total) * 100,
      netFlow: mainForce - retail,
      direction: mainForce > retail ? '流入' : mainForce < retail ? '流出' : '平衡',
    };
  };

  describe('资金流向分析', () => {
    it('主力净流入', () => {
      const result = analyzeFundFlow(5000000, 3000000, 1000000, 1000000);
      expect(result.direction).toBe('流入');
      expect(result.mainForce).toBe(8000000);
      expect(result.netFlow).toBe(6000000);
    });
    it('散户净流入', () => {
      const result = analyzeFundFlow(1000000, 1000000, 5000000, 3000000);
      expect(result.direction).toBe('流出');
    });
    it('平衡状态', () => {
      const result = analyzeFundFlow(2500000, 2500000, 2500000, 2500000);
      expect(result.direction).toBe('平衡');
      expect(result.mainForceRatio).toBeCloseTo(50);
    });
    it('零资金', () => {
      const result = analyzeFundFlow(0, 0, 0, 0);
      expect(result.total).toBe(0);
      expect(result.mainForceRatio).toBe(0);
    });
  });

  // 多周期数据对齐
  const alignMultiPeriodData = (daily: number[], weekly: number[]) => {
    const aligned: { daily: number; weekly: number; ratio: number }[] = [];
    for (let i = 0; i < Math.min(daily.length, weekly.length); i++) {
      aligned.push({
        daily: daily[i],
        weekly: weekly[i],
        ratio: weekly[i] === 0 ? 0 : daily[i] / weekly[i],
      });
    }
    return aligned;
  };

  describe('多周期数据对齐', () => {
    it('正常对齐', () => {
      const result = alignMultiPeriodData([100, 105, 110], [200, 210, 220]);
      expect(result.length).toBe(3);
      expect(result[0].ratio).toBeCloseTo(0.5);
    });
    it('长度不等取短', () => {
      const result = alignMultiPeriodData([100, 105], [200, 210, 220]);
      expect(result.length).toBe(2);
    });
    it('空数组', () => {
      const result = alignMultiPeriodData([], [1, 2, 3]);
      expect(result.length).toBe(0);
    });
    it('零值处理', () => {
      const result = alignMultiPeriodData([100], [0]);
      expect(result[0].ratio).toBe(0);
    });
  });

  // 价格区间统计
  const priceDistribution = (prices: number[], bins: number = 5) => {
    if (prices.length === 0) return [];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (max === min) return [{ low: min, high: max, count: prices.length, percent: 100 }];
    const binWidth = (max - min) / bins;
    const result: { low: number; high: number; count: number; percent: number }[] = [];
    for (let i = 0; i < bins; i++) {
      const low = min + i * binWidth;
      const high = min + (i + 1) * binWidth;
      const count = prices.filter(p => (i === bins - 1 ? p >= low && p <= high : p >= low && p < high)).length;
      result.push({ low, high, count, percent: (count / prices.length) * 100 });
    }
    return result;
  };

  describe('价格区间统计', () => {
    it('均匀分布', () => {
      const prices = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const result = priceDistribution(prices, 5);
      expect(result.length).toBe(5);
      expect(result.reduce((s, b) => s + b.count, 0)).toBe(10);
    });
    it('空数组', () => {
      expect(priceDistribution([])).toEqual([]);
    });
    it('单一价格', () => {
      const result = priceDistribution([100, 100, 100]);
      expect(result.length).toBe(1);
      expect(result[0].count).toBe(3);
    });
    it('百分比总和100', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = priceDistribution(prices, 3);
      const totalPercent = result.reduce((s, b) => s + b.percent, 0);
      expect(totalPercent).toBeCloseTo(100);
    });
  });
});
