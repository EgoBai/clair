/**
 * 网络状态监控 Hook
 * 监控在线/离线状态、网络类型、延迟等
 * 适用于实时行情应用的网络感知
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type NetworkType = 'wifi' | '4g' | '3g' | '2g' | 'slow-2g' | 'ethernet' | 'unknown';

export interface NetworkStatus {
  /** 是否在线 */
  isOnline: boolean;
  /** 网络类型 */
  effectiveType: NetworkType;
  /** 下行速度估计 (Mbps) */
  downlink: number;
  /** 往返时间 (ms) */
  rtt: number;
  /** 是否省流量模式 */
  saveData: boolean;
  /** 连接质量 */
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
  /** 最后一次在线时间 */
  lastOnlineAt: Date | null;
  /** 离线持续时间 (ms) */
  offlineDuration: number;
}

export interface UseNetworkStatusOptions {
  /** 是否启用ping检测 */
  enablePing?: boolean;
  /** ping目标URL */
  pingUrl?: string;
  /** ping间隔 (ms) */
  pingInterval?: number;
  /** 状态变化回调 */
  onChange?: (status: NetworkStatus) => void;
  /** 离线回调 */
  onOffline?: () => void;
  /** 重连回调 */
  onReconnect?: () => void;
}

/** 获取网络连接信息 */
function getConnectionInfo(): Pick<NetworkStatus, 'effectiveType' | 'downlink' | 'rtt' | 'saveData'> {
  const nav = navigator as any;
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

  if (connection) {
    return {
      effectiveType: connection.effectiveType || 'unknown',
      downlink: connection.downlink || 0,
      rtt: connection.rtt || 0,
      saveData: connection.saveData || false,
    };
  }

  return {
    effectiveType: 'unknown',
    downlink: 0,
    rtt: 0,
    saveData: false,
  };
}

/** 根据网络参数计算连接质量 */
function computeQuality(isOnline: boolean, rtt: number, effectiveType: NetworkType): NetworkStatus['quality'] {
  if (!isOnline) return 'offline';

  if (rtt > 0) {
    if (rtt < 100) return 'excellent';
    if (rtt < 300) return 'good';
    if (rtt < 1000) return 'fair';
    return 'poor';
  }

  switch (effectiveType) {
    case '4g':
    case 'wifi':
    case 'ethernet':
      return 'excellent';
    case '3g':
      return 'good';
    case '2g':
      return 'fair';
    case 'slow-2g':
      return 'poor';
    default:
      return 'good';
  }
}

export function useNetworkStatus(options: UseNetworkStatusOptions = {}) {
  const {
    enablePing = false,
    pingUrl = '/api/health',
    pingInterval = 30000,
    onChange,
    onOffline,
    onReconnect,
  } = options;

  const [status, setStatus] = useState<NetworkStatus>(() => {
    const isOnline = navigator.onLine;
    const conn = getConnectionInfo();
    return {
      isOnline,
      ...conn,
      quality: computeQuality(isOnline, conn.rtt, conn.effectiveType),
      lastOnlineAt: isOnline ? new Date() : null,
      offlineDuration: 0,
    };
  });

  const offlineStartRef = useRef<number | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevOnlineRef = useRef(navigator.onLine);

  const updateStatus = useCallback(() => {
    const isOnline = navigator.onLine;
    const conn = getConnectionInfo();

    let lastOnlineAt = status.lastOnlineAt;
    let offlineDuration = 0;

    if (isOnline) {
      lastOnlineAt = new Date();
      if (offlineStartRef.current) {
        offlineDuration = Date.now() - offlineStartRef.current;
        offlineStartRef.current = null;
      }
    } else {
      if (!offlineStartRef.current) {
        offlineStartRef.current = Date.now();
      }
      offlineDuration = Date.now() - offlineStartRef.current;
    }

    const newStatus: NetworkStatus = {
      isOnline,
      ...conn,
      quality: computeQuality(isOnline, conn.rtt, conn.effectiveType),
      lastOnlineAt,
      offlineDuration,
    };

    setStatus(newStatus);
    onChange?.(newStatus);

    if (!isOnline && prevOnlineRef.current) {
      onOffline?.();
    } else if (isOnline && !prevOnlineRef.current) {
      onReconnect?.();
    }

    prevOnlineRef.current = isOnline;
  }, [onChange, onOffline, onReconnect, status.lastOnlineAt]);

  /** 执行ping检测 */
  const ping = useCallback(async (): Promise<number> => {
    const start = performance.now();
    try {
      await fetch(pingUrl, { method: 'HEAD', cache: 'no-store' });
      return performance.now() - start;
    } catch {
      return -1;
    }
  }, [pingUrl]);

  useEffect(() => {
    const handleOnline = () => updateStatus();
    const handleOffline = () => updateStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const nav = navigator as any;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (connection) {
      connection.addEventListener('change', updateStatus);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', updateStatus);
      }
    };
  }, [updateStatus]);

  // Ping检测
  useEffect(() => {
    if (!enablePing) return;

    const runPing = async () => {
      const latency = await ping();
      if (latency >= 0) {
        setStatus(prev => ({
          ...prev,
          rtt: Math.round(latency),
          quality: computeQuality(true, latency, prev.effectiveType),
        }));
      }
    };

    runPing();
    pingTimerRef.current = setInterval(runPing, pingInterval);

    return () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
      }
    };
  }, [enablePing, ping, pingInterval]);

  return {
    ...status,
    ping,
    /** 刷新状态 */
    refresh: updateStatus,
  };
}

export default useNetworkStatus;
