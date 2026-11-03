/**
 * 影子测试迁移（批次 19）
 *
 * 股票详情页逻辑测试：覆盖涨跌颜色、成交量/成交额格式化、自选股判断、K线数据转换、
 * 子指标白名单、股票代码解析。
 *
 * 旧文件在测试内自抄了 7 组实现（只 import vitest），断言的是副本而不是产品。本批把其中
 * 3 组改为 import 生产实现。
 *
 * 已绑定生产实现（frontend/src/utils/formatters.ts，页面消费层）：
 * - getColorByChange → frontend/src/utils/formatters.ts:228（正 #ef4444 / 负 #22c55e / 平盘 #6b7280）
 * - formatVolume     → frontend/src/utils/formatters.ts:37 （亿手 / 万手 / 手）
 * - formatTurnover   → frontend/src/utils/formatters.ts:48 （亿 / 万 / 原值）
 *
 * 为什么选 formatters.ts 而不是其它同名实现：
 * - frontend/src/utils/bloombergExportEngine.ts:184/193 与 exportEngine.ts:493/505 是导出/报表侧
 *   口径（前者不带「手」、后者带「手」），不是页面展示层；
 * - shared/formatters.ts:31/41 与 frontend/src/utils/formatters.ts 长期分叉，且 src 无消费方
 *   （只有测试 import）；
 * - 详情页 StockDetailPage.tsx:141-153 自带未导出的本地 formatVolume/formatTurnover（无「手」、
 *   万级 toFixed(2)、缺值 '-'），无法 import，列入下方「生产缺口/分叉候选」。
 *
 * 旧断言错在哪（旧值 → 生产值）：
 *
 * | 用例 | 旧值 | 生产值 | 依据 |
 * | --- | --- | --- | --- |
 * | getColorByChange(0)（旧名 getChangeColor） | '#ef4444' | '#6b7280' | formatters.ts:229 平盘走 neutral |
 * | formatVolume(1.5e8) | '1.50亿' | '1.50亿手' | formatters.ts:38 成交量统一带「手」 |
 * | formatVolume(10e8) | '10.00亿' | '10.00亿手' | formatters.ts:38 |
 * | formatVolume(50000) | '5万' | '5.00万手' | formatters.ts:39 万级 toFixed(2)（旧 toFixed(0)） |
 * | formatVolume(500) | '500' | '500手' | formatters.ts:40 |
 * | formatVolume(0) | '0' | '0手' | formatters.ts:40（生产无 0 值特判） |
 * | formatVolume(undefined) | '0' | 'undefined手' | 生产缺口：无缺值守卫（批次 10 已报告） |
 * | formatTurnover(150000) | '15万' | '15.00万' | formatters.ts:50 万级 toFixed(2) |
 *
 * 未迁移——生产无对应导出（保留本地 helper，理由见各 helper 旁注释）：
 * - isInWatchlist：生产只有 zustand store selector（store/useStockStore.ts:351 对 string[] 用
 *   includes；store/useAppStore.ts:235 才对 {symbol}[] 用 some），依赖全局状态，非纯函数；
 * - quotesToKlines：全仓无该导出（grep 仅测试命中）；
 * - isValidIndicator：无运行时校验导出，SubIndicator 类型只在未导出的
 *   components/Charts/KLineChart.tsx:34-45 里，且页面 useState 无 'none'；
 * - parseSymbol：前端无导出；相似规则在其它包（backend/src/services/multiSignalEngine.ts:35-37、
 *   data-collector/src/collectors/base.ts:161-163），包边界与语义不同。
 *
 * 生产缺口/分叉候选（只报告，不改生产）：
 * - formatVolume/formatTurnover 无 null/undefined 入参守卫；formatTurnover(undefined) 会抛
 *   TypeError（不是返回字符串）。
 * - StockDetailPage.tsx:141-153 仍自带未导出的成交量/成交额格式化副本，与统一 formatter 分叉
 *   （无「手」、缺值 '-'），页面并未复用本文件绑定的实现。
 */

import { describe, it, expect } from 'vitest';
import { formatTurnover, formatVolume, getColorByChange } from '../utils/formatters';

