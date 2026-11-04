/**
 * 生产绑定（M2 影子治理批次 40b）
 *
 * 绑定 import 与选型理由：
 * 1. utils/chartDataProcessing.ts:20/53/73/89/111/145 — 图表专用唯一实现。
 *    Bollinger 返回 Array<{upper,middle,lower}|null>（旧内联是 {upper[],middle[],lower[]}，
 *    形状不同故按索引读取；不足周期为 null 而非 NaN）。EMA 是「不足周期 null + 第 period 根用 SMA 种子」口径。
 * 2. utils/featureEngineeringEngine.ts:45/85/172 — ML 特征口径。EMA 无 null 填充、从首值起算，
 *    与 chartDataProcessing.calculateEMA 同名不同口径，单独用例固化差异。
 * 3. utils/chartPatternEngine.ts:136/151 — 唯一形态识别/支撑阻力实现。
 * 4. utils/chartInteractionEngine.ts:390/617 — 唯一 tooltip 定位与 data→screen 映射；
 *    生产无 placement 字段，旧断言据此订正为坐标。
 * 5. utils/dataTransformUtils.ts:74 — 涨跌色归类的生产实现；色值单一来源 styles/chart-theme.ts:10。
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateTicksToCandle,
  downsampleData,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
} from '../utils/chartDataProcessing';
import {
  calculateEMA as calculateFeatureEMA,
  calculateMACD,
  calculateVWAP,
} from '../utils/featureEngineeringEngine';
import { detectPatterns, findSupportResistance } from '../utils/chartPatternEngine';
import type { OHLCV as PatternOHLCV } from '../utils/chartPatternEngine';
import { calculateTooltipPosition, createViewport, dataToScreen } from '../utils/chartInteractionEngine';
import { transformStock } from '../utils/dataTransformUtils';
import type { RawStockData } from '../utils/dataTransformUtils';
import { CHART_COLORS, KLINE_CONFIG } from '../styles/chart-theme';

// 金融图表数据处理
describe('金融图表数据处理', () => {

  // K线数据标准化
  // 生产无同契约导出：rg 全库无 normalizeKLine / 涨跌幅归一函数；
  // utils/dataTransformUtils.ts:74 transformStock 只算 amplitude 与 color，无 change/changePercent/isUp。
  // 因此保留内联规格。
  describe('K线数据标准化', () => {
    interface RawKLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

    function normalizeKLine(raw: RawKLine[]): { date: string; open: number; high: number; low: number; close: number; volume: number; change: number; changePercent: number; amplitude: number; isUp: boolean }[] {
      return raw.map((k, i) => {
        const prevClose = i > 0 ? raw[i - 1].close : k.open;
        const change = k.close - prevClose;
        const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
        const amplitude = prevClose !== 0 ? ((k.high - k.low) / prevClose) * 100 : 0;
        return { ...k, change, changePercent, amplitude, isUp: change >= 0 };
      });
    }

    it('应正确计算涨跌幅', () => {
      const data: RawKLine[] = [
        { date: '2026-01-01', open: 100, high: 105, low: 98, close: 103, volume: 1000 },
        { date: '2026-01-02', open: 103, high: 108, low: 102, close: 106, volume: 1200 },
      ];
      const result = normalizeKLine(data);
      expect(result[1].change).toBe(3);
      expect(result[1].changePercent).toBeCloseTo(2.91, 1);
    });

    it('应正确判断涨跌', () => {
      const data: RawKLine[] = [
        { date: '2026-01-01', open: 100, high: 105, low: 98, close: 103, volume: 1000 },
        { date: '2026-01-02', open: 103, high: 108, low: 102, close: 106, volume: 1200 },
        { date: '2026-01-03', open: 106, high: 107, low: 100, close: 101, volume: 800 },
      ];
      const result = normalizeKLine(data);
      expect(result[1].isUp).toBe(true);
      expect(result[2].isUp).toBe(false);
    });

    it('应正确计算振幅', () => {
      const data: RawKLine[] = [{ date: '2026-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 }];
      const result = normalizeKLine(data);
      expect(result[0].amplitude).toBeCloseTo(20, 0);
    });

    it('首日涨跌基于开盘价', () => {
      const data: RawKLine[] = [{ date: '2026-01-01', open: 100, high: 105, low: 98, close: 103, volume: 1000 }];
      const result = normalizeKLine(data);
      expect(result[0].change).toBe(3);
    });

    it('空数据返回空数组', () => {
      expect(normalizeKLine([])).toHaveLength(0);
    });

    it('成交量应保留原始值', () => {
      const data: RawKLine[] = [{ date: '2026-01-01', open: 100, high: 105, low: 98, close: 103, volume: 9999 }];
      expect(normalizeKLine(data)[0].volume).toBe(9999);
    });
  });

  // 均线带计算
  // 绑定生产：utils/chartDataProcessing.ts:145 calculateBollingerBands
  // 选型：唯一 (closes, period, stdMultiplier) 图表实现，中轨=SMA、标准差用总体方差（/period）。
  // 同名不同口径：utils/featureEngineeringEngine.ts:104 返回并列数组 + NaN 填充，本段不用它。
  describe('均线带计算', () => {
    it('上下轨应包围中轨', () => {
      const prices = [100, 102, 98, 104, 96, 106, 94, 108, 92, 110];
      const bands = calculateBollingerBands(prices, 5, 2);
      for (let i = 4; i < prices.length; i++) {
        expect(bands[i]?.upper ?? NaN).toBeGreaterThan(bands[i]?.middle ?? NaN);
        expect(bands[i]?.lower ?? NaN).toBeLessThan(bands[i]?.middle ?? NaN);
      }
    });

    it('带宽应为正数', () => {
      const prices = [100, 105, 95, 110, 90, 115];
      const bands = calculateBollingerBands(prices, 3, 2);
      for (let i = 2; i < prices.length; i++) {
        expect((bands[i]?.upper ?? NaN) - (bands[i]?.lower ?? NaN)).toBeGreaterThan(0);
      }
    });

    it('平坦价格带宽应窄', () => {
      const prices = [100, 100, 100, 100, 100];
      const bands = calculateBollingerBands(prices, 3, 2);
      expect((bands[4]?.upper ?? NaN) - (bands[4]?.lower ?? NaN)).toBeCloseTo(0, 5);
    });

    it('不足周期为null（旧断言误作NaN）', () => {
      // 旧断言错在：假设不足周期会填充 NaN；chartDataProcessing.ts:153-154 实际返回 null。
      const bands = calculateBollingerBands([100, 101], 5, 2);
      expect(bands[0]).toBeNull();
    });

    it('空数据返回空数组', () => {
      const bands = calculateBollingerBands([], 5, 2);
      expect(bands).toHaveLength(0);
    });
  });

  // K线聚合与降采样
  // 绑定生产：utils/chartDataProcessing.ts:20 aggregateTicksToCandle / :53 downsampleData
  describe('K线聚合与降采样', () => {
    it('应按时间桶聚合tick为K线', () => {
      const ticks = [
        { price: 10, volume: 100, timestamp: 1000 },
        { price: 11, volume: 200, timestamp: 1500 },
        { price: 9, volume: 300, timestamp: 2500 },
        { price: 12, volume: 400, timestamp: 3000 },
      ];
      const candles = aggregateTicksToCandle(ticks, 2000);
      expect(candles).toHaveLength(2);
      expect(candles[0].timestamp).toBe(0);
      expect(candles[0].open).toBe(10);
      expect(candles[0].high).toBe(11);
      expect(candles[0].low).toBe(10);
      expect(candles[0].close).toBe(11);
      expect(candles[0].volume).toBe(300);
      expect(candles[1].volume).toBe(700);
    });

    it('空tick返回空数组', () => {
      expect(aggregateTicksToCandle([], 1000)).toHaveLength(0);
    });

    it('降采样应限制点数', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ timestamp: i }));
      const sampled = downsampleData(data, 10);
      expect(sampled).toHaveLength(10);
      expect(sampled[0].timestamp).toBe(0);
      expect(sampled[9].timestamp).toBe(90);
    });

    it('未超上限时原样返回', () => {
      const data = [{ timestamp: 1 }, { timestamp: 2 }];
      expect(downsampleData(data, 5)).toBe(data);
    });
  });

  // 技术指标
  // 绑定生产：utils/chartDataProcessing.ts:73 calculateSMA / :89 calculateEMA / :111 calculateRSI
  describe('技术指标（生产口径）', () => {
    it('SMA 前 period-1 为 null', () => {
      const sma = calculateSMA([1, 2, 3, 4], 3);
      expect(sma[0]).toBeNull();
      expect(sma[1]).toBeNull();
    });

    it('SMA 第 period 个为窗口均值', () => {
      const sma = calculateSMA([1, 2, 3, 4], 3);
      expect(sma[2]).toBe(2);
      expect(sma[3]).toBe(3);
    });

    it('EMA 以 SMA 为种子递推', () => {
      expect(calculateEMA([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
    });

    it('EMA 不足周期为 null', () => {
      expect(calculateEMA([1, 2], 3)).toEqual([null, null]);
    });

    it('RSI 连续上涨为100', () => {
      const rsi = calculateRSI([1, 2, 3, 4, 5], 3);
      expect(rsi[3]).toBe(100);
      expect(rsi[4]).toBe(100);
    });

    it('RSI 连续下跌为0', () => {
      const rsi = calculateRSI([10, 9, 8, 7, 6], 3);
      expect(rsi[3]).toBe(0);
    });

    it('RSI 数据不足全部为 null', () => {
      expect(calculateRSI([1, 2, 3], 3)).toEqual([null, null, null]);
    });
  });

  // 特征工程指标
  // 绑定生产：utils/featureEngineeringEngine.ts:45 calculateEMA / :85 calculateMACD / :172 calculateVWAP
  describe('特征工程指标（生产口径）', () => {
    it('EMA 从首值起算且无 null 填充', () => {
      expect(calculateFeatureEMA([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2.25, 3.125, 4.0625]);
    });

    it('EMA 与 chartDataProcessing 同名不同口径', () => {
      const chartEma = calculateEMA([1, 2, 3, 4], 3);
      const featureEma = calculateFeatureEMA([1, 2, 3, 4], 3);
      expect(chartEma).toEqual([null, null, 2, 3]);
      expect(featureEma).toEqual([1, 1.5, 2.25, 3.125]);
    });

    it('MACD 首值为0且各序列同长', () => {
      const prices = Array.from({ length: 30 }, (_, i) => i + 1);
      const { macd, signal, histogram } = calculateMACD(prices);
      expect(macd).toHaveLength(30);
      expect(signal).toHaveLength(30);
      expect(histogram).toHaveLength(30);
      expect(macd[0]).toBe(0);
      expect(macd[29]).toBeGreaterThan(0);
    });

    it('VWAP 为累计成交均价', () => {
      expect(calculateVWAP([10, 20], [10, 20], [10, 20], [100, 100])).toEqual([10, 15]);
    });
  });

  // 形态识别
  // 绑定生产：utils/chartPatternEngine.ts:136 detectPatterns / :151 findSupportResistance
  describe('形态识别（生产口径）', () => {
    const candle = (date: string, open: number, high: number, low: number, close: number): PatternOHLCV =>
      ({ date, open, high, low, close, volume: 1000 });

    it('识别红三兵', () => {
      const patterns = detectPatterns([
        candle('2026-01-01', 10, 11.2, 9.9, 11),
        candle('2026-01-02', 11, 12.2, 10.9, 12),
        candle('2026-01-03', 12, 13.2, 11.9, 13),
      ]);
      const red = patterns.find(p => p.name === '红三兵');
      expect(red).toBeDefined();
      expect(red?.type).toBe('bullish');
      expect(red?.confidence).toBe(0.8);
      expect(red?.startIndex).toBe(0);
      expect(red?.endIndex).toBe(2);
    });

    it('识别十字星', () => {
      const patterns = detectPatterns([
        candle('2026-01-01', 10, 11, 9.5, 10.5),
        candle('2026-01-02', 10.5, 11, 9.8, 10),
        candle('2026-01-03', 10, 11, 9, 10.02),
      ]);
      const doji = patterns.find(p => p.name === '十字星');
      expect(doji).toBeDefined();
      expect(doji?.type).toBe('neutral');
    });

    it('不足3根不识别', () => {
      const patterns = detectPatterns([
        candle('2026-01-01', 10, 11, 9, 10.5),
        candle('2026-01-02', 10.5, 12, 10, 11.5),
      ]);
      expect(patterns).toHaveLength(0);
    });

    it('局部高点识别为阻力、局部低点识别为支撑', () => {
      const levels = findSupportResistance([
        candle('2026-01-01', 15, 16, 14, 15.5),
        candle('2026-01-02', 15.5, 20, 10, 19),
        candle('2026-01-03', 19, 19.5, 12, 12.5),
      ], 1);
      expect(levels).toHaveLength(2);
      expect(levels.some(lv => lv.type === 'resistance' && lv.level === 20)).toBe(true);
      expect(levels.some(lv => lv.type === 'support' && lv.level === 10)).toBe(true);
    });

    it('窗口不足返回空', () => {
      const levels = findSupportResistance([
        candle('2026-01-01', 15, 16, 14, 15.5),
        candle('2026-01-02', 15.5, 20, 10, 19),
        candle('2026-01-03', 19, 19.5, 12, 12.5),
      ], 2);
      expect(levels).toHaveLength(0);
    });
  });

  // 相对强度排名
  // 生产无同契约导出：rg 无「按涨幅排序 + 百分位」的纯函数；
  // utils/dataTransformUtils.ts:144 computePercentileRank 只算单值分位，无排名列表契约。保留内联规格。
  describe('相对强度排名', () => {
    function rankByRS(stocks: { symbol: string; change: number }[]): { symbol: string; rank: number; percentile: number }[] {
      const sorted = [...stocks].sort((a, b) => b.change - a.change);
      return sorted.map((s, i) => ({
        symbol: s.symbol,
        rank: i + 1,
        percentile: ((stocks.length - i) / stocks.length) * 100,
      }));
    }

    it('最高涨幅排名应为1', () => {
      const stocks = [{ symbol: 'A', change: 5 }, { symbol: 'B', change: -2 }, { symbol: 'C', change: 3 }];
      const ranked = rankByRS(stocks);
      expect(ranked[0].symbol).toBe('A');
      expect(ranked[0].rank).toBe(1);
    });

    it('排名应连续', () => {
      const stocks = Array.from({ length: 10 }, (_, i) => ({ symbol: String(i), change: i }));
      const ranked = rankByRS(stocks);
      ranked.forEach((r, i) => expect(r.rank).toBe(i + 1));
    });

    it('百分位应在0-100', () => {
      const stocks = [{ symbol: 'A', change: 1 }, { symbol: 'B', change: -1 }];
      rankByRS(stocks).forEach(r => {
        expect(r.percentile).toBeGreaterThan(0);
        expect(r.percentile).toBeLessThanOrEqual(100);
      });
    });

    it('空数组返回空', () => {
      expect(rankByRS([])).toHaveLength(0);
    });

    it('单股票排名为1', () => {
      const ranked = rankByRS([{ symbol: 'A', change: 5 }]);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[0].percentile).toBe(100);
    });
  });
});

// 交互组件逻辑测试
// 生产无同契约导出：Tab/面包屑/模态框堆栈/折叠面板的状态都内嵌在 antd 组件里
// （pages/FinancialsPage.tsx:486 Tabs、components/Layout/AppLayout.tsx:159 Modal、
//  components/Layout/NavigationMenu.tsx:139 Collapse 类折叠），没有可导入的纯函数/reducer。
// 下列四段保留为交互规格内联。
describe('交互组件逻辑', () => {

  // Tab状态管理
  describe('Tab管理', () => {
    interface Tab { id: string; title: string; closable: boolean; }

    function createTabManager(tabs: Tab[]) {
      let activeId = tabs[0]?.id || '';
      return {
        getTabs: () => tabs,
        getActive: () => activeId,
        setActive: (id: string) => { if (tabs.some(t => t.id === id)) activeId = id; },
        close: (id: string) => {
          const idx = tabs.findIndex(t => t.id === id);
          if (idx === -1 || !tabs[idx].closable) return;
          tabs.splice(idx, 1);
          if (activeId === id) activeId = tabs[Math.min(idx, tabs.length - 1)]?.id || '';
        },
        add: (tab: Tab) => { tabs.push(tab); activeId = tab.id; },
      };
    }

    it('默认激活第一个Tab', () => {
      const mgr = createTabManager([{ id: 'a', title: 'A', closable: true }, { id: 'b', title: 'B', closable: true }]);
      expect(mgr.getActive()).toBe('a');
    });

    it('切换Tab应更新active', () => {
      const mgr = createTabManager([{ id: 'a', title: 'A', closable: true }, { id: 'b', title: 'B', closable: true }]);
      mgr.setActive('b');
      expect(mgr.getActive()).toBe('b');
    });

    it('关闭当前Tab应激活相邻Tab', () => {
      const tabs: Tab[] = [{ id: 'a', title: 'A', closable: true }, { id: 'b', title: 'B', closable: true }];
      const mgr = createTabManager(tabs);
      mgr.close('a');
      expect(mgr.getActive()).toBe('b');
    });

    it('不可关闭Tab不应被关闭', () => {
      const tabs: Tab[] = [{ id: 'a', title: 'A', closable: false }];
      const mgr = createTabManager(tabs);
      mgr.close('a');
      expect(mgr.getTabs()).toHaveLength(1);
    });

    it('添加Tab应自动激活', () => {
      const tabs: Tab[] = [{ id: 'a', title: 'A', closable: true }];
      const mgr = createTabManager(tabs);
      mgr.add({ id: 'b', title: 'B', closable: true });
      expect(mgr.getActive()).toBe('b');
    });

    it('切换到不存在的Tab应无效', () => {
      const mgr = createTabManager([{ id: 'a', title: 'A', closable: true }]);
      mgr.setActive('nonexistent');
      expect(mgr.getActive()).toBe('a');
    });

    it('关闭最后一个可关闭Tab', () => {
      const tabs: Tab[] = [{ id: 'a', title: 'A', closable: true }];
      const mgr = createTabManager(tabs);
      mgr.close('a');
      expect(mgr.getTabs()).toHaveLength(0);
      expect(mgr.getActive()).toBe('');
    });
  });

  // 面包屑导航
  describe('面包屑导航', () => {
    interface Crumb { label: string; path: string; }

    function buildBreadcrumbs(path: string, routes: Record<string, string>): Crumb[] {
      const segments = path.split('/').filter(Boolean);
      const crumbs: Crumb[] = [{ label: '首页', path: '/' }];
      let currentPath = '';
      for (const seg of segments) {
        currentPath += '/' + seg;
        crumbs.push({ label: routes[currentPath] || seg, path: currentPath });
      }
      return crumbs;
    }

    const routes: Record<string, string> = {
      '/stocks': '股票列表',
      '/stocks/detail': '股票详情',
      '/sectors': '行业板块',
    };

    it('根路径应只有首页', () => {
      expect(buildBreadcrumbs('/', routes)).toHaveLength(1);
    });

    it('二级路径应有3个面包屑', () => {
      expect(buildBreadcrumbs('/stocks/detail', routes)).toHaveLength(3);
    });

    it('未知路径应使用segment', () => {
      const crumbs = buildBreadcrumbs('/unknown', routes);
      expect(crumbs[1].label).toBe('unknown');
    });

    it('首页面包屑路径应为/', () => {
      const crumbs = buildBreadcrumbs('/stocks', routes);
      expect(crumbs[0].path).toBe('/');
    });

    it('路径应逐级构建', () => {
      const crumbs = buildBreadcrumbs('/stocks/detail', routes);
      expect(crumbs[1].path).toBe('/stocks');
      expect(crumbs[2].path).toBe('/stocks/detail');
    });
  });

  // 模态框堆栈
  describe('模态框堆栈', () => {
    interface Modal { id: string; title: string; zIndex: number; }

    function createModalStack() {
      const modals: Modal[] = [];
      const baseZ = 1000;
      return {
        open: (id: string, title: string) => { modals.push({ id, title, zIndex: baseZ + modals.length * 10 }); },
        close: (id: string) => { const idx = modals.findIndex(m => m.id === id); if (idx !== -1) modals.splice(idx, 1); },
        closeAll: () => { modals.length = 0; },
        top: () => modals[modals.length - 1],
        count: () => modals.length,
        isOpen: (id: string) => modals.some(m => m.id === id),
        getModals: () => [...modals],
      };
    }

    it('打开模态框应增加计数', () => {
      const stack = createModalStack();
      stack.open('a', 'A');
      expect(stack.count()).toBe(1);
    });

    it('堆叠模态框zIndex递增', () => {
      const stack = createModalStack();
      stack.open('a', 'A');
      stack.open('b', 'B');
      const modals = stack.getModals();
      expect(modals[1].zIndex).toBeGreaterThan(modals[0].zIndex);
    });

    it('关闭后计数减少', () => {
      const stack = createModalStack();
      stack.open('a', 'A');
      stack.close('a');
      expect(stack.count()).toBe(0);
    });

    it('关闭全部应清空', () => {
      const stack = createModalStack();
      stack.open('a', 'A');
      stack.open('b', 'B');
      stack.closeAll();
      expect(stack.count()).toBe(0);
    });

    it('top应返回最后打开的', () => {
      const stack = createModalStack();
      stack.open('a', 'A');
      stack.open('b', 'B');
      expect(stack.top()?.id).toBe('b');
    });

    it('isOpen应正确判断', () => {
      const stack = createModalStack();
      stack.open('a', 'A');
      expect(stack.isOpen('a')).toBe(true);
      expect(stack.isOpen('b')).toBe(false);
    });

    it('空堆栈top返回undefined', () => {
      expect(createModalStack().top()).toBeUndefined();
    });
  });

  // 折叠面板管理
  describe('折叠面板', () => {
    function createPanelManager(panelIds: string[]) {
      const expanded = new Set(panelIds);
      return {
        toggle: (id: string) => { if (expanded.has(id)) expanded.delete(id); else expanded.add(id); },
        expand: (id: string) => expanded.add(id),
        collapse: (id: string) => expanded.delete(id),
        expandAll: () => panelIds.forEach(id => expanded.add(id)),
        collapseAll: () => expanded.clear(),
        isExpanded: (id: string) => expanded.has(id),
        expandedCount: () => expanded.size,
      };
    }

    it('默认全部展开', () => {
      const mgr = createPanelManager(['a', 'b', 'c']);
      expect(mgr.expandedCount()).toBe(3);
    });

    it('toggle应切换状态', () => {
      const mgr = createPanelManager(['a']);
      mgr.toggle('a');
      expect(mgr.isExpanded('a')).toBe(false);
      mgr.toggle('a');
      expect(mgr.isExpanded('a')).toBe(true);
    });

    it('全部折叠应清空', () => {
      const mgr = createPanelManager(['a', 'b']);
      mgr.collapseAll();
      expect(mgr.expandedCount()).toBe(0);
    });

    it('全部展开应恢复', () => {
      const mgr = createPanelManager(['a', 'b']);
      mgr.collapseAll();
      mgr.expandAll();
      expect(mgr.expandedCount()).toBe(2);
    });

    it('不存在的面板toggle创建', () => {
      const mgr = createPanelManager(['a']);
      mgr.toggle('b');
      expect(mgr.isExpanded('b')).toBe(true);
    });
  });
});

// 市场数据图表渲染逻辑
describe('市场数据图表渲染', () => {

  // 涨跌颜色映射
  // 绑定生产：utils/dataTransformUtils.ts:74 transformStock（'red'|'green'|'gray' 归类）
  //           + styles/chart-theme.ts:10 CHART_COLORS / :74 KLINE_CONFIG（色值单一来源）
  // 旧断言错在：把 #ef4444 / #22c55e / #888 这套内联色值当成生产口径；
  // 生产涨色是 CHART_COLORS.up=#cf2a2a、跌色 down=#1db468、平盘 flat=#64748b。
  describe('涨跌颜色映射', () => {
    const rawStock = (overrides: Partial<RawStockData> = {}): RawStockData => ({
      code: '000001', name: '测试股', price: 10, change: 0, changePercent: 0,
      volume: 1000, amount: 10000, high: 10.5, low: 9.5, open: 10, preClose: 10,
      turnover: 1, pe: 10, pb: 1, marketCap: 1000000000,
      ...overrides,
    });

    it('正值应为红色', () => {
      expect(transformStock(rawStock({ change: 1 })).color).toBe('red');
      expect(KLINE_CONFIG.itemStyle.color).toBe(CHART_COLORS.up);
    });

    it('负值应为绿色', () => {
      expect(transformStock(rawStock({ change: -1 })).color).toBe('green');
      expect(KLINE_CONFIG.itemStyle.color0).toBe(CHART_COLORS.down);
    });

    it('零值应为灰色', () => {
      expect(transformStock(rawStock({ change: 0 })).color).toBe('gray');
    });

    it('平盘色由主题单点定义', () => {
      // 旧用例断言自定义中性色入参；生产 transformStock 无中性色参数，平盘色只来自 CHART_COLORS.flat。
      expect(CHART_COLORS.flat).toBe('#64748b');
    });

    it('极小正值仍为红', () => {
      expect(transformStock(rawStock({ change: 0.0001 })).color).toBe('red');
    });
  });

  // 图表坐标轴刻度
  // 生产无同契约导出：chartDataProcessing 只有聚合/指标，交互引擎只有视口映射；
  // nice-step 刻度生成是本文件内的渲染规格，保留内联。
  describe('坐标轴刻度', () => {
    function calcAxisTicks(min: number, max: number, targetTicks: number): number[] {
      if (min === max) return [min];
      const range = max - min;
      const roughStep = range / targetTicks;
      const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const normalized = roughStep / magnitude;
      let step: number;
      if (normalized <= 1.5) step = magnitude;
      else if (normalized <= 3.5) step = 2 * magnitude;
      else if (normalized <= 7.5) step = 5 * magnitude;
      else step = 10 * magnitude;
      const ticks: number[] = [];
      let tick = Math.ceil(min / step) * step;
      while (tick <= max) { ticks.push(tick); tick += step; }
      return ticks;
    }

    it('应生成合理数量的刻度', () => {
      const ticks = calcAxisTicks(0, 100, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.length).toBeLessThanOrEqual(10);
    });

    it('刻度应在范围内', () => {
      const ticks = calcAxisTicks(10, 90, 5);
      ticks.forEach(t => {
        expect(t).toBeGreaterThanOrEqual(10);
        expect(t).toBeLessThanOrEqual(90);
      });
    });

    it('刻度应递增', () => {
      const ticks = calcAxisTicks(0, 1000, 6);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
      }
    });

    it('相同min/max应返回单刻度', () => {
      expect(calcAxisTicks(50, 50, 5)).toEqual([50]);
    });

    it('负值范围应支持', () => {
      const ticks = calcAxisTicks(-100, 100, 5);
      expect(ticks.some(t => t < 0)).toBe(true);
      expect(ticks.some(t => t > 0)).toBe(true);
    });

    it('小数值范围应支持', () => {
      const ticks = calcAxisTicks(0.001, 0.01, 5);
      expect(ticks.length).toBeGreaterThan(0);
    });
  });

  // Tooltip定位
  // 绑定生产：utils/chartInteractionEngine.ts:390 calculateTooltipPosition
  // 旧断言错在：生产返回 {x,y} 且无 placement 字段，翻转方向只能由坐标体现；
  // 另生产左/上边界钳制到 offset（默认10），不是 Math.max(0, x)。
  describe('Tooltip定位', () => {
    it('默认右下方', () => {
      expect(calculateTooltipPosition(100, 100, 50, 30, 500, 500)).toEqual({ x: 110, y: 110 });
    });

    it('靠近右边缘应翻转到左侧', () => {
      const pos = calculateTooltipPosition(480, 100, 50, 30, 500, 500);
      expect(pos.x).toBe(420);
      expect(pos.x).toBeLessThan(480);
    });

    it('靠近下边缘应翻转到上方', () => {
      const pos = calculateTooltipPosition(100, 480, 50, 30, 500, 500);
      expect(pos.y).toBe(440);
      expect(pos.y).toBeLessThan(480);
    });

    it('坐标不应为负', () => {
      const pos = calculateTooltipPosition(5, 5, 50, 30, 500, 500);
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
    });

    it('角落位置应双翻转', () => {
      const pos = calculateTooltipPosition(490, 490, 50, 30, 500, 500);
      expect(pos.x).toBe(430);
      expect(pos.y).toBe(450);
    });

    it('超大浮层（比容器还大）应夹紧到容器左上角，不再溢出', () => {
      // 修复前：x/y 被钳制到 offset=10，浮层实际延伸到 610，仍然溢出 100x100 容器
      expect(calculateTooltipPosition(0, 0, 600, 600, 100, 100)).toEqual({ x: 0, y: 0 });
    });

    it('返回整数坐标', () => {
      const pos = calculateTooltipPosition(100.4, 100.6, 50, 30, 500, 500);
      expect(pos.x).toBe(110);
      expect(pos.y).toBe(111);
    });
  });

  // 坐标转换
  // 绑定生产：utils/chartInteractionEngine.ts:617 dataToScreen + :86 createViewport
  describe('坐标转换', () => {
    const viewport = createViewport(0, 100, 0, 100);

    it('左上角为原点', () => {
      expect(dataToScreen(0, 100, viewport, 800, 600)).toEqual({ x: 0, y: 0 });
    });

    it('中心映射到画布中心', () => {
      expect(dataToScreen(50, 50, viewport, 800, 600)).toEqual({ x: 400, y: 300 });
    });

    it('右下角映射到画布边界', () => {
      expect(dataToScreen(100, 0, viewport, 800, 600)).toEqual({ x: 800, y: 600 });
    });
  });
});
