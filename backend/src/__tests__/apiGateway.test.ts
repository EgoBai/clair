import { describe, it, expect, beforeEach, vi } from 'vitest';

// API Gateway / Request Router
interface Route {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  pattern: RegExp;
  handler: string;
  middleware: string[];
  rateLimit: { requests: number; windowMs: number };
  auth: { required: boolean; roles: string[] };
  cache: { enabled: boolean; ttlSeconds: number };
  version: string;
  deprecated: boolean;
}

interface Request {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  userId?: string;
  userRoles?: string[];
  timestamp: Date;
  ip: string;
}

interface Response {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  duration: number;
}

interface RequestLog {
  request: Request;
  response: Response;
  matchedRoute?: string;
  cacheHit: boolean;
  rateLimited: boolean;
  authFailed: boolean;
}

interface GatewayMetrics {
  totalRequests: number;
  successRequests: number;
  errorRequests: number;
  avgResponseTime: number;
  requestsPerSecond: number;
  cacheHitRate: number;
  rateLimitedRequests: number;
  authFailures: number;
}

class APIGateway {
  private routes: Map<string, Route> = new Map();
  private requestLog: RequestLog[] = [];
  private cache: Map<string, { data: unknown; expiresAt: number }> = new Map();
  private rateLimitBuckets: Map<string, { count: number; resetAt: number }> = new Map();
  private middlewareFns: Map<string, (req: Request) => Request | null> = new Map();
  private startTime = Date.now();

