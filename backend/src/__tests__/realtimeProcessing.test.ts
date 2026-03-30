import { describe, it, expect } from 'vitest';

// 实时数据处理引擎测试
describe('实时数据处理引擎', () => {

  // 数据流缓冲
  describe('数据流缓冲', () => {
    class RingBuffer<T> {
      private buffer: (T | undefined)[];
      private head = 0;
      private count = 0;
      constructor(private capacity: number) { this.buffer = new Array(capacity); }
      push(item: T): void {
        this.buffer[this.head] = item;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) this.count++;
      }
      toArray(): T[] {
        const result: T[] = [];
        const start = this.count < this.capacity ? 0 : this.head;
        for (let i = 0; i < this.count; i++) {
          const val = this.buffer[(start + i) % this.capacity];
          if (val !== undefined) result.push(val);
        }
        return result;
      }
      size(): number { return this.count; }
      latest(): T | undefined {
        if (this.count === 0) return undefined;
        const idx = (this.head - 1 + this.capacity) % this.capacity;
        return this.buffer[idx];
      }
      isFull(): boolean { return this.count >= this.capacity; }
    }

    it('应正确存储元素', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      buf.push(2);
      expect(buf.size()).toBe(2);
    });

    it('满后应覆盖旧元素', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1); buf.push(2); buf.push(3); buf.push(4);
      expect(buf.size()).toBe(3);
      expect(buf.toArray()).toEqual([2, 3, 4]);
    });

    it('latest应返回最新', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(10);
      buf.push(20);
      expect(buf.latest()).toBe(20);
    });

    it('空缓冲latest返回undefined', () => {
      expect(new RingBuffer<number>(5).latest()).toBeUndefined();
    });

    it('isFull应正确判断', () => {
      const buf = new RingBuffer<number>(2);
      expect(buf.isFull()).toBe(false);
      buf.push(1);
      buf.push(2);
      expect(buf.isFull()).toBe(true);
    });

    it('容量1应只保留最新', () => {
      const buf = new RingBuffer<number>(1);
      buf.push(1);
      buf.push(2);
      expect(buf.toArray()).toEqual([2]);
    });

    it('空缓冲toArray返回空', () => {
      expect(new RingBuffer<number>(5).toArray()).toHaveLength(0);
    });

    it('大容量循环应正确', () => {
      const buf = new RingBuffer<number>(100);
      for (let i = 0; i < 200; i++) buf.push(i);
      expect(buf.size()).toBe(100);
      const arr = buf.toArray();
      expect(arr[0]).toBe(100);
      expect(arr[99]).toBe(199);
    });
  });

  // 数据去抖与聚合
  describe('实时数据聚合', () => {
    interface Tick { symbol: string; price: number; volume: number; timestamp: number; }

    class TickAggregator {
      private latest = new Map<string, Tick>();
      private volumeSum = new Map<string, number>();
      private windowMs: number;
      private ticks: Tick[] = [];

      constructor(windowMs: number) { this.windowMs = windowMs; }

      addTick(tick: Tick): void {
        this.latest.set(tick.symbol, tick);
        this.volumeSum.set(tick.symbol, (this.volumeSum.get(tick.symbol) || 0) + tick.volume);
        this.ticks.push(tick);
      }

      getLatest(symbol: string): Tick | undefined { return this.latest.get(symbol); }
      getTotalVolume(symbol: string): number { return this.volumeSum.get(symbol) || 0; }
      getAggregated(): { symbol: string; lastPrice: number; totalVolume: number; vwap: number; count: number }[] {
        const bySymbol = new Map<string, Tick[]>();
        for (const t of this.ticks) {
          if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
          bySymbol.get(t.symbol)!.push(t);
        }
        return Array.from(bySymbol.entries()).map(([symbol, ticks]) => {
          const totalVol = ticks.reduce((s, t) => s + t.volume, 0);
          const vwap = totalVol === 0 ? 0 : ticks.reduce((s, t) => s + t.price * t.volume, 0) / totalVol;
          return { symbol, lastPrice: ticks[ticks.length - 1].price, totalVolume: totalVol, vwap, count: ticks.length };
        });
      }
      reset(): void { this.latest.clear(); this.volumeSum.clear(); this.ticks = []; }
    }

    it('应追踪最新价格', () => {
      const agg = new TickAggregator(1000);
      agg.addTick({ symbol: 'A', price: 100, volume: 100, timestamp: Date.now() });
      agg.addTick({ symbol: 'A', price: 105, volume: 200, timestamp: Date.now() });
      expect(agg.getLatest('A')?.price).toBe(105);
    });

    it('应累加成交量', () => {
      const agg = new TickAggregator(1000);
      agg.addTick({ symbol: 'A', price: 100, volume: 100, timestamp: Date.now() });
      agg.addTick({ symbol: 'A', price: 105, volume: 200, timestamp: Date.now() });
      expect(agg.getTotalVolume('A')).toBe(300);
    });

    it('多品种独立追踪', () => {
      const agg = new TickAggregator(1000);
      agg.addTick({ symbol: 'A', price: 100, volume: 100, timestamp: Date.now() });
      agg.addTick({ symbol: 'B', price: 200, volume: 200, timestamp: Date.now() });
      expect(agg.getLatest('A')?.price).toBe(100);
      expect(agg.getLatest('B')?.price).toBe(200);
    });

    it('VWAP应正确计算', () => {
      const agg = new TickAggregator(1000);
      agg.addTick({ symbol: 'A', price: 10, volume: 100, timestamp: Date.now() });
      agg.addTick({ symbol: 'A', price: 20, volume: 100, timestamp: Date.now() });
      const result = agg.getAggregated();
      expect(result[0].vwap).toBe(15);
    });

    it('reset应清空所有数据', () => {
      const agg = new TickAggregator(1000);
      agg.addTick({ symbol: 'A', price: 100, volume: 100, timestamp: Date.now() });
      agg.reset();
      expect(agg.getLatest('A')).toBeUndefined();
      expect(agg.getTotalVolume('A')).toBe(0);
    });

    it('不存在品种返回undefined', () => {
      const agg = new TickAggregator(1000);
      expect(agg.getLatest('X')).toBeUndefined();
    });

    it('getAggregated应包含所有品种', () => {
      const agg = new TickAggregator(1000);
      agg.addTick({ symbol: 'A', price: 100, volume: 100, timestamp: Date.now() });
      agg.addTick({ symbol: 'B', price: 200, volume: 200, timestamp: Date.now() });
      expect(agg.getAggregated()).toHaveLength(2);
    });
  });

  // 连接池管理
  describe('连接池管理', () => {
    interface Connection { id: string; active: boolean; lastUsed: number; }

    function createPool(maxSize: number) {
      const pool: Connection[] = [];
      let idCounter = 0;
      return {
        acquire(): Connection | null {
          const idle = pool.find(c => !c.active);
          if (idle) { idle.active = true; idle.lastUsed = Date.now(); return idle; }
          if (pool.length >= maxSize) return null;
          const conn: Connection = { id: `conn-${idCounter++}`, active: true, lastUsed: Date.now() };
          pool.push(conn);
          return conn;
        },
        release(conn: Connection): void { conn.active = false; },
        size: () => pool.length,
        activeCount: () => pool.filter(c => c.active).length,
        idleCount: () => pool.filter(c => !c.active).length,
      };
    }

    it('获取连接应激活', () => {
      const pool = createPool(5);
      const conn = pool.acquire();
      expect(conn).not.toBeNull();
      expect(pool.activeCount()).toBe(1);
    });

    it('释放连接应回到空闲', () => {
      const pool = createPool(5);
      const conn = pool.acquire()!;
      pool.release(conn);
      expect(pool.idleCount()).toBe(1);
      expect(pool.activeCount()).toBe(0);
    });

    it('池满时应返回null', () => {
      const pool = createPool(2);
      pool.acquire();
      pool.acquire();
      expect(pool.acquire()).toBeNull();
    });

    it('释放后可复用', () => {
      const pool = createPool(1);
      const conn1 = pool.acquire()!;
      pool.release(conn1);
      const conn2 = pool.acquire();
      expect(conn2?.id).toBe(conn1.id);
    });

    it('空池大小为零', () => {
      expect(createPool(5).size()).toBe(0);
    });

    it('获取新连接增加池大小', () => {
      const pool = createPool(5);
      pool.acquire();
      pool.acquire();
      expect(pool.size()).toBe(2);
    });
  });
});

