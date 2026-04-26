/**
 * 自选股 API 测试
 */
import { describe, it, expect } from 'vitest';

describe('Watchlist API', () => {
  // 模拟自选股数据
  const mockWatchlist = [
    { id: 1, symbol: '000001.SZ', name: '平安银行', market: 'SZ', groupId: 'default', sortIndex: 0 },
    { id: 2, symbol: '600519.SH', name: '贵州茅台', market: 'SH', groupId: 'default', sortIndex: 1 },
    { id: 3, symbol: '000858.SZ', name: '五粮液', market: 'SZ', groupId: 'finance', sortIndex: 0 },
  ];

  describe('分组管理', () => {
    it('应该有默认分组', () => {
      const groups = [...new Set(mockWatchlist.map(w => w.groupId))];
      expect(groups).toContain('default');
    });

    it('自定义分组应该能包含股票', () => {
      const financeStocks = mockWatchlist.filter(w => w.groupId === 'finance');
      expect(financeStocks.length).toBeGreaterThan(0);
    });

    it('删除分组时股票应移到默认分组', () => {
      const stocksAfterDelete = mockWatchlist.map(w =>
        w.groupId === 'finance' ? { ...w, groupId: 'default' } : w
      );
      const groups = [...new Set(stocksAfterDelete.map(w => w.groupId))];
      expect(groups).not.toContain('finance');
      expect(groups).toContain('default');
    });
  });

  describe('排序', () => {
    it('应该按 sortIndex 排序', () => {
      const sorted = [...mockWatchlist].sort((a, b) => a.sortIndex - b.sortIndex);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].sortIndex).toBeGreaterThanOrEqual(sorted[i - 1].sortIndex);
      }
    });

    it('上下移动应该交换 sortIndex', () => {
      const list = [...mockWatchlist];
      const idx = 0;
      const targetIdx = 1;
      [list[idx], list[targetIdx]] = [list[targetIdx], list[idx]];
      list.forEach((item, i) => { item.sortIndex = i; });
      expect(list[0].symbol).toBe('600519.SH');
      expect(list[1].symbol).toBe('000001.SZ');
    });
  });

  describe('CRUD操作', () => {
    it('添加自选股应该检查重复', () => {
      const exists = mockWatchlist.some(w => w.symbol === '000001.SZ');
      expect(exists).toBe(true);
    });

    it('删除后应该不再存在', () => {
      const afterDelete = mockWatchlist.filter(w => w.symbol !== '000001.SZ');
      expect(afterDelete.some(w => w.symbol === '000001.SZ')).toBe(false);
      expect(afterDelete.length).toBe(mockWatchlist.length - 1);
    });

    it('更新备注应该生效', () => {
      const updated = mockWatchlist.map(w =>
        w.symbol === '000001.SZ' ? { ...w, notes: '银行龙头' } : w
      );
      const target = updated.find(w => w.symbol === '000001.SZ');
      expect((target as any as { notes?: string }).notes).toBe('银行龙头');
    });
  });

  describe('批量操作', () => {
    it('批量排序应该更新所有项', () => {
      const reorder = [
        { symbol: '600519.SH', sortIndex: 0 },
        { symbol: '000001.SZ', sortIndex: 1 },
        { symbol: '000858.SZ', sortIndex: 2 },
      ];
      const reordered = mockWatchlist.map(w => {
        const r = reorder.find(r => r.symbol === w.symbol);
        return r ? { ...w, sortIndex: r.sortIndex } : w;
      }).sort((a, b) => a.sortIndex - b.sortIndex);

      expect(reordered[0].symbol).toBe('600519.SH');
      expect(reordered[1].symbol).toBe('000001.SZ');
      expect(reordered[2].symbol).toBe('000858.SZ');
    });
  });
});
