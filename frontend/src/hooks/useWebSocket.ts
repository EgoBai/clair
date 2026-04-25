/**
 * WebSocket React Hook
 * 自动管理连接、重连、订阅、状态
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { wsService, WSMessage, WSMessageType, QuoteUpdateData } from '../services/websocket';

// ==================== 连接状态 Hook ====================

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  useEffect(() => {
    // 连接
    wsService.connect()
      .then(() => setConnected(true))
      .catch((err) => console.error('[useWS] 连接失败:', err));

    // 监听所有消息
    const unsub = wsService.onMessage((msg) => {
      setLastMessage(msg);
    });

    // 定期检查连接状态
    const timer = setInterval(() => {
      setConnected(wsService.getConnectionState());
    }, 2000);

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  const subscribe = useCallback((symbols: string[]) => {
    wsService.subscribe(symbols);
  }, []);

  const unsubscribe = useCallback((symbols: string[]) => {
    wsService.unsubscribe(symbols);
  }, []);

  const disconnect = useCallback(() => {
    wsService.disconnect();
    setConnected(false);
  }, []);

  return { connected, lastMessage, subscribe, unsubscribe, disconnect };
}

// ==================== 特定类型消息 Hook ====================

export function useWSMessage<T = any>(type: WSMessageType) {
  const [data, setData] = useState<T | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  useEffect(() => {
    const unsub = wsService.on(type, (msg: WSMessage) => {
      setData(msg.data as T);
      setLastUpdate(msg.timestamp || Date.now());
    });
    return unsub;
  }, [type]);

  return { data, lastUpdate };
}

// ==================== 股票实时行情 Hook ====================

export function useRealtimeQuote(symbol: string | undefined) {
  const [quote, setQuote] = useState<QuoteUpdateData | null>(null);
  const [stale, setStale] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!symbol) return;

    // 订阅
    wsService.subscribe([symbol]);

    // 监听行情更新
    const unsub = wsService.on('quote_update', (msg: WSMessage) => {
      const data = msg.data as QuoteUpdateData;
      if (data.symbol === symbol) {
        setQuote(data);
        setStale(false);

        // 15秒无更新标记为过期
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setStale(true), 15000);
      }
    });

    return () => {
      unsub();
      wsService.unsubscribe([symbol]);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [symbol]);

  return { quote, stale };
}

// ==================== 多股票行情 Hook ====================

export function useRealtimeQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Map<string, QuoteUpdateData>>(new Map());
  const symbolsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newSymbols = new Set(symbols);
    const toSubscribe = symbols.filter(s => !symbolsRef.current.has(s));
    const toUnsubscribe = Array.from(symbolsRef.current).filter(s => !newSymbols.has(s));

    if (toSubscribe.length > 0) wsService.subscribe(toSubscribe);
    if (toUnsubscribe.length > 0) wsService.unsubscribe(toUnsubscribe);

    symbolsRef.current = newSymbols;

    const unsub = wsService.on('quote_update', (msg: WSMessage) => {
      const data = msg.data as QuoteUpdateData;
      if (newSymbols.has(data.symbol)) {
        setQuotes(prev => {
          const next = new Map(prev);
          next.set(data.symbol, data);
          return next;
        });
      }
    });

    return () => {
      unsub();
      wsService.unsubscribe(Array.from(newSymbols));
    };
  }, [symbols.join(',')]);

  return quotes;
}

// ==================== 连接状态指示 Hook ====================

export function useConnectionStatus() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  useEffect(() => {
    wsService.connect().catch((err) => console.warn('[WebSocket] useConnectionStatus 连接失败:', err));

    const timer = setInterval(() => {
      const connected = wsService.getConnectionState();
      setStatus(connected ? 'connected' : 'disconnected');
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  return status;
}
