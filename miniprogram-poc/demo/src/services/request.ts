import Taro from '@tarojs/taro'

/**
 * Taro.request 封装 —— 替代 axios（axios 依赖 XMLHttpRequest，小程序无）
 * 复用 Web 端 api.ts 的拦截器/缓存/重试思路，传输层换成 Taro.request。
 */

// POC 阶段：本地/局域网调试。改为局域网 IP 后，微信开发者工具需勾选「不校验合法域名」。
// 生产：HTTPS 合法域名（备案，用户届时办理）。
export const BASE_URL = 'http://127.0.0.1:3001'

const ACCESS_TOKEN_KEY = 'clair_access_token'
const REFRESH_TOKEN_KEY = 'clair_refresh_token'

export function getAccessToken(): string {
  return Taro.getStorageSync(ACCESS_TOKEN_KEY) || ''
}
export function setTokens(accessToken: string, refreshToken: string): void {
  Taro.setStorageSync(ACCESS_TOKEN_KEY, accessToken)
  Taro.setStorageSync(REFRESH_TOKEN_KEY, refreshToken)
}
export function clearTokens(): void {
  Taro.removeStorageSync(ACCESS_TOKEN_KEY)
  Taro.removeStorageSync(REFRESH_TOKEN_KEY)
}

/** 统一响应包：兼容 sendSuccess（带 timestamp）与手写 res.json（无 timestamp） */
export interface ApiEnvelope<T = unknown> {
  success: boolean
  data?: T
  error?: string
  code?: string
  timestamp?: string
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: Record<string, unknown>
  header?: Record<string, string>
}

/** 401 静默刷新：access 过期 → POST /api/auth/refresh → 重放 */
let refreshing: Promise<string | null> | null = null

async function tryRefresh(): Promise<string | null> {
  if (refreshing) return refreshing
  const refreshToken = Taro.getStorageSync(REFRESH_TOKEN_KEY)
  if (!refreshToken) return null

  refreshing = (async () => {
    try {
      const res = await Taro.request({
        url: `${BASE_URL}/api/auth/refresh`,
        method: 'POST',
        data: { refreshToken },
        header: { 'Content-Type': 'application/json' },
      })
      const body = res.data as ApiEnvelope<{ accessToken: string; refreshToken: string }>
      if (body.success && body.data) {
        setTokens(body.data.accessToken, body.data.refreshToken)
        return body.data.accessToken
      }
      clearTokens()
      return null
    } catch {
      clearTokens()
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
  retried = false,
): Promise<T> {
  const token = getAccessToken()
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.header || {}),
  }

  const res = await Taro.request({
    url: `${BASE_URL}${path}`,
    method: options.method || 'GET',
    data: options.data,
    header,
  })

  const body = res.data as ApiEnvelope<T> & { dataSource?: string }

  // 401：静默刷新并重放一次
  if (res.statusCode === 401 && !retried) {
    const newToken = await tryRefresh()
    if (newToken) return request<T>(path, options, true)
    clearTokens()
    throw new ApiError('未登录或登录已过期', 401, body.code)
  }

  if (res.statusCode >= 400) {
    throw new ApiError(body.error || '请求失败', res.statusCode, body.code)
  }

  return body as T
}

export class ApiError extends Error {
  statusCode: number
  code?: string
  constructor(message: string, statusCode: number, code?: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}
