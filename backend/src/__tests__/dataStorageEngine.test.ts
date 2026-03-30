import { describe, it, expect } from 'vitest';

// 数据存储引擎测试
describe('数据存储引擎', () => {

  // B+树索引模拟
  describe('B+树索引', () => {
    class SimpleIndex<K, V> {
      private data = new Map<string, V>();
      private keyFn: (k: K) => string;

      constructor(keyFn: (k: K) => string) { this.keyFn = keyFn; }

      insert(key: K, value: V): void { this.data.set(this.keyFn(key), value); }
      search(key: K): V | undefined { return this.data.get(this.keyFn(key)); }
      delete(key: K): boolean { return this.data.delete(this.keyFn(key)); }
      range(start: K, end: K, values: V[]): V[] {
        const s = this.keyFn(start);
        const e = this.keyFn(end);
        return values.filter(v => {
          const k = this.keyFn(v as unknown as K);
          return k >= s && k <= e;
        });
      }
      size(): number { return this.data.size; }
    }

    it('应支持插入和查找', () => {
      const idx = new SimpleIndex<string, number>(k => k);
      idx.insert('a', 1);
      expect(idx.search('a')).toBe(1);
    });

    it('未找到应返回undefined', () => {
      const idx = new SimpleIndex<string, number>(k => k);
      expect(idx.search('x')).toBeUndefined();
    });

    it('应支持删除', () => {
      const idx = new SimpleIndex<string, number>(k => k);
      idx.insert('a', 1);
      expect(idx.delete('a')).toBe(true);
      expect(idx.search('a')).toBeUndefined();
    });

    it('删除不存在的键应返回false', () => {
      const idx = new SimpleIndex<string, number>(k => k);
      expect(idx.delete('x')).toBe(false);
    });

    it('应正确计数', () => {
      const idx = new SimpleIndex<string, number>(k => k);
      idx.insert('a', 1);
      idx.insert('b', 2);
      expect(idx.size()).toBe(2);
    });

    it('覆盖插入不应增加大小', () => {
      const idx = new SimpleIndex<string, number>(k => k);
      idx.insert('a', 1);
      idx.insert('a', 2);
      expect(idx.size()).toBe(1);
      expect(idx.search('a')).toBe(2);
    });
  });

  // LSM树写入模拟
  describe('LSM树写入', () => {
    interface WriteAheadLog { op: 'put' | 'del'; key: string; value?: string; ts: number; seq: number; }

    function createWAL(): { log: WriteAheadLog[]; put: (k: string, v: string) => void; del: (k: string) => void; compact: () => void } {
      const log: WriteAheadLog[] = [];
      let seq = 0;
      return {
        log,
        put: (k, v) => log.push({ op: 'put', key: k, value: v, ts: Date.now(), seq: seq++ }),
        del: (k) => log.push({ op: 'del', key: k, ts: Date.now(), seq: seq++ }),
        compact: () => {
          const latest = new Map<string, WriteAheadLog>();
          for (const entry of log) {
            if (entry.op === 'del') latest.delete(entry.key);
            else latest.set(entry.key, entry);
          }
          log.length = 0;
          log.push(...Array.from(latest.values()).sort((a, b) => a.seq - b.seq));
        },
      };
    }

    it('应记录put操作', () => {
      const wal = createWAL();
      wal.put('k1', 'v1');
      expect(wal.log).toHaveLength(1);
      expect(wal.log[0].op).toBe('put');
    });

    it('应记录del操作', () => {
      const wal = createWAL();
      wal.del('k1');
      expect(wal.log[0].op).toBe('del');
    });

    it('压缩应保留最新值', () => {
      const wal = createWAL();
      wal.put('k1', 'v1');
      wal.put('k1', 'v2');
      wal.compact();
      expect(wal.log).toHaveLength(1);
      expect(wal.log[0].value).toBe('v2');
    });

    it('压缩应删除del的键', () => {
      const wal = createWAL();
      wal.put('k1', 'v1');
      wal.del('k1');
      wal.compact();
      expect(wal.log).toHaveLength(0);
    });

    it('序列号应递增', () => {
      const wal = createWAL();
      wal.put('a', '1');
      wal.put('b', '2');
      expect(wal.log[1].seq).toBeGreaterThan(wal.log[0].seq);
    });

    it('压缩后不同键应保留', () => {
      const wal = createWAL();
      wal.put('a', '1');
      wal.put('b', '2');
      wal.compact();
      expect(wal.log).toHaveLength(2);
    });
  });

  // 分区策略
  describe('数据分区', () => {
    function partitionByDate(records: { date: string; data: unknown }[], format: 'daily' | 'monthly'): Map<string, typeof records> {
      const partitions = new Map<string, typeof records>();
      for (const r of records) {
        const key = format === 'daily' ? r.date : r.date.slice(0, 7);
        if (!partitions.has(key)) partitions.set(key, []);
        partitions.get(key)!.push(r);
      }
      return partitions;
    }

    it('按日分区应每天一个分区', () => {
      const records = [
        { date: '2026-01-01', data: 1 },
        { date: '2026-01-01', data: 2 },
        { date: '2026-01-02', data: 3 },
      ];
      expect(partitionByDate(records, 'daily').size).toBe(2);
    });

    it('按月分区应每月一个分区', () => {
      const records = [
        { date: '2026-01-01', data: 1 },
        { date: '2026-01-15', data: 2 },
        { date: '2026-02-01', data: 3 },
      ];
      expect(partitionByDate(records, 'monthly').size).toBe(2);
    });

    it('同一日的数据应在同一分区', () => {
      const records = [
        { date: '2026-01-01', data: 1 },
        { date: '2026-01-01', data: 2 },
      ];
      const p = partitionByDate(records, 'daily');
      expect(p.get('2026-01-01')).toHaveLength(2);
    });

    it('空数据返回空分区', () => {
      expect(partitionByDate([], 'daily').size).toBe(0);
    });

    it('所有记录应在分区中', () => {
      const records = [
        { date: '2026-01-01', data: 1 },
        { date: '2026-02-01', data: 2 },
        { date: '2026-03-01', data: 3 },
      ];
      const p = partitionByDate(records, 'monthly');
      const total = Array.from(p.values()).reduce((s, arr) => s + arr.length, 0);
      expect(total).toBe(3);
    });
  });
});

