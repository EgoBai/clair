import { describe, it, expect } from 'vitest';
import { calculateSMA as calculateMA, calculateEMA } from '../utils/chartDataProcessing';
import { CHART_COLORS } from '../styles/chart-theme';
import { formatAmount } from '../utils/dataTransformUtils';
import { formatComparisonTooltip } from '../utils/chartTooltipFormatter';

/**
 * 数据可视化逻辑测试（影子测试迁移，批次 28a）
 *
 * 已绑定生产实现（唯一真源）：
 * - calculateMA → frontend/src/utils/chartDataProcessing.ts:73 calculateSMA
 *   契约：前 period-1 位为 null（:76-77），i>=period-1 为最近 period 个值的算术平均（:79-80），
 *   不舍入。与影子实现逐字符一致，原断言不变。
 * - calculateEMA → frontend/src/utils/chartDataProcessing.ts:89 calculateEMA
 *   契约：前 period-1 位为 null（:95-96）；i===period-1 用前 period 个值的 SMA 播种（:97-99）；
 *   之后 ema=(data[i]-ema)*2/(period+1)+ema（:101-103），不舍入。
 * - K 线涨跌色 → frontend/src/styles/chart-theme.ts:10 CHART_COLORS，
 *   up '#cf2a2a'（红涨，:12）/ down '#1db468'（绿跌，:13）；KLineChart.tsx:232 用该常量给蜡烛着色。
 * - formatYAxis → frontend/src/utils/dataTransformUtils.ts:45 formatAmount
 *   契约：>=1e12 → toFixed(2)+'万亿'（:46）；>=1e8 → toFixed(2)+'亿'（:47）；
 *   >=1e4 → toFixed(2)+'万'（:48）；否则 toFixed(2)（:49）。
 * - formatTooltipContent → frontend/src/utils/chartTooltipFormatter.ts:130 formatComparisonTooltip
 *   契约：首行日期、次行 '---'（:134），每项 `${name}: ${price.toFixed(2)} (${sign}${change.toFixed(2)}%)`
 *   （:136-137），join('\n')（:139）。本文件适配器只做字段名映射（label→name、value→price、
 *   缺省 change→0）并固定日期夹具，不含任何格式化公式。
 *
 * 旧断言错在哪（旧值 → 生产值 + 生产文件:行号）：
 * 1) EMA：影子实现从 data[0] 起算（ema[0]=10）→ 生产前 period-1 位为 null、period-1 处用 SMA 播种
 *    （chartDataProcessing.ts:95-99）。对 [10,20,30,40,50], period=3：
 *    旧 ema=[10,15,22.5,31.25,40.625] → 生产 [null,null,20,30,40]；
 *    旧断言 ema[0]=10、ema.length=5、ema[4]>ema[0] → 改为 null/null/20、length=5、20/30/40 精确断言。
 * 2) K 线涨跌色：旧 '#ef4444'/'#22c55e'（来自浅色主题 chartTheme.ts LIGHT_COLORS 的 rise/fall，
 *    非 KLineChart 实际配色）→ 生产 KLineChart 使用 styles/chart-theme.ts:12-13 CHART_COLORS.up
 *    '#cf2a2a' / down '#1db468'（KLineChart.tsx:232）。断言改为 CHART_COLORS.up/down，
 *    并新增常量字面量锁定用例（#cf2a2a / #1db468）。
 * 3) formatYAxis：旧 toFixed(1) → 生产 formatAmount 统一 toFixed(2)
 *    （dataTransformUtils.ts:46-48）：'1.5万亿'→'1.50万亿'、'5.0亿'→'5.00亿'、'1.5万'→'1.50万'；
 *    '100.00' 不变（:49）。
 * 4) formatTooltipContent：旧逐项拼 `${label}: ${value.toFixed(2)}`、change 可省略、每行以 '\n' 结尾
 *    → 生产 formatComparisonTooltip 固定「日期 + --- + 每项 name/price/change」，change 必填
 *    （chartTooltipFormatter.ts:130-139）。原 4 条 toContain 断言在生产输出下仍成立，
 *    另加全等断言锁定生产输出 '2024-01-15\n---\n收盘: 105.50 (+2.30%)'。
 *
 * 未迁移（生产无对应导出，保留内联，不改生产）：
 * 1) processKLineForChart 的几何（isUp/bodyHeight/upperShadow/lowerShadow）：生产同口径实现是
 *    frontend/src/utils/workerManager.ts:93-104 computeKLine，但它是 worker 内部函数、未导出，
 *    无法 import；颜色部分已改为绑定 CHART_COLORS。
 * 2) getColorForValue（分档 A 股红涨绿跌色板）：生产 frontend/src/utils/heatmapEngine.ts:60 有同名导出，
 *    但签名是 (value, {colorScheme,minValue,maxValue})、连续 RGB 色带（t<0.5 由 rgb(255,60,60)
 *    过渡到 rgb(60,180,60)，t>=0.5 再到 rgb(60,255,60)，:68-85），与本文件按 ratio 分 5 档的语义不同；
 *    绑定会改变被测契约，故保留并注明差异。
 * 3) getHeatmapColor（7 档涨跌幅色）：生产实现是 MarketHeatmap.tsx:136-157 getHeatColor（13 档
 *    COLOR_STOPS，阈值 9.5/7/5/3/1.5/0.5/0/-0.5/-1.5/-3/-5/-7/-9.5，兜底 #14532d），且未导出；
 *    本文件 7 档色板在生产中无导出对应。
 * 4) formatXAxisDate：生产无图表 X 轴日期格式化导出；chartTooltipFormatter.ts:53-59 的 formatDate
 *    未导出，只支持 MM-DD / YYYY/MM/DD，不支持月线 'YYYY-MM'。
 *
 * 测试名与用例数：原 23 个 it 全部保留（名称未改），新增 3 个（K线色字面量、EMA 短数据、
 * tooltip 全等），共 26 个。
 */
