import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LogParser, LogAnalyzer, LogEntry, LogLevel } from '../services/logAnalyzer';

describe('logAnalyzer', () => {
  describe('LogParser', () => {
    let parser: LogParser;

    beforeEach(() => {
      parser = new LogParser();
    });

    it('should parse standard format log lines', () => {
      const entry = parser.parseLine('[2024-01-15T10:30:00.000Z] [INFO] Server started');
      expect(entry).not.toBeNull();
      expect(entry!.level).toBe('info');
      expect(entry!.message).toBe('Server started');
      expect(entry!.timestamp).toBe(new Date('2024-01-15T10:30:00.000Z').getTime());
    });

    it('should parse simple format log lines', () => {
      const entry = parser.parseLine('ERROR: Database connection failed');
      expect(entry).not.toBeNull();
      expect(entry!.level).toBe('error');
      expect(entry!.message).toBe('Database connection failed');
    });

    it('should parse WARNING as warn', () => {
      const entry = parser.parseLine('WARNING: Deprecated API');
      expect(entry).not.toBeNull();
      expect(entry!.level).toBe('warn');
    });

    it('should parse DEBUG level', () => {
      const entry = parser.parseLine('DEBUG: Debug info here');
      expect(entry).not.toBeNull();
      expect(entry!.level).toBe('debug');
    });

    it('should parse FATAL level', () => {
      const entry = parser.parseLine('FATAL: System crash');
      expect(entry).not.toBeNull();
      expect(entry!.level).toBe('fatal');
      expect(entry!.message).toBe('System crash');
    });

    it('should return null for unrecognizable lines', () => {
      const entry = parser.parseLine('just some random text');
      expect(entry).toBeNull();
    });

    it('should use custom patterns', () => {
      parser.addPattern({
        name: 'custom',
        regex: /STOCK_ALERT/,
        level: 'warn',
        description: 'Stock alert pattern',
      });
      const entry = parser.parseLine('STOCK_ALERT: price spike');
      expect(entry).not.toBeNull();
      expect(entry!.level).toBe('warn');
      expect(entry!.source).toBe('custom');
    });

    it('should parse multiple lines', () => {
      const lines = [
        'INFO: Line 1',
        'ERROR: Line 2',
        'random text',
        'WARN: Line 3',
      ];
      const entries = parser.parseLines(lines);
      expect(entries.length).toBe(3);
      expect(entries[0].level).toBe('info');
      expect(entries[1].level).toBe('error');
      expect(entries[2].level).toBe('warn');
    });

    it('should handle empty lines array', () => {
      const entries = parser.parseLines([]);
      expect(entries).toHaveLength(0);
    });

    it('should be case insensitive for simple format', () => {
      const entry = parser.parseLine('error: lowercase');
      expect(entry).not.toBeNull();
      expect(entry!.level).toBe('error');
    });
  });

  describe('LogAnalyzer', () => {
    let analyzer: LogAnalyzer;

    beforeEach(() => {
      analyzer = new LogAnalyzer(1000);
    });

    const makeEntry = (level: LogLevel, message: string, ts?: number): LogEntry => ({
      timestamp: ts ?? Date.now(),
      level,
      message,
    });

    it('should add and count entries', () => {
      analyzer.addEntry(makeEntry('info', 'test'));
      analyzer.addEntry(makeEntry('error', 'error test'));
      expect(analyzer.getCount()).toBe(2);
    });

    it('should analyze log stats', () => {
      analyzer.addEntry(makeEntry('info', 'ok'));
      analyzer.addEntry(makeEntry('info', 'ok2'));
      analyzer.addEntry(makeEntry('error', 'fail'));
      const stats = analyzer.analyze();
      expect(stats.total).toBe(3);
      expect(stats.byLevel.info).toBe(2);
      expect(stats.byLevel.error).toBe(1);
      expect(stats.errorRate).toBeCloseTo(1 / 3);
    });

    it('should track top errors', () => {
      analyzer.addEntry(makeEntry('error', 'DB timeout'));
      analyzer.addEntry(makeEntry('error', 'DB timeout'));
      analyzer.addEntry(makeEntry('error', 'Auth failed'));
      const stats = analyzer.analyze();
      expect(stats.topErrors[0].message).toBe('DB timeout');
      expect(stats.topErrors[0].count).toBe(2);
    });

    it('should filter by timestamp', () => {
      const now = Date.now();
      analyzer.addEntry(makeEntry('info', 'old', now - 100000));
      analyzer.addEntry(makeEntry('info', 'new', now));
      const stats = analyzer.analyze(now - 1000);
      expect(stats.total).toBe(1);
    });

    it('should trigger alert rules', () => {
      analyzer.addAlertRule({
        name: 'high-error-rate',
        condition: (stats) => stats.errorRate > 0.5,
        message: 'Error rate exceeds 50%',
      });
      analyzer.addEntry(makeEntry('error', 'e1'));
      analyzer.addEntry(makeEntry('error', 'e2'));
      analyzer.addEntry(makeEntry('info', 'ok'));
      const stats = analyzer.analyze();
      expect(stats.alerts).toContain('Error rate exceeds 50%');
    });

    it('should not trigger alerts when condition not met', () => {
      analyzer.addAlertRule({
        name: 'high-error-rate',
        condition: (stats) => stats.errorRate > 0.5,
        message: 'High errors',
      });
      analyzer.addEntry(makeEntry('info', 'ok'));
      analyzer.addEntry(makeEntry('info', 'ok'));
      analyzer.addEntry(makeEntry('error', 'e1'));
      const stats = analyzer.analyze();
      expect(stats.alerts).toHaveLength(0);
    });

    it('should search entries', () => {
      analyzer.addEntry(makeEntry('info', 'User login'));
      analyzer.addEntry(makeEntry('error', 'DB connection failed'));
      analyzer.addEntry(makeEntry('info', 'User logout'));
      const results = analyzer.search('user');
      expect(results.length).toBe(2);
    });

    it('should search with level filter', () => {
      analyzer.addEntry(makeEntry('info', 'test message'));
      analyzer.addEntry(makeEntry('error', 'test error'));
      const results = analyzer.search('test', { level: 'error' });
      expect(results.length).toBe(1);
      expect(results[0].level).toBe('error');
    });

    it('should search with limit', () => {
      for (let i = 0; i < 20; i++) {
        analyzer.addEntry(makeEntry('info', `message ${i}`));
      }
      const results = analyzer.search('message', { limit: 5 });
      expect(results.length).toBe(5);
    });

    it('should clear all entries', () => {
      analyzer.addEntry(makeEntry('info', 'test'));
      analyzer.clear();
      expect(analyzer.getCount()).toBe(0);
    });

    it('should respect max entries limit', () => {
      const small = new LogAnalyzer(3);
      small.addEntry(makeEntry('info', '1'));
      small.addEntry(makeEntry('info', '2'));
      small.addEntry(makeEntry('info', '3'));
      small.addEntry(makeEntry('info', '4'));
      expect(small.getCount()).toBe(3);
    });

    it('should return hourly breakdown', () => {
      const now = Date.now();
      const hourMs = 3600_000;
      analyzer.addEntry(makeEntry('info', 'a', now - hourMs * 2));
      analyzer.addEntry(makeEntry('error', 'b', now - hourMs));
      analyzer.addEntry(makeEntry('info', 'c', now));
      const breakdown = analyzer.hourlyBreakdown(24);
      expect(breakdown.length).toBeGreaterThan(0);
      const total = breakdown.reduce((s, b) => s + b.count, 0);
      expect(total).toBe(3);
    });

    it('should count errors in hourly breakdown', () => {
      const now = Date.now();
      analyzer.addEntry(makeEntry('error', 'e1', now));
      analyzer.addEntry(makeEntry('fatal', 'e2', now));
      analyzer.addEntry(makeEntry('info', 'ok', now));
      const breakdown = analyzer.hourlyBreakdown(1);
      const bucket = breakdown.find(b => b.count > 0);
      expect(bucket?.errors).toBe(2);
    });

    it('should handle empty analyzer', () => {
      const stats = analyzer.analyze();
      expect(stats.total).toBe(0);
      expect(stats.errorRate).toBe(0);
      expect(stats.topErrors).toHaveLength(0);
      expect(stats.alerts).toHaveLength(0);
    });

    it('should include fatal in error rate', () => {
      analyzer.addEntry(makeEntry('fatal', 'crash'));
      analyzer.addEntry(makeEntry('info', 'ok'));
      const stats = analyzer.analyze();
      expect(stats.errorRate).toBe(0.5);
    });
  });
});