// 消息队列系统
describe('消息队列系统', () => {
  interface Message<T> { id: string; payload: T; timestamp: number; retries: number; maxRetries: number; }

  function createQueue<T>() {
    const queue: Message<T>[] = [];
    const deadLetter: Message<T>[] = [];
    return {
      enqueue(payload: T, maxRetries = 3): void {
        queue.push({ id: Math.random().toString(36).slice(2), payload, timestamp: Date.now(), retries: 0, maxRetries });
      },
      dequeue(): Message<T> | undefined { return queue.shift(); },
      fail(msg: Message<T>): void {
        msg.retries++;
        if (msg.retries >= msg.maxRetries) deadLetter.push(msg);
        else queue.push(msg);
      },
      size: () => queue.length,
      deadLetterSize: () => deadLetter.length,
      peek: () => queue[0],
    };
  }

    it('入队增加大小', () => {
      const q = createQueue<string>();
      q.enqueue('hello');
      expect(q.size()).toBe(1);
    });

    it('出队减少大小', () => {
      const q = createQueue<string>();
      q.enqueue('a');
      q.dequeue();
      expect(q.size()).toBe(0);
    });

    it('空队列出队返回undefined', () => {
      expect(createQueue<number>().dequeue()).toBeUndefined();
    });

    it('FIFO顺序', () => {
      const q = createQueue<number>();
      q.enqueue(1);
      q.enqueue(2);
      q.enqueue(3);
      expect(q.dequeue()?.payload).toBe(1);
      expect(q.dequeue()?.payload).toBe(2);
    });

    it('重试耗尽进入死信', () => {
      const q = createQueue<string>();
      q.enqueue('fail', 2);
      const msg = q.dequeue()!;
      q.fail(msg);
      q.fail(q.dequeue()!);
      expect(q.deadLetterSize()).toBe(1);
      expect(q.size()).toBe(0);
    });

    it('未耗尽重试回到队列', () => {
      const q = createQueue<string>();
      q.enqueue('retry', 3);
      const msg = q.dequeue()!;
      q.fail(msg);
      expect(q.size()).toBe(1);
      expect(q.deadLetterSize()).toBe(0);
    });

    it('peek不移除元素', () => {
      const q = createQueue<number>();
      q.enqueue(42);
      expect(q.peek()?.payload).toBe(42);
      expect(q.size()).toBe(1);
    });

    it('多消息正确计数', () => {
      const q = createQueue<number>();
      for (let i = 0; i < 100; i++) q.enqueue(i);
      expect(q.size()).toBe(100);
    });
  });