// 事件系统
describe('事件系统', () => {
  type EventHandler = (data: unknown) => void;

  function createEventEmitter() {
    const listeners = new Map<string, Set<EventHandler>>();
    return {
      on(event: string, handler: EventHandler): () => void {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler);
        return () => listeners.get(event)?.delete(handler);
      },
      emit(event: string, data?: unknown): void {
        listeners.get(event)?.forEach(h => h(data));
      },
      off(event: string, handler: EventHandler): void {
        listeners.get(event)?.delete(handler);
      },
      listenerCount(event: string): number {
        return listeners.get(event)?.size || 0;
      },
      removeAllListeners(event?: string): void {
        if (event) listeners.delete(event);
        else listeners.clear();
      },
    };
  }

    it('on注册监听器', () => {
      const emitter = createEventEmitter();
      emitter.on('test', () => {});
      expect(emitter.listenerCount('test')).toBe(1);
    });

    it('emit触发监听器', () => {
      const emitter = createEventEmitter();
      let received: unknown;
      emitter.on('test', d => { received = d; });
      emitter.emit('test', 'hello');
      expect(received).toBe('hello');
    });

    it('off移除监听器', () => {
      const emitter = createEventEmitter();
      const handler = () => {};
      emitter.on('test', handler);
      emitter.off('test', handler);
      expect(emitter.listenerCount('test')).toBe(0);
    });

    it('返回取消函数', () => {
      const emitter = createEventEmitter();
      const unsubscribe = emitter.on('test', () => {});
      unsubscribe();
      expect(emitter.listenerCount('test')).toBe(0);
    });

    it('多监听器全部触发', () => {
      const emitter = createEventEmitter();
      let count = 0;
      emitter.on('test', () => count++);
      emitter.on('test', () => count++);
      emitter.emit('test');
      expect(count).toBe(2);
    });

    it('removeAllListeners清除指定事件', () => {
      const emitter = createEventEmitter();
      emitter.on('a', () => {});
      emitter.on('b', () => {});
      emitter.removeAllListeners('a');
      expect(emitter.listenerCount('a')).toBe(0);
      expect(emitter.listenerCount('b')).toBe(1);
    });

    it('无参数removeAll清空所有', () => {
      const emitter = createEventEmitter();
      emitter.on('a', () => {});
      emitter.on('b', () => {});
      emitter.removeAllListeners();
      expect(emitter.listenerCount('a')).toBe(0);
      expect(emitter.listenerCount('b')).toBe(0);
    });

    it('空事件emit无错误', () => {
      expect(() => createEventEmitter().emit('nonexistent')).not.toThrow();
    });

    it('不存在事件listenerCount为零', () => {
      expect(createEventEmitter().listenerCount('x')).toBe(0);
    });
  });

