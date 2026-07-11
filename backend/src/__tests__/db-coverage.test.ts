import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, isMemoryMode, getDb, getDbType } from '../db/dbFactory';

beforeAll(async () => {
  await initDatabase();
});

describe('Database Factory', () => {
  it('should initialize database', () => {
    expect(isMemoryMode()).toBeDefined();
  });

  it('should get database connection', () => {
    const db = getDb();
    expect(db).toBeDefined();
  });

  it('should return memory mode when no DATABASE_URL', () => {
    expect(isMemoryMode()).toBe(true);
  });

  it('should return memory as db type', () => {
    expect(getDbType()).toBe('memory');
  });

  it('should support basic query in memory mode', async () => {
    const db = getDb();
    expect(db).toBeDefined();
  });
});

describe('Database Models', () => {
  it('should have stock model module', async () => {
    const stockModule = await import('../models/Stock');
    expect(stockModule).toBeDefined();
  });

  it('should have block trade model types', async () => {
    const blockTradeModule = await import('../models/BlockTrade');
    expect(blockTradeModule).toBeDefined();
  });
});
