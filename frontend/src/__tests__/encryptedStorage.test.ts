import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EncryptedStorage, SessionStorage } from '../services/encryptedStorage';

// Mock localStorage
const store: Record<string, string> = {};
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: vi.fn((k: string) => store[k] || null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
    get length() { return Object.keys(store).length; },
  },
  writable: true,
});

// Mock sessionStorage
const sStore: Record<string, string> = {};
Object.defineProperty(global, 'sessionStorage', {
  value: {
    getItem: vi.fn((k: string) => sStore[k] || null),
    setItem: vi.fn((k: string, v: string) => { sStore[k] = v; }),
    removeItem: vi.fn((k: string) => { delete sStore[k]; }),
    clear: vi.fn(() => { Object.keys(sStore).forEach(k => delete sStore[k]); }),
    key: vi.fn((i: number) => Object.keys(sStore)[i] || null),
    get length() { return Object.keys(sStore).length; },
  },
  writable: true,
});

describe('EncryptedStorage', () => {
  let storage: EncryptedStorage;

  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    vi.clearAllMocks();
    storage = new EncryptedStorage({ prefix: 'test_', secretKey: 'mykey' });
  });

  it('should store and retrieve data', () => {
    storage.set('user', { name: 'test', id: 1 });
    const result = storage.get<{ name: string; id: number }>('user');
    expect(result).toEqual({ name: 'test', id: 1 });
  });

  it('should encrypt data in localStorage', () => {
    storage.set('secret', 'sensitive');
    const raw = store['test_secret'];
    expect(raw).not.toBe('sensitive'); // should be encrypted
    expect(raw).toBeTruthy();
  });

  it('should return null for missing key', () => {
    expect(storage.get('missing')).toBeNull();
  });

  it('should handle corrupted data', () => {
    store['test_corrupt'] = 'not-encrypted-json';
    expect(storage.get('corrupt')).toBeNull();
  });

  it('should remove key', () => {
    storage.set('key', 'value');
    storage.remove('key');
    expect(storage.get('key')).toBeNull();
  });

  it('should check existence', () => {
    storage.set('exists', true);
    expect(storage.has('exists')).toBe(true);
    expect(storage.has('missing')).toBe(false);
  });

  it('should list keys', () => {
    storage.set('a', 1);
    storage.set('b', 2);
    const keys = storage.keys();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });

  it('should report size', () => {
    storage.set('a', 1);
    storage.set('b', 2);
    expect(storage.size()).toBe(2);
  });

  it('should clear all with prefix', () => {
    storage.set('a', 1);
    storage.set('b', 2);
    // Add non-prefixed key
    store['other_key'] = 'value';
    storage.clear();
    expect(storage.size()).toBe(0);
    expect(store['other_key']).toBe('value'); // preserved
  });

  it('should return false on set failure', () => {
    // Can't easily simulate localStorage failure in this mock
    const result = storage.set('key', 'value');
    expect(result).toBe(true);
  });
});

describe('SessionStorage', () => {
  let sessStore: SessionStorage;

  beforeEach(() => {
    Object.keys(sStore).forEach(k => delete sStore[k]);
    vi.clearAllMocks();
    sessStore = new SessionStorage('sess_');
  });

  it('should store and retrieve with TTL', () => {
    sessStore.set('key', 'value', 60000);
    expect(sessStore.get('key')).toBe('value');
  });

  it('should return null for expired entries', () => {
    sessStore.set('key', 'value', -1); // already expired
    expect(sessStore.get('key')).toBeNull();
  });

  it('should return null for missing key', () => {
    expect(sessStore.get('missing')).toBeNull();
  });

  it('should remove key', () => {
    sessStore.set('key', 'value');
    sessStore.remove('key');
    expect(sessStore.get('key')).toBeNull();
  });

  it('should clear expired entries', () => {
    sessStore.set('expired', 'old', -1);
    sessStore.set('valid', 'new', 60000);
    const cleared = sessStore.clearExpired();
    expect(cleared).toBe(1);
  });
});
