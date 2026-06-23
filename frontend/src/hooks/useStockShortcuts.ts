/**
 * 股票列表键盘快捷操作
 * Enter: 查看详情
 * W: 添加/移除自选
 * B: 买入（触发事件）
 * S: 卖出（触发事件）
 */

import { useEffect } from 'react';

interface StockActions {
  onViewDetail?: (symbol: string) => void;
  onToggleWatchlist?: (symbol: string) => void;
  onBuy?: (symbol: string) => void;
  onSell?: (symbol: string) => void;
  onCompare?: (symbol: string) => void;
}

export function useStockShortcuts(
  activeSymbol: string | null,
  actions: StockActions,
  enabled = true
) {
  useEffect(() => {
    if (!enabled || !activeSymbol) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'w':
          e.preventDefault();
          actions.onToggleWatchlist?.(activeSymbol);
          break;
        case 'b':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            actions.onBuy?.(activeSymbol);
          }
          break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            actions.onSell?.(activeSymbol);
          }
          break;
        case 'c':
          if (e.altKey) {
            e.preventDefault();
            actions.onCompare?.(activeSymbol);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, activeSymbol, actions]);
}

/**
 * 获取快捷键提示
 */
export function getStockShortcutHints() {
  return [
    { keys: ['j', '↓'], description: '下一只股票' },
    { keys: ['k', '↑'], description: '上一只股票' },
    { keys: ['Enter'], description: '查看详情' },
    { keys: ['W'], description: '添加/移除自选' },
    { keys: ['B'], description: '买入' },
    { keys: ['S'], description: '卖出' },
    { keys: ['Alt', 'C'], description: '加入对比' },
  ];
}
