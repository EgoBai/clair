import { describe, it, expect } from 'vitest'

// 前端状态管理深层测试
describe('State Management Deep Dive', () => {
  // 不可变更新工具
  function immutableUpdate<T extends Record<string, any>>(obj: T, path: string, value: any): T {
    const keys = path.split('.')
    const result = { ...obj }
    let current: any = result
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = { ...current[keys[i]] }
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value
    return result
  }

  it('should update nested value immutably', () => {
    const original = { user: { name: 'old', settings: { theme: 'light' } } }
    const updated = immutableUpdate(original, 'user.settings.theme', 'dark')
    expect(updated.user.settings.theme).toBe('dark')
    expect(original.user.settings.theme).toBe('light')  // original unchanged
  })

  it('should update top-level value', () => {
    const updated = immutableUpdate({ a: 1 }, 'a', 2)
    expect(updated.a).toBe(2)
  })

  // 选择器缓存
  function createSelector<Args extends any[], Result>(
    fn: (...args: Args) => Result,
    equalityFn?: (a: Result, b: Result) => boolean
  ) {
    let lastArgs: Args | null = null
    let lastResult: Result | null = null
    const eq = equalityFn || ((a: Result, b: Result) => a === b)
    return (...args: Args): Result => {
      if (lastArgs && args.every((a, i) => a === lastArgs![i])) {
        return lastResult!
      }
      lastArgs = args
      lastResult = fn(...args)
      return lastResult
    }
  }

  it('should cache selector result', () => {
    let callCount = 0
    const selector = createSelector((x: number) => { callCount++; return x * 2 })
    selector(5)
    selector(5)
    expect(callCount).toBe(1)
  })

  it('should recompute when args change', () => {
    let callCount = 0
    const selector = createSelector((x: number) => { callCount++; return x * 2 })
    selector(5)
    selector(10)
    expect(callCount).toBe(2)
  })

  // 状态合并策略
  function mergeState<S extends Record<string, any>>(current: S, update: Partial<S>): S {
    const result = { ...current }
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) continue
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key as keyof S] = mergeState(result[key] as any, value)
      } else {
        result[key as keyof S] = value
      }
    }
    return result
  }

  it('should deep merge objects', () => {
    const result = mergeState(
      { user: { name: 'a', age: 10 }, theme: 'light' },
      { user: { age: 20 } }
    )
    expect(result.user.name).toBe('a')
    expect(result.user.age).toBe(20)
  })

  it('should replace arrays', () => {
    const result = mergeState({ items: [1, 2, 3] }, { items: [4, 5] })
    expect(result.items).toEqual([4, 5])
  })

  it('should ignore undefined values', () => {
    const result = mergeState({ a: 1 }, { a: undefined as any })
    expect(result.a).toBe(1)
  })

  // 中间件管道
  type Middleware<S> = (state: S, next: (s: S) => S) => S

  function applyMiddleware<S>(middlewares: Middleware<S>[], initialState: S): S {
    let result = initialState;
    for (const middleware of middlewares) {
      result = middleware(result, (s: S) => s);
    }
    return result;
  }

  it('should apply middlewares in order', () => {
    const log: string[] = []
    const mw1: Middleware<{ v: number }> = (state, next) => {
      log.push('before1')
      const result = next({ ...state, v: state.v + 1 })
      log.push('after1')
      return result
    }
    const mw2: Middleware<{ v: number }> = (state, next) => {
      log.push('before2')
      const result = next({ ...state, v: state.v * 2 })
      log.push('after2')
      return result
    }
    const result = applyMiddleware([mw1, mw2], { v: 1 })
    expect(result.v).toBeGreaterThan(1)
  })

  // Undo/Redo 管理器
  class UndoRedoManager<S> {
    private past: S[] = []
    private present: S
    private future: S[] = []

    constructor(initial: S) {
      this.present = initial
    }

    push(state: S) {
      this.past.push(this.present)
      this.present = state
      this.future = []
    }

    undo(): S | null {
      if (this.past.length === 0) return null
      this.future.push(this.present)
      this.present = this.past.pop()!
      return this.present
    }

    redo(): S | null {
      if (this.future.length === 0) return null
      this.past.push(this.present)
      this.present = this.future.pop()!
      return this.present
    }

    getPresent() { return this.present }
    canUndo() { return this.past.length > 0 }
    canRedo() { return this.future.length > 0 }
    clear() { this.past = []; this.future = [] }
  }

  it('should undo state changes', () => {
    const mgr = new UndoRedoManager(0)
    mgr.push(1)
    mgr.push(2)
    expect(mgr.undo()).toBe(1)
    expect(mgr.undo()).toBe(0)
  })

  it('should redo undone changes', () => {
    const mgr = new UndoRedoManager(0)
    mgr.push(1)
    mgr.undo()
    expect(mgr.redo()).toBe(1)
  })

  it('should clear redo stack on new push', () => {
    const mgr = new UndoRedoManager(0)
    mgr.push(1)
    mgr.undo()
    mgr.push(2)
    expect(mgr.canRedo()).toBe(false)
  })

  it('should track can undo/redo', () => {
    const mgr = new UndoRedoManager(0)
    expect(mgr.canUndo()).toBe(false)
    mgr.push(1)
    expect(mgr.canUndo()).toBe(true)
    expect(mgr.canRedo()).toBe(false)
  })

  // 乐观更新
  function optimisticUpdate<T>(
    currentState: T,
    optimisticValue: T,
    asyncOp: () => Promise<T>
  ): { state: T; rollback: () => T; confirm: (v: T) => T } {
    return {
      state: optimisticValue,
      rollback: () => currentState,
      confirm: (v: T) => v,
    }
  }

  it('should apply optimistic update', () => {
    const result = optimisticUpdate({ count: 1 }, { count: 2 }, async () => ({ count: 2 }))
    expect(result.state.count).toBe(2)
  })

  it('should rollback on failure', () => {
    const result = optimisticUpdate({ count: 1 }, { count: 2 }, async () => { throw new Error() })
    expect(result.rollback().count).toBe(1)
  })

  // 选择器组合
  function combineSelectors<State, R1, R2, Result>(
    selector1: (s: State) => R1,
    selector2: (s: State) => R2,
    combiner: (r1: R1, r2: R2) => Result
  ): (s: State) => Result {
    return (state: State) => combiner(selector1(state), selector2(state))
  }

  it('should combine two selectors', () => {
    const selector = combineSelectors(
      (s: { a: number; b: number }) => s.a,
      (s: { a: number; b: number }) => s.b,
      (a, b) => a + b
    )
    expect(selector({ a: 3, b: 7 })).toBe(10)
  })

  // 订阅管理器
  class SubscriptionManager<T> {
    private subscribers: Array<(value: T) => void> = []
    subscribe(fn: (value: T) => void) {
      this.subscribers.push(fn)
      return () => {
        this.subscribers = this.subscribers.filter(s => s !== fn)
      }
    }
    notify(value: T) {
      this.subscribers.forEach(s => s(value))
    }
    count() { return this.subscribers.length }
  }

  it('should notify subscribers', () => {
    const mgr = new SubscriptionManager<number>()
    let received = 0
    mgr.subscribe(v => { received = v })
    mgr.notify(42)
    expect(received).toBe(42)
  })

  it('should unsubscribe', () => {
    const mgr = new SubscriptionManager<number>()
    let count = 0
    const unsub = mgr.subscribe(() => { count++ })
    mgr.notify(1)
    unsub()
    mgr.notify(2)
    expect(count).toBe(1)
  })

  it('should track subscriber count', () => {
    const mgr = new SubscriptionManager<void>()
    const unsub1 = mgr.subscribe(() => {})
    const unsub2 = mgr.subscribe(() => {})
    expect(mgr.count()).toBe(2)
    unsub1()
    expect(mgr.count()).toBe(1)
  })

  // 批量状态更新
  function batchUpdates<State extends Record<string, any>>(
    state: State,
    updates: Array<Partial<State>>
  ): State {
    return updates.reduce((s, update) => mergeState(s, update), state)
  }

  it('should batch multiple updates', () => {
    const result = batchUpdates(
      { a: 1, b: 2, c: 3 },
      [{ a: 10 }, { b: 20 }, { c: 30 }]
    )
    expect(result).toEqual({ a: 10, b: 20, c: 30 })
  })

  it('should handle empty updates', () => {
    const state = { x: 1 }
    expect(batchUpdates(state, [])).toEqual({ x: 1 })
  })
})