describe('Data Visualization Logic', () => {
  describe('Chart Data Processing', () => {
    interface KLineData { date: string; open: number; close: number; high: number; low: number; volume: number; }

    // 未迁移：几何口径与 frontend/src/utils/workerManager.ts:93-104 computeKLine 一致，但该函数
    // 未导出；涨跌色绑定生产 CHART_COLORS（styles/chart-theme.ts:10-13，KLineChart.tsx:232）。
    function processKLineForChart(data: KLineData[]) {
      return data.map(d => ({
        ...d,
        isUp: d.close >= d.open,
        color: d.close >= d.open ? CHART_COLORS.up : CHART_COLORS.down,
        bodyHeight: Math.abs(d.close - d.open),
        upperShadow: d.high - Math.max(d.open, d.close),
        lowerShadow: Math.min(d.open, d.close) - d.low,
      }));
    }

    it('should process KLine data with correct colors', () => {
      const data: KLineData[] = [
        { date: '2024-01-01', open: 100, close: 105, high: 108, low: 98, volume: 1000 },
        { date: '2024-01-02', open: 105, close: 100, high: 107, low: 99, volume: 1200 },
      ];
      const result = processKLineForChart(data);
      expect(result[0].color).toBe(CHART_COLORS.up); // 生产红涨 #cf2a2a
      expect(result[1].color).toBe(CHART_COLORS.down); // 生产绿跌 #1db468
      expect(result[0].isUp).toBe(true);
      expect(result[1].isUp).toBe(false);
    });

    it('should use production KLine up/down colors', () => {
      expect(CHART_COLORS.up).toBe('#cf2a2a');
      expect(CHART_COLORS.down).toBe('#1db468');
    });

    it('should calculate upper and lower shadows', () => {
      const data: KLineData[] = [
        { date: '2024-01-01', open: 100, close: 105, high: 110, low: 95, volume: 1000 },
      ];
      const result = processKLineForChart(data);
      expect(result[0].upperShadow).toBe(5); // 110 - 105
      expect(result[0].lowerShadow).toBe(5); // 100 - 95
    });

    it('should calculate body height', () => {
      const data: KLineData[] = [
        { date: '2024-01-01', open: 100, close: 105, high: 108, low: 98, volume: 1000 },
        { date: '2024-01-02', open: 108, close: 100, high: 110, low: 98, volume: 1000 },
      ];
      const result = processKLineForChart(data);
      expect(result[0].bodyHeight).toBe(5);
      expect(result[1].bodyHeight).toBe(8);
    });

    it('should calculate MA correctly', () => {
      const data = [10, 20, 30, 40, 50];
      const ma3 = calculateMA(data, 3);
      expect(ma3[0]).toBeNull();
      expect(ma3[1]).toBeNull();
      expect(ma3[2]).toBeCloseTo(20, 1); // (10+20+30)/3
      expect(ma3[3]).toBeCloseTo(30, 1);
      expect(ma3[4]).toBeCloseTo(40, 1);
    });

    it('should calculate EMA correctly', () => {
      const data = [10, 20, 30, 40, 50];
      const ema = calculateEMA(data, 3);
      // 生产：前 2 位 null，第 3 位用前 3 个值的 SMA 播种（chartDataProcessing.ts:95-99）
      expect(ema[0]).toBeNull();
      expect(ema[1]).toBeNull();
      expect(ema[2]).toBe(20);
      expect(ema[3]).toBe(30);
      expect(ema[4]).toBe(40);
      expect(ema.length).toBe(5);
    });

    it('should return nulls for EMA when data shorter than period', () => {
      expect(calculateEMA([10, 20], 3)).toEqual([null, null]);
    });

    it('should handle empty data for MA', () => {
      const ma = calculateMA([], 5);
      expect(ma).toEqual([]);
    });

    it('should handle single data point', () => {
      const data: KLineData[] = [
        { date: '2024-01-01', open: 100, close: 100, high: 100, low: 100, volume: 1000 },
      ];
      const result = processKLineForChart(data);
      expect(result[0].bodyHeight).toBe(0);
      expect(result[0].upperShadow).toBe(0);
      expect(result[0].lowerShadow).toBe(0);
    });
  });

  describe('Color Scale Logic', () => {
    // 未迁移：生产 frontend/src/utils/heatmapEngine.ts:60 同名导出是连续 RGB 色带且签名不同
    // （value, {colorScheme,minValue,maxValue}），bind 会改变被测契约；保留原分档色板并注明差异。
    function getColorForValue(value: number, min: number, max: number): string {
      if (max === min) return '#888888';
      const ratio = (value - min) / (max - min);
      if (ratio > 0.6) return '#ef4444'; // strong positive
      if (ratio > 0.4) return '#f97316'; // moderate positive
      if (ratio > 0.3) return '#eab308'; // slight positive
      if (ratio > 0.2) return '#9ca3af'; // neutral
      return '#22c55e'; // negative
    }

    // 未迁移：生产 MarketHeatmap.tsx:136-157 getHeatColor 为 13 档 COLOR_STOPS 且未导出；
    // 本文件 7 档色板在生产中无导出对应。
    function getHeatmapColor(changePercent: number): string {
      if (changePercent >= 5) return '#dc2626';
      if (changePercent >= 3) return '#ef4444';
      if (changePercent >= 1) return '#f97316';
      if (changePercent >= 0) return '#fbbf24';
      if (changePercent >= -1) return '#86efac';
      if (changePercent >= -3) return '#22c55e';
      return '#15803d';
    }

    it('should return red for high values', () => {
      expect(getColorForValue(90, 0, 100)).toBe('#ef4444');
    });

    it('should return green for low values', () => {
      expect(getColorForValue(10, 0, 100)).toBe('#22c55e');
    });

    it('should handle equal min/max', () => {
      expect(getColorForValue(50, 50, 50)).toBe('#888888');
    });

    it('should get heatmap color for positive change', () => {
      expect(getHeatmapColor(5)).toBe('#dc2626');
      expect(getHeatmapColor(3)).toBe('#ef4444');
      expect(getHeatmapColor(1)).toBe('#f97316');
      expect(getHeatmapColor(0.5)).toBe('#fbbf24');
    });

    it('should get heatmap color for negative change', () => {
      expect(getHeatmapColor(-5)).toBe('#15803d');
      expect(getHeatmapColor(-2)).toBe('#22c55e');
      expect(getHeatmapColor(-0.5)).toBe('#86efac');
    });

    it('should get heatmap color for zero', () => {
      expect(getHeatmapColor(0)).toBe('#fbbf24');
    });
  });

  describe('Axis Formatting Logic', () => {
    // 已绑定生产：frontend/src/utils/dataTransformUtils.ts:45 formatAmount
    const formatYAxis = formatAmount;

    // 未迁移：生产无图表 X 轴日期格式化导出（chartTooltipFormatter.ts:53-59 formatDate 未导出，
    // 且不支持月线 'YYYY-MM'），保留原实现。
    function formatXAxisDate(dateStr: string, period: string): string {
      if (period === '1d' || period === 'day') return dateStr.slice(5);
      if (period === '1w' || period === 'week') return dateStr.slice(5);
      return dateStr.slice(0, 7);
    }

    it('should format large numbers with 万亿', () => {
      expect(formatYAxis(1.5e12)).toBe('1.50万亿');
    });

    it('should format medium numbers with 亿', () => {
      expect(formatYAxis(5e8)).toBe('5.00亿');
    });

    it('should format small numbers with 万', () => {
      expect(formatYAxis(15000)).toBe('1.50万');
    });

    it('should format tiny numbers as is', () => {
      expect(formatYAxis(100)).toBe('100.00');
    });

    it('should format daily dates', () => {
      expect(formatXAxisDate('2024-01-15', 'day')).toBe('01-15');
    });

    it('should format monthly dates', () => {
      expect(formatXAxisDate('2024-01-15', 'month')).toBe('2024-01');
    });
  });

  describe('Tooltip Logic', () => {
    // 已绑定生产：frontend/src/utils/chartTooltipFormatter.ts:130 formatComparisonTooltip。
    // 适配器只做字段映射与固定日期夹具，格式化全部由生产完成。
    const TOOLTIP_DATE_FIXTURE = '2024-01-15';
    function formatTooltipContent(data: { label: string; value: number; change?: number }[]): string {
      return formatComparisonTooltip(
        TOOLTIP_DATE_FIXTURE,
        data.map(item => ({ name: item.label, price: item.value, change: item.change ?? 0 })),
      );
    }

    it('should format tooltip with values', () => {
      const content = formatTooltipContent([{ label: '收盘', value: 105.5 }]);
      expect(content).toContain('收盘');
      expect(content).toContain('105.50');
    });

    it('should format tooltip with change', () => {
      const content = formatTooltipContent([{ label: '涨跌', value: 5.5, change: 2.3 }]);
      expect(content).toContain('+2.30%');
    });

    it('should format negative change', () => {
      const content = formatTooltipContent([{ label: '涨跌', value: -3.2, change: -1.5 }]);
      expect(content).toContain('-1.50%');
    });

    it('should handle multiple items', () => {
      const content = formatTooltipContent([
        { label: '开', value: 100 },
        { label: '高', value: 110 },
        { label: '低', value: 95 },
      ]);
      expect(content.split('\n').length).toBeGreaterThan(2);
    });

    it('should match production comparison tooltip format', () => {
      const content = formatTooltipContent([{ label: '收盘', value: 105.5, change: 2.3 }]);
      expect(content).toBe('2024-01-15\n---\n收盘: 105.50 (+2.30%)');
    });
  });
});
