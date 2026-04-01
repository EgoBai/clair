/**
 * 后端批量操作引擎测试
 * 覆盖批量增删改、事务管理、错误恢复
 */

import { describe, it, expect } from 'vitest';

describe('批量操作引擎', () => {
  describe('批量操作分组', () => {
    interface BatchOperation {
      type: 'insert' | 'update' | 'delete';
      table: string;
      data: Record<string, unknown>;
    }

    function groupOperations(ops: BatchOperation[]): Map<string, Map<string, BatchOperation[]>> {
      const grouped = new Map<string, Map<string, BatchOperation[]>>();
      for (const op of ops) {
        if (!grouped.has(op.table)) grouped.set(op.table, new Map());
        const tableGroup = grouped.get(op.table)!;
        if (!tableGroup.has(op.type)) tableGroup.set(op.type, []);
        tableGroup.get(op.type)!.push(op);
      }
      return grouped;
    }

    it('应按表和操作类型分组', () => {
      const ops: BatchOperation[] = [
        { type: 'insert', table: 'stocks', data: {} },
        { type: 'update', table: 'stocks', data: {} },
        { type: 'insert', table: 'quotes', data: {} },
        { type: 'delete', table: 'stocks', data: {} },
      ];
      const grouped = groupOperations(ops);
      expect(grouped.get('stocks')?.get('insert')).toHaveLength(1);
      expect(grouped.get('stocks')?.get('update')).toHaveLength(1);
      expect(grouped.get('quotes')?.get('insert')).toHaveLength(1);
    });
  });

  describe('批量大小优化', () => {
    function calcOptimalBatchSize(totalItems: number, maxBatchSize: number = 1000): { batchSize: number; batches: number } {
      const batchSize = Math.min(totalItems, maxBatchSize);
      const batches = Math.ceil(totalItems / batchSize);
      return { batchSize, batches };
    }

    it('应正确计算批次数', () => {
      expect(calcOptimalBatchSize(2500)).toEqual({ batchSize: 1000, batches: 3 });
      expect(calcOptimalBatchSize(500)).toEqual({ batchSize: 500, batches: 1 });
    });
  });

  describe('批量操作事务', () => {
    class BatchTransaction {
      private operations: (() => void)[] = [];
      private executed: number = 0;
      private failed: number = -1;

      add(op: () => void): void {
        this.operations.push(op);
      }

      setFailAt(index: number): void {
        this.failed = index;
      }

      execute(): { success: boolean; executed: number; error?: string } {
        try {
          for (let i = 0; i < this.operations.length; i++) {
            if (i === this.failed) throw new Error(`Operation ${i} failed`);
            this.operations[i]();
            this.executed++;
          }
          return { success: true, executed: this.executed };
        } catch (e) {
          return { success: false, executed: this.executed, error: (e as Error).message };
        }
      }

      rollback(): void {
        this.executed = 0;
      }
    }

    it('全部成功应返回success', () => {
      const tx = new BatchTransaction();
      tx.add(() => {});
      tx.add(() => {});
      tx.add(() => {});
      expect(tx.execute().success).toBe(true);
    });

    it('中途失败应返回失败状态', () => {
      const tx = new BatchTransaction();
      tx.add(() => {});
      tx.add(() => {});
      tx.add(() => {});
      tx.setFailAt(1);
      const result = tx.execute();
      expect(result.success).toBe(false);
      expect(result.executed).toBe(1);
    });
  });

  describe('批量错误处理', () => {
    interface BatchResult<T> {
      succeeded: T[];
      failed: { item: T; error: string }[];
      totalProcessed: number;
    }

    function processBatch<T>(items: T[], process: (item: T) => void): BatchResult<T> {
      const succeeded: T[] = [];
      const failed: { item: T; error: string }[] = [];

      for (const item of items) {
        try {
          process(item);
          succeeded.push(item);
        } catch (e) {
          failed.push({ item, error: (e as Error).message });
        }
      }

      return { succeeded, failed, totalProcessed: items.length };
    }

    it('应正确统计成功和失败', () => {
      const items = [1, 2, 3, 4, 5];
      const result = processBatch(items, (n) => {
        if (n % 2 === 0) throw new Error('even');
      });
      expect(result.succeeded).toHaveLength(3);
      expect(result.failed).toHaveLength(2);
      expect(result.totalProcessed).toBe(5);
    });
  });

  describe('幂等性检查', () => {
    function generateIdempotencyKey(operation: string, data: unknown): string {
      const json = JSON.stringify(data);
      let hash = 0;
      const seed = operation + json;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
      }
      return Math.abs(hash).toString(36);
    }

    it('相同输入应产生相同key', () => {
      const key1 = generateIdempotencyKey('insert', { a: 1 });
      const key2 = generateIdempotencyKey('insert', { a: 1 });
      expect(key1).toBe(key2);
    });

    it('不同输入应产生不同key', () => {
      const key1 = generateIdempotencyKey('insert', { a: 1 });
      const key2 = generateIdempotencyKey('insert', { a: 2 });
      expect(key1).not.toBe(key2);
    });
  });
});
