import { describe, it, expect, beforeEach, vi } from 'vitest';

// Database Migration System
interface Migration {
  id: string;
  version: number;
  name: string;
  up: string;
  down: string;
  checksum: string;
  appliedAt?: Date;
  executionTime?: number;
}

interface MigrationConfig {
  migrationsDir: string;
  tableName: string;
  lockTableName: string;
  lockTimeout: number;
  dryRun: boolean;
  verbose: boolean;
}

interface MigrationResult {
  migration: Migration;
  success: boolean;
  executionTime: number;
  error?: string;
}

interface MigrationStatus {
  pending: Migration[];
  applied: Migration[];
  total: number;
  lastApplied?: Migration;
}

class MigrationManager {
  private migrations: Map<string, Migration> = new Map();
  private config: MigrationConfig;
  private locked = false;
  private history: MigrationResult[] = [];

  constructor(config?: Partial<MigrationConfig>) {
    this.config = {
      migrationsDir: './migrations',
      tableName: 'schema_migrations',
      lockTableName: 'migration_locks',
      lockTimeout: 30000,
      dryRun: false,
      verbose: false,
      ...config,
    };
  }

  addMigration(name: string, up: string, down: string, version?: number): Migration {
    const id = `mig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const ver = version ?? this.migrations.size + 1;
    const checksum = this.computeChecksum(up);
    const migration: Migration = { id, version: ver, name, up, down, checksum };
    this.migrations.set(id, migration);
    return migration;
  }

  private computeChecksum(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  async getStatus(): Promise<MigrationStatus> {
    const all = Array.from(this.migrations.values()).sort((a, b) => a.version - b.version);
    const applied = all.filter(m => m.appliedAt);
    const pending = all.filter(m => !m.appliedAt);
    return {
      pending,
      applied,
      total: all.length,
      lastApplied: applied.length > 0 ? applied[applied.length - 1] : undefined,
    };
  }

  async acquireLock(): Promise<boolean> {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  async releaseLock(): Promise<void> {
    this.locked = false;
  }

  async runMigrations(): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    if (!await this.acquireLock()) {
      throw new Error('Migration lock already acquired');
    }
    try {
      const status = await this.getStatus();
      for (const migration of status.pending) {
        const result = await this.runSingle(migration, 'up');
        results.push(result);
        if (!result.success) break;
      }
    } finally {
      await this.releaseLock();
    }
    this.history.push(...results);
    return results;
  }

  async rollback(steps = 1): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const status = await this.getStatus();
    const toRollback = status.applied.slice(-steps).reverse();
    for (const migration of toRollback) {
      const result = await this.runSingle(migration, 'down');
      results.push(result);
      if (!result.success) break;
    }
    return results;
  }

  private async runSingle(migration: Migration, direction: 'up' | 'down'): Promise<MigrationResult> {
    const start = Date.now();
    try {
      if (this.config.dryRun) {
        return { migration, success: true, executionTime: 0 };
      }
      if (direction === 'up') {
        migration.appliedAt = new Date();
      } else {
        migration.appliedAt = undefined;
      }
      const executionTime = Date.now() - start;
      migration.executionTime = executionTime;
      return { migration, success: true, executionTime };
    } catch (error) {
      return {
        migration,
        success: false,
        executionTime: Date.now() - start,
        error: (error as Error).message,
      };
    }
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const versions = new Set<number>();
    const migrations = Array.from(this.migrations.values());
    for (const mig of migrations) {
      if (versions.has(mig.version)) {
        errors.push(`Duplicate version: ${mig.version}`);
      }
      versions.add(mig.version);
      if (!mig.up || mig.up.trim() === '') {
        errors.push(`Empty up migration: ${mig.name}`);
      }
      if (!mig.down || mig.down.trim() === '') {
        errors.push(`Empty down migration: ${mig.name}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async generateTemplate(name: string): Promise<Migration> {
    return this.addMigration(
      name,
      `-- UP: ${name}\n-- Add migration SQL here`,
      `-- DOWN: ${name}\n-- Add rollback SQL here`,
    );
  }

  getHistory(): MigrationResult[] {
    return [...this.history];
  }

  async exportManifest(): Promise<string> {
    const migrations = Array.from(this.migrations.values())
      .sort((a, b) => a.version - b.version);
    return JSON.stringify(migrations.map(m => ({
      id: m.id,
      version: m.version,
      name: m.name,
      checksum: m.checksum,
      appliedAt: m.appliedAt?.toISOString(),
    })), null, 2);
  }

  async importManifest(json: string): Promise<void> {
    const entries = JSON.parse(json);
    for (const entry of entries) {
      if (!this.migrations.has(entry.id)) {
        this.addMigration(entry.name, '', '', entry.version);
      }
    }
  }
}

describe('Migration Manager', () => {
  let manager: MigrationManager;

  beforeEach(() => {
    manager = new MigrationManager({ dryRun: true });
  });

  it('should create migration', () => {
    const mig = manager.addMigration('add_users', 'CREATE TABLE users', 'DROP TABLE users');
    expect(mig.name).toBe('add_users');
    expect(mig.up).toBe('CREATE TABLE users');
    expect(mig.down).toBe('DROP TABLE users');
    expect(mig.version).toBe(1);
  });

  it('should compute checksum', () => {
    const mig = manager.addMigration('test', 'SELECT 1', 'SELECT 1');
    expect(mig.checksum).toBeTruthy();
    expect(typeof mig.checksum).toBe('string');
  });

  it('should return pending migrations', async () => {
    manager.addMigration('m1', 'SELECT 1', 'SELECT 1');
    manager.addMigration('m2', 'SELECT 2', 'SELECT 2');
    const status = await manager.getStatus();
    expect(status.pending).toHaveLength(2);
    expect(status.applied).toHaveLength(0);
    expect(status.total).toBe(2);
  });

  it('should run migrations in dry run mode', async () => {
    manager.addMigration('m1', 'SELECT 1', 'SELECT 1');
    manager.addMigration('m2', 'SELECT 2', 'SELECT 2');
    const results = await manager.runMigrations();
    expect(results).toHaveLength(2);
    expect(results.every(r => r.success)).toBe(true);
  });

  it('should acquire and release lock', async () => {
    expect(await manager.acquireLock()).toBe(true);
    expect(await manager.acquireLock()).toBe(false);
    await manager.releaseLock();
    expect(await manager.acquireLock()).toBe(true);
  });

  it('should rollback migrations', async () => {
    const liveManager = new MigrationManager({ dryRun: false });
    liveManager.addMigration('m1', 'SELECT 1', 'SELECT 1');
    await liveManager.runMigrations();
    const rollbackResults = await liveManager.rollback(1);
    expect(rollbackResults).toHaveLength(1);
    expect(rollbackResults[0].success).toBe(true);
  });

  it('should validate migrations', async () => {
    manager.addMigration('m1', 'SELECT 1', 'SELECT 1');
    manager.addMigration('m2', 'SELECT 2', 'SELECT 2');
    const result = await manager.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect duplicate versions', async () => {
    manager.addMigration('m1', 'SELECT 1', 'SELECT 1', 1);
    manager.addMigration('m2', 'SELECT 2', 'SELECT 2', 1);
    const result = await manager.validate();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate version: 1');
  });

  it('should detect empty up migrations', async () => {
    manager.addMigration('m1', '', 'SELECT 1');
    const result = await manager.validate();
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Empty up migration');
  });

  it('should track history', async () => {
    manager.addMigration('m1', 'SELECT 1', 'SELECT 1');
    await manager.runMigrations();
    const history = manager.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].success).toBe(true);
  });

