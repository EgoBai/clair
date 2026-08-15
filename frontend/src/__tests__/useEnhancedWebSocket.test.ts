import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useEnhancedWebSocket,
  useConnectionState,
  useEnhancedRealtimeQuote,
  useEnhancedRealtimeQuotes,
} from '../hooks/useEnhancedWebSocket';

/**
 * 增强 WebSocket Hook 测试（导入真实模块，mock 底层 enhancedWsService）
 */

const h = vi.hoisted(() => {
  const msgListeners: Record<string, Array<(msg: any) => void>> = {};
  const stateListeners: Array<(s: any) => void> = [];
  const mockService = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getState: vi.fn().mockReturnValue('disconnected'),
    getCurrentSource: vi.fn().mockReturnValue('mock-ws'),
    onStateChange: vi.fn((cb: (s: any) => void) => {
      stateListeners.push(cb);
      return () => {};
    }),
    on: vi.fn((event: string, cb: (msg: any) => void) => {
      (msgListeners[event] ||= []).push(cb);
      return () => {};
    }),
  };
  return { msgListeners, stateListeners, mockService };
});

vi.mock('../services/enhancedWebsocket', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return { ...actual, enhancedWsService: h.mockService };
});

const VALID_STATES = ['connecting', 'connected', 'disconnected', 'reconnecting'] as const;

describe('useEnhancedWebSocket（真实 hook）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.msgListeners['*'] = [];
    h.msgListeners['quote_update'] = [];
    h.stateListeners.length = 0;
    h.mockService.getState.mockReturnValue('disconnected');
  });

  it('应返回连接状态与操作函数', () => {
    const { result } = renderHook(() => useEnhancedWebSocket());
    expect(VALID_STATES).toContain(result.current.state);
    expect(result.current.connected).toBe(result.current.state === 'connected');
    expect(result.current.lastMessage).toBeNull();
    expect(result.current.reconnectCount).toBe(0);
    expect(typeof result.current.subscribe).toBe('function');
    expect(typeof result.current.unsubscribe).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
    expect(typeof result.current.reconnect).toBe('function');
  });

  it('subscribe 应调用底层服务', () => {
    const { result } = renderHook(() => useEnhancedWebSocket());
    act(() => { result.current.subscribe(['600519']); });
    expect(h.mockService.subscribe).toHaveBeenCalledWith(['600519']);
  });

  it('onStateChange 回调应更新 state', () => {
    const { result } = renderHook(() => useEnhancedWebSocket());
    act(() => { h.stateListeners.forEach(cb => cb('connected')); });
    expect(result.current.state).toBe('connected');
    expect(result.current.reconnectCount).toBe(0);
  });

  it('reconnecting 状态应递增 reconnectCount', () => {
    const { result } = renderHook(() => useEnhancedWebSocket());
    act(() => { h.stateListeners.forEach(cb => cb('reconnecting')); });
    act(() => { h.stateListeners.forEach(cb => cb('reconnecting')); });
    expect(result.current.reconnectCount).toBe(2);
  });
});

describe('useConnectionState（真实 hook）', () => {
  it('应返回 state 与 source', () => {
    const { result } = renderHook(() => useConnectionState());
    expect(VALID_STATES).toContain(result.current.state);
    expect(result.current.source).toBe('mock-ws');
  });
});

describe('useEnhancedRealtimeQuote（真实 hook）', () => {
  it('symbol 未定义时 quote 为 null', () => {
    const { result } = renderHook(() => useEnhancedRealtimeQuote(undefined));
    expect(result.current.quote).toBeNull();
  });

  it('收到 quote_update 消息应更新 quote', () => {
    const { result } = renderHook(() => useEnhancedRealtimeQuote('600519'));
    act(() => {
      h.msgListeners['quote_update'].forEach(cb =>
        cb({ type: 'quote_update', data: { symbol: '600519', price: 1800, change: 1.5 } })
      );
    });
    expect(result.current.quote).not.toBeNull();
    expect(result.current.quote?.symbol).toBe('600519');
    expect(result.current.quote?.price).toBe(1800);
    expect(result.current.stale).toBe(false);
    expect(result.current.lastUpdate).toBeGreaterThan(0);
  });

  it('非本 symbol 的消息应被忽略', () => {
    const { result } = renderHook(() => useEnhancedRealtimeQuote('600519'));
    act(() => {
      h.msgListeners['quote_update'].forEach(cb =>
        cb({ type: 'quote_update', data: { symbol: '000001', price: 10 } })
      );
    });
    expect(result.current.quote).toBeNull();
  });
});

describe('useEnhancedRealtimeQuotes（真实 hook）', () => {
  it('批量行情应写入 quotes Map', () => {
    const { result } = renderHook(() => useEnhancedRealtimeQuotes(['600519', '000001']));
    act(() => {
      h.msgListeners['quote_update'].forEach(cb =>
        cb({ type: 'quote_update', data: { symbol: '600519', price: 1800 } })
      );
      h.msgListeners['quote_update'].forEach(cb =>
        cb({ type: 'quote_update', data: { symbol: '000001', price: 10 } })
      );
    });
    expect(result.current.size).toBe(2);
    expect(result.current.get('600519')?.price).toBe(1800);
    expect(result.current.get('000001')?.price).toBe(10);
  });
});
