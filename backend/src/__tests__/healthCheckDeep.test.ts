import { describe, it, expect } from 'vitest';

// Health Check System
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface ServiceHealth {
  name: string;
  status: HealthStatus;
  latency: number;
  lastCheck: number;
  error?: string;
}

interface SystemHealth {
  status: HealthStatus;
  services: ServiceHealth[];
  uptime: number;
  version: string;
  timestamp: number;
}

function assessHealth(services: ServiceHealth[]): HealthStatus {
  if (services.length === 0) return 'healthy';
  const unhealthy = services.filter(s => s.status === 'unhealthy');
  const degraded = services.filter(s => s.status === 'degraded');
  if (unhealthy.length > 0) return 'unhealthy';
  if (degraded.length > 0) return 'degraded';
  return 'healthy';
}

function calculateHealthScore(services: ServiceHealth[]): number {
  if (services.length === 0) return 100;
  let score = 100;
  for (const s of services) {
    if (s.status === 'unhealthy') score -= 40;
    else if (s.status === 'degraded') score -= 15;
    if (s.latency > 5000) score -= 10;
    else if (s.latency > 2000) score -= 5;
  }
  return Math.max(0, Math.min(100, score));
}

function getHealthGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function checkStaleness(service: ServiceHealth, maxAge: number, now: number): boolean {
  return (now - service.lastCheck) > maxAge;
}

function buildHealthReport(services: ServiceHealth[], uptime: number, version: string): SystemHealth {
  return {
    status: assessHealth(services),
    services,
    uptime,
    version,
    timestamp: Date.now(),
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

describe('Health Check System', () => {
  const healthyService: ServiceHealth = {
    name: 'database', status: 'healthy', latency: 50, lastCheck: Date.now(),
  };
  const degradedService: ServiceHealth = {
    name: 'cache', status: 'degraded', latency: 3000, lastCheck: Date.now(),
  };
  const unhealthyService: ServiceHealth = {
    name: 'api', status: 'unhealthy', latency: 0, lastCheck: Date.now(), error: 'Connection refused',
  };

  it('should return healthy when all services healthy', () => {
    expect(assessHealth([healthyService, { ...healthyService, name: 'cache' }])).toBe('healthy');
  });

  it('should return degraded when any service degraded', () => {
    expect(assessHealth([healthyService, degradedService])).toBe('degraded');
  });

  it('should return unhealthy when any service unhealthy', () => {
    expect(assessHealth([healthyService, degradedService, unhealthyService])).toBe('unhealthy');
  });

  it('should prioritize unhealthy over degraded', () => {
    expect(assessHealth([degradedService, unhealthyService])).toBe('unhealthy');
  });

  it('should return healthy for empty services', () => {
    expect(assessHealth([])).toBe('healthy');
  });

  it('should calculate health score as 100 for all healthy', () => {
    expect(calculateHealthScore([healthyService, { ...healthyService, name: 'x' }])).toBe(100);
  });

  it('should deduct score for degraded services', () => {
    const score = calculateHealthScore([healthyService, degradedService]);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('should deduct heavily for unhealthy services', () => {
    const score = calculateHealthScore([unhealthyService]);
    expect(score).toBeLessThanOrEqual(60);
  });

  it('should deduct for high latency', () => {
    const slowService: ServiceHealth = { name: 'slow', status: 'healthy', latency: 6000, lastCheck: Date.now() };
    const score = calculateHealthScore([slowService]);
    expect(score).toBeLessThan(100);
  });

  it('should not go below 0', () => {
    const services = Array(5).fill(unhealthyService);
    expect(calculateHealthScore(services)).toBe(0);
  });

  it('should not go above 100', () => {
    expect(calculateHealthScore([])).toBe(100);
  });

  it('should assign correct grades', () => {
    expect(getHealthGrade(95)).toBe('A');
    expect(getHealthGrade(90)).toBe('A');
    expect(getHealthGrade(85)).toBe('B');
    expect(getHealthGrade(80)).toBe('B');
    expect(getHealthGrade(75)).toBe('C');
    expect(getHealthGrade(70)).toBe('C');
    expect(getHealthGrade(65)).toBe('D');
    expect(getHealthGrade(60)).toBe('D');
    expect(getHealthGrade(50)).toBe('F');
    expect(getHealthGrade(0)).toBe('F');
  });

  it('should detect stale services', () => {
    const stale: ServiceHealth = { name: 'old', status: 'healthy', latency: 10, lastCheck: 1000 };
    expect(checkStaleness(stale, 5000, 7000)).toBe(true);
    expect(checkStaleness(stale, 5000, 5000)).toBe(false);
  });

  it('should build health report with correct status', () => {
    const report = buildHealthReport([healthyService], 86400, '1.0.0');
    expect(report.status).toBe('healthy');
    expect(report.uptime).toBe(86400);
    expect(report.version).toBe('1.0.0');
    expect(report.services).toHaveLength(1);
  });

  it('should format uptime correctly', () => {
    expect(formatUptime(0)).toBe('0m');
    expect(formatUptime(60)).toBe('1m');
    expect(formatUptime(3600)).toBe('1h 0m');
    expect(formatUptime(3661)).toBe('1h 1m');
    expect(formatUptime(90061)).toBe('1d 1h 1m');
    expect(formatUptime(86400)).toBe('1d 0m');
  });

  it('should handle all services unhealthy', () => {
    const report = buildHealthReport([unhealthyService, { ...unhealthyService, name: 'db' }], 100, '2.0');
    expect(report.status).toBe('unhealthy');
  });

  it('should handle mixed health states', () => {
    const report = buildHealthReport([healthyService, degradedService], 1000, '1.0');
    expect(report.status).toBe('degraded');
  });
});
