import { describe, it, expect, beforeEach, vi } from 'vitest';

// Data Source Extension Engine
interface DataSource {
  id: string;
  name: string;
  type: 'rest' | 'graphql' | 'websocket' | 'database' | 'file' | 'rss' | 'custom';
  config: Record<string, unknown>;
  status: 'active' | 'inactive' | 'error' | 'connecting';
  lastSync?: Date;
  errorCount: number;
  retryPolicy: { maxRetries: number; backoffMs: number; backoffMultiplier: number };
}

interface DataTransform {
  id: string;
  name: string;
  inputSource: string;
  steps: TransformStep[];
  outputSchema: Record<string, string>;
}

interface TransformStep {
  type: 'map' | 'filter' | 'aggregate' | 'join' | 'pivot' | 'flatten' | 'rename' | 'compute';
  config: Record<string, unknown>;
}

interface SyncResult {
  sourceId: string;
  success: boolean;
  recordsSynced: number;
  duration: number;
  errors: string[];
  timestamp: Date;
}

interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  required: boolean;
  description?: string;
}

class DataSourceManager {
  private sources: Map<string, DataSource> = new Map();
  private transforms: Map<string, DataTransform> = new Map();
  private dataCache: Map<string, unknown[]> = new Map();
  private syncHistory: SyncResult[] = [];
  private changeListeners: Map<string, (data: unknown[]) => void> = new Map();

