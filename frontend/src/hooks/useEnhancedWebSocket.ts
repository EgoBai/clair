/**
 * 增强 WebSocket React Hooks
 * 使用增强版 WebSocket 服务 (指数退避、心跳、断线补全)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  enhancedWsService,
  WSMessage,
  WSMessageType,
  QuoteUpdateData,
  ConnectionState,
} from '../services/enhancedWebsocket';

// ==================== 连接状态 Hook ====================

export function useEnhancedWebSocket() {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  useEffect(() => {
    // 连接
    enhancedWsService.connect().catch((err) => console.warn('[WebSocket] 初始连接失败:', err));

    // 监听状态变化
    const unsubState = enhancedWsService.onStateChange((s) => {
      setState(s);
      if (s === 'reconnecting') {
        setReconnectCount((c) => c + 1);
      }
      if (s === 'connected') {
        setReconnectCount(0);
      }
    });

    // 监听所有消息
    const unsubMsg = enhancedWsService.on('*', (msg) => {
      setLastMessage(msg);
    });

    // 初始化状态
    setState(enhancedWsService.getState());

    return () => {
      unsubState();
      unsubMsg();
    };
  }, []);

  const subscribe = useCallback((symbols: string[]) => {
    enhancedWsService.subscribe(symbols);
  }, []);

  const unsubscribe = useCallback((symbols: string[]) => {
    enhancedWsService.unsubscribe(symbols);
  }, []);

  const disconnect = useCallback(() => {
    enhancedWsService.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    enhancedWsService.connect().catch((err) => console.warn('[WebSocket] 重连失败:', err));
  }, []);

  return {
    state,
    connected: state === 'connected',
    lastMessage,
    reconnectCount,
    currentSource: enhancedWsService.getCurrentSource(),
    subscribe,
    unsubscribe,
    disconnect,
    reconnect,
  };
}

// ==================== 连接状态指示 Hook ====================

export function useConnectionState() {
  const [state, setState] = useState<ConnectionState>(enhancedWsService.getState());
  const [source, setSource] = useState<string>(enhancedWsService.getCurrentSource());

  useEffect(() => {
    enhancedWsService.connect().catch((err) => console.warn('[WebSocket] useConnectionState 连接失败:', err));

    const unsub = enhancedWsService.onStateChange((s) => {
      setState(s);
      setSource(enhancedWsService.getCurrentSource());
    });

    return unsub;
  }, []);

  return { state, source };
}

// ==================== 实时行情 Hook (增强版) ====================

export function useEnhancedRealtimeQuote(symbol: string | undefined) {
  const [quote, setQuote] = useState<QuoteUpdateData | null>(null);
  const [stale, setStale] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!symbol) return;

    enhancedWsService.subscribe([symbol]);

    const unsub = enhancedWsService.on('quote_update', (msg: WSMessage) => {
      const data = msg.data as QuoteUpdateData;
      if (data.symbol === symbol) {
        setQuote(data);
        setStale(false);
        setLastUpdate(Date.now());

        // 20秒无更新标记为过期
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setStale(true), 20000);
      }
    });

    return () => {
      unsub();
      enhancedWsService.unsubscribe([symbol]);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [symbol]);

  return { quote, stale, lastUpdate };
}

// ==================== 批量实时行情 Hook ====================

export function useEnhancedRealtimeQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Map<string, QuoteUpdateData>>(new Map());
  const symbolsRef = useRef<Set<string>>(new Set());
  const symbolsKey = symbols.join(',');

  useEffect(() => {
    const newSymbols = new Set(symbols);
    const toSubscribe = symbols.filter((s) => !symbolsRef.current.has(s));
    const toUnsubscribe = Array.from(symbolsRef.current).filter((s) => !newSymbols.has(s));

    if (toSubscribe.length > 0) enhancedWsService.subscribe(toSubscribe);
    if (toUnsubscribe.length > 0) enhancedWsService.unsubscribe(toUnsubscribe);

    symbolsRef.current = newSymbols;

    const unsub = enhancedWsService.on('quote_update', (msg: WSMessage) => {
      const data = msg.data as QuoteUpdateData;
      if (newSymbols.has(data.symbol)) {
        setQuotes((prev) => {
          const next = new Map(prev);
          next.set(data.symbol, data);
          return next;
        });
      }
    });

    return () => {
      unsub();
      enhancedWsService.unsubscribe(Array.from(newSymbols));
    };
  }, [symbolsKey]);

  return quotes;
}
