/**
 * 搜索历史管理 Hook
 * 支持本地存储、自动去重、最大条目限制
 */

import { useState, useCallback, useEffect } from 'react';

interface UseSearchHistoryOptions {
  key?: string;
  maxItems?: number;
  onSearch?: (query: string) => void;
}

export function useSearchHistory(options: UseSearchHistoryOptions = {}) {
  const { key = 'search-history', maxItems = 20, _onSearch } = options;
  const [history, setHistory] = useState<string[]>([]);

  // 从 localStorage 加载
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, [key]);

  // 保存到 localStorage
  const save = useCallback((items: string[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch { /* ignore */ }
  }, [key]);

  // 添加搜索记录
  const add = useCallback((query: string) => {
    if (!query.trim()) return;
    setHistory(prev => {
      const filtered = prev.filter(item => item !== query);
      const updated = [query, ...filtered].slice(0, maxItems);
      save(updated);
      return updated;
    });
  }, [maxItems, save]);

  // 删除单条
  const remove = useCallback((query: string) => {
    setHistory(prev => {
      const updated = prev.filter(item => item !== query);
      save(updated);
      return updated;
    });
  }, [save]);

  // 清空
  const clear = useCallback(() => {
    setHistory([]);
    save([]);
  }, [save]);

  // 搜索历史
  const search = useCallback((query: string): string[] => {
    if (!query.trim()) return history;
    const lowerQuery = query.toLowerCase();
    return history.filter(item => item.toLowerCase().includes(lowerQuery));
  }, [history]);

  return { history, add, remove, clear, search };
}
