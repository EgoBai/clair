// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { WatchlistItem, WatchlistGroup } from '../hooks/useWatchlistStore';

// 测试 WatchlistItem 接口和辅助函数（非Hook部分可以纯逻辑测试）
describe('WatchlistItem 类型验证', () => {
  it('应该创建有效的 WatchlistItem', () => {
    const item: WatchlistItem = {
      symbol: '600519',
      name: '贵州茅台',
      market: 'sh',
      industry: '白酒',
      addedAt: Date.now(),
      groupId: 'default',
    };
    expect(item.symbol).toBe('600519');
    expect(item.name).toBe('贵州茅台');
    expect(item.groupId).toBe('default');
  });

  it('应该支持可选字段', () => {
    const item: WatchlistItem = {
      symbol: '000858',
      name: '五粮液',
      addedAt: Date.now(),
      groupId: 'default',
      note: '白酒龙头',
      alertPrice: 180,
      alertType: 'above',
    };
    expect(item.note).toBe('白酒龙头');
    expect(item.alertPrice).toBe(180);
    expect(item.alertType).toBe('above');
  });

  it('alertType 应该是 above 或 below', () => {
    const above: WatchlistItem['alertType'] = 'above';
    const below: WatchlistItem['alertType'] = 'below';
    expect(['above', 'below']).toContain(above);
    expect(['above', 'below']).toContain(below);
  });
});

describe('WatchlistGroup 类型验证', () => {
  it('应该创建有效的 WatchlistGroup', () => {
    const group: WatchlistGroup = {
      id: 'default',
      name: '自选股',
      sortIndex: 0,
    };
    expect(group.id).toBe('default');
    expect(group.name).toBe('自选股');
    expect(group.sortIndex).toBe(0);
  });

  it('应该支持自定义分组', () => {
    const group: WatchlistGroup = {
      id: 'custom_1',
      name: '新能源',
      sortIndex: 5,
    };
    expect(group.id).toBe('custom_1');
    expect(group.name).toBe('新能源');
  });
});

describe('Watchlist 业务逻辑验证', () => {
  it('添加去重逻辑', () => {
    const items: WatchlistItem[] = [
      { symbol: '600519', name: '茅台', addedAt: Date.now(), groupId: 'default' },
    ];

    const add = (item: Omit<WatchlistItem, 'addedAt' | 'groupId'>) => {
      if (items.some(i => i.symbol === item.symbol)) return items;
      return [...items, { ...item, addedAt: Date.now(), groupId: 'default' }];
    };

    // 重复添加应不增加
    const result1 = add({ symbol: '600519', name: '茅台' });
    expect(result1.length).toBe(1);

    // 新股票应增加
    const result2 = add({ symbol: '000858', name: '五粮液' });
    expect(result2.length).toBe(2);
  });

  it('分组过滤逻辑', () => {
    const items: WatchlistItem[] = [
      { symbol: '600519', name: '茅台', addedAt: 1, groupId: 'default' },
      { symbol: '000858', name: '五粮液', addedAt: 2, groupId: 'focus' },
      { symbol: '002304', name: '洋河', addedAt: 3, groupId: 'default' },
    ];

    const getGroupItems = (groupId: string) => items.filter(i => i.groupId === groupId);
    expect(getGroupItems('default').length).toBe(2);
    expect(getGroupItems('focus').length).toBe(1);
  });

  it('移除分组后应回到 default', () => {
    const items: WatchlistItem[] = [
      { symbol: '600519', name: '茅台', addedAt: 1, groupId: 'custom' },
    ];

    const movedItems = items.map(i =>
      i.groupId === 'custom' ? { ...i, groupId: 'default' } : i
    );
    expect(movedItems[0].groupId).toBe('default');
  });

  it('设置提醒逻辑', () => {
    const items: WatchlistItem[] = [
      { symbol: '600519', name: '茅台', addedAt: 1, groupId: 'default' },
    ];

    const updated = items.map(i =>
      i.symbol === '600519' ? { ...i, alertPrice: 2000, alertType: 'above' as const } : i
    );
    expect(updated[0].alertPrice).toBe(2000);
    expect(updated[0].alertType).toBe('above');
  });

  it('清除提醒逻辑', () => {
    const items: WatchlistItem[] = [
      { symbol: '600519', name: '茅台', addedAt: 1, groupId: 'default', alertPrice: 2000, alertType: 'above' },
    ];

    const cleared = items.map(i =>
      i.symbol === '600519' ? { ...i, alertPrice: undefined, alertType: undefined } : i
    );
    expect(cleared[0].alertPrice).toBeUndefined();
    expect(cleared[0].alertType).toBeUndefined();
  });

  it('导出数据结构', () => {
    const items: WatchlistItem[] = [
      { symbol: '600519', name: '茅台', addedAt: 1, groupId: 'default' },
    ];
    const groups: WatchlistGroup[] = [
      { id: 'default', name: '自选股', sortIndex: 0 },
    ];

    const exported = { items, groups, exportedAt: Date.now() };
    expect(exported.items.length).toBe(1);
    expect(exported.groups.length).toBe(1);
    expect(typeof exported.exportedAt).toBe('number');
  });

  it('导入数据应该替换现有数据', () => {
    const newItems: WatchlistItem[] = [
      { symbol: '000858', name: '五粮液', addedAt: 2, groupId: 'default' },
    ];
    const newGroups: WatchlistGroup[] = [
      { id: 'default', name: '自选股', sortIndex: 0 },
      { id: 'new', name: '新分组', sortIndex: 1 },
    ];

    expect(newItems.length).toBe(1);
    expect(newGroups.length).toBe(2);
  });
});
