import { describe, it, expect } from 'vitest'

// 消息队列与事件系统测试
describe('Message Queue & Event System', () => {
  // 事件发射器
  class EventEmitter {
    private handlers: Record<string, Array<(...args: any[]) => void>> = {}
    on(event: string, handler: (...args: any[]) => void) {
      if (!this.handlers[event]) this.handlers[event] = []
      this.handlers[event].push(handler)
      return () => this.off(event, handler)
    }
    off(event: string, handler: (...args: any[]) => void) {
      if (!this.handlers[event]) return
      this.handlers[event] = this.handlers[event].filter(h => h !== handler)
    }
    emit(event: string, ...args: any[]) {
      if (!this.handlers[event]) return 0
      this.handlers[event].forEach(h => h(...args))
      return this.handlers[event].length
    }
    removeAll(event?: string) {
      if (event) delete this.handlers[event]
      else this.handlers = {}
    }
    listenerCount(event: string) {
      return this.handlers[event]?.length || 0
    }
  }

  it('should emit events', () => {
    const emitter = new EventEmitter()
    let called = false
    emitter.on('test', () => { called = true })
    emitter.emit('test')
    expect(called).toBe(true)
  })

  it('should pass arguments', () => {
    const emitter = new EventEmitter()
    let received: any[] = []
    emitter.on('data', (...args) => { received = args })
    emitter.emit('data', 1, 'two', { three: 3 })
    expect(received).toEqual([1, 'two', { three: 3 }])
  })

  it('should return listener count on emit', () => {
    const emitter = new EventEmitter()
    emitter.on('x', () => {})
    emitter.on('x', () => {})
    expect(emitter.emit('x')).toBe(2)
  })

  it('should remove specific handler', () => {
    const emitter = new EventEmitter()
    let count = 0
    const handler = () => { count++ }
    emitter.on('x', handler)
    emitter.emit('x')
    emitter.off('x', handler)
    emitter.emit('x')
    expect(count).toBe(1)
  })

  it('should return unsubscribe function', () => {
    const emitter = new EventEmitter()
    let count = 0
    const unsub = emitter.on('x', () => { count++ })
    emitter.emit('x')
    unsub()
    emitter.emit('x')
    expect(count).toBe(1)
  })

  it('should remove all listeners for event', () => {
    const emitter = new EventEmitter()
    emitter.on('a', () => {})
    emitter.on('a', () => {})
    emitter.on('b', () => {})
    emitter.removeAll('a')
    expect(emitter.listenerCount('a')).toBe(0)
    expect(emitter.listenerCount('b')).toBe(1)
  })

  it('should remove all listeners', () => {
    const emitter = new EventEmitter()
    emitter.on('a', () => {})
    emitter.on('b', () => {})
    emitter.removeAll()
    expect(emitter.listenerCount('a')).toBe(0)
    expect(emitter.listenerCount('b')).toBe(0)
  })

  // 消息队列
  class MessageQueue<T> {
    private queue: Array<{ id: string; data: T; priority: number; timestamp: number }> = []
    private processed = new Set<string>()

    enqueue(id: string, data: T, priority = 0) {
      if (this.processed.has(id)) return false
      this.queue.push({ id, data, priority, timestamp: Date.now() })
      this.queue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp)
      return true
    }

    dequeue() {
      const item = this.queue.shift()
      if (item) this.processed.add(item.id)
      return item || null
    }

    peek() { return this.queue[0] || null }
    size() { return this.queue.length }
    isProcessed(id: string) { return this.processed.has(id) }
  }

  it('should enqueue and dequeue', () => {
    const mq = new MessageQueue<string>()
    mq.enqueue('1', 'hello')
    const item = mq.dequeue()
    expect(item?.data).toBe('hello')
    expect(mq.size()).toBe(0)
  })

  it('should respect priority', () => {
    const mq = new MessageQueue<string>()
    mq.enqueue('low', 'low', 1)
    mq.enqueue('high', 'high', 10)
    const item = mq.dequeue()
    expect(item?.id).toBe('high')
  })

  it('should prevent duplicate ids', () => {
    const mq = new MessageQueue<string>()
    mq.enqueue('dup', 'first')
    const item = mq.dequeue()
    expect(mq.enqueue('dup', 'second')).toBe(false)
  })

  it('should track processed items', () => {
    const mq = new MessageQueue<number>()
    mq.enqueue('a', 1)
    mq.dequeue()
    expect(mq.isProcessed('a')).toBe(true)
  })

  it('should peek without removing', () => {
    const mq = new MessageQueue<number>()
    mq.enqueue('a', 42)
    expect(mq.peek()?.data).toBe(42)
    expect(mq.size()).toBe(1)
  })

  // 发布订阅模式
  class PubSub {
    private channels: Record<string, Set<(data: any) => void>> = {}
    subscribe(channel: string, callback: (data: any) => void) {
      if (!this.channels[channel]) this.channels[channel] = new Set()
      this.channels[channel].add(callback)
      return () => this.channels[channel]?.delete(callback)
    }
    publish(channel: string, data: any) {
      if (!this.channels[channel]) return 0
      this.channels[channel].forEach(cb => cb(data))
      return this.channels[channel].size
    }
    subscriberCount(channel: string) {
      return this.channels[channel]?.size || 0
    }
  }

  it('should publish to subscribers', () => {
    const ps = new PubSub()
    let received: any = null
    ps.subscribe('news', (d) => { received = d })
    ps.publish('news', { title: 'test' })
    expect(received).toEqual({ title: 'test' })
  })

  it('should support multiple channels', () => {
    const ps = new PubSub()
    const received: string[] = []
    ps.subscribe('a', () => received.push('a'))
    ps.subscribe('b', () => received.push('b'))
    ps.publish('a', null)
    ps.publish('b', null)
    expect(received).toEqual(['a', 'b'])
  })

  it('should unsubscribe', () => {
    const ps = new PubSub()
    let count = 0
    const unsub = ps.subscribe('x', () => { count++ })
    ps.publish('x', null)
    unsub()
    ps.publish('x', null)
    expect(count).toBe(1)
  })

  // 重试队列
  class RetryQueue<T> {
    private items: Array<{ data: T; retries: number; maxRetries: number; nextRetry: number }> = []

    add(data: T, maxRetries = 3, delay = 1000) {
      this.items.push({ data, retries: 0, maxRetries, nextRetry: Date.now() + delay })
    }

    getReady(): T[] {
      const now = Date.now()
      return this.items.filter(i => i.nextRetry <= now).map(i => i.data)
    }

    retry(data: T, delay = 1000) {
      const item = this.items.find(i => i.data === data)
      if (!item) return false
      item.retries++
      if (item.retries >= item.maxRetries) {
        this.items = this.items.filter(i => i.data !== data)
        return false
      }
      item.nextRetry = Date.now() + delay * Math.pow(2, item.retries)
      return true
    }

    remove(data: T) {
      this.items = this.items.filter(i => i.data !== data)
    }

    size() { return this.items.length }
  }

  it('should add items to retry queue', () => {
    const rq = new RetryQueue<string>()
    rq.add('task1')
    expect(rq.size()).toBe(1)
  })

  it('should remove on successful retry', () => {
    const rq = new RetryQueue<string>()
    rq.add('task', 3)
    rq.retry('task')
    rq.retry('task')
    rq.retry('task')  // third retry reaches max, removes item
    expect(rq.size()).toBe(0)
  })

  it('should remove completed tasks', () => {
    const rq = new RetryQueue<string>()
    rq.add('task')
    rq.remove('task')
    expect(rq.size()).toBe(0)
  })
})