  registerRoute(route: Omit<Route, 'id' | 'pattern'>): Route {
    const id = `route_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const pattern = this.pathToRegex(route.path);
    const full: Route = { ...route, id, pattern };
    this.routes.set(id, full);
    return full;
  }

  private pathToRegex(path: string): RegExp {
    const pattern = path
      .replace(/:[^/]+/g, '([^/]+)')
      .replace(/\//g, '\\/');
    return new RegExp(`^${pattern}$`);
  }

  matchRoute(method: string, path: string): Route | null {
    const candidates = Array.from(this.routes.values())
      .filter(r => r.method === method && !r.deprecated);

    for (const route of candidates) {
      if (route.pattern.test(path)) return route;
    }

    // Fallback: try exact path match
    for (const route of candidates) {
      if (route.path === path) return route;
    }
    return null;
  }

  checkRateLimit(key: string, route: Route): boolean {
    const bucketKey = `${key}:${route.id}`;
    const now = Date.now();
    let bucket = this.rateLimitBuckets.get(bucketKey);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + route.rateLimit.windowMs };
      this.rateLimitBuckets.set(bucketKey, bucket);
    }

    bucket.count++;
    return bucket.count <= route.rateLimit.requests;
  }

  checkAuth(request: Request, route: Route): boolean {
    if (!route.auth.required) return true;
    if (!request.userId) return false;
    if (route.auth.roles.length === 0) return true;
    return route.auth.roles.some(role => request.userRoles?.includes(role));
  }

  getCache(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  setCache(key: string, data: unknown, ttlSeconds: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  invalidateCache(pattern?: string): number {
    if (!pattern) {
      const count = this.cache.size;
      this.cache.clear();
      return count;
    }
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  registerMiddleware(name: string, fn: (req: Request) => Request | null): void {
    this.middlewareFns.set(name, fn);
  }

  async handleRequest(request: Request): Promise<{ response: Response; log: RequestLog }> {
    const start = Date.now();
    const log: RequestLog = {
      request,
      response: { statusCode: 500, body: null, headers: {}, duration: 0 },
      cacheHit: false,
      rateLimited: false,
      authFailed: false,
    };

    // Match route
    const route = this.matchRoute(request.method, request.path);
    if (!route) {
      log.response = { statusCode: 404, body: { error: 'Not found' }, headers: {}, duration: Date.now() - start };
      this.requestLog.push(log);
      return { response: log.response, log };
    }
    log.matchedRoute = route.id;

    // Apply middleware
    let processedReq = request;
    for (const mwName of route.middleware) {
      const mw = this.middlewareFns.get(mwName);
      if (mw) {
        const result = mw(processedReq);
        if (!result) {
          log.response = { statusCode: 500, body: { error: 'Middleware rejected' }, headers: {}, duration: Date.now() - start };
          this.requestLog.push(log);
          return { response: log.response, log };
        }
        processedReq = result;
      }
    }

    // Rate limit
    if (!this.checkRateLimit(request.ip, route)) {
      log.rateLimited = true;
      log.response = { statusCode: 429, body: { error: 'Rate limited' }, headers: { 'Retry-After': '60' }, duration: Date.now() - start };
      this.requestLog.push(log);
      return { response: log.response, log };
    }

    // Auth check
    if (!this.checkAuth(processedReq, route)) {
      log.authFailed = true;
      log.response = { statusCode: 401, body: { error: 'Unauthorized' }, headers: {}, duration: Date.now() - start };
      this.requestLog.push(log);
      return { response: log.response, log };
    }

    // Cache check
    if (route.cache.enabled) {
      const cacheKey = `${request.method}:${request.path}`;
      const cached = this.getCache(cacheKey);
      if (cached) {
        log.cacheHit = true;
        log.response = { statusCode: 200, body: cached, headers: { 'X-Cache': 'HIT' }, duration: Date.now() - start };
        this.requestLog.push(log);
        return { response: log.response, log };
      }
    }

    // Execute handler (simulated)
    const body = { success: true, route: route.path, handler: route.handler };
    log.response = { statusCode: 200, body, headers: {}, duration: Date.now() - start };

    // Set cache
    if (route.cache.enabled) {
      this.setCache(`${request.method}:${request.path}`, body, route.cache.ttlSeconds);
    }

    this.requestLog.push(log);
    return { response: log.response, log };
  }

  getMetrics(): GatewayMetrics {
    const logs = this.requestLog;
    const durations = logs.map(l => l.response.duration);
    const elapsed = (Date.now() - this.startTime) / 1000;

    return {
      totalRequests: logs.length,
      successRequests: logs.filter(l => l.response.statusCode < 400).length,
      errorRequests: logs.filter(l => l.response.statusCode >= 400).length,
      avgResponseTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      requestsPerSecond: elapsed > 0 ? logs.length / elapsed : 0,
      cacheHitRate: logs.length > 0 ? logs.filter(l => l.cacheHit).length / logs.length : 0,
      rateLimitedRequests: logs.filter(l => l.rateLimited).length,
      authFailures: logs.filter(l => l.authFailed).length,
    };
  }

  getRoutes(): Route[] {
    return Array.from(this.routes.values());
  }

  getLogs(): RequestLog[] {
    return [...this.requestLog];
  }

  clearLogs(): void {
    this.requestLog = [];
  }
}

describe('API Gateway', () => {
  let gateway: APIGateway;

  beforeEach(() => {
    gateway = new APIGateway();
  });

  it('should register route', () => {
    const route = gateway.registerRoute({
      method: 'GET', path: '/api/stocks/:symbol',
      handler: 'getStock', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    expect(route.id).toBeTruthy();
    expect(route.path).toBe('/api/stocks/:symbol');
  });

  it('should match route', () => {
    gateway.registerRoute({
      method: 'GET', path: '/api/stocks/:symbol',
      handler: 'getStock', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    const matched = gateway.matchRoute('GET', '/api/stocks/AAPL');
    expect(matched).not.toBeNull();
    expect(matched!.handler).toBe('getStock');
  });

  it('should handle 404', async () => {
    const { response } = await gateway.handleRequest({
      id: 'r1', method: 'GET', path: '/unknown',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '127.0.0.1',
    });
    expect(response.statusCode).toBe(404);
  });

  it('should handle successful request', async () => {
    gateway.registerRoute({
      method: 'GET', path: '/api/health',
      handler: 'health', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    const { response } = await gateway.handleRequest({
      id: 'r1', method: 'GET', path: '/api/health',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '127.0.0.1',
    });
    expect(response.statusCode).toBe(200);
  });

  it('should rate limit', async () => {
    gateway.registerRoute({
      method: 'GET', path: '/api/limited',
      handler: 'limited', middleware: [],
      rateLimit: { requests: 2, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    await gateway.handleRequest({
      id: 'r1', method: 'GET', path: '/api/limited',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '10.0.0.1',
    });
    await gateway.handleRequest({
      id: 'r2', method: 'GET', path: '/api/limited',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '10.0.0.1',
    });
    const { response } = await gateway.handleRequest({
      id: 'r3', method: 'GET', path: '/api/limited',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '10.0.0.1',
    });
    expect(response.statusCode).toBe(429);
  });

  it('should enforce auth', async () => {
    gateway.registerRoute({
      method: 'GET', path: '/api/admin',
      handler: 'admin', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: true, roles: ['admin'] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    const { response } = await gateway.handleRequest({
      id: 'r1', method: 'GET', path: '/api/admin',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '127.0.0.1',
    });
    expect(response.statusCode).toBe(401);
  });

  it('should pass auth with valid user', async () => {
    gateway.registerRoute({
      method: 'GET', path: '/api/admin',
      handler: 'admin', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: true, roles: ['admin'] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    const { response } = await gateway.handleRequest({
      id: 'r1', method: 'GET', path: '/api/admin',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '127.0.0.1',
      userId: 'user1', userRoles: ['admin'],
    });
    expect(response.statusCode).toBe(200);
  });

  it('should cache responses', async () => {
    gateway.registerRoute({
      method: 'GET', path: '/api/cached',
      handler: 'cached', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: true, ttlSeconds: 60 },
      version: 'v1', deprecated: false,
    });
    await gateway.handleRequest({
      id: 'r1', method: 'GET', path: '/api/cached',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '127.0.0.1',
    });
    const { log } = await gateway.handleRequest({
      id: 'r2', method: 'GET', path: '/api/cached',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '127.0.0.1',
    });
    expect(log.cacheHit).toBe(true);
  });

  it('should invalidate cache', () => {
    gateway.setCache('GET:/api/test', { data: 1 }, 60);
    gateway.setCache('GET:/api/other', { data: 2 }, 60);
    const removed = gateway.invalidateCache('test');
    expect(removed).toBe(1);
  });

  it('should apply middleware', async () => {
    gateway.registerMiddleware('addUser', (req) => ({ ...req, userId: 'injected' }));
    gateway.registerRoute({
      method: 'GET', path: '/api/me',
      handler: 'me', middleware: ['addUser'],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: true, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    const { response } = await gateway.handleRequest({
      id: 'r1', method: 'GET', path: '/api/me',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '127.0.0.1',
    });
    expect(response.statusCode).toBe(200);
  });

  it('should get metrics', async () => {
    gateway.registerRoute({
      method: 'GET', path: '/api/test',
      handler: 'test', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    await gateway.handleRequest({
      id: 'r1', method: 'GET', path: '/api/test',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '127.0.0.1',
    });
    const metrics = gateway.getMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.successRequests).toBe(1);
  });

  it('should skip deprecated routes', () => {
    gateway.registerRoute({
      method: 'GET', path: '/api/old',
      handler: 'old', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: true,
    });
    expect(gateway.matchRoute('GET', '/api/old')).toBeNull();
  });

  it('should clear logs', async () => {
    gateway.registerRoute({
      method: 'GET', path: '/api/test',
      handler: 'test', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    await gateway.handleRequest({
      id: 'r1', method: 'GET', path: '/api/test',
      headers: {}, body: null, query: {},
      timestamp: new Date(), ip: '127.0.0.1',
    });
    gateway.clearLogs();
    expect(gateway.getLogs()).toHaveLength(0);
  });

  it('should get all routes', () => {
    gateway.registerRoute({
      method: 'GET', path: '/a', handler: 'a', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    gateway.registerRoute({
      method: 'POST', path: '/b', handler: 'b', middleware: [],
      rateLimit: { requests: 100, windowMs: 60000 },
      auth: { required: false, roles: [] },
      cache: { enabled: false, ttlSeconds: 0 },
      version: 'v1', deprecated: false,
    });
    expect(gateway.getRoutes()).toHaveLength(2);
  });
});
