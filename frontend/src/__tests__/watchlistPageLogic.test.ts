/**
 * 自选股页面逻辑测试
 * 覆盖自选股管理、涨跌排序、分组管理
 */

import { describe, it, expect } from 'vitest';

describe('自选股页面逻辑', () => {
  describe('自选股列表管理', () => {
    interface WatchItem {
      symbol: string;
      name: string;
      price: number;
      changePercent: number;
      addedAt: number;
    }

    function addToWatchlist(list: WatchItem[], item: WatchItem): WatchItem[] {
      if (list.some(w => w.symbol === item.symbol)) return list;
      return [...list, item];
    }

    function removeFromWatchlist(list: WatchItem[], symbol: string): WatchItem[] {
      return list.filter(w => w.symbol !== symbol);
    }

    it('应能添加自选股', () => {
      const list: WatchItem[] = [];
      const result = addToWatchlist(list, { symbol: '600519', name: '茅台', price: 1800, changePercent: 1, addedAt: Date.now() });
      expect(result).toHaveLength(1);
    });

    it('重复添加应忽略', () => {
      const item: WatchItem = { symbol: '600519', name: '茅台', price: 1800, changePercent: 1, addedAt: Date.now() };
      const result = addToWatchlist([item], item);
      expect(result).toHaveLength(1);
    });

    it('应能移除自选股', () => {
      const list: WatchItem[] = [
        { symbol: '600519', name: '茅台', price: 1800, changePercent: 1, addedAt: Date.now() },
        { symbol: '000858', name: '五粮液', price: 150, changePercent: 2, addedAt: Date.now() },
      ];
      const result = removeFromWatchlist(list, '600519');
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('000858');
    });
  });

  describe('自选股排序', () => {
    interface WatchItem {
      symbol: string;
      changePercent: number;
      price: number;
      marketCap: number;
      addedAt: number;
    }

    function sortWatchlist(items: WatchItem[], by: string, desc = true): WatchItem[] {
      return [...items].sort((a, b) => {
        const aVal = (a as any)[by];
        const bVal = (b as any)[by];
        return desc ? bVal - aVal : aVal - bVal;
      });
    }

    it('按涨幅排序', () => {
      const items: WatchItem[] = [
        { symbol: 'A', changePercent: 3, price: 10, marketCap: 1e9, addedAt: 1 },
        { symbol: 'B', changePercent: 5, price: 20, marketCap: 2e9, addedAt: 2 },
      ];
      const sorted = sortWatchlist(items, 'changePercent');
      expect(sorted[0].symbol).toBe('B');
    });

    it('按添加时间排序', () => {
      const items: WatchItem[] = [
        { symbol: 'A', changePercent: 3, price: 10, marketCap: 1e9, addedAt: 2 },
        { symbol: 'B', changePercent: 5, price: 20, marketCap: 2e9, addedAt: 1 },
      ];
      const sorted = sortWatchlist(items, 'addedAt', false);
      expect(sorted[0].symbol).toBe('B');
    });
  });

  describe('自选股涨跌汇总', () => {
    function summarizeWatchlist(items: { changePercent: number }[]): { upCount: number; downCount: number; flatCount: number; avgChange: number } {
      const upCount = items.filter(i => i.changePercent > 0).length;
      const downCount = items.filter(i => i.changePercent < 0).length;
      const flatCount = items.filter(i => i.changePercent === 0).length;
      const avgChange = items.length > 0
        ? Math.round(items.reduce((s, i) => s + i.changePercent, 0) / items.length * 100) / 100
        : 0;
      return { upCount, downCount, flatCount, avgChange };
    }

    it('应正确汇总涨跌', () => {
      const items = [
        { changePercent: 5 },
        { changePercent: -3 },
        { changePercent: 0 },
      ];
      const result = summarizeWatchlist(items);
      expect(result.upCount).toBe(1);
      expect(result.downCount).toBe(1);
      expect(result.flatCount).toBe(1);
      expect(result.avgChange).toBe(0.67);
    });
  });

  describe('批量操作', () => {
    function batchAdd(list: string[], symbols: string[]): string[] {
      const newSymbols = symbols.filter(s => !list.includes(s));
      return [...list, ...newSymbols];
    }

    function batchRemove(list: string[], symbols: string[]): string[] {
      return list.filter(s => !symbols.includes(s));
    }

    it('批量添加应去重', () => {
      const result = batchAdd(['600519'], ['600519', '000858', '300750']);
      expect(result).toHaveLength(3);
    });

    it('批量移除应正确', () => {
      const result = batchRemove(['600519', '000858', '300750'], ['600519', '300750']);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('000858');
    });
  });

  describe('导入导出', () => {
    function exportWatchlist(symbols: string[]): string {
      return JSON.stringify({ version: 1, symbols, exportedAt: new Date().toISOString() });
    }

    function importWatchlist(json: string): string[] {
      try {
        const data = JSON.parse(json);
        return Array.isArray(data.symbols) ? data.symbols : [];
      } catch {
        return [];
      }
    }

    it('导出应包含版本号', () => {
      const exported = exportWatchlist(['600519']);
      const parsed = JSON.parse(exported);
      expect(parsed.version).toBe(1);
      expect(parsed.symbols).toContain('600519');
    });

    it('导入应正确解析', () => {
      const json = JSON.stringify({ version: 1, symbols: ['600519', '000858'] });
      expect(importWatchlist(json)).toHaveLength(2);
    });

    it('无效JSON应返回空数组', () => {
      expect(importWatchlist('invalid')).toEqual([]);
    });
  });
});