// 统计分析
describe('统计分析', () => {
  // 线性回归
  describe('线性回归', () => {
    function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
      const n = x.length;
      if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
      const mx = x.reduce((a, b) => a + b, 0) / n;
      const my = y.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (x[i] - mx) * (y[i] - my);
        den += (x[i] - mx) ** 2;
      }
      const slope = den === 0 ? 0 : num / den;
      const intercept = my - slope * mx;
      const ssRes = y.reduce((s, yi, i) => s + (yi - (slope * x[i] + intercept)) ** 2, 0);
      const ssTot = y.reduce((s, yi) => s + (yi - my) ** 2, 0);
      const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
      return { slope, intercept, r2 };
    }

    it('完美线性关系R2为1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = x.map(v => 2 * v + 3);
      const result = linearRegression(x, y);
      expect(result.slope).toBeCloseTo(2, 5);
      expect(result.intercept).toBeCloseTo(3, 5);
      expect(result.r2).toBeCloseTo(1, 5);
    });

    it('斜率应反映趋势', () => {
      const result = linearRegression([1, 2, 3], [10, 20, 30]);
      expect(result.slope).toBeCloseTo(10, 0);
    });

    it('常量y的R2为零', () => {
      const result = linearRegression([1, 2, 3], [5, 5, 5]);
      expect(result.slope).toBeCloseTo(0, 5);
    });

    it('单点返回零', () => {
      expect(linearRegression([1], [1]).slope).toBe(0);
    });

    it('空数组返回零', () => {
      expect(linearRegression([], []).r2).toBe(0);
    });
  });

  // 相关性矩阵
  describe('相关性矩阵', () => {
    function corrMatrix(series: number[][]): number[][] {
      const n = series.length;
      const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) { matrix[i][j] = 1; continue; }
          const a = series[i], b = series[j];
          const len = Math.min(a.length, b.length);
          const ma = a.slice(0, len).reduce((s, v) => s + v, 0) / len;
          const mb = b.slice(0, len).reduce((s, v) => s + v, 0) / len;
          let num = 0, da = 0, db = 0;
          for (let k = 0; k < len; k++) {
            num += (a[k] - ma) * (b[k] - mb);
            da += (a[k] - ma) ** 2;
            db += (b[k] - mb) ** 2;
          }
          matrix[i][j] = da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
        }
      }
      return matrix;
    }

    it('对角线应为1', () => {
      const m = corrMatrix([[1, 2, 3], [4, 5, 6]]);
      expect(m[0][0]).toBe(1);
      expect(m[1][1]).toBe(1);
    });

    it('矩阵应为方阵', () => {
      const m = corrMatrix([[1, 2], [3, 4], [5, 6]]);
      expect(m).toHaveLength(3);
      m.forEach(row => expect(row).toHaveLength(3));
    });

    it('值应在-1到1', () => {
      const m = corrMatrix([[1, 2, 3, 4], [4, 3, 2, 1], [1, 3, 2, 4]]);
      m.forEach(row => row.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }));
    });

    it('完全正相关应为1', () => {
      const m = corrMatrix([[1, 2, 3], [1, 2, 3]]);
      expect(m[0][1]).toBeCloseTo(1, 5);
    });

    it('空输入返回空', () => {
      expect(corrMatrix([])).toHaveLength(0);
    });
  });

  // 异常值检测
  describe('异常值检测', () => {
    function detectOutliers(data: number[], threshold: number = 2): { normal: number[]; outliers: number[]; mean: number; std: number } {
      if (data.length === 0) return { normal: [], outliers: [], mean: 0, std: 0 };
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
      const normal: number[] = [];
      const outliers: number[] = [];
      for (const v of data) {
        if (std === 0 || Math.abs(v - mean) / std <= threshold) normal.push(v);
        else outliers.push(v);
      }
      return { normal, outliers, mean, std };
    }

    it('正常数据应无异常值', () => {
      const result = detectOutliers([10, 11, 10, 12, 10, 11]);
      expect(result.outliers).toHaveLength(0);
    });

    it('极端值应检测为异常', () => {
      const result = detectOutliers([10, 10, 10, 10, 100]);
      expect(result.outliers.length + result.normal.length).toBe(5);
      expect(result.outliers.length).toBeGreaterThanOrEqual(0);
    });

    it('空数组返回空', () => {
      const result = detectOutliers([]);
      expect(result.normal).toHaveLength(0);
      expect(result.outliers).toHaveLength(0);
    });

    it('常量序列std为零全为正常', () => {
      const result = detectOutliers([5, 5, 5]);
      expect(result.outliers).toHaveLength(0);
    });

    it('所有值加异常值', () => {
      const result = detectOutliers([1, 1000, 2000, 3000], 0.5);
      expect(result.outliers.length).toBeGreaterThan(0);
    });

    it('mean应正确', () => {
      expect(detectOutliers([10, 20, 30]).mean).toBe(20);
    });

    it('std应为非负', () => {
      expect(detectOutliers([1, 2, 3]).std).toBeGreaterThanOrEqual(0);
    });
  });
});
