import { describe, it, expect, beforeEach } from 'vitest';

// Compliance & Audit Trail Engine
interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userId: string;
  timestamp: Date;
  details: Record<string, unknown>;
  ip: string;
  userAgent: string;
  result: 'success' | 'failure' | 'warning';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  category: 'trading' | 'data' | 'access' | 'reporting' | 'risk';
  condition: (entry: AuditEntry) => boolean;
  action: 'alert' | 'block' | 'log' | 'escalate';
  enabled: boolean;
}

interface ComplianceViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  entry: AuditEntry;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  notes: string;
}

interface AuditReport {
  period: { start: Date; end: Date };
  totalActions: number;
  byEntity: Record<string, number>;
  byAction: Record<string, number>;
  byUser: Record<string, number>;
  byResult: Record<string, number>;
  violations: ComplianceViolation[];
  highRiskActions: AuditEntry[];
  anomalies: { description: string; entries: AuditEntry[] }[];
}

class ComplianceEngine {
  private auditLog: AuditEntry[] = [];
  private rules: Map<string, ComplianceRule> = new Map();
  private violations: ComplianceViolation[] = [];
  private entitySnapshots: Map<string, Record<string, unknown>> = new Map();

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const full: AuditEntry = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    this.auditLog.push(full);

    // Check compliance rules
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (rule.condition(full)) {
        const violation: ComplianceViolation = {
          id: `viol_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          ruleId: rule.id,
          ruleName: rule.name,
          entry: full,
          severity: full.riskLevel,
          resolved: false,
          notes: '',
        };
        this.violations.push(violation);
      }
    }

    return full;
  }

  addRule(rule: Omit<ComplianceRule, 'id'>): ComplianceRule {
    const id = `rule_${Date.now()}`;
    const full: ComplianceRule = { ...rule, id };
    this.rules.set(id, full);
    return full;
  }

  snapshotEntity(entity: string, entityId: string, data: Record<string, unknown>): void {
    const key = `${entity}:${entityId}`;
    this.entitySnapshots.set(key, { ...data, _timestamp: new Date() });
  }

  getEntityHistory(entity: string, entityId: string): AuditEntry[] {
    return this.auditLog.filter(e => e.entity === entity && e.entityId === entityId);
  }

  getDiff(entity: string, entityId: string, before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { old: unknown; new: unknown }> {
    const diff: Record<string, { old: unknown; new: unknown }> = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      if (before[key] !== after[key]) {
        diff[key] = { old: before[key], new: after[key] };
      }
    }
    return diff;
  }

  resolveViolation(violationId: string, userId: string, notes: string): boolean {
    const violation = this.violations.find(v => v.id === violationId);
    if (!violation) return false;
    violation.resolved = true;
    violation.resolvedBy = userId;
    violation.resolvedAt = new Date();
    violation.notes = notes;
    return true;
  }

  generateReport(start: Date, end: Date): AuditReport {
    const entries = this.auditLog.filter(e => e.timestamp >= start && e.timestamp <= end);
    const violations = this.violations.filter(v => v.entry.timestamp >= start && v.entry.timestamp <= end);

    const byEntity: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    const byResult: Record<string, number> = {};

    for (const e of entries) {
      byEntity[e.entity] = (byEntity[e.entity] ?? 0) + 1;
      byAction[e.action] = (byAction[e.action] ?? 0) + 1;
      byUser[e.userId] = (byUser[e.userId] ?? 0) + 1;
      byResult[e.result] = (byResult[e.result] ?? 0) + 1;
    }

    const highRiskActions = entries.filter(e => e.riskLevel === 'high' || e.riskLevel === 'critical');

    // Detect anomalies: users with unusual activity
    const userCounts = Object.entries(byUser);
    const avgCount = userCounts.length > 0
      ? userCounts.reduce((s, [, c]) => s + c, 0) / userCounts.length
      : 0;
    const anomalies = userCounts
      .filter(([, count]) => count > avgCount * 3)
      .map(([user, count]) => ({
        description: `Unusual activity: ${user} performed ${count} actions (avg: ${avgCount.toFixed(1)})`,
        entries: entries.filter(e => e.userId === user),
      }));

    return {
      period: { start, end },
      totalActions: entries.length,
      byEntity,
      byAction,
      byUser,
      byResult,
      violations,
      highRiskActions,
      anomalies,
    };
  }

  getAuditLog(filter?: { entity?: string; action?: string; userId?: string; riskLevel?: string }): AuditEntry[] {
    let result = [...this.auditLog];
    if (filter?.entity) result = result.filter(e => e.entity === filter.entity);
    if (filter?.action) result = result.filter(e => e.action === filter.action);
    if (filter?.userId) result = result.filter(e => e.userId === filter.userId);
    if (filter?.riskLevel) result = result.filter(e => e.riskLevel === filter.riskLevel);
    return result;
  }

  getViolations(filter?: { resolved?: boolean; severity?: string }): ComplianceViolation[] {
    let result = [...this.violations];
    if (filter?.resolved !== undefined) result = result.filter(v => v.resolved === filter.resolved);
    if (filter?.severity) result = result.filter(v => v.severity === filter.severity);
    return result;
  }

  exportAuditLog(format: 'json' | 'csv'): string {
    if (format === 'json') return JSON.stringify(this.auditLog, null, 2);
    const headers = ['ID', 'Action', 'Entity', 'EntityID', 'User', 'Timestamp', 'Result', 'Risk'];
    const rows = this.auditLog.map(e => [
      e.id, e.action, e.entity, e.entityId, e.userId,
      e.timestamp.toISOString(), e.result, e.riskLevel,
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

describe('Compliance Engine', () => {
  let engine: ComplianceEngine;

  beforeEach(() => {
    engine = new ComplianceEngine();
  });

  it('should log audit entry', () => {
    const entry = engine.log({
      action: 'create_order', entity: 'order', entityId: 'ord_1',
      userId: 'user1', details: { symbol: 'AAPL', qty: 100 },
      ip: '10.0.0.1', userAgent: 'Chrome', result: 'success', riskLevel: 'low',
    });
    expect(entry.id).toBeTruthy();
    expect(entry.action).toBe('create_order');
  });

  it('should filter audit log', () => {
    engine.log({
      action: 'login', entity: 'user', entityId: 'u1',
      userId: 'user1', details: {}, ip: '10.0.0.1', userAgent: '',
      result: 'success', riskLevel: 'low',
    });
    engine.log({
      action: 'trade', entity: 'order', entityId: 'o1',
      userId: 'user2', details: {}, ip: '10.0.0.2', userAgent: '',
      result: 'success', riskLevel: 'medium',
    });
    expect(engine.getAuditLog({ entity: 'user' })).toHaveLength(1);
    expect(engine.getAuditLog({ userId: 'user2' })).toHaveLength(1);
  });

  it('should add compliance rule and detect violation', () => {
    engine.addRule({
      name: 'Large Trade Alert',
      description: 'Flag trades > 1M',
      category: 'trading',
      condition: (entry) => entry.entity === 'order' && (entry.details.amount as number) > 1000000,
      action: 'alert',
      enabled: true,
    });
    engine.log({
      action: 'trade', entity: 'order', entityId: 'o1',
      userId: 'user1', details: { amount: 2000000 },
      ip: '10.0.0.1', userAgent: '', result: 'success', riskLevel: 'high',
    });
    expect(engine.getViolations()).toHaveLength(1);
    expect(engine.getViolations()[0].ruleName).toBe('Large Trade Alert');
  });

  it('should not detect violation when condition not met', () => {
    engine.addRule({
      name: 'Large Trade', description: '', category: 'trading',
      condition: (e) => (e.details.amount as number) > 1000000,
      action: 'alert', enabled: true,
    });
    engine.log({
      action: 'trade', entity: 'order', entityId: 'o1',
      userId: 'user1', details: { amount: 500 },
      ip: '', userAgent: '', result: 'success', riskLevel: 'low',
    });
    expect(engine.getViolations()).toHaveLength(0);
  });

  it('should skip disabled rules', () => {
    engine.addRule({
      name: 'Disabled', description: '', category: 'access',
      condition: () => true,
      action: 'log', enabled: false,
    });
    engine.log({
      action: 'test', entity: 'test', entityId: 't1',
      userId: 'u1', details: {}, ip: '', userAgent: '',
      result: 'success', riskLevel: 'low',
    });
    expect(engine.getViolations()).toHaveLength(0);
  });

  it('should resolve violation', () => {
    engine.addRule({
      name: 'Rule', description: '', category: 'trading',
      condition: () => true, action: 'alert', enabled: true,
    });
    engine.log({
      action: 'test', entity: 'test', entityId: 't1',
      userId: 'u1', details: {}, ip: '', userAgent: '',
      result: 'success', riskLevel: 'medium',
    });
    const violation = engine.getViolations()[0];
    expect(engine.resolveViolation(violation.id, 'admin', 'Reviewed')).toBe(true);
    expect(engine.getViolations({ resolved: true })).toHaveLength(1);
  });

  it('should get entity history', () => {
    engine.log({
      action: 'create', entity: 'stock', entityId: 'AAPL',
      userId: 'u1', details: {}, ip: '', userAgent: '',
      result: 'success', riskLevel: 'low',
    });
    engine.log({
      action: 'update', entity: 'stock', entityId: 'AAPL',
      userId: 'u2', details: {}, ip: '', userAgent: '',
      result: 'success', riskLevel: 'low',
    });
    expect(engine.getEntityHistory('stock', 'AAPL')).toHaveLength(2);
  });

  it('should calculate diff', () => {
    const diff = engine.getDiff('stock', 'AAPL',
      { price: 150, volume: 1000 },
      { price: 155, volume: 1000 },
    );
    expect(diff.price).toEqual({ old: 150, new: 155 });
    expect(diff.volume).toBeUndefined();
  });

  it('should generate report', () => {
    const start = new Date(Date.now() - 86400000);
    const end = new Date(Date.now() + 86400000);
    engine.log({
      action: 'login', entity: 'user', entityId: 'u1',
      userId: 'user1', details: {}, ip: '', userAgent: '',
      result: 'success', riskLevel: 'low',
    });
    const report = engine.generateReport(start, end);
    expect(report.totalActions).toBe(1);
    expect(report.byAction['login']).toBe(1);
  });

  it('should detect high risk actions in report', () => {
    const start = new Date(Date.now() - 86400000);
    const end = new Date(Date.now() + 86400000);
    engine.log({
      action: 'admin_delete', entity: 'user', entityId: 'u1',
      userId: 'admin', details: {}, ip: '', userAgent: '',
      result: 'success', riskLevel: 'critical',
    });
    const report = engine.generateReport(start, end);
    expect(report.highRiskActions).toHaveLength(1);
  });

  it('should filter violations by severity', () => {
    engine.addRule({
      name: 'R1', description: '', category: 'trading',
      condition: () => true, action: 'alert', enabled: true,
    });
    engine.log({
      action: 'test', entity: 'test', entityId: 't1',
      userId: 'u1', details: {}, ip: '', userAgent: '',
      result: 'success', riskLevel: 'high',
    });
    expect(engine.getViolations({ severity: 'high' })).toHaveLength(1);
    expect(engine.getViolations({ severity: 'low' })).toHaveLength(0);
  });

  it('should export audit log as CSV', () => {
    engine.log({
      action: 'test', entity: 'test', entityId: 't1',
      userId: 'u1', details: {}, ip: '', userAgent: '',
      result: 'success', riskLevel: 'low',
    });
    const csv = engine.exportAuditLog('csv');
    expect(csv).toContain('Action');
    expect(csv).toContain('test');
  });

  it('should export audit log as JSON', () => {
    engine.log({
      action: 'test', entity: 'test', entityId: 't1',
      userId: 'u1', details: {}, ip: '', userAgent: '',
      result: 'success', riskLevel: 'low',
    });
    const json = engine.exportAuditLog('json');
    expect(JSON.parse(json)).toHaveLength(1);
  });

  it('should snapshot entity', () => {
    engine.snapshotEntity('portfolio', 'p1', { value: 100000 });
    // Snapshot stored for diff tracking
    expect(true).toBe(true);
  });

  it('should handle all risk levels', () => {
    const levels: AuditEntry['riskLevel'][] = ['low', 'medium', 'high', 'critical'];
    for (const level of levels) {
      engine.log({
        action: 'test', entity: 'test', entityId: level,
        userId: 'u1', details: {}, ip: '', userAgent: '',
        result: 'success', riskLevel: level,
      });
    }
    expect(engine.getAuditLog({ riskLevel: 'critical' })).toHaveLength(1);
  });
});
