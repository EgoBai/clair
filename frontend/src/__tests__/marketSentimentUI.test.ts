/**
 * 市场情绪UI逻辑测试
 */
import { describe, it, expect } from 'vitest';

type SentimentLevel = 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';

function getSentimentLevel(index: number): SentimentLevel {
  if (index < 20) return 'extreme_fear';
  if (index < 40) return 'fear';
  if (index < 60) return 'neutral';
  if (index < 80) return 'greed';
  return 'extreme_greed';
}

function getSentimentColor(level: SentimentLevel): string {
  const colors: Record<SentimentLevel, string> = {
    extreme_fear: '#dc2626',
    fear: '#f97316',
    neutral: '#eab308',
    greed: '#22c55e',
    extreme_greed: '#15803d',
  };
  return colors[level];
}

function getSentimentLabel(level: SentimentLevel): string {
  const labels: Record<SentimentLevel, string> = {
    extreme_fear: '极度恐慌',
    fear: '恐慌',
    neutral: '中性',
    greed: '贪婪',
    extreme_greed: '极度贪婪',
  };
  return labels[level];
}

function calculateFearGreedIndex(
  advanceRatio: number,
  avgChangePercent: number,
  volumeRatio: number,
  volatilityIndex: number
): number {
  const advanceScore = advanceRatio * 30;
  const momentumScore = Math.max(0, Math.min(30, (avgChangePercent + 5) * 3));
  const volumeScore = Math.max(0, Math.min(20, volumeRatio * 10));
  const volatilityScore = Math.max(0, Math.min(20, (100 - volatilityIndex) * 0.2));
  return Math.round(Math.max(0, Math.min(100, advanceScore + momentumScore + volumeScore + volatilityScore)));
}

function formatSentimentGauge(index: number): {
  level: SentimentLevel;
  color: string;
  label: string;
  angle: number;
  description: string;
} {
  const level = getSentimentLevel(index);
  const angle = (index / 100) * 180 - 90;
  const descriptions: Record<SentimentLevel, string> = {
    extreme_fear: '市场极度恐慌，可能是抄底机会',
    fear: '市场情绪偏悲观，注意风险控制',
    neutral: '市场情绪中性，观望为主',
    greed: '市场情绪乐观，注意追高风险',
    extreme_greed: '市场极度贪婪，可能是见顶信号',
  };
  return {
    level,
    color: getSentimentColor(level),
    label: getSentimentLabel(level),
    angle,
    description: descriptions[level],
  };
}

describe('市场情绪UI', () => {
  describe('情绪等级', () => {
    it('0-19极度恐慌', () => {
      expect(getSentimentLevel(0)).toBe('extreme_fear');
      expect(getSentimentLevel(19)).toBe('extreme_fear');
    });

    it('20-39恐慌', () => {
      expect(getSentimentLevel(20)).toBe('fear');
      expect(getSentimentLevel(39)).toBe('fear');
    });

    it('40-59中性', () => {
      expect(getSentimentLevel(50)).toBe('neutral');
    });

    it('60-79贪婪', () => {
      expect(getSentimentLevel(70)).toBe('greed');
    });

    it('80-100极度贪婪', () => {
      expect(getSentimentLevel(80)).toBe('extreme_greed');
      expect(getSentimentLevel(100)).toBe('extreme_greed');
    });
  });

  describe('情绪颜色', () => {
    it('每级有对应颜色', () => {
      const levels: SentimentLevel[] = ['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed'];
      for (const level of levels) {
        expect(getSentimentColor(level)).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it('不同等级颜色不同', () => {
      const colors = new Set([
        getSentimentColor('extreme_fear'),
        getSentimentColor('fear'),
        getSentimentColor('neutral'),
        getSentimentColor('greed'),
        getSentimentColor('extreme_greed'),
      ]);
      expect(colors.size).toBe(5);
    });
  });

  describe('情绪标签', () => {
    it('所有等级有标签', () => {
      const levels: SentimentLevel[] = ['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed'];
      for (const level of levels) {
        expect(getSentimentLabel(level).length).toBeGreaterThan(0);
      }
    });

    it('中文标签', () => {
      expect(getSentimentLabel('extreme_fear')).toBe('极度恐慌');
      expect(getSentimentLabel('extreme_greed')).toBe('极度贪婪');
    });
  });

  describe('恐慌贪婪指数计算', () => {
    it('结果在0-100之间', () => {
      const idx = calculateFearGreedIndex(0.6, 2, 1.5, 30);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(100);
    });

    it('全涨高分', () => {
      const idx = calculateFearGreedIndex(0.95, 5, 3, 10);
      expect(idx).toBeGreaterThan(70);
    });

    it('全跌低分', () => {
      const idx = calculateFearGreedIndex(0.05, -5, 0.5, 80);
      expect(idx).toBeLessThan(30);
    });

    it('结果为整数', () => {
      const idx = calculateFearGreedIndex(0.5, 0, 1, 50);
      expect(Number.isInteger(idx)).toBe(true);
    });
  });

  describe('情绪仪表格式化', () => {
    it('包含所有字段', () => {
      const gauge = formatSentimentGauge(50);
      expect(gauge).toHaveProperty('level');
      expect(gauge).toHaveProperty('color');
      expect(gauge).toHaveProperty('label');
      expect(gauge).toHaveProperty('angle');
      expect(gauge).toHaveProperty('description');
    });

    it('指针角度范围', () => {
      expect(formatSentimentGauge(0).angle).toBeCloseTo(-90);
      expect(formatSentimentGauge(100).angle).toBeCloseTo(90);
      expect(formatSentimentGauge(50).angle).toBeCloseTo(0);
    });

    it('有描述文字', () => {
      const gauge = formatSentimentGauge(50);
      expect(gauge.description.length).toBeGreaterThan(0);
    });
  });
});
