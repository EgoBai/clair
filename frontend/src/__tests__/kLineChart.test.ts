import { describe, it, expect } from 'vitest';
import { calculateSMA, calculateEMA, aggregateTicksToCandle } from '../utils/chartDataProcessing';
import { formatVolume, formatTurnover, formatChangePercent } from '../utils/formatters';
import { detectCrossovers } from '../utils/trendFollowingEngine';
import type { MAValues } from '../utils/trendFollowingEngine';
import { CHART_COLORS, KLINE_CONFIG } from '../styles/chart-theme';

/**
 * K线图组件逻辑测试（影子测试迁移，批次 26b）
 *
 * 已绑定生产实现（唯一真源）：
 * - 原 calculateMA → frontend/src/utils/chartDataProcessing.ts:73 calculateSMA
 *   契约：null 预热，sum/period，不舍入（原影子实现额外 toFixed(2)）。
 * - 原 calculateEMA → frontend/src/utils/chartDataProcessing.ts:89 calculateEMA
 *   契约：period-1 位 null，前 period 个值的 SMA 播种，multiplier=2/(period+1)，不舍入（:97-103）。
 * - 原 formatVolume → frontend/src/utils/formatters.ts:37 formatVolume（与影子实现逐字符一致）。
 * - 原 formatTurnover → frontend/src/utils/formatters.ts:48 formatTurnover（与影子实现逐字符一致）。
 * - OHLC 聚合 → frontend/src/utils/chartDataProcessing.ts:20 aggregateTicksToCandle
 *   契约：按 floor(timestamp/intervalMs)*intervalMs 分桶；open=桶内首 tick、close=末 tick、high/low 极值、
 *   volume 求和，按 timestamp 升序（:26-47）。
 * - 涨跌幅格式化 → frontend/src/utils/formatters.ts:148 formatChangePercent（带正负号）。
 * - 阳/阴线颜色 → frontend/src/styles/chart-theme.ts:10 CHART_COLORS（up #cf2a2a 红涨 / down #1db468 绿跌）
 *   与 :74 KLINE_CONFIG（itemStyle.color=up、color0=down）。
 * - 均线交叉信号 → frontend/src/utils/trendFollowingEngine.ts:113 detectCrossovers
 *   契约：遍历 ma5/ma10、ma5/ma20、ma10/ma20、ma20/ma60、ma60/ma120；金叉 prev[short] <= prev[long]
 *   && curr[short] > curr[long]（:134-146），死叉反之（:149-161），NaN 跳过；strength=min(100, round(spread*20+50))。
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * 1) calculateMA 旧 parseFloat(toFixed(2)) 舍入 → 生产不四舍五入（chartDataProcessing.ts:73-84）；
 *    MA5 [10..16] 旧只断言 index4/5 → 生产完整为 [null,null,null,null,12,13,14]。
 * 2) calculateEMA 旧 toFixed(2) 舍入 → 生产不舍入；EMA12 对 100..119：index11 = 105.5、index12 ≈ 106.5
 *    （chartDataProcessing.ts:97-103），旧断言只校验 index11 非 null。
 * 3) formatVolume/formatTurnover 旧仅 toContain 关键词 → 绑定 formatters.ts 后收紧为全等
 *    （如 150000000 → '1.50亿手'、2e8 → '2.00亿'）。
 * 4) 涨跌幅：旧 (close-open)/open*100 后 toFixed(2) 得 '10.00' → 生产 formatChangePercent 带正号
 *    （formatters.ts:148-152），10 → '+10.00%'；跌 9.09% → '-9.09%'。
 * 5) 均线交叉：旧内联布尔 → 生产 detectCrossovers 返回结构化 TrendSignal；旧「非交叉」用例断言却是
 *    true（prev5 === prev10 && curr5 > curr10 按生产口径就是金叉），改名为「前值相等仍判金叉」并断言真实信号。
 *
 * 未迁移（生产无对应导出，保留内联）：
 * - KLineChart.tsx 的 OHLC 提取、阳/阴判定与涨跌幅算术为组件内联逻辑（涨跌幅计算未导出；:499 起仅
 *   calculateMA/calculateEMA/formatVolume/formatTurnover 为模块私有），故「close >= open 判定」与
 *   涨跌幅算式保留内联，仅聚合、符号格式化与颜色取生产实现。
 */

interface KLineData {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
}

// 固定时间戳（聚合桶边界，60000ms 的整数倍），保证夹具确定性
const T0 = 1700000040000;