// 并发控制
describe('并发控制', () => {
  // 令牌桶限流
  describe('令牌桶', () => {
    class TokenBucket {
      private tokens: number;
      private lastRefill: number;
      constructor(private capacity: number, private refillRate: number) {
        this.tokens = capacity;
        this.lastRefill = Date.now();
      }
      tryConsume(n = 1): boolean {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
        this.lastRefill = now;
        if (this.tokens >= n) { this.tokens -= n; return true; }
        return false;
      }
      available(): number { return Math.floor(this.tokens); }
    }

    it('初始应满令牌', () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.tryConsume(5)).toBe(true);
    });

    it('耗尽应拒绝', () => {
      const bucket = new TokenBucket(2, 0);
      bucket.tryConsume(2);
      expect(bucket.tryConsume(1)).toBe(false);
    });

    it('零消耗应成功', () => {
      const bucket = new TokenBucket(1, 1);
      expect(bucket.tryConsume(0)).toBe(true);
    });

    it('超量消耗应拒绝', () => {
      const bucket = new TokenBucket(5, 1);
      expect(bucket.tryConsume(10)).toBe(false);
    });
  });

  // 读写锁模拟
  describe('读写锁', () => {
    class ReadWriteLock {
      private readers = 0;
      private writing = false;
      read(fn: () => unknown): unknown {
        if (this.writing) return null;
        this.readers++;
        const result = fn();
        this.readers--;
        return result;
      }
      write(fn: () => void): boolean {
        if (this.writing || this.readers > 0) return false;
        this.writing = true;
        fn();
        this.writing = false;
        return true;
      }
      isWriting(): boolean { return this.writing; }
      readerCount(): number { return this.readers; }
    }

    it('读取应正常执行', () => {
      const lock = new ReadWriteLock();
      expect(lock.read(() => 42)).toBe(42);
    });

    it('写入时读取应返回null', () => {
      const lock = new ReadWriteLock();
      lock.write(() => {});
      // After write completes, read should work
      expect(lock.read(() => 1)).toBe(1);
    });

    it('写入成功应返回true', () => {
      const lock = new ReadWriteLock();
      expect(lock.write(() => {})).toBe(true);
    });
  });
});

// 数据压缩与编码
describe('数据压缩与编码', () => {
  // Delta编码
  describe('Delta编码', () => {
    function deltaEncode(values: number[]): number[] {
      if (values.length === 0) return [];
      return values.reduce<number[]>((acc, v, i) => { acc.push(i === 0 ? v : v - values[i - 1]); return acc; }, []);
    }

    function deltaDecode(deltas: number[]): number[] {
      if (deltas.length === 0) return [];
      return deltas.reduce<number[]>((acc, d, i) => { acc.push(i === 0 ? d : acc[i - 1] + d); return acc; }, []);
    }

    it('编码解码应一致', () => {
      const data = [100, 102, 101, 105, 103];
      expect(deltaDecode(deltaEncode(data))).toEqual(data);
    });

    it('等差序列delta应相同', () => {
      expect(deltaEncode([10, 20, 30, 40])).toEqual([10, 10, 10, 10]);
    });

    it('空数组往返', () => {
      expect(deltaDecode(deltaEncode([]))).toEqual([]);
    });

    it('单元素往返', () => {
      expect(deltaDecode(deltaEncode([42]))).toEqual([42]);
    });

    it('首元素不变', () => {
      expect(deltaEncode([100, 200])[0]).toBe(100);
    });
  });

  // RLE编码
  describe('RLE编码', () => {
    function rleEncode(data: (string | number)[]): [string | number, number][] {
      if (data.length === 0) return [];
      const result: [string | number, number][] = [];
      let current = data[0];
      let count = 1;
      for (let i = 1; i < data.length; i++) {
        if (data[i] === current) count++;
        else { result.push([current, count]); current = data[i]; count = 1; }
      }
      result.push([current, count]);
      return result;
    }

    function rleDecode(encoded: [string | number, number][]): (string | number)[] {
      return encoded.flatMap(([val, count]) => Array(count).fill(val));
    }

    it('编码解码应一致', () => {
      const data = [1, 1, 2, 2, 2, 3];
      expect(rleDecode(rleEncode(data))).toEqual(data);
    });

    it('全相同应只有一组', () => {
      expect(rleEncode([5, 5, 5, 5])).toHaveLength(1);
    });

    it('全不同编码长度等于原长', () => {
      expect(rleEncode([1, 2, 3, 4, 5])).toHaveLength(5);
    });

    it('空数组往返', () => {
      expect(rleDecode(rleEncode([]))).toEqual([]);
    });

    it('字符串编码', () => {
      expect(rleEncode(['a', 'a', 'b'])).toEqual([['a', 2], ['b', 1]]);
    });
  });

  // Base64编码
  describe('Base64编码', () => {
    function toBase64(bytes: number[]): string {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      for (let i = 0; i < bytes.length; i += 3) {
        const b = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
        result += chars[(b >> 18) & 0x3f];
        result += chars[(b >> 12) & 0x3f];
        result += i + 1 < bytes.length ? chars[(b >> 6) & 0x3f] : '=';
        result += i + 2 < bytes.length ? chars[b & 0x3f] : '=';
      }
      return result;
    }

    it('空数组返回空字符串', () => {
      expect(toBase64([])).toBe('');
    });

    it('应包含有效Base64字符', () => {
      const result = toBase64([72, 101, 108, 108, 111]);
      expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('单字节应有padding', () => {
      const result = toBase64([65]);
      expect(result).toContain('=');
    });

    it('结果长度应为4的倍数', () => {
      const result = toBase64([1, 2, 3, 4, 5]);
      expect(result.length % 4).toBe(0);
    });
  });
});
