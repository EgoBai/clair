import { describe, it, expect } from 'vitest';

// 前端状态机与交互测试
describe('状态机与用户交互', () => {
  // 通用状态机
  interface Transition<S extends string, E extends string> {
    from: S;
    event: E;
    to: S;
  }

  function createStateMachine<S extends string, E extends string>(
    initial: S,
    transitions: Transition<S, E>[]
  ) {
    let current = initial;
    return {
      state: () => current,
      send: (event: E): boolean => {
        const t = transitions.find(tr => tr.from === current && tr.event === event);
        if (t) { current = t.to; return true; }
        return false;
      },
      can: (event: E): boolean => transitions.some(tr => tr.from === current && tr.event === event),
      reset: () => { current = initial; },
    };
  }

  // 搜索状态机
  type SearchState = 'idle' | 'typing' | 'searching' | 'results' | 'error';
  type SearchEvent = 'INPUT' | 'SUBMIT' | 'SUCCESS' | 'FAIL' | 'CLEAR' | 'RETRY';

  function createSearchMachine() {
    return createStateMachine<SearchState, SearchEvent>('idle', [
      { from: 'idle', event: 'INPUT', to: 'typing' },
      { from: 'typing', event: 'INPUT', to: 'typing' },
      { from: 'typing', event: 'SUBMIT', to: 'searching' },
      { from: 'typing', event: 'CLEAR', to: 'idle' },
      { from: 'searching', event: 'SUCCESS', to: 'results' },
      { from: 'searching', event: 'FAIL', to: 'error' },
      { from: 'results', event: 'INPUT', to: 'typing' },
      { from: 'results', event: 'CLEAR', to: 'idle' },
      { from: 'error', event: 'RETRY', to: 'searching' },
      { from: 'error', event: 'INPUT', to: 'typing' },
      { from: 'error', event: 'CLEAR', to: 'idle' },
    ]);
  }

  // 分页状态
  interface PaginationState {
    page: number;
    pageSize: number;
    total: number;
  }

  function createPagination(total: number, pageSize: number = 10) {
    const state: PaginationState = { page: 1, pageSize, total };
    return {
      state: () => ({ ...state }),
      totalPages: () => Math.ceil(state.total / state.pageSize),
      hasNext: () => state.page < Math.ceil(state.total / state.pageSize),
      hasPrev: () => state.page > 1,
      next: () => { if (state.page < Math.ceil(state.total / state.pageSize)) state.page++; },
      prev: () => { if (state.page > 1) state.page--; },
      goTo: (p: number) => {
        const max = Math.ceil(state.total / state.pageSize);
        state.page = Math.max(1, Math.min(p, max));
      },
      setPageSize: (size: number) => { state.pageSize = size; state.page = 1; },
      range: () => {
        const start = (state.page - 1) * state.pageSize;
        return { start, end: Math.min(start + state.pageSize, state.total) };
      },
    };
  }

  // Toast通知管理
  interface Toast {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    duration: number;
    createdAt: number;
  }

  function createToastManager(maxToasts: number = 5) {
    const toasts: Toast[] = [];
    let idCounter = 0;
    return {
      add: (type: Toast['type'], message: string, duration: number = 3000): string => {
        const id = `toast-${++idCounter}`;
        if (toasts.length >= maxToasts) toasts.shift();
        toasts.push({ id, type, message, duration, createdAt: Date.now() });
        return id;
      },
      remove: (id: string) => {
        const idx = toasts.findIndex(t => t.id === id);
        if (idx >= 0) toasts.splice(idx, 1);
      },
      removeAll: () => toasts.splice(0),
      getAll: () => [...toasts],
      getByType: (type: Toast['type']) => toasts.filter(t => t.type === type),
      count: () => toasts.length,
    };
  }

  // 表单验证状态机
  interface FormField {
    value: string;
    touched: boolean;
    error: string | null;
  }

  function createFormValidator(fields: Record<string, { required?: boolean; validate?: (v: string) => string | null }>) {
    const state: Record<string, FormField> = {};
    for (const [name, config] of Object.entries(fields)) {
      state[name] = { value: '', touched: false, error: config.required ? '必填' : null };
    }
    return {
      set: (name: string, value: string) => {
        if (!state[name]) return;
        state[name].value = value;
        state[name].touched = true;
        const config = fields[name];
        if (config.required && !value.trim()) {
          state[name].error = '必填';
        } else if (config.validate) {
          state[name].error = config.validate(value);
        } else {
          state[name].error = null;
        }
      },
      get: (name: string) => state[name],
      isValid: () => Object.values(state).every(f => f.error === null),
      errors: () => {
        const result: Record<string, string> = {};
        for (const [name, field] of Object.entries(state)) {
          if (field.error) result[name] = field.error;
        }
        return result;
      },
      reset: () => {
        for (const name of Object.keys(state)) {
          state[name] = { value: '', touched: false, error: fields[name].required ? '必填' : null };
        }
      },
    };
  }

  // Tab管理器
  function createTabManager<T extends string>(tabs: T[], initial: T) {
    let active = initial;
    const history: T[] = [initial];
    return {
      active: () => active,
      switch: (tab: T) => {
        if (tabs.includes(tab)) {
          history.push(tab);
          active = tab;
        }
      },
      history: () => [...history],
      back: () => {
        if (history.length > 1) {
          history.pop();
          active = history[history.length - 1];
        }
      },
      isCurrent: (tab: T) => active === tab,
    };
  }

  describe('搜索状态机', () => {
    it('初始状态为idle', () => {
      const sm = createSearchMachine();
      expect(sm.state()).toBe('idle');
    });

    it('idle → typing → searching → results', () => {
      const sm = createSearchMachine();
      expect(sm.send('INPUT')).toBe(true);
      expect(sm.state()).toBe('typing');
      expect(sm.send('SUBMIT')).toBe(true);
      expect(sm.state()).toBe('searching');
      expect(sm.send('SUCCESS')).toBe(true);
      expect(sm.state()).toBe('results');
    });

    it('搜索失败进入error', () => {
      const sm = createSearchMachine();
      sm.send('INPUT');
      sm.send('SUBMIT');
      expect(sm.send('FAIL')).toBe(true);
      expect(sm.state()).toBe('error');
    });

    it('error可以重试', () => {
      const sm = createSearchMachine();
      sm.send('INPUT');
      sm.send('SUBMIT');
      sm.send('FAIL');
      expect(sm.send('RETRY')).toBe(true);
      expect(sm.state()).toBe('searching');
    });

    it('无效转换返回false', () => {
      const sm = createSearchMachine();
      expect(sm.send('SUBMIT')).toBe(false); // idle不能直接SUBMIT
    });

    it('can检查可用事件', () => {
      const sm = createSearchMachine();
      expect(sm.can('INPUT')).toBe(true);
      expect(sm.can('SUBMIT')).toBe(false);
    });

    it('reset回到初始', () => {
      const sm = createSearchMachine();
      sm.send('INPUT');
      sm.send('SUBMIT');
      sm.reset();
      expect(sm.state()).toBe('idle');
    });

    it('typing时CLEAR回到idle', () => {
      const sm = createSearchMachine();
      sm.send('INPUT');
      expect(sm.send('CLEAR')).toBe(true);
      expect(sm.state()).toBe('idle');
    });
  });

  describe('分页状态', () => {
    it('初始页为1', () => {
      const p = createPagination(100);
      expect(p.state().page).toBe(1);
    });

    it('总页数正确', () => {
      expect(createPagination(100, 10).totalPages()).toBe(10);
      expect(createPagination(95, 10).totalPages()).toBe(10);
      expect(createPagination(101, 10).totalPages()).toBe(11);
    });

    it('hasNext/hasPrev', () => {
      const p = createPagination(30, 10);
      expect(p.hasPrev()).toBe(false);
      expect(p.hasNext()).toBe(true);
      p.next();
      expect(p.hasPrev()).toBe(true);
      expect(p.hasNext()).toBe(true);
      p.next();
      p.next();
      expect(p.hasNext()).toBe(false);
    });

    it('goTo边界钳制', () => {
      const p = createPagination(30, 10);
      p.goTo(100);
      expect(p.state().page).toBe(3);
      p.goTo(-5);
      expect(p.state().page).toBe(1);
    });

    it('range正确', () => {
      const p = createPagination(25, 10);
      expect(p.range()).toEqual({ start: 0, end: 10 });
      p.next();
      expect(p.range()).toEqual({ start: 10, end: 20 });
      p.next();
      expect(p.range()).toEqual({ start: 20, end: 25 });
    });

    it('改变pageSize回到第1页', () => {
      const p = createPagination(100, 10);
      p.next();
      p.next();
      p.setPageSize(20);
      expect(p.state().page).toBe(1);
      expect(p.state().pageSize).toBe(20);
    });
  });

  describe('Toast管理器', () => {
    it('添加通知', () => {
      const tm = createToastManager();
      tm.add('success', 'OK');
      expect(tm.count()).toBe(1);
    });

    it('超出上限移除最早的', () => {
      const tm = createToastManager(2);
      tm.add('info', 'a');
      tm.add('info', 'b');
      tm.add('info', 'c');
      expect(tm.count()).toBe(2);
      expect(tm.getAll()[0].message).toBe('b');
    });

    it('按类型筛选', () => {
      const tm = createToastManager();
      tm.add('success', 'OK');
      tm.add('error', 'ERR');
      tm.add('success', 'OK2');
      expect(tm.getByType('success')).toHaveLength(2);
      expect(tm.getByType('error')).toHaveLength(1);
    });

    it('移除指定通知', () => {
      const tm = createToastManager();
      const id = tm.add('info', 'test');
      expect(tm.count()).toBe(1);
      tm.remove(id);
      expect(tm.count()).toBe(0);
    });

    it('清空所有', () => {
      const tm = createToastManager();
      tm.add('info', 'a');
      tm.add('info', 'b');
      tm.removeAll();
      expect(tm.count()).toBe(0);
    });
  });

  describe('表单验证', () => {
    it('必填字段初始有错误', () => {
      const form = createFormValidator({ name: { required: true } });
      expect(form.get('name').error).toBe('必填');
    });

    it('填写后清除必填错误', () => {
      const form = createFormValidator({ name: { required: true } });
      form.set('name', 'test');
      expect(form.get('name').error).toBeNull();
    });

    it('自定义验证', () => {
      const form = createFormValidator({
        email: { required: true, validate: v => v.includes('@') ? null : '格式错误' },
      });
      form.set('email', 'invalid');
      expect(form.get('email').error).toBe('格式错误');
        form.set('email', 'a@b.com');
      expect(form.get('email').error).toBeNull();
    });

    it('isValid全通过', () => {
      const form = createFormValidator({ a: { required: true }, b: { required: true } });
      expect(form.isValid()).toBe(false);
      form.set('a', 'x');
      form.set('b', 'y');
      expect(form.isValid()).toBe(true);
    });

    it('errors只返回有错的字段', () => {
      const form = createFormValidator({ a: { required: true }, b: {} });
      form.set('a', 'x');
      const errors = form.errors();
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('reset清空所有', () => {
      const form = createFormValidator({ name: { required: true } });
      form.set('name', 'test');
      form.reset();
      expect(form.get('name').value).toBe('');
      expect(form.get('name').touched).toBe(false);
    });

    it('touched标记', () => {
      const form = createFormValidator({ name: {} });
      expect(form.get('name').touched).toBe(false);
      form.set('name', 'a');
      expect(form.get('name').touched).toBe(true);
    });
  });

  describe('Tab管理器', () => {
    it('初始激活指定tab', () => {
      const tm = createTabManager(['a', 'b', 'c'] as const, 'b');
      expect(tm.active()).toBe('b');
    });

    it('切换tab', () => {
      const tm = createTabManager(['a', 'b', 'c'] as const, 'a');
      tm.switch('c');
      expect(tm.active()).toBe('c');
    });

    it('无效tab不切换', () => {
      const tm = createTabManager(['a', 'b'] as const, 'a');
      tm.switch('d' as any);
      expect(tm.active()).toBe('a');
    });

    it('历史记录', () => {
      const tm = createTabManager(['a', 'b', 'c'] as const, 'a');
      tm.switch('b');
      tm.switch('c');
      expect(tm.history()).toEqual(['a', 'b', 'c']);
    });

    it('back回到上一个', () => {
      const tm = createTabManager(['a', 'b', 'c'] as const, 'a');
      tm.switch('b');
      tm.switch('c');
      tm.back();
      expect(tm.active()).toBe('b');
    });

    it('back到头不再退', () => {
      const tm = createTabManager(['a', 'b'] as const, 'a');
      tm.back();
      expect(tm.active()).toBe('a');
    });

    it('isCurrent判断', () => {
      const tm = createTabManager(['a', 'b'] as const, 'a');
      expect(tm.isCurrent('a')).toBe(true);
      expect(tm.isCurrent('b')).toBe(false);
    });
  });
});