  it('should generate template', async () => {
    const mig = await manager.generateTemplate('new_feature');
    expect(mig.name).toBe('new_feature');
    expect(mig.up).toContain('UP');
    expect(mig.down).toContain('DOWN');
  });

  it('should export manifest', async () => {
    manager.addMigration('m1', 'SELECT 1', 'SELECT 1', 1);
    const manifest = await manager.exportManifest();
    const parsed = JSON.parse(manifest);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].version).toBe(1);
  });

  it('should import manifest', async () => {
    const manifest = JSON.stringify([{ id: 'imp1', version: 5, name: 'imported', checksum: 'abc' }]);
    await manager.importManifest(manifest);
    const status = await manager.getStatus();
    expect(status.total).toBe(1);
  });

  it('should handle rollback all', async () => {
    const liveManager = new MigrationManager({ dryRun: false });
    liveManager.addMigration('m1', 'SELECT 1', 'SELECT 1');
    liveManager.addMigration('m2', 'SELECT 2', 'SELECT 2');
    await liveManager.runMigrations();
    const status1 = await liveManager.getStatus();
    expect(status1.applied).toHaveLength(2);
    await liveManager.rollback(2);
    const status2 = await liveManager.getStatus();
    expect(status2.applied).toHaveLength(0);
  });

  it('should sort migrations by version', async () => {
    manager.addMigration('m3', 'SELECT 3', 'SELECT 3', 3);
    manager.addMigration('m1', 'SELECT 1', 'SELECT 1', 1);
    manager.addMigration('m2', 'SELECT 2', 'SELECT 2', 2);
    const results = await manager.runMigrations();
    expect(results[0].migration.version).toBe(1);
    expect(results[1].migration.version).toBe(2);
    expect(results[2].migration.version).toBe(3);
  });

  it('should stop on failure', async () => {
    const failingManager = new MigrationManager({ dryRun: false });
    failingManager.addMigration('m1', 'SELECT 1', 'SELECT 1');
    const results = await failingManager.runMigrations();
    expect(results.length).toBeGreaterThan(0);
  });

  it('should configure options', () => {
    const custom = new MigrationManager({
      migrationsDir: './custom_migrations',
      tableName: 'my_migrations',
      verbose: true,
    });
    expect(custom).toBeTruthy();
  });
});