describe('股票详情页逻辑', () => {
  describe('涨跌颜色', () => {
    it('上涨为红色', () => {
      expect(getColorByChange(5.0)).toBe('#ef4444');
      expect(getColorByChange(0.01)).toBe('#ef4444');
    });

    it('平盘为灰色（旧断言「平盘为红色」为自抄口径，生产 0 走 neutral）', () => {
      expect(getColorByChange(0)).toBe('#6b7280');
    });

    it('下跌为绿色', () => {
      expect(getColorByChange(-3.5)).toBe('#22c55e');
      expect(getColorByChange(-0.01)).toBe('#22c55e');
    });
  });

  describe('成交量格式化', () => {
    it('亿级成交量', () => {
      expect(formatVolume(1.5e8)).toBe('1.50亿手');
      expect(formatVolume(10e8)).toBe('10.00亿手');
    });

    it('万级成交量', () => {
      // 生产万级 toFixed(2)；旧自抄版 toFixed(0) 得 '5万'。
      expect(formatVolume(50000)).toBe('5.00万手');
    });

    it('小成交量', () => {
      expect(formatVolume(500)).toBe('500手');
    });

    it('零成交量', () => {
      expect(formatVolume(0)).toBe('0手');
    });

    it('缺值按生产现状固化（生产缺口：无 null/undefined 守卫）', () => {
      // 生产缺口：formatVolume 无缺值分支，undefined 被原样拼进字符串（批次 10 已报告）；
      // 旧自抄版返回 '0'。生产补守卫后此断言应改为 '-'。
      expect(formatVolume(undefined as unknown as number)).toBe('undefined手');
    });
  });

  describe('成交额格式化', () => {
    it('亿级成交额', () => {
      expect(formatTurnover(2.3e8)).toBe('2.30亿');
    });

    it('万级成交额', () => {
      // 生产万级 toFixed(2)；旧自抄版 toFixed(0) 得 '15万'。
      expect(formatTurnover(150000)).toBe('15.00万');
    });

    it('小额成交额', () => {
      // 生产小于 1e4 走 turnover.toString()，旧自抄版相同，补一条钉住口径。
      expect(formatTurnover(500)).toBe('500');
    });
  });

  describe('自选股判断', () => {
    // 未迁移：生产无对应导出——只有 zustand store selector（useStockStore.ts:351 /
    // useAppStore.ts:235），依赖全局状态，不是纯函数；页面用 watchlist.includes(symbol)。
    function isInWatchlist(symbol: string, watchlist: { symbol: string }[]): boolean {
      return watchlist.some(s => s.symbol === symbol);
    }

    it('已在自选股中', () => {
      const list = [{ symbol: '600519' }, { symbol: '000858' }];
      expect(isInWatchlist('600519', list)).toBe(true);
    });

    it('不在自选股中', () => {
      const list = [{ symbol: '600519' }];
      expect(isInWatchlist('000858', list)).toBe(false);
    });

    it('空自选股列表', () => {
      expect(isInWatchlist('600519', [])).toBe(false);
    });
  });

  describe('K线数据转换', () => {
    interface Quote {
      date: string;
      open: number;
      close: number;
      high: number;
      low: number;
      volume: number;
    }

    interface KLineData {
      date: string;
      open: number;
      close: number;
      high: number;
      low: number;
      volume: number;
    }

    // 未迁移：全仓无 quotesToKlines 导出（grep 仅测试命中），页面直接内联映射，没有可 import
    // 的纯函数；保留本地 helper 只作为字段映射契约的回归用例。
    function quotesToKlines(quotes: Quote[]): KLineData[] {
      return quotes.map(q => ({
        date: q.date,
        open: q.open,
        close: q.close,
        high: q.high,
        low: q.low,
        volume: q.volume,
      }));
    }

    it('应正确转换K线数据', () => {
      const quotes: Quote[] = [
        { date: '2024-01-02', open: 100, close: 105, high: 108, low: 99, volume: 100000 },
        { date: '2024-01-03', open: 105, close: 103, high: 107, low: 102, volume: 80000 },
      ];
      const klines = quotesToKlines(quotes);
      expect(klines).toHaveLength(2);
      expect(klines[0].date).toBe('2024-01-02');
      expect(klines[0].close).toBe(105);
      expect(klines[1].high).toBe(107);
    });

    it('空数据应返回空数组', () => {
      expect(quotesToKlines([])).toEqual([]);
    });
  });

  describe('指标切换', () => {
    type SubIndicator = 'volume' | 'macd' | 'kdj' | 'rsi' | 'none';
    const validIndicators: SubIndicator[] = ['volume', 'macd', 'kdj', 'rsi', 'none'];

    // 未迁移：生产无运行时白名单校验导出；SubIndicator 类型只存在于未导出的
    // components/Charts/KLineChart.tsx:34-45（KLineChartProps.subIndicator），页面 useState
    // 也没有 'none' 档，没有可 import 的同签名函数。
    function isValidIndicator(val: string): val is SubIndicator {
      return validIndicators.includes(val as SubIndicator);
    }

    it('应识别有效指标', () => {
      for (const ind of validIndicators) {
        expect(isValidIndicator(ind)).toBe(true);
      }
    });

    it('应拒绝无效指标', () => {
      expect(isValidIndicator('invalid')).toBe(false);
      expect(isValidIndicator('')).toBe(false);
    });
  });

  describe('股票代码解析', () => {
    // 未迁移：前端无 parseSymbol 导出；相似规则在 backend/src/services/multiSignalEngine.ts:35-37
    // 与 data-collector/src/collectors/base.ts:161-163（跨包、口径不同），不跨包绑定。
    function parseSymbol(symbol: string): { market: string; code: string } {
      if (symbol.startsWith('6')) return { market: 'SH', code: symbol };
      if (symbol.startsWith('0') || symbol.startsWith('3')) return { market: 'SZ', code: symbol };
      if (symbol.startsWith('8') || symbol.startsWith('4')) return { market: 'BJ', code: symbol };
      return { market: 'UNKNOWN', code: symbol };
    }

    it('6开头为上海', () => {
      expect(parseSymbol('600519')).toEqual({ market: 'SH', code: '600519' });
    });

    it('0开头为深圳', () => {
      expect(parseSymbol('000858')).toEqual({ market: 'SZ', code: '000858' });
    });

    it('3开头为深圳创业板', () => {
      expect(parseSymbol('300750')).toEqual({ market: 'SZ', code: '300750' });
    });

    it('8/4开头为北京', () => {
      expect(parseSymbol('830000')).toEqual({ market: 'BJ', code: '830000' });
    });
  });
});
