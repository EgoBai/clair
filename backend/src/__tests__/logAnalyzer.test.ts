import { describe, it, expect } from 'vitest';
import { LogParser, LogAnalyzer } from '../services/logAnalyzer';

describe('LogParser', () => {
  it('should parse standard format', () => {
    const parser = new LogParser();
    const entry = parser.parseLine('[2024-01-15T10:30:00Z] [INFO] Server started');
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe('info');
    expect(entry!.message).toBe('Server started');
  });

  it('should parse simple format', () => {
    const parser = new LogParser();
    const entry = parser.parseLine('ERROR: Connection failed');
    expect(entry!.level).toBe('error');
    expect(entry!.message).toBe('Connection failed');
  });

  it('should parse WARNING as warn', () => {
    const parser = new LogParser();
    const entry = parser.parseLine('WARNING: Low memory');
    expect(entry!.level).toBe('warn');
  });

  it('should use custom patterns', () => {
    const parser = new LogParser();
    parser.addPattern({ name: 'timeout', regex: /timeout/i, level: 'error', description: 'Timeout' });
    const entry = parser.parseLine('Request timeout after 30s');
    expect(entry!.level).toBe('error');
    expect(entry!.source).toBe('timeout');
  });

  it('should return null for unrecognized lines', () => {
    const parser = new LogParser();
    expect(parser.parseLine('just some random text')).toBeNull();
  });

  it('should batch parse lines', () => {
    const parser = new LogParser();
    const entries = parser.parseLines([
      'INFO: Start',
      'garbage line',
      'ERROR: Fail',
    ]);
    expect(entries).toHaveLength(2);
  });
});

describe('LogAnalyzer', () => {
  it('should analyze log levels', () => {
    const analyzer = new LogAnalyzer();
    analyzer.addEntry({ timestamp: Date.now(), level: 'info', message: 'a' });
    analyzer.addEntry({ timestamp: Date.now(), level: 'error', message: 'b' });
    analyzer.addEntry({ timestamp: Date.now(), level: 'info', message: 'c' });

    const stats = analyzer.analyze();
    expect(stats.total).toBe(3);
    expect(stats.byLevel.info).toBe(2);
    expect(stats.byLevel.error).toBe(1);
    expect(stats.errorRate).toBeCloseTo(1 / 3);
  });

  it('should track top errors', () => {
    const analyzer = new LogAnalyzer();
    for (let i = 0; i < 5; i++) analyzer.addEntry({ timestamp: Date.now(), level: 'error', message: 'DB timeout' });
    for (let i = 0; i < 2; i++) analyzer.addEntry({ timestamp: Date.now(), level: 'error', message: 'Auth fail' });

    const stats = analyzer.analyze();
    expect(stats.topErrors[0].message).toBe('DB timeout');
    expect(stats.topErrors[0].count).toBe(5);
  });

  it('should filter by time', () => {
    const analyzer = new LogAnalyzer();
    analyzer.addEntry({ timestamp: 1000, level: 'info', message: 'old' });
    analyzer.addEntry({ timestamp: 5000, level: 'info', message: 'new' });
    const stats = analyzer.analyze(3000);
    expect(stats.total).toBe(1);
  });

  it('should trigger alerts', () => {
    const analyzer = new LogAnalyzer();
    analyzer.addAlertRule({
      name: 'high-error',
      condition: (s) => s.errorRate > 0.5,
      message: 'Error rate too high',
    });
    analyzer.addEntry({ timestamp: Date.now(), level: 'error', message: 'e1' });
    analyzer.addEntry({ timestamp: Date.now(), level: 'error', message: 'e2' });
    analyzer.addEntry({ timestamp: Date.now(), level: 'info', message: 'i1' });

    const stats = analyzer.analyze();
    expect(stats.alerts).toContain('Error rate too high');
  });

  it('should search logs', () => {
    const analyzer = new LogAnalyzer();
    analyzer.addEntry({ timestamp: Date.now(), level: 'info', message: 'User login' });
    analyzer.addEntry({ timestamp: Date.now(), level: 'error', message: 'User not found' });
    analyzer.addEntry({ timestamp: Date.now(), level: 'info', message: 'Server start' });

    const results = analyzer.search('user');
    expect(results).toHaveLength(2);
  });

  it('should search with level filter', () => {
    const analyzer = new LogAnalyzer();
    analyzer.addEntry({ timestamp: Date.now(), level: 'info', message: 'User login' });
    analyzer.addEntry({ timestamp: Date.now(), level: 'error', message: 'User not found' });

    const results = analyzer.search('user', { level: 'error' });
    expect(results).toHaveLength(1);
  });

  it('should track entry count', () => {
    const analyzer = new LogAnalyzer();
    analyzer.addEntry({ timestamp: Date.now(), level: 'info', message: 'a' });
    analyzer.addEntry({ timestamp: Date.now(), level: 'info', message: 'b' });
    expect(analyzer.getCount()).toBe(2);
  });

  it('should clear entries', () => {
    const analyzer = new LogAnalyzer();
    analyzer.addEntry({ timestamp: Date.now(), level: 'info', message: 'a' });
    analyzer.clear();
    expect(analyzer.getCount()).toBe(0);
  });

  it('should compute hourly breakdown', () => {
    const analyzer = new LogAnalyzer();
    const now = Date.now();
    analyzer.addEntry({ timestamp: now, level: 'info', message: 'a' });
    analyzer.addEntry({ timestamp: now - 3600_000, level: 'error', message: 'b' });
    const breakdown = analyzer.hourlyBreakdown(24);
    expect(breakdown.length).toBeGreaterThan(0);
  });
});
