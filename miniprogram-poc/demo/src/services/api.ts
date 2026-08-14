import { request } from './request'

/**
 * 真实接口调用（全部来自 backend/src/api 真实路由，见 docs/02-api-contract.md）
 * 无任何假数据；源不可达时 dataSource === 'unavailable'，由页面展示诚实空态。
 */

// ============ 行情 ============

export interface IndexQuote {
  name: string
  price: number
  changePct: number
}
export interface MarketBreadth {
  up: number
  down: number
  limitUp: number
  limitDown: number
  turnoverYi: number
  upVolume: number
  downVolume: number
  volumeRatio: number
}
export interface RealtimeData {
  dataSource: 'real' | 'unavailable'
  error?: string
  shanghai?: IndexQuote
  shenzhen?: IndexQuote
  chinext?: IndexQuote
  breadth?: MarketBreadth | null
}

/** GET /api/market/realtime（公开，30s 缓存） */
export async function fetchMarketRealtime(): Promise<RealtimeData> {
  const body = await request<{ success: boolean; data: RealtimeData }>('/api/market/realtime')
  return body.data
}

export interface KlineData {
  dataSource: 'real' | 'unavailable'
  symbol?: string
  message?: string
  dates: string[]
  opens: number[]
  highs: number[]
  lows: number[]
  prices: number[]
  volumes: number[]
  amounts: number[]
}

/** GET /api/market/kline?symbol=&days=（公开，10min 缓存） */
export async function fetchMarketKline(symbol: string, days = 120): Promise<KlineData> {
  const body = await request<{ success: boolean; data: KlineData }>(
    `/api/market/kline?symbol=${encodeURIComponent(symbol)}&days=${days}`,
  )
  return body.data
}

// ============ 通知（站内通知中心入口） ============

export interface UnreadCount {
  count: number
}

/** GET /api/notifications/user/:userId/unread-count（公开） */
export async function fetchUnreadCount(userId: string): Promise<UnreadCount> {
  const body = await request<{ success: boolean; data: UnreadCount }>(
    `/api/notifications/user/${userId}/unread-count`,
  )
  return body.data
}

// ============ 用户（登录态） ============

export interface LoginResult {
  user: {
    id: string
    email: string
    nickname: string
    avatar?: string
    roles: string[]
    status: string
    settings?: unknown
    mfaEnabled?: boolean
    createdAt?: string
    lastLoginAt?: string
  }
  token: string
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/** POST /api/user/login */
export async function login(email: string, password: string): Promise<LoginResult> {
  const body = await request<{ success: boolean; data: LoginResult }>('/api/user/login', {
    method: 'POST',
    data: { email, password },
  })
  return body.data
}
