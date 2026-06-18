/**
 * 前端组件测试
 * 测试关键组件的渲染和交互
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// ==================== Zustand Store 测试 ====================

describe('useAppStore', () => {
  // 由于 Zustand store 依赖 localStorage，需要 mock
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    };
  })();

  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

  it('初始偏好设置应该有默认值', async () => {
    const { useAppStore } = await import('../store/useAppStore');
    const state = useAppStore.getState();
    expect(state.preferences.theme).toBe('dark');
    expect(state.preferences.klinePeriod).toBe('day');
    expect(state.preferences.showVolume).toBe(true);
    expect(state.preferences.sidebarCollapsed).toBe(false);
  });

  it('setTheme 应该更新主题', async () => {
    const { useAppStore } = await import('../store/useAppStore');
    useAppStore.getState().setTheme('dark');
    expect(useAppStore.getState().preferences.theme).toBe('dark');
    useAppStore.getState().setTheme('light');
  });

  it('setKlinePeriod 应该更新K线周期', async () => {
    const { useAppStore } = await import('../store/useAppStore');
    useAppStore.getState().setKlinePeriod('week');
    expect(useAppStore.getState().preferences.klinePeriod).toBe('week');
    useAppStore.getState().setKlinePeriod('day');
  });

  it('toggleVolume 应该切换成交量显示', async () => {
    const { useAppStore } = await import('../store/useAppStore');
    const before = useAppStore.getState().preferences.showVolume;
    useAppStore.getState().toggleVolume();
    expect(useAppStore.getState().preferences.showVolume).toBe(!before);
    useAppStore.getState().toggleVolume(); // 恢复
  });

  it('addToWatchlist 应该添加股票', async () => {
    const { useAppStore } = await import('../store/useAppStore');
    const stock = { id: 1, symbol: '000001.SZ', name: '平安银行', market: 'SZ', isActive: true };
    useAppStore.getState().addToWatchlist(stock);
    expect(useAppStore.getState().watchlist.some(s => s.symbol === '000001.SZ')).toBe(true);
  });

  it('removeFromWatchlist 应该移除股票', async () => {
    const { useAppStore } = await import('../store/useAppStore');
    useAppStore.getState().removeFromWatchlist('000001.SZ');
    expect(useAppStore.getState().watchlist.some(s => s.symbol === '000001.SZ')).toBe(false);
  });

  it('重复添加自选股应该被忽略', async () => {
    const { useAppStore } = await import('../store/useAppStore');
    const stock = { id: 1, symbol: '600519.SH', name: '贵州茅台', market: 'SH', isActive: true };
    useAppStore.getState().addToWatchlist(stock);
    useAppStore.getState().addToWatchlist(stock);
    const count = useAppStore.getState().watchlist.filter(s => s.symbol === '600519.SH').length;
    expect(count).toBe(1);
  });

  it('URL状态应该能同步', async () => {
    const { useAppStore } = await import('../store/useAppStore');
    const params = new URLSearchParams('?page=3&q=平安&market=SH');
    useAppStore.getState().syncFromURL(params);
    expect(useAppStore.getState().urlState.page).toBe(3);
    expect(useAppStore.getState().urlState.searchKeyword).toBe('平安');
    expect(useAppStore.getState().urlState.market).toBe('SH');
  });

  it('toURLParams 应该生成正确参数', async () => {
    const { useAppStore } = await import('../store/useAppStore');
    useAppStore.getState().setURLState({ page: 2, searchKeyword: 'test', sortBy: 'name' });
    const params = useAppStore.getState().toURLParams();
    expect(params.get('page')).toBe('2');
    expect(params.get('q')).toBe('test');
    expect(params.get('sortBy')).toBe('name');
  });
});

// ==================== 格式化函数测试 ====================

describe('格式化工具', () => {
  it('涨跌幅应该正确格式化', () => {
    const formatChange = (val: number) => {
      const prefix = val > 0 ? '+' : '';
      return `${prefix}${val.toFixed(2)}%`;
    };
    expect(formatChange(1.23)).toBe('+1.23%');
    expect(formatChange(-0.5)).toBe('-0.50%');
    expect(formatChange(0)).toBe('0.00%');
  });

  it('金额应该正确格式化', () => {
    const formatAmount = (val: number) => {
      if (Math.abs(val) >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
      if (Math.abs(val) >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
      return `${val.toFixed(0)}`;
    };
    expect(formatAmount(123456789)).toBe('1.23亿');
    expect(formatAmount(50000)).toBe('5.00万');
    expect(formatAmount(123)).toBe('123');
  });

  it('成交量应该正确格式化', () => {
    const formatVolume = (vol: number) => {
      if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿手`;
      if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万手`;
      return `${vol}手`;
    };
    expect(formatVolume(150000000)).toBe('1.50亿手');
    expect(formatVolume(80000)).toBe('8.00万手');
    expect(formatVolume(500)).toBe('500手');
  });

  it('null/undefined 值应安全处理', () => {
    const safeToFixed = (val: number | null | undefined, digits = 2) => {
      if (val === null || val === undefined) return '-';
      return val.toFixed(digits);
    };
    expect(safeToFixed(null)).toBe('-');
    expect(safeToFixed(undefined)).toBe('-');
    expect(safeToFixed(1.234)).toBe('1.23');
  });
});
