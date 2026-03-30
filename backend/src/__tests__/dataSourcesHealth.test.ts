import { describe, it, expect } from 'vitest';

// ===== 数据源容灾与负载均衡测试 =====
describe('Data Source Failover & Load Balancing', () => {
  interface DataSource {
    name: string;
    priority: number;
    healthy: boolean;
    latency: number;
    errorCount: number;
    lastError?: string;
  }

  const selectSource = (sources: DataSource[]): DataSource | null => {
    const healthy = sources.filter(s => s.healthy && s.errorCount < 10);
    if (healthy.length === 0) return null;
    return healthy.sort((a, b) => a.priority - b.priority || a.latency - b.latency)[0];
  };

  const markUnhealthy = (sources: DataSource[], name: string): DataSource[] => {
    return sources.map(s => s.name === name ? { ...s, healthy: false } : s);
  };

  const restoreHealth = (sources: DataSource[], name: string): DataSource[] => {
    return sources.map(s => s.name === name ? { ...s, healthy: true, errorCount: 0 } : s);
  };

  const calcHealthScore = (s: DataSource): number => {
    let score = 100;
    score -= s.errorCount * 5;
    score -= s.latency / 10;
    if (!s.healthy) score -= 50;
    return Math.max(0, Math.min(100, score));
  };

  const sampleSources: DataSource[] = [
    { name: 'tushare', priority: 1, healthy: true, latency: 50, errorCount: 0 },
    { name: 'akshare', priority: 2, healthy: true, latency: 100, errorCount: 2 },
    { name: 'eastmoney', priority: 3, healthy: true, latency: 200, errorCount: 5 },
    { name: 'sina', priority: 4, healthy: false, latency: 150, errorCount: 10 },
  ];

  it('应选择最高优先级健康源', () => {
    const src = selectSource(sampleSources);
    expect(src?.name).toBe('tushare');
  });

  it('主源故障应降级', () => {
    const degraded = markUnhealthy(sampleSources, 'tushare');
    const src = selectSource(degraded);
    expect(src?.name).toBe('akshare');
  });

  it('全故障应返回null', () => {
    const allDown = sampleSources.map(s => ({ ...s, healthy: false }));
    expect(selectSource(allDown)).toBeNull();
  });

  it('错误过多应排除', () => {
    const sources = sampleSources.map(s => s.name === 'tushare' ? { ...s, errorCount: 15 } : s);
    const src = selectSource(sources);
    expect(src?.name).not.toBe('tushare');
  });

  it('同优先级按延迟选', () => {
    const sources: DataSource[] = [
      { name: 'a', priority: 1, healthy: true, latency: 200, errorCount: 0 },
      { name: 'b', priority: 1, healthy: true, latency: 50, errorCount: 0 },
    ];
    expect(selectSource(sources)?.name).toBe('b');
  });

  it('恢复健康', () => {
    const restored = restoreHealth(markUnhealthy(sampleSources, 'akshare'), 'akshare');
    const ak = restored.find(s => s.name === 'akshare');
    expect(ak?.healthy).toBe(true);
    expect(ak?.errorCount).toBe(0);
  });

  it('健康评分', () => {
    expect(calcHealthScore(sampleSources[0])).toBeGreaterThan(90);
    expect(calcHealthScore(sampleSources[3])).toBeLessThan(50);
  });

  it('高错误率评分低', () => {
    const bad: DataSource = { name: 'x', priority: 1, healthy: true, latency: 50, errorCount: 10 };
    expect(calcHealthScore(bad)).toBeLessThan(calcHealthScore(sampleSources[0]));
  });

  it('故障源评分最低', () => {
    const down: DataSource = { name: 'x', priority: 1, healthy: false, latency: 50, errorCount: 0 };
    expect(calcHealthScore(down)).toBeLessThan(60);
  });
});

// ===== 健康检查聚合测试 =====
describe('Health Check Aggregation', () => {
  interface ServiceHealth {
    name: string;
    status: 'up' | 'down' | 'degraded';
    latency: number;
    lastCheck: number;
  }

  const aggregateHealth = (services: ServiceHealth[]): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    upCount: number;
    downCount: number;
    avgLatency: number;
  } => {
    const up = services.filter(s => s.status === 'up');
    const down = services.filter(s => s.status === 'down');
    const degraded = services.filter(s => s.status === 'degraded');
    const avgLatency = services.length > 0
      ? services.reduce((s, sv) => s + sv.latency, 0) / services.length
      : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (down.length > 0) status = 'unhealthy';
    else if (degraded.length > 0) status = 'degraded';
    else status = 'healthy';

    return { status, upCount: up.length, downCount: down.length, avgLatency };
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}天`);
    if (hours > 0) parts.push(`${hours}小时`);
    if (mins > 0) parts.push(`${mins}分钟`);
    return parts.join('') || '0分钟';
  };

  it('全up应healthy', () => {
    const h = aggregateHealth([
      { name: 'db', status: 'up', latency: 10, lastCheck: Date.now() },
      { name: 'api', status: 'up', latency: 50, lastCheck: Date.now() },
    ]);
    expect(h.status).toBe('healthy');
    expect(h.upCount).toBe(2);
  });

  it('有down应unhealthy', () => {
    const h = aggregateHealth([
      { name: 'db', status: 'up', latency: 10, lastCheck: Date.now() },
      { name: 'api', status: 'down', latency: 0, lastCheck: Date.now() },
    ]);
    expect(h.status).toBe('unhealthy');
    expect(h.downCount).toBe(1);
  });

  it('有degraded应degraded', () => {
    const h = aggregateHealth([
      { name: 'db', status: 'up', latency: 10, lastCheck: Date.now() },
      { name: 'api', status: 'degraded', latency: 500, lastCheck: Date.now() },
    ]);
    expect(h.status).toBe('degraded');
  });

  it('空应healthy', () => {
    expect(aggregateHealth([]).status).toBe('healthy');
  });

  it('平均延迟', () => {
    const h = aggregateHealth([
      { name: 'a', status: 'up', latency: 10, lastCheck: 0 },
      { name: 'b', status: 'up', latency: 30, lastCheck: 0 },
    ]);
    expect(h.avgLatency).toBe(20);
  });

  it('运行时间格式化-天', () => {
    expect(formatUptime(86400)).toContain('1天');
  });

  it('运行时间格式化-小时', () => {
    expect(formatUptime(3600)).toContain('1小时');
  });

  it('运行时间格式化-分钟', () => {
    expect(formatUptime(60)).toContain('1分钟');
  });

  it('运行时间格式化-组合', () => {
    const r = formatUptime(90061); // 1天1小时1分钟
    expect(r).toContain('天');
    expect(r).toContain('小时');
    expect(r).toContain('分钟');
  });

  it('0秒', () => {
    expect(formatUptime(0)).toBe('0分钟');
  });
});
