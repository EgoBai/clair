/**
 * 自选股管理 Store
 * 统一使用 astock_watchlist_v2 存储格式
 */

import { useState, useCallback, useEffect } from 'react';

export interface WatchlistItem {
  symbol: string;
  name: string;
  market?: string;
  industry?: string;
  addedAt: number;
  groupId: string;
  note?: string;
  alertPrice?: number;
  alertType?: 'above' | 'below';
}

export interface WatchlistGroup {
  id: string;
  name: string;
  sortIndex: number;
}

// 统一使用 astock_watchlist_v2
const STORAGE_KEY = 'astock_watchlist_v2';

interface StoredStock {
  symbol: string;
  name: string;
  market: string;
  sortIndex: number;
  groupId: string;
}

interface StoredGroup {
  id: string;
  name: string;
  stocks: StoredStock[];
  isDefault?: boolean;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* quota exceeded */ }
}

// 从 astock_watchlist_v2 格式转换为 WatchlistItem[]
function convertToItems(groups: StoredGroup[]): WatchlistItem[] {
  const items: WatchlistItem[] = [];
  for (const group of groups) {
    for (const stock of group.stocks) {
      items.push({
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        addedAt: Date.now(),
        groupId: stock.groupId || group.id,
      });
    }
  }
  return items;
}

export function useWatchlistStore() {
  const [groups, setGroups] = useState<StoredGroup[]>(() =>
    loadFromStorage<StoredGroup[]>(STORAGE_KEY, [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }])
  );

  // 从 groups 派生 items
  const items = convertToItems(groups);

  // 持久化
  useEffect(() => {
    saveToStorage(STORAGE_KEY, groups);
  }, [groups]);

  // 添加股票
  const add = useCallback((item: Omit<WatchlistItem, 'addedAt' | 'groupId'>, groupId = 'default') => {
    setGroups(prev => {
      // 检查是否已存在
      const exists = prev.some(g => g.stocks.some(s => s.symbol === item.symbol));
      if (exists) return prev;

      return prev.map(g => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          stocks: [...g.stocks, {
            symbol: item.symbol,
            name: item.name,
            market: item.market || '',
            sortIndex: g.stocks.length,
            groupId,
          }],
        };
      });
    });
  }, []);

  // 移除股票
  const remove = useCallback((symbol: string) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      stocks: g.stocks.filter(s => s.symbol !== symbol),
    })));
  }, []);

  // 判断是否在自选中
  const has = useCallback((symbol: string) => {
    return groups.some(g => g.stocks.some(s => s.symbol === symbol));
  }, [groups]);

  // 切换自选
  const toggle = useCallback((item: Omit<WatchlistItem, 'addedAt' | 'groupId'>) => {
    if (has(item.symbol)) {
      remove(item.symbol);
      return false;
    } else {
      add(item);
      return true;
    }
  }, [has, remove, add]);

  // 移动到分组
  const moveToGroup = useCallback((symbol: string, groupId: string) => {
    setGroups(prev => {
      let stockToMove: StoredStock | null = null;
      // 先从原分组移除
      const newGroups = prev.map(g => ({
        ...g,
        stocks: g.stocks.filter(s => {
          if (s.symbol === symbol) {
            stockToMove = { ...s, groupId };
            return false;
          }
          return true;
        }),
      }));
      // 添加到目标分组
      if (stockToMove) {
        return newGroups.map(g => {
          if (g.id !== groupId) return g;
          return { ...g, stocks: [...g.stocks, stockToMove!] };
        });
      }
      return newGroups;
    });
  }, []);

  return {
    items,
    groups,
    add,
    remove,
    has,
    toggle,
    moveToGroup,
  };
}