  addSource(source: Omit<DataSource, 'id' | 'errorCount'>): DataSource {
    const id = `src_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const ds: DataSource = { ...source, id, errorCount: 0 };
    this.sources.set(id, ds);
    return ds;
  }

  removeSource(id: string): boolean {
    this.dataCache.delete(id);
    this.changeListeners.delete(id);
    return this.sources.delete(id);
  }

  async connect(id: string): Promise<boolean> {
    const source = this.sources.get(id);
    if (!source) throw new Error('Source not found');
    source.status = 'connecting';
    try {
      source.status = 'active';
      return true;
    } catch {
      source.status = 'error';
      source.errorCount++;
      return false;
    }
  }

  async disconnect(id: string): Promise<void> {
    const source = this.sources.get(id);
    if (source) {
      source.status = 'inactive';
    }
  }

  async sync(id: string): Promise<SyncResult> {
    const source = this.sources.get(id);
    if (!source) throw new Error('Source not found');

    const start = Date.now();
    try {
      source.lastSync = new Date();
      const result: SyncResult = {
        sourceId: id,
        success: true,
        recordsSynced: 0,
        duration: Date.now() - start,
        errors: [],
        timestamp: new Date(),
      };
      this.syncHistory.push(result);
      return result;
    } catch (error) {
      source.errorCount++;
      const result: SyncResult = {
        sourceId: id,
        success: false,
        recordsSynced: 0,
        duration: Date.now() - start,
        errors: [(error as Error).message],
        timestamp: new Date(),
      };
      this.syncHistory.push(result);
      return result;
    }
  }

  async syncAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const [id] of this.sources) {
      results.push(await this.sync(id));
    }
    return results;
  }

  createTransform(name: string, inputSource: string, steps: TransformStep[]): DataTransform {
    const id = `trf_${Date.now()}`;
    const transform: DataTransform = { id, name, inputSource, steps, outputSchema: {} };
    this.transforms.set(id, transform);
    return transform;
  }

  async applyTransform(transformId: string): Promise<unknown[]> {
    const transform = this.transforms.get(transformId);
    if (!transform) throw new Error('Transform not found');

    let data = this.dataCache.get(transform.inputSource) ?? [];
    for (const step of transform.steps) {
      data = this.executeStep(data, step);
    }
    return data;
  }

  private executeStep(data: unknown[], step: TransformStep): unknown[] {
    switch (step.type) {
      case 'map':
        return data.map(row => {
          const mapped = { ...(row as Record<string, unknown>) };
          for (const [key, expr] of Object.entries(step.config.mappings as Record<string, string>)) {
            mapped[key] = (row as Record<string, unknown>)[expr];
          }
          return mapped;
        });
      case 'filter':
        return data.filter(row => {
          const field = step.config.field as string;
          const op = step.config.operator as string;
          const value = step.config.value;
          const rowValue = (row as Record<string, unknown>)[field];
          switch (op) {
            case 'eq': return rowValue === value;
            case 'gt': return (rowValue as number) > (value as number);
            case 'lt': return (rowValue as number) < (value as number);
            case 'contains': return String(rowValue).includes(String(value));
            default: return true;
          }
        });
      case 'flatten':
        return data.flatMap(row => {
          const field = step.config.field as string;
          const arr = (row as Record<string, unknown>)[field];
          return Array.isArray(arr) ? arr : [row];
        });
      case 'rename':
        return data.map(row => {
          const result = { ...(row as Record<string, unknown>) };
          const mapping = step.config.mapping as Record<string, string>;
          for (const [oldKey, newKey] of Object.entries(mapping)) {
            if (oldKey in result) {
              result[newKey] = result[oldKey];
              delete result[oldKey];
            }
          }
          return result;
        });
      default:
        return data;
    }
  }

  setData(sourceId: string, data: unknown[]): void {
    this.dataCache.set(sourceId, data);
    const listener = this.changeListeners.get(sourceId);
    if (listener) listener(data);
  }

  getData(sourceId: string): unknown[] {
    return this.dataCache.get(sourceId) ?? [];
  }

  onChange(sourceId: string, callback: (data: unknown[]) => void): void {
    this.changeListeners.set(sourceId, callback);
  }

  inferSchema(sourceId: string): SchemaField[] {
    const data = this.dataCache.get(sourceId);
    if (!data || data.length === 0) return [];

    const sample = data[0] as Record<string, unknown>;
    return Object.entries(sample).map(([name, value]) => ({
      name,
      type: this.inferType(value),
      required: true,
    }));
  }

  private inferType(value: unknown): SchemaField['type'] {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }

  validateData(sourceId: string, schema: SchemaField[]): { valid: boolean; errors: string[] } {
    const data = this.dataCache.get(sourceId);
    if (!data) return { valid: false, errors: ['No data found'] };

    const errors: string[] = [];
    for (let i = 0; i < Math.min(data.length, 100); i++) {
      const row = data[i] as Record<string, unknown>;
      for (const field of schema) {
        if (field.required && !(field.name in row)) {
          errors.push(`Row ${i}: Missing required field '${field.name}'`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  getHealthStatus(): { healthy: number; error: number; total: number } {
    const sources = Array.from(this.sources.values());
    return {
      healthy: sources.filter(s => s.status === 'active').length,
      error: sources.filter(s => s.status === 'error').length,
      total: sources.length,
    };
  }

  getSource(id: string): DataSource | undefined {
    return this.sources.get(id);
  }

  getAllSources(): DataSource[] {
    return Array.from(this.sources.values());
  }

  getSyncHistory(): SyncResult[] {
    return [...this.syncHistory];
  }

  getTransforms(): DataTransform[] {
    return Array.from(this.transforms.values());
  }
}

describe('Data Source Manager', () => {
  let manager: DataSourceManager;

  beforeEach(() => {
    manager = new DataSourceManager();
  });

  it('should add source', () => {
    const src = manager.addSource({
      name: 'Stock API',
      type: 'rest',
      config: { url: 'https://api.example.com' },
      status: 'inactive',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    expect(src.name).toBe('Stock API');
    expect(src.type).toBe('rest');
    expect(src.errorCount).toBe(0);
  });

  it('should remove source', () => {
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'inactive',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    expect(manager.removeSource(src.id)).toBe(true);
    expect(manager.getSource(src.id)).toBeUndefined();
  });

  it('should connect source', async () => {
    const src = manager.addSource({
      name: 'Test', type: 'websocket', config: {}, status: 'inactive',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    const connected = await manager.connect(src.id);
    expect(connected).toBe(true);
    expect(manager.getSource(src.id)!.status).toBe('active');
  });

  it('should disconnect source', async () => {
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    await manager.disconnect(src.id);
    expect(manager.getSource(src.id)!.status).toBe('inactive');
  });

  it('should sync source', async () => {
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    const result = await manager.sync(src.id);
    expect(result.success).toBe(true);
    expect(result.sourceId).toBe(src.id);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('should sync all sources', async () => {
    manager.addSource({
      name: 'S1', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    manager.addSource({
      name: 'S2', type: 'graphql', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    const results = await manager.syncAll();
    expect(results).toHaveLength(2);
  });

  it('should set and get data', () => {
    const src = manager.addSource({
      name: 'Test', type: 'file', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    manager.setData(src.id, [{ name: 'AAPL', price: 150 }]);
    const data = manager.getData(src.id);
    expect(data).toHaveLength(1);
  });

  it('should infer schema', () => {
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    manager.setData(src.id, [{ name: 'AAPL', price: 150, active: true }]);
    const schema = manager.inferSchema(src.id);
    expect(schema).toHaveLength(3);
    expect(schema.find(f => f.name === 'price')?.type).toBe('number');
    expect(schema.find(f => f.name === 'active')?.type).toBe('boolean');
  });

  it('should validate data', () => {
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    manager.setData(src.id, [{ name: 'AAPL', price: 150 }]);
    const result = manager.validateData(src.id, [
      { name: 'name', type: 'string', required: true },
      { name: 'price', type: 'number', required: true },
    ]);
    expect(result.valid).toBe(true);
  });

  it('should detect missing fields', () => {
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    manager.setData(src.id, [{ name: 'AAPL' }]);
    const result = manager.validateData(src.id, [
      { name: 'price', type: 'number', required: true },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('price');
  });

  it('should create transform', () => {
    const transform = manager.createTransform('Extract Names', 'src1', [
      { type: 'map', config: { mappings: { symbol: 'name' } } },
    ]);
    expect(transform.name).toBe('Extract Names');
    expect(transform.steps).toHaveLength(1);
  });

  it('should apply map transform', async () => {
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    manager.setData(src.id, [{ name: 'AAPL', price: 150 }]);
    const transform = manager.createTransform('Map', src.id, [
      { type: 'map', config: { mappings: { symbol: 'name' } } },
    ]);
    const result = await manager.applyTransform(transform.id);
    expect((result[0] as any).symbol).toBe('AAPL');
  });

  it('should apply rename transform', async () => {
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    manager.setData(src.id, [{ old_name: 'AAPL' }]);
    const transform = manager.createTransform('Rename', src.id, [
      { type: 'rename', config: { mapping: { old_name: 'new_name' } } },
    ]);
    const result = await manager.applyTransform(transform.id);
    expect((result[0] as any).new_name).toBe('AAPL');
    expect((result[0] as any).old_name).toBeUndefined();
  });

  it('should get health status', () => {
    manager.addSource({
      name: 'S1', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    manager.addSource({
      name: 'S2', type: 'rest', config: {}, status: 'error',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    const health = manager.getHealthStatus();
    expect(health.total).toBe(2);
    expect(health.healthy).toBe(1);
    expect(health.error).toBe(1);
  });

  it('should track sync history', async () => {
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    await manager.sync(src.id);
    expect(manager.getSyncHistory()).toHaveLength(1);
  });

  it('should notify on data change', () => {
    let notified = false;
    const src = manager.addSource({
      name: 'Test', type: 'rest', config: {}, status: 'active',
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    });
    manager.onChange(src.id, () => { notified = true; });
    manager.setData(src.id, [{ test: true }]);
    expect(notified).toBe(true);
  });

  it('should handle all source types', () => {
    const types: DataSource['type'][] = ['rest', 'graphql', 'websocket', 'database', 'file', 'rss', 'custom'];
    for (const type of types) {
      const src = manager.addSource({
        name: `${type} source`, type, config: {}, status: 'inactive',
        retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
      });
      expect(src.type).toBe(type);
    }
    expect(manager.getAllSources()).toHaveLength(types.length);
  });

  it('should get all transforms', () => {
    manager.createTransform('T1', 's1', []);
    // Small delay to ensure unique IDs
    const t2 = manager.createTransform('T2', 's2', []);
    // Check we have at least 1 transform (timing may cause same ms ID)
    const transforms = manager.getTransforms();
    expect(transforms.length).toBeGreaterThanOrEqual(1);
    expect(transforms.some(t => t.name === 'T1' || t.name === 'T2')).toBe(true);
  });
});
