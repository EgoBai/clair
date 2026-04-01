import { describe, it, expect } from 'vitest';

/**
 * 数据同步逻辑测试
 * 增量同步/冲突解决/版本控制/合并策略
 */

interface SyncRecord {
  id: string;
  data: any;
  version: number;
  lastModified: number;
  deleted: boolean;
}

interface SyncResult {
  synced: number;
  conflicts: number;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

class DataSyncer {
  private local = new Map<string, SyncRecord>();
  private version = 0;

  set(id: string, data: any): SyncRecord {
    const existing = this.local.get(id);
    const record: SyncRecord = {
      id, data, version: existing ? existing.version + 1 : 1,
      lastModified: Date.now(), deleted: false,
    };
    this.local.set(id, record);
    this.version++;
    return record;
  }

  delete(id: string): boolean {
    const existing = this.local.get(id);
    if (!existing) return false;
    existing.deleted = true;
    existing.version++;
    existing.lastModified = Date.now();
    this.version++;
    return true;
  }

  get(id: string): SyncRecord | undefined {
    const r = this.local.get(id);
    return r && !r.deleted ? r : undefined;
  }

  sync(remote: SyncRecord[]): SyncResult {
    const result: SyncResult = { synced: 0, conflicts: 0, created: 0, updated: 0, deleted: 0, errors: [] };
    for (const remoteRecord of remote) {
      const localRecord = this.local.get(remoteRecord.id);
      if (!localRecord) {
        if (!remoteRecord.deleted) {
          this.local.set(remoteRecord.id, { ...remoteRecord });
          result.created++;
        }
      } else if (remoteRecord.deleted) {
        if (remoteRecord.version > localRecord.version) {
          this.local.set(remoteRecord.id, { ...remoteRecord });
          result.deleted++;
        }
      } else if (remoteRecord.version > localRecord.version) {
        this.local.set(remoteRecord.id, { ...remoteRecord });
        result.updated++;
      } else if (remoteRecord.version === localRecord.version && JSON.stringify(remoteRecord.data) !== JSON.stringify(localRecord.data)) {
        result.conflicts++;
        // Last-write-wins by timestamp
        if (remoteRecord.lastModified > localRecord.lastModified) {
          this.local.set(remoteRecord.id, { ...remoteRecord });
        }
      }
      result.synced++;
    }
    return result;
  }

  getVersion(): number { return this.version; }
  getAll(): SyncRecord[] { return Array.from(this.local.values()).filter(r => !r.deleted); }
  getChangesSince(version: number): SyncRecord[] {
    return Array.from(this.local.values()).filter(r => r.version > version);
  }
}

describe('数据同步逻辑', () => {
  describe('DataSyncer', () => {
    it('should create records', () => {
      const syncer = new DataSyncer();
      const r = syncer.set('1', { name: 'test' });
      expect(r.version).toBe(1);
      expect(syncer.get('1')?.data.name).toBe('test');
    });

    it('should increment version on update', () => {
      const syncer = new DataSyncer();
      syncer.set('1', { v: 1 });
      const r = syncer.set('1', { v: 2 });
      expect(r.version).toBe(2);
    });

    it('should soft delete', () => {
      const syncer = new DataSyncer();
      syncer.set('1', 'data');
      expect(syncer.delete('1')).toBe(true);
      expect(syncer.get('1')).toBeUndefined();
    });

    it('should sync new records', () => {
      const syncer = new DataSyncer();
      const remote: SyncRecord[] = [
        { id: '1', data: 'a', version: 1, lastModified: 1000, deleted: false },
        { id: '2', data: 'b', version: 1, lastModified: 2000, deleted: false },
      ];
      const result = syncer.sync(remote);
      expect(result.created).toBe(2);
      expect(syncer.getAll()).toHaveLength(2);
    });

    it('should update on newer version', () => {
      const syncer = new DataSyncer();
      syncer.set('1', 'old');
      const result = syncer.sync([{ id: '1', data: 'new', version: 5, lastModified: 2000, deleted: false }]);
      expect(result.updated).toBe(1);
      expect(syncer.get('1')?.data).toBe('new');
    });

    it('should detect conflicts', () => {
      const syncer = new DataSyncer();
      syncer.set('1', 'local');
      const result = syncer.sync([{ id: '1', data: 'remote', version: 1, lastModified: 100, deleted: false }]);
      expect(result.conflicts).toBe(1);
    });

    it('should get changes since version', () => {
      const syncer = new DataSyncer();
      syncer.set('1', 'a'); // v1
      syncer.set('1', 'b'); // v2
      syncer.set('1', 'c'); // v3
      const changes = syncer.getChangesSince(1);
      expect(changes.length).toBe(1); // only the record with version > 1
      expect(changes[0].data).toBe('c');
    });
  });
});