type MARow = MAValues & { date: string; close: number };

function maRow(partial: { date: string; close: number } & Partial<MAValues>): MARow {
  return {
    date: partial.date,
    close: partial.close,
    ma5: partial.ma5 ?? NaN,
    ma10: partial.ma10 ?? NaN,
    ma20: partial.ma20 ?? NaN,
    ma60: partial.ma60 ?? NaN,
    ma120: partial.ma120 ?? NaN,
    ma250: partial.ma250 ?? NaN,
  };
}

describe('K线图计算函数', () => {
  describe('MA均线计算（原 calculateMA）', () => {
    it('MA5应该正确计算', () => {
      const prices = [10, 11, 12, 13, 14, 15, 16];
      const ma5 = calculateSMA(prices, 5);
      expect(ma5).toEqual([null, null, null, null, 12, 13, 14]);
    });

    it('MA10对不足数据应该返回null', () => {
      const prices = [1, 2, 3, 4, 5];
      const ma10 = calculateSMA(prices, 10);
      expect(ma10.every(v => v === null)).toBe(true);
    });

    it('等值数据的MA应该等于该值', () => {
      const prices = Array(10).fill(100);
      const ma5 = calculateSMA(prices, 5);
      for (let i = 4; i < 10; i++) {
        expect(ma5[i]).toBe(100);
      }
    });

    it('单个数据点的MA1应该等于自身', () => {
      const prices = [42];
      const ma1 = calculateSMA(prices, 1);
      expect(ma1[0]).toBe(42);
    });

    it('不应该四舍五入（旧实现 toFixed(2)）', () => {
      const ma3 = calculateSMA([10, 20, 31], 3);
      expect(ma3[2]).toBeCloseTo(61 / 3, 10);
      expect(ma3[2]).not.toBe(20.33);
    });
  });

  describe('EMA指数移动平均（原 calculateEMA）', () => {
    it('EMA12应该正确计算', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const ema12 = calculateEMA(prices, 12);
      expect(ema12).toHaveLength(20);
      expect(ema12[0]).toBeNull(); // 前11个为null
      expect(ema12[10]).toBeNull();
      expect(ema12[11]).toBe(105.5); // 前12个值的SMA播种
      expect(ema12[12]).toBeCloseTo(106.5, 10); // 105.5 + (112-105.5)*2/13
    });

    it('EMA应该比MA更快速响应价格变化', () => {
      const prices = [10, 10, 10, 10, 10, 20, 20, 20, 20, 20];
      const ma5 = calculateSMA(prices, 5);
      const ema5 = calculateEMA(prices, 5);
      // EMA在价格跳变后反应更快
      expect(ma5[5]).toBe(12);
      expect(ema5[5]).toBeCloseTo(10 + (20 - 10) * (2 / 6), 12);
      expect(ema5[5]!).toBeGreaterThan(ma5[5]!);
    });

    it('等值数据的EMA应该等于该值', () => {
      const prices = Array(15).fill(50);
      const ema5 = calculateEMA(prices, 5);
      for (let i = 4; i < 15; i++) {
        expect(ema5[i]).toBe(50);
      }
    });
  });

  describe('成交量格式化（→ formatters.formatVolume）', () => {
    it('大于1亿应该显示亿手', () => {
      expect(formatVolume(150000000)).toBe('1.50亿手');
    });

    it('大于1万但小于1亿应该显示万手', () => {
      expect(formatVolume(50000)).toBe('5.00万手');
    });

    it('小于1万应该直接显示手', () => {
      expect(formatVolume(999)).toBe('999手');
    });

    it('正好1亿应该显示亿手', () => {
      expect(formatVolume(1e8)).toBe('1.00亿手');
    });

    it('正好1万应该显示万手', () => {
      expect(formatVolume(1e4)).toBe('1.00万手');
    });
  });

  describe('成交额格式化（→ formatters.formatTurnover）', () => {
    it('大于1亿应该显示亿', () => {
      expect(formatTurnover(2e8)).toBe('2.00亿');
    });

    it('大于1万但小于1亿应该显示万', () => {
      expect(formatTurnover(50000)).toBe('5.00万');
    });

    it('小于1万应该直接显示数字', () => {
      expect(formatTurnover(999)).toBe('999');
    });
  });

  describe('K线数据处理（部分迁移：aggregateTicksToCandle / chart-theme）', () => {
    it('应该正确提取OHLC数据', () => {
      // 两个 1 分钟桶，乱序传入以验证按 timestamp 升序输出
      const ticks = [
        { price: 11.2, volume: 2000, timestamp: T0 + 60000 },
        { price: 10.5, volume: 1000, timestamp: T0 },
        { price: 10.8, volume: 1500, timestamp: T0 + 2000 },
      ];
      const candles = aggregateTicksToCandle(ticks, 60000);

      expect(candles).toHaveLength(2);
      expect(candles[0].timestamp).toBe(T0);
      expect(candles[0].open).toBe(10.5);
      expect(candles[0].high).toBe(10.8);
      expect(candles[0].low).toBe(10.5);
      expect(candles[0].close).toBe(10.8);
      expect(candles[0].volume).toBe(2500);
      expect(candles[1].timestamp).toBe(T0 + 60000);
      expect(candles[1].open).toBe(11.2);
      expect(candles[1].close).toBe(11.2);
      expect(candles[1].volume).toBe(2000);
    });

    it('阳线 close >= open 且使用红涨配置', () => {
      const [candle] = aggregateTicksToCandle([
        { price: 10, volume: 100, timestamp: T0 },
        { price: 11, volume: 100, timestamp: T0 + 1000 },
      ], 60000);
      expect(candle.close >= candle.open).toBe(true);
      expect(CHART_COLORS.up).toBe('#cf2a2a');
      expect(KLINE_CONFIG.itemStyle.color).toBe(CHART_COLORS.up);
    });

    it('阴线 close < open 且使用绿跌配置', () => {
      const [candle] = aggregateTicksToCandle([
        { price: 11, volume: 100, timestamp: T0 },
        { price: 10, volume: 100, timestamp: T0 + 1000 },
      ], 60000);
      expect(candle.close < candle.open).toBe(true);
      expect(CHART_COLORS.down).toBe('#1db468');
      expect(KLINE_CONFIG.itemStyle.color0).toBe(CHART_COLORS.down);
    });

    it('涨跌幅计算应该正确', () => {
      const data: KLineData = {
        tradeDate: '2024-01-15',
        open: 10,
        close: 11,
        high: 11.5,
        low: 9.5,
        volume: 1000000,
        turnover: 10500000,
      };
      const changePercent = ((data.close - data.open) / data.open) * 100;
      expect(formatChangePercent(changePercent)).toBe('+10.00%');
    });

    it('跌幅应该为负数', () => {
      const data: KLineData = {
        tradeDate: '2024-01-15',
        open: 11,
        close: 10,
        high: 11.5,
        low: 9.5,
        volume: 1000000,
        turnover: 10500000,
      };
      const changePercent = ((data.close - data.open) / data.open) * 100;
      expect(formatChangePercent(changePercent)).toBe('-9.09%');
    });
  });

  describe('均线交叉信号（→ trendFollowingEngine.detectCrossovers）', () => {
    it('金叉: MA5从下方穿过MA10', () => {
      const signals = detectCrossovers([
        maRow({ date: '2024-01-01', close: 10, ma5: 9.5, ma10: 10 }),
        maRow({ date: '2024-01-02', close: 11.5, ma5: 10.5, ma10: 10 }),
      ]);

      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('golden_cross');
      expect(signals[0].ma).toBe('ma5');
      expect(signals[0].direction).toBe('bullish');
      expect(signals[0].price).toBe(11.5);
      expect(signals[0].maValue).toBe(10);
      expect(signals[0].strength).toBe(100); // spread 5% → round(5*20+50) 后钳制到 100
      expect(signals[0].description).toContain('5/10日线金叉');
    });

    it('死叉: MA5从上方穿过MA10', () => {
      const signals = detectCrossovers([
        maRow({ date: '2024-01-01', close: 10, ma5: 11, ma10: 10 }),
        maRow({ date: '2024-01-02', close: 9, ma5: 9.5, ma10: 10 }),
      ]);

      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('death_cross');
      expect(signals[0].ma).toBe('ma5');
      expect(signals[0].direction).toBe('bearish');
      expect(signals[0].price).toBe(9);
      expect(signals[0].description).toContain('5/10日线死叉');
    });

    it('前值相等、当前上穿：生产口径仍判为金叉', () => {
      const signals = detectCrossovers([
        maRow({ date: '2024-01-01', close: 10, ma5: 10, ma10: 10 }),
        maRow({ date: '2024-01-02', close: 10.5, ma5: 10.5, ma10: 10 }),
      ]);

      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('golden_cross');
    });
  });
});
