import { describe, it, expect } from 'vitest'

// 前端路由与导航深度测试
describe('Router & Navigation Deep', () => {
  // 路径匹配器
  function matchRoute(pattern: string, path: string): Record<string, string> | null {
    const patternParts = pattern.split('/').filter(Boolean)
    const pathParts = path.split('/').filter(Boolean)
    if (patternParts.length !== pathParts.length) return null
    const params: Record<string, string> = {}
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i]
      } else if (patternParts[i] !== pathParts[i]) {
        return null
      }
    }
    return params
  }

  it('should match static routes', () => {
    expect(matchRoute('/stocks', '/stocks')).toEqual({})
  })

  it('should match parameterized routes', () => {
    expect(matchRoute('/stocks/:symbol', '/stocks/600519')).toEqual({ symbol: '600519' })
  })

  it('should return null for non-matching routes', () => {
    expect(matchRoute('/stocks', '/etf')).toBeNull()
  })

  it('should return null for different segment count', () => {
    expect(matchRoute('/stocks/:symbol', '/stocks')).toBeNull()
  })

  it('should match multiple params', () => {
    expect(matchRoute('/sectors/:sectorId/stocks/:symbol', '/sectors/baijiu/stocks/600519'))
      .toEqual({ sectorId: 'baijiu', symbol: '600519' })
  })

  // 面包屑生成
  function generateBreadcrumbs(path: string, labels: Record<string, string>) {
    const parts = path.split('/').filter(Boolean)
    const crumbs = [{ label: '首页', path: '/' }]
    let currentPath = ''
    for (const part of parts) {
      currentPath += '/' + part
      crumbs.push({ label: labels[part] || part, path: currentPath })
    }
    return crumbs
  }

  it('should generate breadcrumbs', () => {
    const crumbs = generateBreadcrumbs('/stocks/600519', { stocks: '股票', '600519': '贵州茅台' })
    expect(crumbs).toHaveLength(3)
    expect(crumbs[0].label).toBe('首页')
    expect(crumbs[1].label).toBe('股票')
    expect(crumbs[2].label).toBe('贵州茅台')
  })

  it('should handle root path', () => {
    expect(generateBreadcrumbs('/', {})).toHaveLength(1)
  })

  // 查询参数构建与解析
  function buildQueryString(params: Record<string, string | number | boolean | undefined | null>) {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
  }

  function parseQueryString(qs: string): Record<string, string> {
    if (!qs.startsWith('?') && !qs.includes('=')) return {}
    const str = qs.startsWith('?') ? qs.slice(1) : qs
    return Object.fromEntries(
      str.split('&').filter(Boolean).map(pair => {
        const [k, v] = pair.split('=')
        return [decodeURIComponent(k), decodeURIComponent(v || '')]
      })
    )
  }

  it('should build query string', () => {
    expect(buildQueryString({ page: 1, q: 'test', sort: undefined })).toBe('page=1&q=test')
  })

  it('should parse query string', () => {
    expect(parseQueryString('?page=1&q=test')).toEqual({ page: '1', q: 'test' })
  })

  it('should handle special characters', () => {
    const qs = buildQueryString({ q: 'A&B=1' })
    expect(parseQueryString('?' + qs).q).toBe('A&B=1')
  })

  // 导航历史管理
  class NavigationHistory {
    private stack: string[] = ['/']
    private maxLen: number
    constructor(maxLen = 50) { this.maxLen = maxLen }
    push(path: string) {
      if (this.stack[this.stack.length - 1] === path) return
      this.stack.push(path)
      if (this.stack.length > this.maxLen) this.stack.shift()
    }
    back() { return this.stack.length > 1 ? this.stack[this.stack.length - 2] : '/' }
    current() { return this.stack[this.stack.length - 1] }
    canGoBack() { return this.stack.length > 1 }
    size() { return this.stack.length }
  }

  it('should track navigation', () => {
    const nav = new NavigationHistory()
    nav.push('/stocks')
    nav.push('/stocks/600519')
    expect(nav.current()).toBe('/stocks/600519')
    expect(nav.back()).toBe('/stocks')
  })

  it('should limit history size', () => {
    const nav = new NavigationHistory(3)
    nav.push('/a'); nav.push('/b'); nav.push('/c'); nav.push('/d')
    expect(nav.size()).toBe(3)
  })

  it('should not duplicate consecutive paths', () => {
    const nav = new NavigationHistory()
    nav.push('/a'); nav.push('/a')
    expect(nav.size()).toBe(2)  // only initial + one push
  })

  // 404 检测
  function is404(path: string, validRoutes: string[]) {
    for (const route of validRoutes) {
      if (matchRoute(route, path) !== null) return false
    }
    return true
  }

  it('should detect 404 for unknown routes', () => {
    expect(is404('/unknown', ['/stocks', '/etf', '/stocks/:symbol'])).toBe(true)
  })

  it('should not 404 for valid routes', () => {
    expect(is404('/stocks/600519', ['/stocks/:symbol'])).toBe(false)
  })

  // 重定向解析
  function resolveRedirects(path: string, redirects: Record<string, string>, depth = 0): string {
    if (depth > 10) return path  // 防止循环
    const target = redirects[path]
    return target ? resolveRedirects(target, redirects, depth + 1) : path
  }

  it('should resolve redirect chain', () => {
    expect(resolveRedirects('/old', { '/old': '/new', '/new': '/latest' })).toBe('/latest')
  })

  it('should handle no redirect', () => {
    expect(resolveRedirects('/stable', {})).toBe('/stable')
  })

  it('should stop infinite loops', () => {
    expect(resolveRedirects('/a', { '/a': '/b', '/b': '/a' })).toBeTruthy()
  })

  // 权限检查
  function canAccess(path: string, userRole: string, routePermissions: Record<string, string[]>) {
    const required = routePermissions[path]
    return !required || required.includes(userRole)
  }

  it('should allow access to public routes', () => {
    expect(canAccess('/stocks', 'guest', { '/admin': ['admin'] })).toBe(true)
  })

  it('should deny unauthorized access', () => {
    expect(canAccess('/admin', 'user', { '/admin': ['admin'] })).toBe(false)
  })

  it('should allow authorized access', () => {
    expect(canAccess('/admin', 'admin', { '/admin': ['admin'] })).toBe(true)
  })

  // 活跃菜单检测
  function isActiveMenuItem(menuPath: string, currentPath: string) {
    if (menuPath === '/') return currentPath === '/'
    return currentPath === menuPath || currentPath.startsWith(menuPath + '/')
  }

  it('should match exact path', () => {
    expect(isActiveMenuItem('/stocks', '/stocks')).toBe(true)
  })

  it('should match child paths', () => {
    expect(isActiveMenuItem('/stocks', '/stocks/600519')).toBe(true)
  })

  it('should not match partial names', () => {
    expect(isActiveMenuItem('/stock', '/stocks')).toBe(false)
  })

  it('should match root exactly', () => {
    expect(isActiveMenuItem('/', '/')).toBe(true)
    expect(isActiveMenuItem('/', '/stocks')).toBe(false)
  })
})
