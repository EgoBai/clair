import { describe, it, expect } from 'vitest';

// Rate limiting and throttling logic tests
describe('Rate Limiting & Throttling', () => {
  // Token bucket algorithm
  describe('Token Bucket', () => {
    class TokenBucket {
      private tokens: number;
      private lastRefill: number;

      constructor(
        private capacity: number,
        private refillRate: number, // tokens per second
      ) {
        this.tokens = capacity;
        this.lastRefill = Date.now();
      }

      tryConsume(count = 1): boolean {
        this.refill();
        if (this.tokens >= count) {
          this.tokens -= count;
          return true;
        }
        return false;
      }

      private refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
        this.lastRefill = now;
      }

      available(): number {
        this.refill();
        return Math.floor(this.tokens);
      }
    }

    it('should allow requests within capacity', () => {
      const bucket = new TokenBucket(10, 1);
      for (let i = 0; i < 10; i++) {
        expect(bucket.tryConsume()).toBe(true);
      }
    });

    it('should reject when empty', () => {
      const bucket = new TokenBucket(1, 0);
      bucket.tryConsume();
      expect(bucket.tryConsume()).toBe(false);
    });

    it('should consume multiple tokens', () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.tryConsume(5)).toBe(true);
      expect(bucket.available()).toBe(5);
    });

    it('should reject multi-token request exceeding available', () => {
      const bucket = new TokenBucket(3, 0);
      expect(bucket.tryConsume(5)).toBe(false);
    });
  });

  // Sliding window log
  describe('Sliding Window Log', () => {
    class SlidingWindowLog {
      private timestamps: number[] = [];

      constructor(private windowMs: number, private maxRequests: number) {}

      tryRequest(now: number): boolean {
        this.cleanup(now);
        if (this.timestamps.length < this.maxRequests) {
          this.timestamps.push(now);
          return true;
        }
        return false;
      }

      private cleanup(now: number) {
        const cutoff = now - this.windowMs;
        this.timestamps = this.timestamps.filter(t => t > cutoff);
      }

      currentCount(now: number): number {
        this.cleanup(now);
        return this.timestamps.length;
      }
    }

    it('should allow requests within window', () => {
      const limiter = new SlidingWindowLog(60000, 5);
      expect(limiter.tryRequest(1000)).toBe(true);
      expect(limiter.tryRequest(2000)).toBe(true);
      expect(limiter.tryRequest(3000)).toBe(true);
    });

    it('should reject when limit reached', () => {
      const limiter = new SlidingWindowLog(60000, 2);
      limiter.tryRequest(1000);
      limiter.tryRequest(2000);
      expect(limiter.tryRequest(3000)).toBe(false);
    });

    it('should allow after window expires', () => {
      const limiter = new SlidingWindowLog(1000, 2);
      limiter.tryRequest(1000);
      limiter.tryRequest(2000);
      expect(limiter.tryRequest(3000)).toBe(true); // 1000 expired
    });

    it('should count correctly', () => {
      const limiter = new SlidingWindowLog(60000, 10);
      limiter.tryRequest(1000);
      limiter.tryRequest(2000);
      expect(limiter.currentCount(3000)).toBe(2);
    });
  });

  // Fixed window counter
  describe('Fixed Window Counter', () => {
    class FixedWindowCounter {
      private count = 0;
      private windowStart: number;

      constructor(private windowMs: number, private maxRequests: number) {
        this.windowStart = Date.now();
      }

      tryRequest(): boolean {
        this.maybeReset();
        if (this.count < this.maxRequests) {
          this.count++;
          return true;
        }
        return false;
      }

      private maybeReset() {
        const now = Date.now();
        if (now - this.windowStart >= this.windowMs) {
          this.count = 0;
          this.windowStart = now;
        }
      }

      remaining(): number {
        this.maybeReset();
        return this.maxRequests - this.count;
      }
    }

    it('should count requests in window', () => {
      const counter = new FixedWindowCounter(60000, 10);
      counter.tryRequest();
      counter.tryRequest();
      expect(counter.remaining()).toBe(8);
    });

    it('should reject after limit', () => {
      const counter = new FixedWindowCounter(60000, 1);
      counter.tryRequest();
      expect(counter.tryRequest()).toBe(false);
    });

    it('should return remaining correctly', () => {
      const counter = new FixedWindowCounter(60000, 5);
      expect(counter.remaining()).toBe(5);
      counter.tryRequest();
      expect(counter.remaining()).toBe(4);
    });
  });

  // Debounce vs Throttle
  describe('Debounce & Throttle', () => {
    function createThrottle(fn: Function, intervalMs: number) {
      let lastCall = 0;
      return function(...args: any[]) {
        const now = Date.now();
        if (now - lastCall >= intervalMs) {
          lastCall = now;
          return fn(...args);
        }
        return undefined;
      };
    }

    it('throttle should limit call frequency', () => {
      let count = 0;
      const throttled = createThrottle(() => count++, 1000);
      throttled();
      throttled();
      throttled();
      expect(count).toBe(1);
    });

    it('throttle logic validates interval', () => {
      // Test the throttle concept without real timers
      const interval = 1000;
      const callTimes = [0, 100, 200, 1100, 1200, 2200];
      let lastCall = -Infinity;
      let allowed = 0;
      for (const t of callTimes) {
        if (t - lastCall >= interval) {
          allowed++;
          lastCall = t;
        }
      }
      expect(allowed).toBe(3); // t=0, t=1100, t=2200
    });
  });

  // Priority queue for rate limiting
  describe('Priority Request Queue', () => {
    interface Request {
      id: string;
      priority: number; // lower = higher priority
      timestamp: number;
    }

    class PriorityQueue {
      private items: Request[] = [];

      enqueue(req: Request) {
        this.items.push(req);
        this.items.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);
      }

      dequeue(): Request | undefined {
        return this.items.shift();
      }

      size(): number { return this.items.length; }

      peek(): Request | undefined {
        return this.items[0];
      }
    }

    it('should dequeue highest priority first', () => {
      const pq = new PriorityQueue();
      pq.enqueue({ id: 'low', priority: 3, timestamp: 1 });
      pq.enqueue({ id: 'high', priority: 1, timestamp: 2 });
      pq.enqueue({ id: 'med', priority: 2, timestamp: 3 });

      expect(pq.dequeue()!.id).toBe('high');
      expect(pq.dequeue()!.id).toBe('med');
      expect(pq.dequeue()!.id).toBe('low');
    });

    it('should break ties by timestamp', () => {
      const pq = new PriorityQueue();
      pq.enqueue({ id: 'later', priority: 1, timestamp: 2 });
      pq.enqueue({ id: 'earlier', priority: 1, timestamp: 1 });
      expect(pq.dequeue()!.id).toBe('earlier');
    });

    it('should handle empty queue', () => {
      const pq = new PriorityQueue();
      expect(pq.dequeue()).toBeUndefined();
      expect(pq.size()).toBe(0);
    });

    it('should peek without removing', () => {
      const pq = new PriorityQueue();
      pq.enqueue({ id: 'a', priority: 1, timestamp: 1 });
      expect(pq.peek()!.id).toBe('a');
      expect(pq.size()).toBe(1);
    });
  });
});
