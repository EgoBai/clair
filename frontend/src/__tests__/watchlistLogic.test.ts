import { describe, it, expect } from 'vitest';

// 自选股逻辑测试
describe('Watchlist Logic', () => {
  interface WatchlistItem {
    symbol: string;
    name: string;
    groupId: string;
    sortIndex: number;
    addedAt: number;
    note?: string;
  }

  interface Group {
    id: string;
    name: string;
    items: WatchlistItem[];
  }

  const createGroup = (id: string, name: string): Group => ({
    id,
    name,
    items: [],
  });

  // 分组管理
  describe('Group Management', () => {
    it('should create default group', () => {
      const group = createGroup('default', '默认分组');
      expect(group.id).toBe('default');
      expect(group.name).toBe('默认分组');
      expect(group.items).toHaveLength(0);
    });

    it('should create custom group', () => {
      const group = createGroup('long-term', '长线持有');
      expect(group.name).toBe('长线持有');
    });

    it('should add item to group', () => {
      const group = createGroup('default', '默认');
      group.items.push({
        symbol: '600519',
        name: '贵州茅台',
        groupId: 'default',
        sortIndex: 0,
        addedAt: Date.now(),
      });
      expect(group.items).toHaveLength(1);
    });

    it('should remove item from group', () => {
      const group = createGroup('default', '默认');
      group.items.push({
        symbol: '600519',
        name: '贵州茅台',
        groupId: 'default',
        sortIndex: 0,
        addedAt: Date.now(),
      });
      group.items = group.items.filter(i => i.symbol !== '600519');
      expect(group.items).toHaveLength(0);
    });

    it('should move item to another group', () => {
      const fromGroup = createGroup('default', '默认');
      const toGroup = createGroup('long-term', '长线');
      fromGroup.items.push({
        symbol: '600519', name: '贵州茅台', groupId: 'default',
        sortIndex: 0, addedAt: Date.now(),
      });
      const item = fromGroup.items.find(i => i.symbol === '600519')!;
      fromGroup.items = fromGroup.items.filter(i => i.symbol !== '600519');
      item.groupId = 'long-term';
      toGroup.items.push(item);
      expect(fromGroup.items).toHaveLength(0);
      expect(toGroup.items).toHaveLength(1);
    });
  });

  // 排序逻辑
  describe('Sort Logic', () => {
    const items: WatchlistItem[] = [
      { symbol: '600519', name: '贵州茅台', groupId: 'default', sortIndex: 2, addedAt: 3000 },
      { symbol: '000001', name: '平安银行', groupId: 'default', sortIndex: 0, addedAt: 1000 },
      { symbol: '300750', name: '宁德时代', groupId: 'default', sortIndex: 1, addedAt: 2000 },
    ];

    it('should sort by sortIndex', () => {
      const sorted = [...items].sort((a, b) => a.sortIndex - b.sortIndex);
      expect(sorted[0].symbol).toBe('000001');
      expect(sorted[2].symbol).toBe('600519');
    });

    it('should sort by addedAt (recent first)', () => {
      const sorted = [...items].sort((a, b) => b.addedAt - a.addedAt);
      expect(sorted[0].symbol).toBe('600519');
    });

    it('should move item up', () => {
      let sorted = [...items].sort((a, b) => a.sortIndex - b.sortIndex);
      const idx = 1;
      if (idx > 0) {
        const temp = sorted[idx].sortIndex;
        sorted[idx].sortIndex = sorted[idx - 1].sortIndex;
        sorted[idx - 1].sortIndex = temp;
      }
      sorted = sorted.sort((a, b) => a.sortIndex - b.sortIndex);
      expect(sorted[0].symbol).toBe('300750');
      expect(sorted[1].symbol).toBe('000001');
    });

    it('should move item down', () => {
      const sorted = [...items].sort((a, b) => a.sortIndex - b.sortIndex);
      const idx = 0;
      if (idx < sorted.length - 1) {
        const temp = sorted[idx].sortIndex;
        sorted[idx].sortIndex = sorted[idx + 1].sortIndex;
        sorted[idx + 1].sortIndex = temp;
      }
      expect(sorted[0].symbol).toBe('300750');
      expect(sorted[1].symbol).toBe('000001');
    });
  });

  // 去重逻辑
  describe('Dedup Logic', () => {
    it('should detect duplicate symbol', () => {
      const items: WatchlistItem[] = [
        { symbol: '600519', name: '贵州茅台', groupId: 'default', sortIndex: 0, addedAt: 1000 },
      ];
      const newSymbol = '600519';
      const isDuplicate = items.some(i => i.symbol === newSymbol);
      expect(isDuplicate).toBe(true);
    });

    it('should allow different symbol', () => {
      const items: WatchlistItem[] = [
        { symbol: '600519', name: '贵州茅台', groupId: 'default', sortIndex: 0, addedAt: 1000 },
      ];
      const newSymbol = '000001';
      const isDuplicate = items.some(i => i.symbol === newSymbol);
      expect(isDuplicate).toBe(false);
    });

    it('should deduplicate by symbol across groups', () => {
      const groups: Group[] = [
        { id: 'g1', name: 'A', items: [
          { symbol: '600519', name: '茅台', groupId: 'g1', sortIndex: 0, addedAt: 1000 },
        ]},
        { id: 'g2', name: 'B', items: [
          { symbol: '000001', name: '平安', groupId: 'g2', sortIndex: 0, addedAt: 2000 },
        ]},
      ];
      const allSymbols = groups.flatMap(g => g.items.map(i => i.symbol));
      const unique = new Set(allSymbols);
      expect(unique.size).toBe(allSymbols.length);
    });
  });

  // 备注管理
  describe('Note Management', () => {
    it('should add note to item', () => {
      const item: WatchlistItem = {
        symbol: '600519', name: '贵州茅台', groupId: 'default',
        sortIndex: 0, addedAt: Date.now(),
      };
      item.note = '长期看好';
      expect(item.note).toBe('长期看好');
    });

    it('should update existing note', () => {
      const item: WatchlistItem = {
        symbol: '600519', name: '贵州茅台', groupId: 'default',
        sortIndex: 0, addedAt: Date.now(), note: '旧备注',
      };
      item.note = '新备注';
      expect(item.note).toBe('新备注');
    });

    it('should handle undefined note', () => {
      const item: WatchlistItem = {
        symbol: '600519', name: '贵州茅台', groupId: 'default',
        sortIndex: 0, addedAt: Date.now(),
      };
      expect(item.note).toBeUndefined();
    });
  });

  // 搜索过滤
  describe('Search Filter', () => {
    const items: WatchlistItem[] = [
      { symbol: '600519', name: '贵州茅台', groupId: 'default', sortIndex: 0, addedAt: 1000 },
      { symbol: '000001', name: '平安银行', groupId: 'default', sortIndex: 1, addedAt: 2000 },
      { symbol: '300750', name: '宁德时代', groupId: 'default', sortIndex: 2, addedAt: 3000 },
    ];

    it('should filter by symbol', () => {
      const filtered = items.filter(i => i.symbol.includes('600'));
      expect(filtered).toHaveLength(1);
    });

    it('should filter by name', () => {
      const filtered = items.filter(i => i.name.includes('茅台'));
      expect(filtered).toHaveLength(1);
    });

    it('should return empty for no match', () => {
      const filtered = items.filter(i => i.name.includes('不存在'));
      expect(filtered).toHaveLength(0);
    });
  });

  // 统计逻辑
  describe('Statistics', () => {
    const groups: Group[] = [
      { id: 'g1', name: '默认', items: [
        { symbol: 'A', name: 'A', groupId: 'g1', sortIndex: 0, addedAt: 1000 },
        { symbol: 'B', name: 'B', groupId: 'g1', sortIndex: 1, addedAt: 2000 },
      ]},
      { id: 'g2', name: '长线', items: [
        { symbol: 'C', name: 'C', groupId: 'g2', sortIndex: 0, addedAt: 3000 },
      ]},
    ];

    it('should count total items', () => {
      const total = groups.reduce((sum, g) => sum + g.items.length, 0);
      expect(total).toBe(3);
    });

    it('should count groups', () => {
      expect(groups.length).toBe(2);
    });

    it('should count items per group', () => {
      expect(groups[0].items.length).toBe(2);
      expect(groups[1].items.length).toBe(1);
    });
  });
});
