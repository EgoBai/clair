/**
 * 自选股云端同步 Hook
 * 页面加载时自动将localStorage数据同步到后端
 * 后续可从后端拉取实现跨设备同步
 */
import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'astock_watchlist_v2';
let lastSyncTime = 0;
const SYNC_INTERVAL = 5 * 60 * 1000; // 5分钟

export function useWatchlistSync() {
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    
    const syncToBackend = async () => {
      const now = Date.now();
      if (now - lastSyncTime < SYNC_INTERVAL) return;
      
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        
        const groups = JSON.parse(raw);
        const stockCount = groups.reduce((sum: number, g: any) => sum + (g.stocks?.length || 0), 0);
        if (stockCount === 0) return;
        
        await fetch('/api/watchlist/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groups }),
        });
        
        lastSyncTime = now;
        synced.current = true;
      } catch {
        // 静默失败，同步非关键路径
      }
    };
    
    // 延迟3秒执行，避免阻塞首屏渲染
    const timer = setTimeout(syncToBackend, 3000);
    return () => clearTimeout(timer);
  }, []);
}
