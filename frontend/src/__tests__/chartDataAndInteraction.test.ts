import { describe, it, expect } from 'vitest';

// 金融图表数据处理
describe('金融图表数据处理', () => {

  // K线数据标准化
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
  describe('均线带计算', () => {
    function calcBollingerBands(prices: number[], period: number, multiplier: number): { upper: number[]; middle: number[]; lower: number[] } {
      const upper: number[] = [];
      const middle: number[] = [];
      const lower: number[] = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) { upper.push(NaN); middle.push(NaN); lower.push(NaN); continue; }
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((s, p) => s + (p - mean) ** 2, 0) / period;
        const std = Math.sqrt(variance);
        middle.push(mean);
        upper.push(mean + multiplier * std);
        lower.push(mean - multiplier * std);
      }
      return { upper, middle, lower };
    }

    it('上下轨应包围中轨', () => {
      const prices = [100, 102, 98, 104, 96, 106, 94, 108, 92, 110];
      const bands = calcBollingerBands(prices, 5, 2);
      for (let i = 4; i < prices.length; i++) {
        expect(bands.upper[i]).toBeGreaterThan(bands.middle[i]);
        expect(bands.lower[i]).toBeLessThan(bands.middle[i]);
      }
    });

    it('带宽应为正数', () => {
      const prices = [100, 105, 95, 110, 90, 115];
      const bands = calcBollingerBands(prices, 3, 2);
      for (let i = 2; i < prices.length; i++) {
        expect(bands.upper[i] - bands.lower[i]).toBeGreaterThan(0);
      }
    });

    it('平坦价格带宽应窄', () => {
      const prices = [100, 100, 100, 100, 100];
      const bands = calcBollingerBands(prices, 3, 2);
      expect(bands.upper[4] - bands.lower[4]).toBeCloseTo(0, 5);
    });

    it('不足周期应为NaN', () => {
      const bands = calcBollingerBands([100, 101], 5, 2);
      expect(bands.upper[0]).toBeNaN();
    });

    it('空数据返回空数组', () => {
      const bands = calcBollingerBands([], 5, 2);
      expect(bands.upper).toHaveLength(0);
    });
  });

  // 相对强度排名
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

  // 颜色映射
  describe('涨跌颜色映射', () => {
    function getChangeColor(value: number, neutral: string = '#888'): string {
      if (value > 0) return '#ef4444';
      if (value < 0) return '#22c55e';
      return neutral;
    }

    it('正值应为红色', () => {
      expect(getChangeColor(1)).toBe('#ef4444');
    });

    it('负值应为绿色', () => {
      expect(getChangeColor(-1)).toBe('#22c55e');
    });

    it('零值应为灰色', () => {
      expect(getChangeColor(0)).toBe('#888');
    });

    it('自定义中性色', () => {
      expect(getChangeColor(0, '#999')).toBe('#999');
    });

    it('极小正值仍为红', () => {
      expect(getChangeColor(0.0001)).toBe('#ef4444');
    });
  });

  // 图表坐标轴刻度
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
  describe('Tooltip定位', () => {
    function positionTooltip(mouseX: number, mouseY: number, tooltipW: number, tooltipH: number, containerW: number, containerH: number): { x: number; y: number; placement: string } {
      const padding = 10;
      let x = mouseX + padding;
      let y = mouseY + padding;
      let placement = 'right-bottom';
      if (x + tooltipW > containerW) { x = mouseX - tooltipW - padding; placement = 'left-bottom'; }
      if (y + tooltipH > containerH) { y = mouseY - tooltipH - padding; placement = placement.replace('bottom', 'top'); }
      return { x: Math.max(0, x), y: Math.max(0, y), placement };
    }

    it('默认右下方', () => {
      const pos = positionTooltip(100, 100, 50, 30, 500, 500);
      expect(pos.placement).toBe('right-bottom');
    });

    it('靠近右边缘应翻转到左侧', () => {
      const pos = positionTooltip(480, 100, 50, 30, 500, 500);
      expect(pos.placement).toContain('left');
    });

    it('靠近下边缘应翻转到上方', () => {
      const pos = positionTooltip(100, 480, 50, 30, 500, 500);
      expect(pos.placement).toContain('top');
    });

    it('坐标不应为负', () => {
      const pos = positionTooltip(5, 5, 50, 30, 500, 500);
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
    });

    it('角落位置应双翻转', () => {
      const pos = positionTooltip(490, 490, 50, 30, 500, 500);
      expect(pos.placement).toContain('left');
      expect(pos.placement).toContain('top');
    });
  });
});
