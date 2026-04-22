import { describe, it, expect } from 'vitest';

// Dashboard Widget Layout Tests
describe('Dashboard Widget Layout', () => {
  interface Widget {
    id: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
    config: Record<string, any>;
  }

  const validateLayout = (widgets: Widget[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    for (let i = 0; i < widgets.length; i++) {
      const a = widgets[i];
      if (a.x < 0 || a.y < 0) errors.push(`Widget ${a.id}: negative position`);
      if (a.w <= 0 || a.h <= 0) errors.push(`Widget ${a.id}: zero/negative size`);
      for (let j = i + 1; j < widgets.length; j++) {
        const b = widgets[j];
        const overlaps = !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
        if (overlaps) errors.push(`Widget ${a.id} overlaps ${b.id}`);
      }
    }
    return { valid: errors.length === 0, errors };
  };

  const compactLayout = (widgets: Widget[]): Widget[] => {
    const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
    const result: Widget[] = [];
    for (const w of sorted) {
      let newY = 0;
      for (const placed of result) {
        if (placed.x < w.x + w.w && placed.x + placed.w > w.x) {
          newY = Math.max(newY, placed.y + placed.h);
        }
      }
      result.push({ ...w, y: newY });
    }
    return result;
  };

  const autoArrange = (widgets: Widget[], columns: number): Widget[] => {
    const colHeights = new Array(columns).fill(0);
    return widgets.map(w => {
      const minCol = colHeights.indexOf(Math.min(...colHeights));
      const x = minCol;
      const y = colHeights[minCol];
      colHeights[minCol] += w.h;
      return { ...w, x, y };
    });
  };

  it('should validate non-overlapping layout', () => {
    const widgets: Widget[] = [
      { id: '1', type: 'chart', x: 0, y: 0, w: 6, h: 4, config: {} },
      { id: '2', type: 'table', x: 6, y: 0, w: 6, h: 4, config: {} },
    ];
    const result = validateLayout(widgets);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect overlapping widgets', () => {
    const widgets: Widget[] = [
      { id: '1', type: 'chart', x: 0, y: 0, w: 8, h: 4, config: {} },
      { id: '2', type: 'table', x: 4, y: 2, w: 8, h: 4, config: {} },
    ];
    const result = validateLayout(widgets);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('overlaps'))).toBe(true);
  });

  it('should detect invalid positions', () => {
    const widgets: Widget[] = [
      { id: '1', type: 'chart', x: -1, y: 0, w: 6, h: 4, config: {} },
    ];
    const result = validateLayout(widgets);
    expect(result.valid).toBe(false);
  });

  it('should compact layout vertically', () => {
    const widgets: Widget[] = [
      { id: '1', type: 'chart', x: 0, y: 10, w: 6, h: 4, config: {} },
      { id: '2', type: 'chart', x: 6, y: 10, w: 6, h: 4, config: {} },
      { id: '3', type: 'chart', x: 0, y: 20, w: 12, h: 4, config: {} },
    ];
    const compacted = compactLayout(widgets);
    expect(compacted[0].y).toBe(0);
    expect(compacted[1].y).toBe(0);
    expect(compacted[2].y).toBe(4);
  });

  it('should auto-arrange in columns', () => {
    const widgets: Widget[] = [
      { id: '1', type: 'chart', x: 0, y: 0, w: 1, h: 3, config: {} },
      { id: '2', type: 'chart', x: 0, y: 0, w: 1, h: 2, config: {} },
      { id: '3', type: 'chart', x: 0, y: 0, w: 1, h: 4, config: {} },
    ];
    const arranged = autoArrange(widgets, 2);
    expect(arranged[0].x).toBe(0);
    expect(arranged[0].y).toBe(0);
    expect(arranged[1].x).toBe(1);
    expect(arranged[1].y).toBe(0);
    // Col 0 has height 3, Col 1 has height 2 → min is col 1
    expect(arranged[2].x).toBe(1);
    expect(arranged[2].y).toBe(2);
  });

  it('should handle single widget', () => {
    const result = validateLayout([
      { id: '1', type: 'chart', x: 0, y: 0, w: 12, h: 6, config: {} },
    ]);
    expect(result.valid).toBe(true);
  });

  it('should handle empty layout', () => {
    const result = validateLayout([]);
    expect(result.valid).toBe(true);
  });
});

