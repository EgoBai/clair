import { describe, it, expect } from 'vitest';

describe('DOM & UI Utility Logic', () => {
  // CSS class utilities
  const cn = (...classes: (string | undefined | null | false)[]): string => {
    return classes.filter(Boolean).join(' ');
  };

  // Debounce simulation
  const createDebounce = <T extends (...args: unknown[]) => void>(fn: T, delay: number) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  // Throttle simulation
  const createThrottle = <T extends (...args: unknown[]) => void>(fn: T, limit: number) => {
    let inThrottle = false;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        fn(...args);
        inThrottle = true;
        setTimeout(() => { inThrottle = false; }, limit);
      }
    };
  };

  // DOM dimension utilities
  const clamp = (value: number, min: number, max: number): number => {
    return Math.min(Math.max(value, min), max);
  };

  const lerp = (start: number, end: number, t: number): number => {
    return start + (end - start) * t;
  };

  const easeInOut = (t: number): number => {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const truncateText = (text: string, maxLength: number, suffix = '...'): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - suffix.length) + suffix;
  };

  const generateId = (prefix = 'id'): string => {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  };

  const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

  const pick = <T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
      if (key in obj) result[key] = obj[key];
    }
    return result;
  };

  const omit = <T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> => {
    const result = { ...obj };
    for (const key of keys) delete result[key];
    return result as Omit<T, K>;
  };

  const groupBy = <T>(arr: T[], key: keyof T): Record<string, T[]> => {
    return arr.reduce((acc, item) => {
      const group = String(item[key]);
      if (!acc[group]) acc[group] = [];
      acc[group].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  };

  const unique = <T>(arr: T[], key?: keyof T): T[] => {
    if (!key) return [...new Set(arr)];
    const seen = new Set<unknown>();
    return arr.filter(item => {
      const val = item[key];
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });
  };

  const sortBy = <T>(arr: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] => {
    return [...arr].sort((a, b) => {
      const va = a[key], vb = b[key];
      if (va < vb) return order === 'asc' ? -1 : 1;
      if (va > vb) return order === 'asc' ? 1 : -1;
      return 0;
    });
  };

  describe('Class Name Utilities', () => {
    it('should join classes', () => {
      expect(cn('a', 'b', 'c')).toBe('a b c');
    });

    it('should filter falsy values', () => {
      expect(cn('a', null, 'b', undefined, false, 'c')).toBe('a b c');
    });

    it('should return empty string for all falsy', () => {
      expect(cn(null, undefined, false)).toBe('');
    });
  });

  describe('Clamp', () => {
    it('should clamp to min', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should clamp to max', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should pass through valid values', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should handle equal bounds', () => {
      expect(clamp(5, 3, 3)).toBe(3);
    });
  });

  describe('Lerp', () => {
    it('should interpolate at t=0', () => {
      expect(lerp(0, 100, 0)).toBe(0);
    });

    it('should interpolate at t=1', () => {
      expect(lerp(0, 100, 1)).toBe(100);
    });

    it('should interpolate at t=0.5', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });
  });

  describe('Ease In Out', () => {
    it('should return 0 at t=0', () => {
      expect(easeInOut(0)).toBe(0);
    });

    it('should return 1 at t=1', () => {
      expect(easeInOut(1)).toBe(1);
    });

    it('should return 0.5 at t=0.5', () => {
      expect(easeInOut(0.5)).toBe(0.5);
    });
  });

  describe('Format Bytes', () => {
    it('should format zero bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('Truncate Text', () => {
    it('should not truncate short text', () => {
      expect(truncateText('hello', 10)).toBe('hello');
    });

    it('should truncate long text', () => {
      expect(truncateText('hello world', 8)).toBe('hello...');
    });

    it('should use custom suffix', () => {
      expect(truncateText('hello world', 8, '…')).toBe('hello w…');
    });

    it('should handle exact length', () => {
      expect(truncateText('hello', 5)).toBe('hello');
    });
  });

  describe('Generate ID', () => {
    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });

    it('should use prefix', () => {
      expect(generateId('btn')).toMatch(/^btn-/);
    });

    it('should use default prefix', () => {
      expect(generateId()).toMatch(/^id-/);
    });
  });

  describe('Deep Clone', () => {
    it('should deep clone objects', () => {
      const original = { a: { b: 1 } };
      const cloned = deepClone(original);
      cloned.a.b = 2;
      expect(original.a.b).toBe(1);
    });

    it('should deep clone arrays', () => {
      const original = [[1, 2], [3, 4]];
      const cloned = deepClone(original);
      cloned[0][0] = 99;
      expect(original[0][0]).toBe(1);
    });
  });

  describe('Pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('should ignore missing keys', () => {
      const obj = { a: 1, b: 2 };
      expect(pick(obj, ['a', 'c' as keyof typeof obj])).toEqual({ a: 1 });
    });
  });

  describe('Omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('Group By', () => {
    it('should group by key', () => {
      const items = [
        { type: 'a', val: 1 },
        { type: 'b', val: 2 },
        { type: 'a', val: 3 },
      ];
      const grouped = groupBy(items, 'type');
      expect(grouped['a']).toHaveLength(2);
      expect(grouped['b']).toHaveLength(1);
    });
  });

  describe('Unique', () => {
    it('should deduplicate primitives', () => {
      expect(unique([1, 2, 1, 3, 2])).toEqual([1, 2, 3]);
    });

    it('should deduplicate by key', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 1 }];
      expect(unique(items, 'id')).toHaveLength(2);
    });
  });

  describe('Sort By', () => {
    it('should sort ascending', () => {
      const items = [{ val: 3 }, { val: 1 }, { val: 2 }];
      expect(sortBy(items, 'val')).toEqual([{ val: 1 }, { val: 2 }, { val: 3 }]);
    });

    it('should sort descending', () => {
      const items = [{ val: 1 }, { val: 3 }, { val: 2 }];
      expect(sortBy(items, 'val', 'desc')).toEqual([{ val: 3 }, { val: 2 }, { val: 1 }]);
    });
  });
});
