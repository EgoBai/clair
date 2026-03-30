import { describe, it, expect } from 'vitest';

describe('系统监控与运维工具', () => {
  // 健康检查
  const healthCheck = (services: { name: string; status: 'up' | 'down' | 'degraded'; latency: number }[]) => {
    const up = services.filter(s => s.status === 'up').length;
    const down = services.filter(s => s.status === 'down').length;
    const degraded = services.filter(s => s.status === 'degraded').length;
    const avgLatency = services.length > 0 ? services.reduce((s, v) => s + v.latency, 0) / services.length : 0;
    const overall = down > 0 ? 'unhealthy' : degraded > 0 ? 'degraded' : 'healthy';
    return { up, down, degraded, total: services.length, avgLatency, overall };
  };

  describe('健康检查', () => {
    it('全部正常', () => {
      const result = healthCheck([
        { name: 'db', status: 'up', latency: 5 },
        { name: 'cache', status: 'up', latency: 2 },
      ]);
      expect(result.overall).toBe('healthy');
      expect(result.up).toBe(2);
    });
    it('存在宕机', () => {
      const result = healthCheck([
        { name: 'db', status: 'up', latency: 5 },
        { name: 'cache', status: 'down', latency: 0 },
      ]);
      expect(result.overall).toBe('unhealthy');
    });
    it('降级状态', () => {
      const result = healthCheck([
        { name: 'db', status: 'up', latency: 5 },
        { name: 'cache', status: 'degraded', latency: 50 },
      ]);
      expect(result.overall).toBe('degraded');
    });
    it('平均延迟', () => {
      const result = healthCheck([
        { name: 'a', status: 'up', latency: 10 },
        { name: 'b', status: 'up', latency: 20 },
      ]);
      expect(result.avgLatency).toBe(15);
    });
    it('空服务列表', () => {
      const result = healthCheck([]);
      expect(result.overall).toBe('healthy');
      expect(result.total).toBe(0);
    });
  });

  // 指标聚合
  const aggregateMetrics = (metrics: { name: string; value: number; timestamp: number }[], windowMs: number) => {
    const now = Math.max(...metrics.map(m => m.timestamp));
    const recent = metrics.filter(m => now - m.timestamp <= windowMs);
    const byName: Record<string, number[]> = {};
    for (const m of recent) {
      if (!byName[m.name]) byName[m.name] = [];
      byName[m.name].push(m.value);
    }
    return Object.entries(byName).map(([name, values]) => ({
      name,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
    }));
  };

  describe('指标聚合', () => {
    it('按名称聚合', () => {
      const metrics = [
        { name: 'cpu', value: 50, timestamp: 1000 },
        { name: 'cpu', value: 70, timestamp: 2000 },
        { name: 'mem', value: 60, timestamp: 1500 },
      ];
      const result = aggregateMetrics(metrics, 5000);
      expect(result.length).toBe(2);
      const cpu = result.find(r => r.name === 'cpu');
      expect(cpu!.avg).toBe(60);
    });
    it('时间窗口过滤', () => {
      const metrics = [
        { name: 'cpu', value: 50, timestamp: 1000 },
        { name: 'cpu', value: 90, timestamp: 10000 },
      ];
      const result = aggregateMetrics(metrics, 2000);
      expect(result[0].count).toBe(1);
    });
    it('最大最小值', () => {
      const metrics = [
        { name: 'latency', value: 10, timestamp: 1000 },
        { name: 'latency', value: 50, timestamp: 1500 },
        { name: 'latency', value: 30, timestamp: 2000 },
      ];
      const result = aggregateMetrics(metrics, 5000);
      expect(result[0].min).toBe(10);
      expect(result[0].max).toBe(50);
    });
    it('空指标', () => {
      expect(aggregateMetrics([], 1000)).toEqual([]);
    });
  });

  // 告警规则引擎
  const evaluateAlerts = (
    metrics: Record<string, number>,
    rules: { metric: string; operator: '>' | '<' | '==' | '>=' | '<='; threshold: number; severity: string }[]
  ) => {
    const triggered: { metric: string; value: number; rule: typeof rules[0] }[] = [];
    for (const rule of rules) {
      const value = metrics[rule.metric];
      if (value === undefined) continue;
      let match = false;
      switch (rule.operator) {
        case '>': match = value > rule.threshold; break;
        case '<': match = value < rule.threshold; break;
        case '==': match = value === rule.threshold; break;
        case '>=': match = value >= rule.threshold; break;
        case '<=': match = value <= rule.threshold; break;
      }
      if (match) triggered.push({ metric: rule.metric, value, rule });
    }
    return { triggered, count: triggered.length };
  };

  describe('告警规则引擎', () => {
    const rules = [
      { metric: 'cpu', operator: '>' as const, threshold: 80, severity: 'critical' },
      { metric: 'mem', operator: '>' as const, threshold: 90, severity: 'critical' },
      { metric: 'latency', operator: '>' as const, threshold: 1000, severity: 'warning' },
      { metric: 'errorRate', operator: '>' as const, threshold: 0.05, severity: 'critical' },
    ];

    it('CPU超阈值', () => {
      const result = evaluateAlerts({ cpu: 85, mem: 50 }, rules);
      expect(result.count).toBe(1);
      expect(result.triggered[0].metric).toBe('cpu');
    });
    it('多条件触发', () => {
      const result = evaluateAlerts({ cpu: 90, mem: 95, latency: 2000 }, rules);
      expect(result.count).toBe(3);
    });
    it('无告警', () => {
      const result = evaluateAlerts({ cpu: 50, mem: 60, latency: 100 }, rules);
      expect(result.count).toBe(0);
    });
    it('边界值', () => {
      const result = evaluateAlerts({ cpu: 80 }, rules);
      expect(result.count).toBe(0); // 80 not > 80
    });
    it('缺失指标', () => {
      const result = evaluateAlerts({ cpu: 90 }, rules);
      expect(result.count).toBe(1); // only cpu triggered
    });
  });

  // 限流器
  const createRateLimiter = (capacity: number, refillRate: number) => {
    let tokens = capacity;
    let lastRefill = Date.now();
    return {
      tryConsume: (n = 1) => {
        const now = Date.now();
        tokens = Math.min(capacity, tokens + (now - lastRefill) * refillRate / 1000);
        lastRefill = now;
        if (tokens >= n) { tokens -= n; return true; }
        return false;
      },
      getTokens: () => tokens,
    };
  };

  describe('令牌桶限流', () => {
    it('初始容量', () => {
      const limiter = createRateLimiter(10, 1);
      expect(limiter.getTokens()).toBe(10);
    });
    it('消耗令牌', () => {
      const limiter = createRateLimiter(10, 1);
      expect(limiter.tryConsume(5)).toBe(true);
      expect(limiter.tryConsume(5)).toBe(true);
    });
    it('令牌不足', () => {
      const limiter = createRateLimiter(3, 1);
      expect(limiter.tryConsume(3)).toBe(true);
      expect(limiter.tryConsume(1)).toBe(false);
    });
  });

  // 熔断器状态机
  const createCircuitBreaker = (failureThreshold: number, resetTimeout: number) => {
    let state: 'closed' | 'open' | 'half-open' = 'closed';
    let failures = 0;
    let lastFailure = 0;
    return {
      getState: () => state,
      recordSuccess: () => { failures = 0; state = 'closed'; },
      recordFailure: () => {
        failures++;
        lastFailure = Date.now();
        if (failures >= failureThreshold) state = 'open';
      },
      canExecute: () => {
        if (state === 'closed') return true;
        if (state === 'open' && Date.now() - lastFailure > resetTimeout) {
          state = 'half-open';
          return true;
        }
        return state === 'half-open';
      },
    };
  };

  describe('熔断器', () => {
    it('初始关闭状态', () => {
      const cb = createCircuitBreaker(3, 1000);
      expect(cb.getState()).toBe('closed');
      expect(cb.canExecute()).toBe(true);
    });
    it('失败累积触发熔断', () => {
      const cb = createCircuitBreaker(3, 1000);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
    });
    it('成功重置失败计数', () => {
      const cb = createCircuitBreaker(3, 1000);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess();
      expect(cb.getState()).toBe('closed');
    });
    it('开启状态不允许执行', () => {
      const cb = createCircuitBreaker(2, 1000);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.canExecute()).toBe(false);
    });
  });

  // 日志级别过滤
  const filterLogs = (logs: { level: string; message: string; timestamp: number }[], minLevel: string) => {
    const levels = ['debug', 'info', 'warn', 'error', 'fatal'];
    const minIdx = levels.indexOf(minLevel);
    return logs.filter(l => levels.indexOf(l.level) >= minIdx);
  };

  describe('日志过滤', () => {
    const logs = [
      { level: 'debug', message: 'd1', timestamp: 1 },
      { level: 'info', message: 'i1', timestamp: 2 },
      { level: 'warn', message: 'w1', timestamp: 3 },
      { level: 'error', message: 'e1', timestamp: 4 },
      { level: 'fatal', message: 'f1', timestamp: 5 },
    ];

    it('过滤debug', () => {
      const result = filterLogs(logs, 'warn');
      expect(result.length).toBe(3);
      expect(result.every(l => ['warn', 'error', 'fatal'].includes(l.level))).toBe(true);
    });
    it('不过滤fatal', () => {
      const result = filterLogs(logs, 'fatal');
      expect(result.length).toBe(1);
    });
    it('全部通过', () => {
      const result = filterLogs(logs, 'debug');
      expect(result.length).toBe(5);
    });
    it('空日志', () => {
      expect(filterLogs([], 'info')).toEqual([]);
    });
  });

  // 链路追踪
  const buildTraceTree = (spans: { id: string; parentId: string | null; name: string; duration: number }[]) => {
    const map = new Map(spans.map(s => [s.id, { ...s, children: [] as typeof spans }]));
    const roots: typeof spans = [];
    for (const span of spans) {
      const node = map.get(span.id)!;
      if (span.parentId && map.has(span.parentId)) {
        (map.get(span.parentId) as any).children.push(node);
      } else {
        roots.push(node as any);
      }
    }
    const totalDuration = spans.reduce((s, sp) => s + sp.duration, 0);
    const criticalPath = spans.reduce((max, sp) => sp.duration > max.duration ? sp : max, spans[0] || { name: '', duration: 0 });
    return { roots, totalDuration, criticalPath: criticalPath.name, spanCount: spans.length };
  };

  describe('链路追踪', () => {
    it('构建树', () => {
      const spans = [
        { id: '1', parentId: null, name: 'root', duration: 100 },
        { id: '2', parentId: '1', name: 'child1', duration: 30 },
        { id: '3', parentId: '1', name: 'child2', duration: 50 },
      ];
      const result = buildTraceTree(spans);
      expect(result.roots.length).toBe(1);
      expect(result.spanCount).toBe(3);
    });
    it('关键路径', () => {
      const spans = [
        { id: '1', parentId: null, name: 'fast', duration: 10 },
        { id: '2', parentId: null, name: 'slow', duration: 200 },
      ];
      const result = buildTraceTree(spans);
      expect(result.criticalPath).toBe('slow');
    });
    it('空跨度', () => {
      const result = buildTraceTree([]);
      expect(result.spanCount).toBe(0);
    });
  });
});
