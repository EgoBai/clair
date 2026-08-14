import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import Taro from '@tarojs/taro'
import type { RealtimeData } from '../services/api'

/**
 * Zustand Store —— 复用 Web 端 Store 逻辑，仅把 persist 的 storage 换成 Taro.storage
 * （对应 design/miniprogram-migration-assessment.md §3.5：localStorage → Taro.storage）
 */

const taroStorage = {
  getItem: (name: string): string | null => {
    const v = Taro.getStorageSync(name)
    return v ? v : null
  },
  setItem: (name: string, value: string): void => {
    Taro.setStorageSync(name, value)
  },
  removeItem: (name: string): void => {
    Taro.removeStorageSync(name)
  },
}

interface MarketState {
  /** 最近一次成功拉取的实时行情（缓存用） */
  realtime: RealtimeData | null
  setRealtime: (data: RealtimeData) => void
  clear: () => void
}

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      realtime: null,
      setRealtime: (data) => set({ realtime: data }),
      clear: () => set({ realtime: null }),
    }),
    {
      name: 'clair_market_cache',
      storage: createJSONStorage(() => taroStorage),
      // 仅缓存 realtime 字段，避免缓存体积膨胀
      partialize: (state) => ({ realtime: state.realtime }),
    },
  ),
)
