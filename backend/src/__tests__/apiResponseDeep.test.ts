import { describe, it, expect } from 'vitest'

// API响应格式化与验证深度测试
describe('API Response & Validation Deep', () => {
  // 统一响应包装器
  function wrapResponse<T>(data: T, code = 0, msg = 'success') {
    return { code, msg, data, timestamp: Date.now() }
  }

  it('should wrap success response', () => {
    const r = wrapResponse({ id: 1 })
    expect(r.code).toBe(0)
    expect(r.msg).toBe('success')
    expect(r.data).toEqual({ id: 1 })
    expect(r.timestamp).toBeGreaterThan(0)
  })

  it('should wrap error response', () => {
    const r = wrapResponse(null, 400, 'invalid params')
    expect(r.code).toBe(400)
    expect(r.msg).toBe('invalid params')
  })

  // 分页响应
  function paginatedResponse<T>(items: T[], page: number, pageSize: number, total: number) {
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page * pageSize < total,
        hasPrev: page > 1,
      },
    }
  }

  it('should calculate pagination correctly', () => {
    const r = paginatedResponse([1, 2, 3], 2, 10, 25)
    expect(r.pagination.totalPages).toBe(3)
    expect(r.pagination.hasNext).toBe(true)
    expect(r.pagination.hasPrev).toBe(true)
  })

  it('should handle first page', () => {
    const r = paginatedResponse([1, 2, 3], 1, 10, 25)
    expect(r.pagination.hasPrev).toBe(false)
  })

  it('should handle last page', () => {
    const r = paginatedResponse([1, 2, 3], 3, 10, 25)
    expect(r.pagination.hasNext).toBe(false)
  })

  // 请求参数验证链
  function validateRequest(params: Record<string, any>, rules: Record<string, (v: any) => string | null>) {
    const errors: string[] = []
    for (const [key, validate] of Object.entries(rules)) {
      const err = validate(params[key])
      if (err) errors.push(`${key}: ${err}`)
    }
    return { valid: errors.length === 0, errors }
  }

  const stockRules = {
    symbol: (v: any) => typeof v === 'string' && /^[0-9]{6}$/.test(v) ? null : '必须为6位数字',
    page: (v: any) => typeof v === 'number' && v >= 1 && v <= 1000 ? null : '页码1-1000',
    pageSize: (v: any) => typeof v === 'number' && v >= 1 && v <= 100 ? null : '每页1-100',
  }

  it('should validate correct params', () => {
    const r = validateRequest({ symbol: '600519', page: 1, pageSize: 20 }, stockRules)
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('should catch invalid symbol', () => {
    const r = validateRequest({ symbol: 'abc', page: 1, pageSize: 20 }, stockRules)
    expect(r.valid).toBe(false)
  })

  it('should catch out of range page', () => {
    const r = validateRequest({ symbol: '600519', page: -1, pageSize: 20 }, stockRules)
    expect(r.valid).toBe(false)
  })

  // 响应压缩判断
  function shouldCompress(contentType: string, size: number, acceptEncoding: string) {
    if (size < 1024) return false
    if (!acceptEncoding.includes('gzip')) return false
    if (contentType.includes('image/') || contentType.includes('video/')) return false
    return true
  }

  it('should compress large JSON', () => {
    expect(shouldCompress('application/json', 5000, 'gzip, deflate')).toBe(true)
  })

  it('should not compress small responses', () => {
    expect(shouldCompress('application/json', 500, 'gzip')).toBe(false)
  })

  it('should not compress images', () => {
    expect(shouldCompress('image/png', 50000, 'gzip')).toBe(false)
  })

  it('should not compress without gzip support', () => {
    expect(shouldCompress('application/json', 5000, 'identity')).toBe(false)
  })

  // 缓存键构建
  function buildCacheKey(prefix: string, params: Record<string, string | number | boolean | undefined>) {
    const sorted = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    return `${prefix}:${sorted}`
  }

  it('should build deterministic cache key', () => {
    const k1 = buildCacheKey('stock', { b: 2, a: 1 })
    const k2 = buildCacheKey('stock', { a: 1, b: 2 })
    expect(k1).toBe(k2)
  })

  it('should skip undefined values', () => {
    const k = buildCacheKey('test', { a: 1, b: undefined })
    expect(k).toBe('test:a=1')
  })

  // 数据扁平化
  function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, any> {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, newKey))
      } else {
        result[newKey] = value
      }
    }
    return result
  }

  it('should flatten nested objects', () => {
    const result = flattenObject({ a: { b: { c: 1 } } })
    expect(result).toEqual({ 'a.b.c': 1 })
  })

  it('should handle arrays as leaves', () => {
    const result = flattenObject({ a: [1, 2] })
    expect(result).toEqual({ a: [1, 2] })
  })

  it('should handle flat objects', () => {
    expect(flattenObject({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 })
  })

  // 安全头生成
  function generateSecurityHeaders(origin?: string) {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    }
  }

  it('should generate all security headers', () => {
    const h = generateSecurityHeaders()
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Strict-Transport-Security']).toContain('max-age')
    expect(h['Content-Security-Policy']).toBeTruthy()
  })

  it('should include CORS origin when provided', () => {
    const h = generateSecurityHeaders('https://example.com')
    expect(h['Access-Control-Allow-Origin']).toBe('https://example.com')
  })

  it('should not include CORS when no origin', () => {
    const h = generateSecurityHeaders()
    expect(h['Access-Control-Allow-Origin']).toBeUndefined()
  })

  // 限流key生成
  function rateLimitKey(ip: string, path: string, method: string) {
    const normalizedPath = path.replace(/\/[0-9a-f-]{36}/gi, '/:id')
      .replace(/\/[0-9]{6}/g, '/:code')
    return `ratelimit:${ip}:${method}:${normalizedPath}`
  }

  it('should normalize stock codes', () => {
    const key = rateLimitKey('1.2.3.4', '/api/stocks/600519', 'GET')
    expect(key).toContain('/:code')
    expect(key).not.toContain('600519')
  })

  it('should normalize UUIDs', () => {
    const key = rateLimitKey('1.2.3.4', '/api/users/550e8400-e29b-41d4-a716-446655440000', 'GET')
    expect(key).toContain('/:id')
  })

  // 错误码映射
  function mapErrorCode(statusCode: number, internalCode?: number) {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    }
    return {
      statusCode,
      code: map[statusCode] || 'UNKNOWN',
      internalCode,
      retryable: [429, 502, 503].includes(statusCode),
    }
  }

  it('should map known status codes', () => {
    expect(mapErrorCode(404).code).toBe('NOT_FOUND')
    expect(mapErrorCode(429).code).toBe('RATE_LIMITED')
  })

  it('should mark retryable errors', () => {
    expect(mapErrorCode(429).retryable).toBe(true)
    expect(mapErrorCode(502).retryable).toBe(true)
    expect(mapErrorCode(400).retryable).toBe(false)
  })

  it('should handle unknown codes', () => {
    expect(mapErrorCode(418).code).toBe('UNKNOWN')
  })
})
