/**
 * UI 微交互逻辑测试 — 影子测试迁移（本文件）
 *
 * 旧文件 0 行 import：easing、formatter、duration、keyframes 全部是本地字面量复刻，
 * 断言的对象就是本地常量（例如 const duration = 800; expect(duration).toBe(800)），
 * 生产改坏也不会红。现全部改为 import 生产实现，frontend/src/utils/uiPolish.ts 为唯一口径真源。
 *
 * 已绑定生产实现（frontend/src/utils/uiPolish.ts）：
 * - :7-44    animateValue（duration 默认 600 / easing 默认 t*(2-t) / formatter 默认 Math.round /
 *            startTime=performance.now() / progress=min(elapsed/duration,1) /
 *            value=from+(to-from)*eased / 收尾写 formatter(to) 并回调 onComplete）
 * - :47-67   flashChange（up=#ef4444、down=#22c55e / 背景 `${color}20` / 默认 800ms ease-out）
 * - :70-79   bounceIn（默认 400ms / 初始 scale(0.3)+opacity 0 / cubic-bezier(0.34, 1.56, 0.64, 1)）
 * - :82-95   slideToDelete（方向默认 left / left=-100%、right=100% / 300ms / onDone 在 300ms 后）
 * - :98-108  flipCard（总时长默认 600，前后各 duration/2 / front rotateY(90deg) → back rotateY(0deg)）
 * - :111-136 typewriter（speed 默认 50 / 逐字符 textContent += / 返回 stop + promise）
 * - :139-153 shake（intensity 默认 5 / 6 帧 / 第 5 帧 intensity/2 / duration 400 + ease-in-out）
 * - :156-175 addGlowEffect（默认 rgba(59, 130, 246, 0.3) / circle 150px / 坐标 = clientX-rect.left / 清理监听）
 * - :178-188 animateBadge（from===to 直接 return / scale(1.3) / 150ms ease-out / 结束写入 String(to)）
 * - :191-212 animateReorder（delta = oldTop-newTop / |delta|<1 跳过 / 300ms cubic-bezier(0.4, 0, 0.2, 1)）
 *
 * 口径订正（旧内联自证值 → 生产可观测值，宿主为可控 rAF / setTimeout 桩）：
 * | 旧断言 | 生产口径 |
 * | defaultEasing(0.5)===0.75（本地函数） | animateValue 默认 easing，t=0.5、0→4 时 textContent='3'（:20,:30-31） |
 * | formatter=String(Math.round(v))（本地函数） | animateValue 默认 formatter，1.4→'1'、1.6→'2'（:21） |
 * | progress 本地算式 | animateValue duration=1000 时 t=500 → 值 500（线性 easing 隔离）（:29） |
 * | shake 内联 keyframes 数组 | element.animate() 收到的真实关键帧与 {duration:400,easing:'ease-in-out'}（:140-152） |
 * | addGlowEffect 用裸 x/y 拼渐变 | 生产用 clientX-rect.left / clientY-rect.top 得局部坐标（:158-161） |
 * | animateBadge「from===to 跳过」本地布尔 | 生产直接 return：style/定时器均未写入（:179） |
 *
 * 未迁移：无（10 个导出函数全部绑定）。
 * 本地保留业务规则：无。
 * DOM 依赖处理：不引入 jsdom 布局，用 style 记录器 + 可控 requestAnimationFrame/setTimeout
 * 桩驱动，断言的是生产函数真实写入的样式/文本/定时器参数。
 *
 * 发现的生产缺口（只记录不修）：
 * 1) uiPolish.ts:64-66 flashChange 收尾把 backgroundColor 赋成 originalBg，原值为 '' 时会写入
 *    undefined（真实 DOM 下被归一化为 ''，但对象桩/SSR 下会出现 'undefined' 语义偏差）。
 * 2) uiPolish.ts:127 typewriter 逐字符递归 setTimeout，长文本会产生 O(n) 个宏任务；
 *    且 stop() 后 promise 仍要靠下一次 setTimeout 才 resolve（无立即 resolve 路径）。
 * 3) uiPolish.ts:99 flipCard 只改 front.display='none'，未恢复 front.transform，
 *    二次翻转（back→front）时没有对称实现。
 * 4) uiPolish.ts:202 animateReorder 以 <1px 为跳过阈值，高 DPI / 缩放下 1px 的
 *    亚像素位移会被静默丢弃，且没有返回是否执行的信息。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  animateValue,
  flashChange,
  bounceIn,
  slideToDelete,
  flipCard,
  typewriter,
  shake,
  addGlowEffect,
  animateBadge,
  animateReorder,
} from '../utils/uiPolish';

// ==================== 可控宿主：rAF / setTimeout / performance.now ====================

type FakeElement = {
  style: Record<string, string>;
  textContent: string;
  animate: ReturnType<typeof vi.fn>;
  getBoundingClientRect: () => { top: number; left: number };
  addEventListener: (type: string, fn: (ev: unknown) => void) => void;
  removeEventListener: (type: string, fn: (ev: unknown) => void) => void;
  emit: (type: string, ev: unknown) => void;
  listenerCount: (type: string) => number;
};

function makeElement(rect: { top?: number; left?: number } = {}): FakeElement {
  const listeners: Record<string, ((ev: unknown) => void)[]> = {};
  return {
    style: {},
    textContent: '',
    animate: vi.fn(),
    getBoundingClientRect: () => ({ top: rect.top ?? 0, left: rect.left ?? 0 }),
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    emit(type, ev) {
      (listeners[type] || []).forEach((fn) => fn(ev));
    },
    listenerCount(type) {
      return (listeners[type] || []).length;
    },
  };
}

const asEl = (el: FakeElement) => el as unknown as HTMLElement;

let now = 0;
let rafQueue: FrameRequestCallback[] = [];
let timers: { fn: () => void; delay: number }[] = [];

const rafStub = (cb: FrameRequestCallback) => {
  rafQueue.push(cb);
  return rafQueue.length;
};

const setTimeoutStub = (fn: () => void, delay = 0) => {
  timers.push({ fn, delay });
  return timers.length;
};

beforeEach(() => {
  now = 0;
  rafQueue = [];
  timers = [];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', rafStub);
  vi.stubGlobal('setTimeout', setTimeoutStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 每次独立动画前清空宿主：animateValue 会为未完成的动画续排下一帧，
// 不清队列会把上一条动画的回调误当成新动画的首帧。
function resetHarness(): void {
  now = 0;
  rafQueue = [];
  timers = [];
}

function frameAt(t: number): void {
  now = t;
  const cb = rafQueue.shift();
  if (!cb) throw new Error('没有待执行的 requestAnimationFrame 回调');
  cb(t);
}

function runTimerOnce(): { fn: () => void; delay: number } {
  const next = timers.shift();
  if (!next) throw new Error('没有待执行的 setTimeout 回调');
  next.fn();
  return next;
}

function runAllTimers(limit = 200): void {
  let guard = 0;
  while (timers.length > 0) {
    if (guard++ > limit) throw new Error('setTimeout 递归超过上限');
    runTimerOnce();
  }
}

// ==================== animateValue ====================

describe('uiPolish - animateValue logic', () => {
  it('default easing function should be defined', () => {
    // 生产默认 easing = (t) => t * (2 - t)（uiPolish.ts:20），用 0→4 的插值反推：
    // t=0 → 0，t=0.5 → 3（线性会是 2），t=1 → 4。
    const el = makeElement();
    animateValue(asEl(el), 0, 4);
    frameAt(0);
    expect(el.textContent).toBe('0');
    frameAt(300);
    expect(el.textContent).toBe('3');
    frameAt(600);
    expect(el.textContent).toBe('4');
  });

  it('default formatter should round numbers', () => {
    // 生产默认 formatter = (v) => String(Math.round(v))（uiPolish.ts:21）
    const a = makeElement();
    animateValue(asEl(a), 1.4, 1.4, { duration: 1000 });
    frameAt(500);
    expect(a.textContent).toBe('1');

    resetHarness();
    const b = makeElement();
    animateValue(asEl(b), 1.6, 1.6, { duration: 1000 });
    frameAt(500);
    expect(b.textContent).toBe('2');

    resetHarness();
    const c = makeElement();
    animateValue(asEl(c), 0, 0, { duration: 1000 });
    frameAt(500);
    expect(c.textContent).toBe('0');
  });

  it('easing should produce values between 0 and 1 for inputs 0-1', () => {
    // 生产 eased 值落在 [0,1]，插值到 0→100 后即 [0,100]；中点固定 75（ease-out 二次）
    const el = makeElement();
    animateValue(asEl(el), 0, 100, { duration: 1000 });
    const values: number[] = [];
    for (let i = 0; i <= 10; i++) {
      frameAt(i * 100);
      values.push(Number(el.textContent));
    }
    values.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
    expect(values[5]).toBe(75);
  });

  it('custom easing should work', () => {
    // 自定义线性 easing 覆盖默认 t*(2-t)：中点从 50 而非 75
    const el = makeElement();
    animateValue(asEl(el), 0, 100, { duration: 1000, easing: (t) => t });
    frameAt(0);
    expect(el.textContent).toBe('0');
    frameAt(500);
    expect(el.textContent).toBe('50');
    frameAt(1000);
    expect(el.textContent).toBe('100');
  });

  it('custom formatter should format currency', () => {
    const currency = (v: number) => `¥${v.toFixed(2)}`;
    const a = makeElement();
    animateValue(asEl(a), 100, 100, { formatter: currency });
    frameAt(600);
    expect(a.textContent).toBe('¥100.00');

    resetHarness();
    const b = makeElement();
    animateValue(asEl(b), 0, 0, { formatter: currency });
    frameAt(600);
    expect(b.textContent).toBe('¥0.00');
  });

  it('animation progress calculation should be correct', () => {
    // 生产 progress = min(elapsed / duration, 1)（uiPolish.ts:29），线性 easing 下中点值 500
    const el = makeElement();
    animateValue(asEl(el), 0, 1000, { duration: 1000, easing: (t) => t });
    frameAt(500);
    expect(el.textContent).toBe('500');
  });

  it('animation should clamp progress to 1', () => {
    // 超过 duration 后 progress 被夹到 1，写 formatter(to) 且不再排帧
    const onComplete = vi.fn();
    const el = makeElement();
    animateValue(asEl(el), 0, 1000, { duration: 1000, easing: (t) => t, onComplete });
    frameAt(1500);
    expect(el.textContent).toBe('1000');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(rafQueue).toHaveLength(0);
  });

  it('interpolation formula should be correct', () => {
    // value = from + (to - from) * eased（uiPolish.ts:31）
    const el = makeElement();
    animateValue(asEl(el), 100, 200, { duration: 1000, easing: (t) => t });
    frameAt(500);
    expect(el.textContent).toBe('150');
  });
});

// ==================== flashChange ====================

describe('uiPolish - flashChange logic', () => {
  it('should use red for up direction', () => {
    // 生产用 #ef4444 + '20'（uiPolish.ts:52,56）
    const el = makeElement();
    flashChange(asEl(el), 'up');
    expect(el.style.backgroundColor).toBe('#ef444420');
  });

  it('should use green for down direction', () => {
    const el = makeElement();
    flashChange(asEl(el), 'down');
    expect(el.style.backgroundColor).toBe('#22c55e20');
  });

  it('default duration should be 800ms', () => {
    // 生产默认 duration=800，写入 transition（uiPolish.ts:50,59）
    const el = makeElement();
    flashChange(asEl(el), 'up');
    frameAt(0);
    expect(el.style.transition).toBe('background-color 800ms ease-out');
    expect(timers[0].delay).toBe(800);
  });

  it('background color should include alpha', () => {
    const el = makeElement();
    flashChange(asEl(el), 'up');
    expect(el.style.backgroundColor).toBe('#ef444420');
    expect(el.style.backgroundColor.length).toBe(9);
  });
});

// ==================== bounceIn ====================

describe('uiPolish - bounceIn logic', () => {
  it('default duration should be 400ms', () => {
    // 生产 transition 中 transform/opacity 都是 400ms（uiPolish.ts:70,73）
    const el = makeElement();
    bounceIn(asEl(el));
    expect(el.style.transition).toContain('transform 400ms');
    expect(el.style.transition).toContain('opacity 400ms ease');
  });

  it('initial scale should be 0.3', () => {
    const el = makeElement();
    bounceIn(asEl(el));
    expect(el.style.transform).toBe('scale(0.3)');
    expect(el.style.opacity).toBe('0');
    expect(Number(el.style.transform.slice('scale('.length, -1))).toBeLessThan(1);
  });

  it('cubic-bezier should have correct control points', () => {
    const el = makeElement();
    bounceIn(asEl(el));
    expect(el.style.transition).toContain('cubic-bezier(0.34, 1.56, 0.64, 1)');
    // 1.56 > 1 表示回弹过冲
    expect(el.style.transition).toContain('1.56');
    frameAt(0);
    expect(el.style.transform).toBe('scale(1)');
    expect(el.style.opacity).toBe('1');
  });
});

// ==================== slideToDelete ====================

describe('uiPolish - slideToDelete logic', () => {
  it('should translate left by -100%', () => {
    const el = makeElement();
    slideToDelete(asEl(el), 'left');
    expect(el.style.transform).toBe('translateX(-100%)');
    expect(el.style.opacity).toBe('0');
  });

  it('should translate right by 100%', () => {
    const el = makeElement();
    slideToDelete(asEl(el), 'right');
    expect(el.style.transform).toBe('translateX(100%)');
  });

  it('default direction should be left', () => {
    const el = makeElement();
    slideToDelete(asEl(el));
    expect(el.style.transform).toBe('translateX(-100%)');
  });

  it('duration should be 300ms', () => {
    const el = makeElement();
    const onDone = vi.fn();
    slideToDelete(asEl(el), 'left', onDone);
    expect(el.style.transition).toBe('transform 300ms ease-in, opacity 300ms ease-in');
    const timer = runTimerOnce();
    expect(timer.delay).toBe(300);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

// ==================== flipCard ====================

describe('uiPolish - flipCard logic', () => {
  it('should use half duration for each phase', () => {
    // 总时长默认 600，前/后各 duration/2=300（uiPolish.ts:98-107）
    const front = makeElement();
    const back = makeElement();
    flipCard(asEl(front), asEl(back));
    expect(front.style.transition).toBe('transform 300ms ease-in');
    const timer = runTimerOnce();
    expect(timer.delay).toBe(300);
    expect(back.style.transition).toBe('transform 300ms ease-out');
  });

  it('front should rotate to 90deg', () => {
    const front = makeElement();
    const back = makeElement();
    flipCard(asEl(front), asEl(back));
    expect(front.style.transform).toBe('rotateY(90deg)');
    expect(front.style.transform).toContain('90deg');
  });

  it('back should rotate to 0deg', () => {
    const front = makeElement();
    const back = makeElement();
    flipCard(asEl(front), asEl(back));
    runTimerOnce();
    expect(front.style.display).toBe('none');
    expect(back.style.transform).toBe('rotateY(0deg)');
    expect(back.style.transform).toContain('0deg');
  });
});

// ==================== typewriter ====================

describe('uiPolish - typewriter logic', () => {
  it('speed default should be 50ms', () => {
    // 生产默认 speed=50（uiPolish.ts:114），每个字符一个 setTimeout
    const el = makeElement();
    const runner = typewriter(asEl(el), 'ab');
    expect(el.textContent).toBe('a');
    expect(timers[0].delay).toBe(50);
    runner.stop();
    runAllTimers();
  });

  it('should iterate through each character', () => {
    const el = makeElement();
    const { promise } = typewriter(asEl(el), 'Hello');
    const seen: string[] = [el.textContent];
    while (timers.length > 0) {
      runTimerOnce();
      if (timers.length > 0) seen.push(el.textContent);
    }
    expect(el.textContent).toBe('Hello');
    expect(seen).toEqual(['H', 'He', 'Hel', 'Hell', 'Hello']);
    return promise;
  });

  it('should handle empty string', () => {
    const el = makeElement();
    const { promise } = typewriter(asEl(el), '');
    expect(el.textContent).toBe('');
    expect(timers).toHaveLength(0);
    return promise;
  });

  it('should handle unicode characters', () => {
    const text = '你好世界';
    expect(text.length).toBe(4);
    const el = makeElement();
    const { promise } = typewriter(asEl(el), text);
    expect(el.textContent).toBe('你');
    expect(text[0]).toBe('你');
    runAllTimers();
    expect(el.textContent).toBe('你好世界');
    return promise;
  });

  it('estimated total time should be text.length * speed', () => {
    // 逐字符递归 setTimeout(speed)：4 个字符 => 4 个 50ms 定时器，总时长 200ms
    const el = makeElement();
    typewriter(asEl(el), 'Test', 50);
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) {
      delays.push(runTimerOnce().delay);
    }
    expect(delays).toEqual([50, 50, 50, 50]);
    expect(delays.reduce((a, b) => a + b, 0)).toBe(200);
    expect(timers).toHaveLength(0);
  });
});

// ==================== shake ====================

describe('uiPolish - shake logic', () => {
  it('default intensity should be 5', () => {
    // 生产默认 intensity=5（uiPolish.ts:139）
    const el = makeElement();
    shake(asEl(el));
    const keyframes = el.animate.mock.calls[0][0] as Keyframe[];
    expect(keyframes[1].transform).toBe('translateX(-5px)');
    expect(keyframes[2].transform).toBe('translateX(5px)');
  });

  it('should generate correct keyframe sequence', () => {
    const el = makeElement();
    shake(asEl(el));
    const keyframes = el.animate.mock.calls[0][0] as Keyframe[];
    const options = el.animate.mock.calls[0][1] as KeyframeAnimationOptions;
    expect(keyframes).toHaveLength(6);
    expect(keyframes[0].transform).toBe('translateX(0)');
    expect(keyframes[keyframes.length - 1].transform).toBe('translateX(0)');
    expect(keyframes[4].transform).toBe('translateX(2.5px)');
    expect(options).toEqual({ duration: 400, easing: 'ease-in-out' });
  });

  it('should end at origin position', () => {
    const el = makeElement();
    shake(asEl(el));
    const keyframes = el.animate.mock.calls[0][0] as Keyframe[];
    expect(keyframes[0].transform).toBe('translateX(0)');
    expect(keyframes[keyframes.length - 1].transform).toBe('translateX(0)');
  });
});

// ==================== animateBadge ====================

describe('uiPolish - animateBadge logic', () => {
  it('should skip if from equals to', () => {
    // 生产 from===to 直接 return（uiPolish.ts:179）：样式与定时器都不写入
    const el = makeElement();
    animateBadge(asEl(el), 5, 5);
    expect(el.style.transition).toBeUndefined();
    expect(el.style.transform).toBeUndefined();
    expect(timers).toHaveLength(0);
    expect(el.textContent).toBe('');
  });

  it('should animate when values differ', () => {
    const el = makeElement();
    animateBadge(asEl(el), 3, 7);
    expect(el.style.transition).toBe('transform 150ms ease-out');
    expect(el.style.transform).toBe('scale(1.3)');
  });

  it('scale factor should be 1.3', () => {
    const el = makeElement();
    animateBadge(asEl(el), 3, 7);
    const scale = Number(el.style.transform.slice('scale('.length, -1));
    expect(scale).toBe(1.3);
    expect(scale).toBeGreaterThan(1);
  });

  it('duration should be 150ms', () => {
    const el = makeElement();
    animateBadge(asEl(el), 3, 7);
    const timer = runTimerOnce();
    expect(timer.delay).toBe(150);
    expect(el.textContent).toBe('7');
    expect(el.style.transform).toBe('scale(1)');
  });

  it('should handle increment from 0', () => {
    const el = makeElement();
    animateBadge(asEl(el), 0, 1);
    runTimerOnce();
    expect(el.textContent).toBe('1');
  });

  it('should handle decrement', () => {
    const el = makeElement();
    animateBadge(asEl(el), 10, 5);
    runTimerOnce();
    expect(el.textContent).toBe('5');
  });
});

// ==================== addGlowEffect ====================

describe('uiPolish - addGlowEffect logic', () => {
  it('default color should be blue with alpha', () => {
    // 生产默认色 rgba(59, 130, 246, 0.3)（uiPolish.ts:156）
    const el = makeElement({ top: 10, left: 5 });
    const cleanup = addGlowEffect(asEl(el));
    el.emit('mousemove', { clientX: 105, clientY: 60 });
    expect(el.style.background).toContain('rgba');
    expect(el.style.background).toContain('0.3');
    expect(el.style.background).toContain('rgba(59, 130, 246, 0.3)');
    cleanup();
  });

  it('radial gradient should use correct radius', () => {
    // 生产坐标是相对元素：x=clientX-rect.left=100、y=clientY-rect.top=50，半径固定 150px（:158-161）
    const el = makeElement({ top: 10, left: 5 });
    const cleanup = addGlowEffect(asEl(el));
    el.emit('mousemove', { clientX: 105, clientY: 60 });
    expect(el.style.background).toContain('150px');
    expect(el.style.background).toContain('100px');
    expect(el.style.background).toContain('50px');
    el.emit('mouseleave', {});
    expect(el.style.background).toBe('');
    cleanup();
    expect(el.listenerCount('mousemove')).toBe(0);
    expect(el.listenerCount('mouseleave')).toBe(0);
  });
});

// ==================== animateReorder ====================

describe('uiPolish - animateReorder logic', () => {
  it('should calculate delta from old to new position', () => {
    // delta = oldTop - newTop（uiPolish.ts:200）：100 - 150 = -50
    const el = makeElement({ top: 150 });
    const elNode = asEl(el);
    animateReorder([elNode], new Map([[elNode, 100]]));
    expect(el.style.transform).toBe('translateY(-50px)');
    expect(el.style.transition).toBe('none');
    expect(rafQueue).toHaveLength(1);
  });

  it('should skip if delta is near zero', () => {
    // |delta| < 1 时直接 return（uiPolish.ts:202）
    const el = makeElement({ top: 100.5 });
    const elNode = asEl(el);
    animateReorder([elNode], new Map([[elNode, 100]]));
    expect(el.style.transform).toBeUndefined();
    expect(el.style.transition).toBeUndefined();
    expect(rafQueue).toHaveLength(0);
  });

  it('should animate if delta is significant', () => {
    const el = makeElement({ top: 150 });
    const elNode = asEl(el);
    animateReorder([elNode], new Map([[elNode, 100]]));
    frameAt(0);
    expect(el.style.transition).toBe('transform 300ms cubic-bezier(0.4, 0, 0.2, 1)');
    expect(el.style.transform).toBe('translateY(0)');
  });

  it('duration should be 300ms', () => {
    const el = makeElement({ top: 150 });
    const elNode = asEl(el);
    animateReorder([elNode], new Map([[elNode, 100]]));
    frameAt(0);
    expect(el.style.transition).toContain('300ms');
  });

  it('cubic-bezier should be standard material', () => {
    const el = makeElement({ top: 150 });
    const elNode = asEl(el);
    animateReorder([elNode], new Map([[elNode, 100]]));
    frameAt(0);
    expect(el.style.transition).toContain('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(el.style.transition).toContain('0.4');
    expect(el.style.transition).toContain('0.2');
  });

  it('should skip items missing from oldPositions', () => {
    // 生产对 oldPositions 里没有的节点直接 return（uiPolish.ts:196-197）
    const known = makeElement({ top: 150 });
    const unknown = makeElement({ top: 150 });
    animateReorder([known as unknown as HTMLElement, asEl(unknown)], new Map([[asEl(known), 100]]));
    expect(known.style.transform).toBe('translateY(-50px)');
    expect(unknown.style.transform).toBeUndefined();
  });
});