// Dashboard Data Refresh Tests
describe('Dashboard Data Refresh', () => {
  class RefreshScheduler {
    private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
    private lastRefresh: Map<string, number> = new Map();
    private paused = new Set<string>();

    register(id: string, intervalMs: number, callback: () => void) {
      this.lastRefresh.set(id, Date.now());
      const timer = setInterval(() => {
        if (!this.paused.has(id)) {
          this.lastRefresh.set(id, Date.now());
          callback();
        }
      }, intervalMs);
      this.timers.set(id, timer);
    }

    unregister(id: string) {
      const timer = this.timers.get(id);
      if (timer) {
        clearInterval(timer);
        this.timers.delete(id);
      }
      this.lastRefresh.delete(id);
      this.paused.delete(id);
    }

    pause(id: string) {
      this.paused.add(id);
    }

    resume(id: string) {
      this.paused.delete(id);
    }

    isPaused(id: string) {
      return this.paused.has(id);
    }

    getActiveCount() {
      return this.timers.size - this.paused.size;
    }

    getLastRefresh(id: string) {
      return this.lastRefresh.get(id) || null;
    }
  }

  it('should register refresh timers', () => {
    const scheduler = new RefreshScheduler();
    let count = 0;
    scheduler.register('w1', 1000, () => { count++; });
    expect(scheduler.getLastRefresh('w1')).not.toBeNull();
    scheduler.unregister('w1');
  });

  it('should pause and resume', () => {
    const scheduler = new RefreshScheduler();
    scheduler.register('w1', 1000, () => { );
    scheduler.pause('w1');
    expect(scheduler.isPaused('w1')).toBe(true);
    expect(scheduler.getActiveCount()).toBe(0);
    scheduler.resume('w1');
    expect(scheduler.isPaused('w1')).toBe(false);
    expect(scheduler.getActiveCount()).toBe(1);
    scheduler.unregister('w1');
  });

  it('should track multiple widgets', () => {
    const scheduler = new RefreshScheduler();
    scheduler.register('w1', 1000, () => { );
    scheduler.register('w2', 2000, () => { );
    scheduler.register('w3', 5000, () => { );
    expect(scheduler.getActiveCount()).toBe(3);
    scheduler.unregister('w2');
    expect(scheduler.getActiveCount()).toBe(2);
  });

  it('should clean up on unregister', () => {
    const scheduler = new RefreshScheduler();
    scheduler.register('w1', 1000, () => { );
    scheduler.unregister('w1');
    expect(scheduler.getLastRefresh('w1')).toBeNull();
    expect(scheduler.isPaused('w1')).toBe(false);
  });
});

// Stock List Pagination & Sorting Tests
describe('Stock List Pagination & Sorting', () => {
  interface Stock {
    code: string;
    name: string;
    price: number;
    changePercent: number;
    volume: number;
    amount: number;
    turnover: number;
  }

  const paginate = (items: Stock[], page: number, pageSize: number) => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  };

  const sort = (items: Stock[], field: keyof Stock, order: 'asc' | 'desc') => {
    return [...items].sort((a, b) => {
      const va = a[field];
      const vb = b[field];
      if (typeof va === 'number' && typeof vb === 'number') {
        return order === 'asc' ? va - vb : vb - va;
      }
      const cmp = String(va).localeCompare(String(vb));
      return order === 'asc' ? cmp : -cmp;
    });
  };

  const stocks: Stock[] = Array.from({ length: 55 }, (_, i) => ({
    code: `${(600000 + i).toString().padStart(6, '0')}`,
    name: `股票${i + 1}`,
    price: 10 + i * 0.5,
    changePercent: -5 + Math.random() * 10,
    volume: 1e6 + i * 1e5,
    amount: 1e8 + i * 1e7,
    turnover: Math.random() * 10,
  }));

  it('should paginate correctly', () => {
    expect(paginate(stocks, 1, 20)).toHaveLength(20);
    expect(paginate(stocks, 2, 20)).toHaveLength(20);
    expect(paginate(stocks, 3, 20)).toHaveLength(15);
    expect(paginate(stocks, 4, 20)).toHaveLength(0);
  });

  it('should sort by price ascending', () => {
    const sorted = sort(stocks, 'price', 'asc');
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].price).toBeGreaterThanOrEqual(sorted[i - 1].price);
    }
  });

  it('should sort by price descending', () => {
    const sorted = sort(stocks, 'price', 'desc');
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].price).toBeLessThanOrEqual(sorted[i - 1].price);
    }
  });

  it('should sort by code alphabetically', () => {
    const sorted = sort(stocks, 'code', 'asc');
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].code >= sorted[i - 1].code).toBe(true);
    }
  });

  it('should not mutate original array', () => {
    const original = [...stocks];
    sort(stocks, 'price', 'desc');
    expect(stocks).toEqual(original);
  });

  it('should calculate total pages', () => {
    const total = 55;
    const pageSize = 20;
    expect(Math.ceil(total / pageSize)).toBe(3);
  });

  it('should handle page 1 and last page', () => {
    const page1 = paginate(stocks, 1, 20);
    expect(page1[0].code).toBe(stocks[0].code);
    const lastPage = paginate(stocks, 3, 20);
    expect(lastPage[lastPage.length - 1].code).toBe(stocks[stocks.length - 1].code);
  });
});

