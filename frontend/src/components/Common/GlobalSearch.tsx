/**
 * 全局搜索组件
 * 防抖搜索 + 历史记录 + 搜索高亮 + 键盘导航
 * 参考 Linear/Notion 搜索体验
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Input, List, Tag, Button, Empty, Spin } from 'antd';
import { SearchOutlined, ClockCircleOutlined, CloseOutlined } from '@ant-design/icons';
import { useDebounce } from '../../hooks/useDebounce';
import { useSearchHistory } from '../../hooks/useSearchHistory';
import SearchHighlight from '../Common/SearchHighlight';

interface SearchResult {
  id: string | number;
  symbol: string;
  name: string;
  type?: string;
  industry?: string;
}

interface GlobalSearchProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelect: (result: SearchResult) => void;
  placeholder?: string;
  debounceMs?: number;
}

export default function GlobalSearch({
  onSearch,
  onSelect,
  placeholder = '搜索股票代码、名称... (⌘K)',
  debounceMs = 300,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { history, add: addToHistory, remove: removeFromHistory, search: searchHistory } = useSearchHistory({
    key: 'stock-search-history',
    maxItems: 10,
  });

  // 防抖搜索
  const debouncedSearch = useDebounce(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    try {
      const res = await onSearch(q);
      setResults(res);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, debounceMs);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setActiveIndex(-1);

    if (value.trim()) {
      setLoading(true);
      debouncedSearch(value);
    } else {
      setResults([]);
      debouncedSearch.cancel();
      setLoading(false);
    }
  }, [debouncedSearch]);

  const handleSelect = useCallback((result: SearchResult) => {
    addToHistory(result.symbol);
    onSelect(result);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.blur();
  }, [addToHistory, onSelect]);

  const handleHistorySelect = useCallback((item: string) => {
    setQuery(item);
    setLoading(true);
    debouncedSearch(item);
  }, [debouncedSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = query.trim() ? results : searchHistory(query);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0) {
          if (query.trim() && results[activeIndex]) {
            handleSelect(results[activeIndex]);
          } else {
            const histItems = searchHistory(query);
            if (histItems[activeIndex]) {
              handleHistorySelect(histItems[activeIndex]);
            }
          }
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        inputRef.current?.blur();
        break;
    }
  }, [activeIndex, results, query, handleSelect, handleHistorySelect, searchHistory]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const historyItems = query.trim() ? searchHistory(query) : history;
  const showHistory = !query.trim() && history.length > 0;
  const showResults = query.trim() && (results.length > 0 || loading);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', maxWidth: 480 }}>
      <Input
        ref={inputRef as any}
        prefix={<SearchOutlined style={{ color: '#999' }} />}
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={handleKeyDown}
        suffix={
          query ? (
            <CloseOutlined
              style={{ cursor: 'pointer', color: '#999' }}
              onClick={() => { setQuery(''); setResults([]); }}
            />
          ) : loading ? <Spin size="small" /> : null
        }
        size="large"
        style={{ borderRadius: 8 }}
        data-search-input
      />

      {showDropdown && (showHistory || showResults) && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          border: '1px solid #e2e8f0',
          maxHeight: 400,
          overflowY: 'auto',
          zIndex: 1000,
        }}>
          {/* 搜索历史 */}
          {showHistory && (
            <div style={{ padding: '8px 12px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
                fontSize: 12,
                color: '#999',
              }}>
                <span><ClockCircleOutlined /> 搜索历史</span>
                <Button type="link" size="small" onClick={() => {}}>
                  清空
                </Button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {historyItems.map((item, i) => (
                  <Tag
                    key={item}
                    style={{
                      cursor: 'pointer',
                      background: activeIndex === i ? '#e6f7ff' : undefined,
                      border: activeIndex === i ? '1px solid #1890ff' : undefined,
                    }}
                    onClick={() => handleHistorySelect(item)}
                    closable
                    onClose={(e) => { e.stopPropagation(); removeFromHistory(item); }}
                  >
                    {item}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {/* 搜索结果 */}
          {showResults && results.length > 0 && (
            <List
              dataSource={results}
              renderItem={(item, i) => (
                <List.Item
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    background: activeIndex === i ? '#f0f7ff' : undefined,
                    borderLeft: activeIndex === i ? '3px solid #1890ff' : '3px solid transparent',
                  }}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      <SearchHighlight text={item.symbol} query={query} />
                    </div>
                    <div style={{ fontSize: 13, color: '#666' }}>
                      <SearchHighlight text={item.name} query={query} />
                      {item.industry && (
                        <Tag style={{ marginLeft: 8, fontSize: 11 }}>{item.industry}</Tag>
                      )}
                    </div>
                  </div>
                </List.Item>
              )}
            />
          )}

          {/* 无结果 */}
          {query.trim() && !loading && results.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="未找到匹配的股票"
              style={{ padding: 20 }}
            />
          )}
        </div>
      )}
    </div>
  );
}
