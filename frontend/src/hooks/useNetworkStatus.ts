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
  /** ping目标URL（必须是后端真实注册的 /api/* 端点，见下方 DEFAULT_PING_URL 注释） */
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

type NetworkConnection = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

/**
 * 默认 ping 目标。
 *
 * 历史坑：本值曾是 `/api/health` —— 后端**从未注册**该路径（真实健康检查是根路径 `/health`，
 * 不带 /api 前缀），实测 `GET /api/health` → 404，故这条 ping 恒定失败。
 *
 * 为什么不用 `/health`：前端 dev 经 Vite proxy 只代理 `/api` 与 `/ws`（见 frontend/vite.config.ts），
 * 生产经 main.tsx 的 window.fetch 劫持也只改写 `/api/` 前缀（见 frontend/src/main.tsx:13）。
 * 也就是说 `/health` 在前端两侧都**不会**到达后端：dev 下会被 Vite 当 SPA 路由兜底返回
 * index.html 并带 HTTP 200 + Content-Type: text/html（实测已验证），那是个「假在线」信号——
 * 比 404 更危险：后端真的挂了时仍会被判定为在线。
 *
 * 选用 `/api/stats/cache` 的理由：后端 app.ts 真实注册（app.ts:275），是纯内存 queryCache 统计，
 * 不打数据库、不受行情源可达性影响，作为「后端进程是否活着」的探针语义上比行情端点更干净
 * （行情端点可能因东财/腾讯源抖动而假阴性）。实测 HTTP 200 application/json。
 */
const DEFAULT_PING_URL = '/api/stats/cache';

/** 获取网络连接信息 */
function getConnectionInfo(): Pick<NetworkStatus, 'effectiveType' | 'downlink' | 'rtt' | 'saveData'> {
  const nav = navigator as Navigator & { connection?: NetworkConnection; mozConnection?: NetworkConnection; webkitConnection?: NetworkConnection };
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

  if (connection) {
    return {
      effectiveType: (connection.effectiveType as NetworkType) || 'unknown',
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
    pingUrl = DEFAULT_PING_URL,
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

  /**
   * 执行 ping 检测，返回往返时延（ms），失败返回 -1。
   *
   * 诚实性要点（此处曾有真实缺陷）：
   * 1. `fetch` 只在**网络层**失败（DNS/连接中断/CORS 被拦）时 reject；HTTP 404/500 会被**正常 resolve**。
   *    旧实现只要 fetch 没抛异常就返回时延，于是「端点 404」会被记成一次成功 ping，
   *    反而把 rtt/quality 刷成「优秀」——死链被掩盖成健康信号。
   * 2. 前端 dev 下任何未代理路径都会被 Vite 以 SPA 兜底返回 index.html + HTTP 200。
   *    所以额外校验 content-type 必须是 JSON，否则 HTML 兜底页会被误判为「后端在线」。
   * 现在只有「2xx 且响应体是 JSON」才算一次有效 ping。
   */
  const ping = useCallback(async (): Promise<number> => {
    const start = performance.now();
    try {
      const res = await fetch(pingUrl, { method: 'GET', cache: 'no-store' });
      if (!res.ok) return -1;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) return -1;
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

    const nav = navigator as Navigator & { connection?: NetworkConnection; mozConnection?: NetworkConnection; webkitConnection?: NetworkConnection };
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (connection) {
      connection.addEventListener?.('change', updateStatus);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener?.('change', updateStatus);
      }
    };
  }, [updateStatus]);

  // Ping检测
  useEffect(() => {
    if (!enablePing) return;

    const runPing = async () => {
      const latency = await ping();
      setStatus(prev => {
        if (latency >= 0) {
          return {
            ...prev,
            rtt: Math.round(latency),
            quality: computeQuality(true, latency, prev.effectiveType),
          };
        }
        // ping 失败（后端不可达 / 端点非 JSON）：诚实降级为 poor，
        // 而不是保留上一次成功 ping 的「优秀」读数假装一切正常。
        // 注意不改isOnline —— 浏览器层面的在线与否由 navigator.onLine 负责，
        // 单次探针失败不足以宣称用户离线。
        return { ...prev, rtt: 0, quality: 'poor' };
      });
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
