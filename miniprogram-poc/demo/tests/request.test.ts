import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- 手动模拟 @tarojs/taro（request + storage）----
const { mockRequest, requestImplRef, storage } = vi.hoisted(() => {
  const storage: Record<string, string> = {}
  const requestImplRef: {
    current: (opts: any) => { statusCode: number; data: any }
  } = {
    current: () => ({ statusCode: 200, data: { success: true, data: 'ok' } }),
  }
  const mockRequest = vi.fn((opts: any) => requestImplRef.current(opts))
  return { mockRequest, requestImplRef, storage }
})

vi.mock('@tarojs/taro', () => ({
  default: {
    request: (...args: any[]) => mockRequest(...args),
    getStorageSync: (k: string) => storage[k] || '',
    setStorageSync: (k: string, v: string) => {
      storage[k] = v
    },
    removeStorageSync: (k: string) => {
      delete storage[k]
    },
  },
}))

const { request, ApiError, getAccessToken, setTokens, clearTokens } = await import(
  '../src/services/request'
)

describe('request — 鉴权拦截器（联调清单 §B）', () => {
  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k]
    mockRequest.mockClear()
  })

  it('200 成功返回 body.data', async () => {
    requestImplRef.current = () => ({ statusCode: 200, data: { success: true, data: { a: 1 } } })
    const r = await request('/x')
    expect(r).toEqual({ a: 1 })
  })

  it('存在 token 时注入 Authorization 头', async () => {
    let seenHeader: any = null
    requestImplRef.current = (opts) => {
      seenHeader = opts.header
      return { statusCode: 200, data: { success: true, data: 'ok' } }
    }
    setTokens('acc', 'ref')
    await request('/x')
    expect(seenHeader.Authorization).toBe('Bearer acc')
  })

  it('401 -> 静默刷新成功 -> 重放一次并返回最终数据', async () => {
    let calls = 0
    requestImplRef.current = (opts) => {
      calls++
      if (calls === 1) return { statusCode: 401, data: { success: false, code: 'TOKEN_EXPIRED' } }
      if (calls === 2)
        return { statusCode: 200, data: { success: true, data: { accessToken: 'newAcc', refreshToken: 'newRef' } } }
      return { statusCode: 200, data: { success: true, data: 'final' } }
    }
    setTokens('oldAcc', 'oldRef')
    const r = await request('/x')
    expect(r).toBe('final')
    expect(calls).toBe(3) // 原请求 + refresh + 重放
    expect(getAccessToken()).toBe('newAcc')
  })

  it('401 -> 无 refreshToken -> 清 token 并抛 ApiError(401)', async () => {
    requestImplRef.current = () => ({ statusCode: 401, data: { success: false, code: 'TOKEN_EXPIRED' } })
    clearTokens() // 无 refresh token
    await expect(request('/x')).rejects.toBeInstanceOf(ApiError)
    expect(getAccessToken()).toBe('')
  })

  it('401 -> refresh 返回 success:false -> 清 token 并抛 ApiError', async () => {
    let calls = 0
    requestImplRef.current = (opts) => {
      calls++
      if (calls === 1) return { statusCode: 401, data: { success: false, code: 'TOKEN_EXPIRED' } }
      return { statusCode: 200, data: { success: false, data: null } } // refresh 失败
    }
    setTokens('a', 'r')
    await expect(request('/x')).rejects.toMatchObject({ statusCode: 401 })
    expect(getAccessToken()).toBe('')
  })

  it('>=400 抛 ApiError 并携带 code（诚实错误透传）', async () => {
    requestImplRef.current = () => ({
      statusCode: 404,
      data: { success: false, error: 'not found', code: 'NOT_FOUND' },
    })
    await expect(request('/x')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('并发刷新：多个 401 只触发一次 refresh（refreshing 单飞）', async () => {
    let refreshCalls = 0
    let reqCalls = 0
    requestImplRef.current = (opts) => {
      if (opts.url.includes('/api/auth/refresh')) {
        refreshCalls++
        return { statusCode: 200, data: { success: true, data: { accessToken: 'n', refreshToken: 'r' } } }
      }
      reqCalls++
      return { statusCode: 401, data: { success: false, code: 'TOKEN_EXPIRED' } }
    }
    setTokens('a', 'r')
    await Promise.all([request('/1').catch(() => {}), request('/2').catch(() => {})])
    expect(refreshCalls).toBe(1) // 单飞
    expect(reqCalls).toBe(2)
  })
})