// Theme CSS Variable Tests
describe('Theme CSS Variables', () => {
  const lightTheme = {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f5f5f5',
    '--text-primary': '#000000',
    '--text-secondary': '#666666',
    '--color-up': '#ff4d4f',
    '--color-down': '#52c41a',
    '--color-flat': '#8c8c8c',
    '--border-color': '#d9d9d9',
  };

  const darkTheme = {
    '--bg-primary': '#141414',
    '--bg-secondary': '#1f1f1f',
    '--text-primary': '#ffffff',
    '--text-secondary': '#a0a0a0',
    '--color-up': '#ff4d4f',
    '--color-down': '#52c41a',
    '--color-flat': '#8c8c8c',
    '--border-color': '#424242',
  };

  const generateCSSVariables = (theme: Record<string, string>) => {
    return Object.entries(theme)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');
  };

  const applyTheme = (theme: Record<string, string>) => {
    for (const [key, value] of Object.entries(theme)) {
      document.documentElement.style.setProperty(key, value);
    }
  };

  it('should have same color semantics in both themes', () => {
    expect(lightTheme['--color-up']).toBe(darkTheme['--color-up']);
    expect(lightTheme['--color-down']).toBe(darkTheme['--color-down']);
    expect(lightTheme['--color-flat']).toBe(darkTheme['--color-flat']);
  });

  it('should have different backgrounds', () => {
    expect(lightTheme['--bg-primary']).not.toBe(darkTheme['--bg-primary']);
  });

  it('should generate valid CSS', () => {
    const css = generateCSSVariables(lightTheme);
    expect(css).toContain('--bg-primary: #ffffff;');
    expect(css).toContain('--color-up: #ff4d4f;');
  });

  it('should have red for up (A-share convention)', () => {
    expect(lightTheme['--color-up']).toMatch(/red|ff/i);
    expect(darkTheme['--color-up']).toMatch(/red|ff/i);
  });

  it('should have green for down (A-share convention)', () => {
    expect(lightTheme['--color-down']).toMatch(/green|c4|a0/i);
  });
});

