import { describe, it, expect } from 'vitest';

describe('代码审计工具', () => {
  describe('generateAuditReport', () => {
    it('应该返回有效的审计报告结构', async () => {
      const { generateAuditReport } = await import('../utils/codeAudit');
      const report = generateAuditReport();
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('totalFiles');
      expect(report).toHaveProperty('issues');
      expect(report).toHaveProperty('summary');
      expect(report.summary).toHaveProperty('errors');
      expect(report.summary).toHaveProperty('warnings');
      expect(report.summary).toHaveProperty('infos');
      expect(report.summary).toHaveProperty('byType');
    });

    it('timestamp 应该是有效的ISO日期', async () => {
      const { generateAuditReport } = await import('../utils/codeAudit');
      const report = generateAuditReport();
      const date = new Date(report.timestamp);
      expect(date.getTime()).not.toBeNaN();
    });

    it('issues 应该是数组', async () => {
      const { generateAuditReport } = await import('../utils/codeAudit');
      const report = generateAuditReport();
      expect(Array.isArray(report.issues)).toBe(true);
    });
  });

  describe('formatReport', () => {
    it('应该生成格式化的报告文本', async () => {
      const { generateAuditReport, formatReport } = await import('../utils/codeAudit');
      const report = generateAuditReport();
      const formatted = formatReport(report);
      expect(formatted).toContain('# TypeScript 严格模式代码质量审计报告');
      expect(formatted).toContain('生成时间');
      expect(formatted).toContain('扫描文件');
    });

    it('应该包含问题汇总部分', async () => {
      const { generateAuditReport, formatReport } = await import('../utils/codeAudit');
      const report = generateAuditReport();
      const formatted = formatReport(report);
      expect(formatted).toContain('## 问题汇总');
      expect(formatted).toContain('错误:');
      expect(formatted).toContain('警告:');
      expect(formatted).toContain('提示:');
    });

    it('应该包含按类型分布部分', async () => {
      const { generateAuditReport, formatReport } = await import('../utils/codeAudit');
      const report = generateAuditReport();
      const formatted = formatReport(report);
      expect(formatted).toContain('## 按类型分布');
    });

    it('有issues时应该包含问题详情', async () => {
      const { formatReport } = await import('../utils/codeAudit');
      const report = {
        timestamp: new Date().toISOString(),
        totalFiles: 10,
        issues: [
          {
            file: 'test.ts',
            line: 5,
            type: 'any-type' as const,
            severity: 'warning' as const,
            message: '使用了 any 类型',
          },
        ],
        summary: { errors: 0, warnings: 1, infos: 0, byType: { 'any-type': 1 } },
      };
      const formatted = formatReport(report);
      expect(formatted).toContain('## 问题详情');
      expect(formatted).toContain('test.ts:5');
      expect(formatted).toContain('any-type');
      expect(formatted).toContain('使用了 any 类型');
    });
  });

  describe('IMPROVEMENT_CHECKLIST', () => {
    it('应该包含TypeScript Strict检查项', async () => {
      const { IMPROVEMENT_CHECKLIST } = await import('../utils/codeAudit');
      expect(IMPROVEMENT_CHECKLIST['TypeScript Strict']).toBeDefined();
      expect(IMPROVEMENT_CHECKLIST['TypeScript Strict'].length).toBeGreaterThanOrEqual(5);
    });

    it('应该包含Security检查项', async () => {
      const { IMPROVEMENT_CHECKLIST } = await import('../utils/codeAudit');
      expect(IMPROVEMENT_CHECKLIST['Security (OWASP Top 10)']).toBeDefined();
      expect(IMPROVEMENT_CHECKLIST['Security (OWASP Top 10)'].length).toBeGreaterThanOrEqual(8);
    });

    it('应该包含Performance检查项', async () => {
      const { IMPROVEMENT_CHECKLIST } = await import('../utils/codeAudit');
      expect(IMPROVEMENT_CHECKLIST['Performance']).toBeDefined();
      expect(IMPROVEMENT_CHECKLIST['Performance'].length).toBeGreaterThanOrEqual(5);
    });

    it('应该包含Testing检查项', async () => {
      const { IMPROVEMENT_CHECKLIST } = await import('../utils/codeAudit');
      expect(IMPROVEMENT_CHECKLIST['Testing']).toBeDefined();
    });

    it('应该包含Documentation检查项', async () => {
      const { IMPROVEMENT_CHECKLIST } = await import('../utils/codeAudit');
      expect(IMPROVEMENT_CHECKLIST['Documentation']).toBeDefined();
    });

    it('所有检查项应该以✅开头', async () => {
      const { IMPROVEMENT_CHECKLIST } = await import('../utils/codeAudit');
      for (const items of Object.values(IMPROVEMENT_CHECKLIST)) {
        for (const item of items) {
          expect(item.startsWith('✅')).toBe(true);
        }
      }
    });
  });
});
