/**
 * Command Palette - Linear/Notion 风格的命令面板
 * 支持 Cmd+K / Ctrl+K 打开, 搜索命令/页面/股票, 键盘导航
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchOutlined } from '@ant-design/icons';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  category: 'navigation' | 'action' | 'data' | 'stock' | 'help';
  shortcut?: string;
  handler: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
  commands?: CommandItem[];
  onStockSearch?: (query: string) => Promise<Array<{ symbol: string; name: string }>>;
  onStockSelect?: (symbol: string) => void;
}

const DEFAULT_COMMANDS: CommandItem[] = [
  // 导航
  { id: 'nav-home', label: '首页', icon: '🏠', category: 'navigation', shortcut: 'Alt+1', handler: () => {}, keywords: ['home', '首页', '主页'] },
  { id: 'nav-stocks', label: '股票列表', icon: '📈', category: 'navigation', shortcut: 'Alt+2', handler: () => {}, keywords: ['stocks', '股票', '列表'] },
  { id: 'nav-market', label: '行情分析', icon: '📊', category: 'navigation', shortcut: 'Alt+3', handler: () => {}, keywords: ['market', '行情', '分析'] },
  { id: 'nav-watchlist', label: '自选股', icon: '⭐', category: 'navigation', shortcut: 'Alt+4', handler: () => {}, keywords: ['watchlist', '自选', '收藏'] },
  { id: 'nav-backtest', label: '策略回测', icon: '🔄', category: 'navigation', shortcut: 'Alt+5', handler: () => {}, keywords: ['backtest', '回测', '策略'] },
  { id: 'nav-ai', label: 'AI 选股', icon: '🤖', category: 'navigation', shortcut: 'Alt+6', handler: () => {}, keywords: ['ai', '选股', '智能'] },

  // 数据操作
  { id: 'refresh-data', label: '刷新数据', icon: '🔄', category: 'data', shortcut: 'R', handler: () => {}, keywords: ['refresh', '刷新', '更新'] },
  { id: 'filter-stocks', label: '筛选股票', icon: '🔍', category: 'data', shortcut: 'F', handler: () => {}, keywords: ['filter', '筛选', '过滤'] },
  { id: 'sort-price', label: '按价格排序', icon: '💰', category: 'data', shortcut: 'S P', handler: () => {}, keywords: ['sort', '排序', '价格'] },
  { id: 'sort-change', label: '按涨跌幅排序', icon: '📉', category: 'data', shortcut: 'S C', handler: () => {}, keywords: ['sort', '排序', '涨跌'] },
  { id: 'sort-volume', label: '按成交量排序', icon: '📦', category: 'data', shortcut: 'S V', handler: () => {}, keywords: ['sort', '排序', '成交量'] },

  // 操作
  { id: 'toggle-theme', label: '切换主题', icon: '🌙', category: 'action', shortcut: 'Alt+T', handler: () => {}, keywords: ['theme', '主题', '暗色', 'dark'] },
  { id: 'toggle-sidebar', label: '切换侧边栏', icon: '📌', category: 'action', shortcut: 'Alt+S', handler: () => {}, keywords: ['sidebar', '侧边栏', '菜单'] },
  { id: 'shortcuts-help', label: '快捷键帮助', icon: '⌨️', category: 'help', shortcut: '?', handler: () => {}, keywords: ['help', '帮助', '快捷键', 'shortcuts'] },
];

export default function CommandPalette({
  visible,
  onClose,
  commands = DEFAULT_COMMANDS,
  onStockSearch,
  onStockSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [stockResults, setStockResults] = useState<Array<{ symbol: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const _navigate = useNavigate();

  // 匹配命令
  const filteredCommands = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;

    return commands.filter(cmd => {
      const searchText = [
        cmd.label,
        cmd.description || '',
        cmd.category,
        ...(cmd.keywords || []),
      ].join(' ').toLowerCase();
      return searchText.includes(q);
    });
  }, [query, commands]);

  // 股票搜索
  useEffect(() => {
    if (!query.trim() || !onStockSearch) {
      setStockResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await onStockSearch(query);
        setStockResults(results.slice(0, 5));
      } catch {
        setStockResults([]);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, onStockSearch]);

  // 聚焦输入框
  useEffect(() => {
    if (visible) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  // 滚动到活跃项
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
      activeEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const totalItems = filteredCommands.length + stockResults.length;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex < filteredCommands.length) {
          filteredCommands[activeIndex].handler();
          onClose();
        } else {
          const stockIdx = activeIndex - filteredCommands.length;
          if (stockResults[stockIdx]) {
            onStockSelect?.(stockResults[stockIdx].symbol);
            onClose();
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [activeIndex, totalItems, filteredCommands, stockResults, onClose, onStockSelect]);

  const handleItemClick = useCallback((index: number) => {
    if (index < filteredCommands.length) {
      filteredCommands[index].handler();
      onClose();
    } else {
      const stockIdx = index - filteredCommands.length;
      if (stockResults[stockIdx]) {
        onStockSelect?.(stockResults[stockIdx].symbol);
        onClose();
      }
    }
  }, [filteredCommands, stockResults, onClose, onStockSelect]);

  // 按类别分组
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredCommands.forEach(cmd => {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  const categoryLabels: Record<string, string> = {
    navigation: '导航',
    data: '数据操作',
    action: '操作',
    stock: '股票',
    help: '帮助',
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
    >
      <div style={{
        width: '100%',
        maxWidth: 560,
        backgroundColor: '#fff',
        borderRadius: 12,
        boxShadow: '0 16px 70px rgba(0, 0, 0, 0.2)',
        overflow: 'hidden',
      }}>
        {/* 搜索输入 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #e2e8f0',
          gap: 8,
        }}>
          <SearchOutlined style={{ color: '#999', fontSize: 16 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="输入命令或搜索股票..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 15,
              color: '#333',
            }}
            aria-label="搜索命令"
            data-command-input
          />
          <kbd style={{
            padding: '2px 6px',
            fontSize: 11,
            color: '#999',
            backgroundColor: '#f5f5f5',
            borderRadius: 4,
            border: '1px solid #ddd',
          }}>ESC</kbd>
        </div>

        {/* 命令列表 */}
        <div
          ref={listRef}
          style={{ maxHeight: 400, overflowY: 'auto', padding: '8px 0' }}
          role="listbox"
          aria-label="命令列表"
        >
          {Object.entries(groupedCommands).map(([category, items]) => (
            <div key={category}>
              <div style={{
                padding: '6px 16px',
                fontSize: 11,
                fontWeight: 600,
                color: '#999',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {categoryLabels[category] || category}
              </div>
              {items.map((cmd) => {
                const globalIndex = filteredCommands.indexOf(cmd);
                return (
                  <div
                    key={cmd.id}
                    data-index={globalIndex}
                    onClick={() => handleItemClick(globalIndex)}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    role="option"
                    aria-selected={activeIndex === globalIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 16px',
                      cursor: 'pointer',
                      backgroundColor: activeIndex === globalIndex ? '#f0f7ff' : 'transparent',
                      borderLeft: activeIndex === globalIndex ? '3px solid #1890ff' : '3px solid transparent',
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{cmd.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{cmd.label}</div>
                      {cmd.description && (
                        <div style={{ fontSize: 12, color: '#999' }}>{cmd.description}</div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd style={{
                        padding: '2px 6px',
                        fontSize: 11,
                        color: '#999',
                        backgroundColor: '#f5f5f5',
                        borderRadius: 4,
                        border: '1px solid #ddd',
                      }}>{cmd.shortcut}</kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* 股票搜索结果 */}
          {stockResults.length > 0 && (
            <div>
              <div style={{
                padding: '6px 16px',
                fontSize: 11,
                fontWeight: 600,
                color: '#999',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderTop: '1px solid #e2e8f0',
                marginTop: 4,
                paddingTop: 10,
              }}>
                股票
              </div>
              {stockResults.map((stock, i) => {
                const globalIndex = filteredCommands.length + i;
                return (
                  <div
                    key={stock.symbol}
                    data-index={globalIndex}
                    onClick={() => handleItemClick(globalIndex)}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    role="option"
                    aria-selected={activeIndex === globalIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 16px',
                      cursor: 'pointer',
                      backgroundColor: activeIndex === globalIndex ? '#f0f7ff' : 'transparent',
                      borderLeft: activeIndex === globalIndex ? '3px solid #1890ff' : '3px solid transparent',
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>📈</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{stock.symbol}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{stock.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 空状态 */}
          {filteredCommands.length === 0 && stockResults.length === 0 && !loading && (
            <div style={{
              padding: 32,
              textAlign: 'center',
              color: '#999',
              fontSize: 14,
            }}>
              没有找到匹配的命令
            </div>
          )}

          {/* 加载中 */}
          {loading && (
            <div style={{
              padding: 16,
              textAlign: 'center',
              color: '#999',
              fontSize: 13,
            }}>
              搜索中...
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 16px',
          borderTop: '1px solid #e2e8f0',
          fontSize: 11,
          color: '#999',
        }}>
          <span>↑↓ 导航</span>
          <span>↵ 选择</span>
          <span>ESC 关闭</span>
        </div>
      </div>
    </div>
  );
}
