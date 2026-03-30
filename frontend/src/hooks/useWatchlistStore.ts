/**
 * 自选股管理 Store
 * 支持分组、拖拽排序、本地存储、导入导出
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

const STORAGE_KEY = 'watchlist_data';
const GROUPS_KEY = 'watchlist_groups';

const DEFAULT_GROUPS: WatchlistGroup[] = [
  { id: 'default', name: '自选股', sortIndex: 0 },
  { id: 'focus', name: '重点关注', sortIndex: 1 },
];

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

export function useWatchlistStore() {
  const [items, setItems] = useState<WatchlistItem[]>(() =>
    loadFromStorage<WatchlistItem[]>(STORAGE_KEY, [])
  );
  const [groups, setGroups] = useState<WatchlistGroup[]>(() =>
    loadFromStorage<WatchlistGroup[]>(GROUPS_KEY, DEFAULT_GROUPS)
  );

  // 持久化
  useEffect(() => {
    saveToStorage(STORAGE_KEY, items);
  }, [items]);

  useEffect(() => {
    saveToStorage(GROUPS_KEY, groups);
  }, [groups]);

  // 添加股票
  const add = useCallback((item: Omit<WatchlistItem, 'addedAt' | 'groupId'>, groupId = 'default') => {
    setItems(prev => {
      if (prev.some(i => i.symbol === item.symbol)) return prev;
      return [...prev, { ...item, addedAt: Date.now(), groupId }];
    });
  }, []);

  // 移除股票
  const remove = useCallback((symbol: string) => {
    setItems(prev => prev.filter(i => i.symbol !== symbol));
  }, []);

  // 判断是否在自选中
  const has = useCallback((symbol: string) => {
    return items.some(i => i.symbol === symbol);
  }, [items]);

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
    setItems(prev => prev.map(i =>
      i.symbol === symbol ? { ...i, groupId } : i
    ));
  }, []);

  // 设置提醒
  const setAlert = useCallback((symbol: string, price: number, type: 'above' | 'below') => {
    setItems(prev => prev.map(i =>
      i.symbol === symbol ? { ...i, alertPrice: price, alertType: type } : i
    ));
  }, []);

  // 清除提醒
  const clearAlert = useCallback((symbol: string) => {
    setItems(prev => prev.map(i =>
      i.symbol === symbol ? { ...i, alertPrice: undefined, alertType: undefined } : i
    ));
  }, []);

  // 设置备注
  const setNote = useCallback((symbol: string, note: string) => {
    setItems(prev => prev.map(i =>
      i.symbol === symbol ? { ...i, note } : i
    ));
  }, []);

  // 分组管理
  const addGroup = useCallback((name: string) => {
    const id = `group_${Date.now()}`;
    setGroups(prev => [...prev, { id, name, sortIndex: prev.length }]);
    return id;
  }, []);

  const renameGroup = useCallback((id: string, name: string) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
  }, []);

  const removeGroup = useCallback((id: string) => {
    if (id === 'default') return;
    setGroups(prev => prev.filter(g => g.id !== id));
    setItems(prev => prev.map(i => i.groupId === id ? { ...i, groupId: 'default' } : i));
  }, []);

  // 获取分组内股票
  const getGroupItems = useCallback((groupId: string) => {
    return items.filter(i => i.groupId === groupId);
  }, [items]);

  // 导出
  const exportData = useCallback(() => {
    return { items, groups, exportedAt: Date.now() };
  }, [items, groups]);

  // 导入
  const importData = useCallback((data: { items: WatchlistItem[]; groups: WatchlistGroup[] }) => {
    setItems(data.items);
    setGroups(data.groups);
  }, []);

  // 清空
  const clear = useCallback(() => {
    setItems([]);
  }, []);

  return {
    items,
    groups,
    add,
    remove,
    has,
    toggle,
    moveToGroup,
    setAlert,
    clearAlert,
    setNote,
    addGroup,
    renameGroup,
    removeGroup,
    getGroupItems,
    exportData,
    importData,
    clear,
  };
}