// Notification Badge Logic Tests
describe('Notification Badge Logic', () => {
  interface Notification {
    id: string;
    type: 'price' | 'volume' | 'news' | 'system';
    read: boolean;
    priority: 'low' | 'medium' | 'high' | 'critical';
    timestamp: number;
  }

  const countUnread = (notifications: Notification[]) =>
    notifications.filter(n => !n.read).length;

  const countByType = (notifications: Notification[]) => {
    const counts: Record<string, number> = {};
    for (const n of notifications) {
      if (!n.read) counts[n.type] = (counts[n.type] || 0) + 1;
    }
    return counts;
  };

  const filterCritical = (notifications: Notification[]) =>
    notifications.filter(n => n.priority === 'critical' && !n.read);

  const markAllRead = (notifications: Notification[]) =>
    notifications.map(n => ({ ...n, read: true }));

  const markReadByType = (notifications: Notification[], type: string) =>
    notifications.map(n => n.type === type ? { ...n, read: true } : n);

  const notifications: Notification[] = [
    { id: '1', type: 'price', read: false, priority: 'high', timestamp: 1 },
    { id: '2', type: 'price', read: true, priority: 'low', timestamp: 2 },
    { id: '3', type: 'volume', read: false, priority: 'critical', timestamp: 3 },
    { id: '4', type: 'news', read: false, priority: 'medium', timestamp: 4 },
    { id: '5', type: 'system', read: false, priority: 'low', timestamp: 5 },
  ];

  it('should count unread notifications', () => {
    expect(countUnread(notifications)).toBe(4);
  });

  it('should count by type', () => {
    const counts = countByType(notifications);
    expect(counts['price']).toBe(1);
    expect(counts['volume']).toBe(1);
    expect(counts['news']).toBe(1);
  });

  it('should filter critical unread', () => {
    const critical = filterCritical(notifications);
    expect(critical).toHaveLength(1);
    expect(critical[0].id).toBe('3');
  });

  it('should mark all as read', () => {
    const all = markAllRead(notifications);
    expect(all.every(n => n.read)).toBe(true);
  });

  it('should mark by type', () => {
    const result = markReadByType(notifications, 'price');
    expect(result.filter(n => n.type === 'price').every(n => n.read)).toBe(true);
    expect(result.filter(n => n.type !== 'price').some(n => !n.read)).toBe(true);
  });
});

// Search Highlight Logic Tests
describe('Search Highlight Logic', () => {
  const highlightMatches = (text: string, query: string) => {
    if (!query) return [{ text, highlight: false }];
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    return parts
      .filter(Boolean)
      .map(p => ({ text: p, highlight: regex.test(p) }));
  };

  const fuzzyMatch = (text: string, query: string): boolean => {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let qi = 0;
    for (let i = 0; i < lower.length && qi < q.length; i++) {
      if (lower[i] === q[qi]) qi++;
    }
    return qi === q.length;
  };

  it('should highlight exact matches', () => {
    const result = highlightMatches('贵州茅台酒股份有限公司', '茅台');
    expect(result.some(r => r.highlight && r.text === '茅台')).toBe(true);
  });

  it('should handle case insensitive matching', () => {
    const result = highlightMatches('Kweichow Moutai', 'kweichow');
    expect(result.some(r => r.highlight)).toBe(true);
  });

  it('should handle no match', () => {
    const result = highlightMatches('平安银行', '茅台');
    expect(result.every(r => !r.highlight)).toBe(true);
  });

  it('should handle empty query', () => {
    const result = highlightMatches('贵州茅台', '');
    expect(result).toEqual([{ text: '贵州茅台', highlight: false }]);
  });

  it('should fuzzy match abbreviation', () => {
    // fuzzyMatch does character-level matching (not pinyin)
    expect(fuzzyMatch('Kweichow Moutai', 'kw')).toBe(true);
    expect(fuzzyMatch('Kweichow Moutai', 'mt')).toBe(true);
    expect(fuzzyMatch('Kweichow Moutai', 'zgyh')).toBe(false);
  });

  it('should fuzzy match partial', () => {
    expect(fuzzyMatch('Kweichow Moutai', 'km')).toBe(true);
    expect(fuzzyMatch('Kweichow Moutai', 'xyz')).toBe(false);
  });
});
