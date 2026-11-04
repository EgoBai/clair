// @vitest-environment jsdom
/**
 * uiPolish 契约测试 —— 旧纯数学契约 → 生产 DOM 契约
 * ============================================================================
 * 本文件在真实 jsdom 元素上驱动 frontend/src/utils/uiPolish.ts 的 10 个导出，
 * 断言的是生产函数实际写入 DOM 的 textContent / 行内样式 / 定时器参数 / rAF 排帧。
 *
 * 【旧纯数学契约 → 生产 DOM 契约 差异】
 * - 旧版（commit bd3f213b4~1，313 行）0 行 import：defaultEasing、formatter、
 *   duration、keyframes 全是本地字面量复刻，断言对象就是本地常量，生产改坏不会红。
 * - 上一版（commit bd3f213b4，628 行）已 import 生产实现，但用手写 FakeElement
 *   普通对象充当 DOM：缺失属性读 undefined、颜色/transform 不做 CSSOM 归一化、
 *   事件用自造 emit 分发，仍与浏览器语义有偏差。
 * - 本版：// @vitest-environment jsdom + document.createElement 真元素，
 *   断言值取 CSSOM 归一化结果，事件用真实 MouseEvent 分发，样式写入用
 *   getPropertyValue 读取。仍不依赖 jsdom 布局（jsdom 无排版），
 *   几何量（getBoundingClientRect）按用例显式桩定。
 *
 * 【绑定符号与行号（frontend/src/utils/uiPolish.ts）】
 * - :7-44    animateValue(element, from, to, {duration=600, easing=(t)=>t*(2-t),
 *            formatter=(v)=>String(Math.round(v)), onComplete})
 *            startTime=performance.now() / progress=min(elapsed/duration,1) /
 *            value=from+(to-from)*easing(progress) / 只写 element.textContent（:33,:38）
 *            / progress<1 续排 rAF / 收尾写 formatter(to) 并回调 onComplete
 * - :47-67   flashChange（up=#ef4444、down=#22c55e / 背景 `${color}20` /
 *            首帧切到 background-color ${duration=800}ms ease-out / setTimeout(duration) 复原）
 * - :70-79   bounceIn（默认 400ms / 初始 scale(0.3)+opacity 0 /
 *            cubic-bezier(0.34, 1.56, 0.64, 1) / 首帧 scale(1)+opacity 1）
 * - :82-95   slideToDelete（默认 left / left=-100%、right=100% / 300ms / onDone 300ms 后）
 * - :98-108  flipCard（总时长默认 600，前后各 duration/2 / front rotateY(90deg)
 *            → front.display=none、back.display=''、back rotateY(0deg)）
 * - :111-136 typewriter（speed 默认 50 / 逐字符 textContent += / 返回 {stop, promise}）
 * - :139-153 shake（intensity 默认 5 / 6 帧 / 第 5 帧 intensity/2 /
 *            element.animate(keyframes, {duration:400, easing:'ease-in-out'})）
 * - :156-175 addGlowEffect（默认 rgba(59, 130, 246, 0.3) / circle 150px /
 *            x=clientX-rect.left、y=clientY-rect.top / 返回清理函数移除两监听）
 * - :178-188 animateBadge（from===to 直接 return / scale(1.3) / 150ms ease-out /
 *            setTimeout 后写 String(to) + scale(1)）
 * - :191-212 animateReorder（delta=oldTop-newTop / |delta|<1 跳过 /
 *            300ms cubic-bezier(0.4, 0, 0.2, 1)）
 *
 * 【旧断言订正清单（上一版 → 本版 jsdom 真值）】
 * | 旧断言（FakeElement）                    | 本版 jsdom 真值 |
 * | style.backgroundColor === '#ef444420'     | 'rgba(239, 68, 68, 0.125)'（8 位 hex 被 CSSOM 归一化） |
 * | el.style.transition === undefined         | ''（真实 CSSStyleDeclaration 缺失属性返回空串） |
 * | el.style.transform === undefined          | '' |
 * | 自造 emit 触发监听                         | el.dispatchEvent(new MouseEvent(...)) 真事件 |
 * | el.animate = vi.fn() 直接挂在对象上        | jsdom 原生无 animate，显式注入桩并断言原生缺失 |
 * | listenerCount('mousemove') === 0          | 清理后再次 dispatch 不再改样式 + removeEventListener 调用 2 次 |
 * | style.background 用裸 x/y 拼串             | 生产用 clientX-rect.left / clientY-rect.top，矩形显式桩定 |
 *
 * 【未迁移项（逐条原因）】
 * 1) 旧版直接调用的 defaultEasing(t)=t*(2-t)：生产未导出缓动表（:20 是内联默认
 *    箭头函数），无法 import；改为以 0→4 的帧值 0/3/4 反推真实缓动，等价且能随生产变红。
 * 2) 旧版 formatter(v)=String(Math.round(v))：同上（:21 内联默认），
 *    改为断言 1.4→'1'、1.6→'2'、0→'0'。
 * 3) 旧版「progress 用本地 duration/startTime/currentTime 复算」：progress 未被导出，
 *    改为线性 easing 下 duration=1000、elapsed=500 时写入 500 反推。
 * 4) 旧版 keyframes 数组字面量：改为 element.animate 实参捕获（jsdom 无 animate，注入桩）。
 * 5) 旧版 addGlowEffect 用裸 x/y 断言字符串：改为真实 MouseEvent + 矩形桩，断言局部坐标。
 * 6) 旧版「style 属性缺失为 undefined」：jsdom CSSOM 返回 ''，全部断言值随之订正。
 *
 * 【任务前提订正（按源码实际写的属性）】
 * 任务描述称 animateValue「接收 HTMLElement 做行内样式动画、断言 opacity/transform/width」，
 * 与源码不符：animateValue 只写 element.textContent（:33、:38），不写任何行内样式；
 * 因此行内样式断言落在真正写 style 的 flashChange/bounceIn/slideToDelete/flipCard 上，
 * animateValue 另加一条「完成后 cssText 仍为空」证明它不碰样式。
 *
 * 【生产缺口（只记录不修）】
 * 1) :29 progress 只夹上界：duration<=0 无保护。duration=0 首帧即完成；
 *    duration<0 时 progress 恒 <1 → 永不结束，值会越界为负（实测 -300、-800）。
 * 2) :53-66 flashChange 原背景为 '' 时首帧写 'transparent'，到期后写 ''（语义差异）。
 * 3) :127 typewriter stop() 后 promise 要等下一次 setTimeout 才 resolve。
 * 4) :99 flipCard 只隐藏 front、未恢复 front.transform，无对称回翻。
 * 5) :202 animateReorder 以 1px 为跳过阈值，亚像素位移被静默丢弃。
 * 6) :33 元素为 null 时同步调用不抛，错误延迟到首个 rAF 帧，调用方无法就地捕获。
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

// ==================== 可控时钟：rAF 队列 + setTimeout 队列 + performance.now ====================

let now = 0;
let rafQueue: FrameRequestCallback[] = [];
let timers: { fn: () => void; delay: number }[] = [];

const rafStub = (cb: FrameRequestCallback): number => {
  rafQueue.push(cb);
  return rafQueue.length;
};

const setTimeoutStub = (fn: () => void, delay = 0): number => {
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
  document.body.innerHTML = '';
});

/** 真实 jsdom 元素；jsdom 无排版，几何量按用例桩定 */
function makeEl(rect: { top?: number; left?: number } = {}): HTMLElement {
  const el = document.createElement('div');
  const top = rect.top ?? 0;
  const left = rect.left ?? 0;
  el.getBoundingClientRect = () =>
    ({
      top,
      left,
      right: left + 100,
      bottom: top + 100,
      width: 100,
      height: 100,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as unknown as DOMRect;
  document.body.appendChild(el);
  return el;
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

function runAllTimers(limit = 500): void {
  let guard = 0;
  while (timers.length > 0) {
    if (guard++ > limit) throw new Error('setTimeout 递归超过上限');
    runTimerOnce();
  }
}

/** 同一用例内起第二条动画前清空宿主：未完成的动画会续排 rAF，串到下一帧 */
function resetHarness(): void {
  now = 0;
  rafQueue = [];
  timers = [];
}

/** 在真实元素上注入 Element.animate 桩（jsdom 原生不实现 Web Animations） */
function installAnimate(el: HTMLElement): ReturnType<typeof vi.fn> {
  const animate = vi.fn();
  (el as unknown as { animate: typeof animate }).animate = animate;
  return animate;
}

const rgbaAlpha = (value: string): number => {
  const m = /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\s*\)/.exec(value);
  return Number(m?.[1] ?? NaN);
};

// ==================== animateValue：DOM 契约是 textContent，不是行内样式 ====================

describe('uiPolish - animateValue（生产 DOM 契约）', () => {
  it('默认 easing 为 t*(2-t)：0→4 在 0/300/600ms 写 0/3/4', () => {
    const el = makeEl();
    animateValue(el, 0, 4);
    frameAt(0);
    expect(el.textContent).toBe('0');
    frameAt(300);
    expect(el.textContent).toBe('3');
    frameAt(600);
    expect(el.textContent).toBe('4');
  });

  it('起始帧写入 from 原值，且全程不写任何行内样式', () => {
    const el = makeEl();
    animateValue(el, 0, 100, { duration: 600, easing: (t) => t });
    frameAt(0);
    expect(el.textContent).toBe('0');
    expect(el.style.cssText).toBe('');
    frameAt(600);
    expect(el.textContent).toBe('100');
    // 生产只写 textContent（:33,:38）：锚点证明 opacity/transform/width 从不出现
    expect(el.style.getPropertyValue('opacity')).toBe('');
    expect(el.style.getPropertyValue('transform')).toBe('');
    expect(el.style.getPropertyValue('width')).toBe('');
    expect(el.style.cssText).toBe('');
  });

  it('默认 formatter 四舍五入：1.4→"1"、1.6→"2"、0→"0"', () => {
    const a = makeEl();
    animateValue(a, 1.4, 1.4, { duration: 1000 });
    frameAt(500);
    expect(a.textContent).toBe('1');

    resetHarness();
    const b = makeEl();
    animateValue(b, 1.6, 1.6, { duration: 1000 });
    frameAt(500);
    expect(b.textContent).toBe('2');

    resetHarness();
    const c = makeEl();
    animateValue(c, 0, 0, { duration: 1000 });
    frameAt(500);
    expect(c.textContent).toBe('0');
  });

  it('默认 easing 映射到 0→100 后单调不减、区间封闭、中点为 75', () => {
    const el = makeEl();
    animateValue(el, 0, 100, { duration: 1000 });
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
    expect(values[0]).toBe(0);
    expect(values[10]).toBe(100);
  });

  it('自定义线性 easing 覆盖默认缓动（中点 50 而非 75）', () => {
    const el = makeEl();
    animateValue(el, 0, 100, { duration: 1000, easing: (t) => t });
    frameAt(0);
    expect(el.textContent).toBe('0');
    frameAt(500);
    expect(el.textContent).toBe('50');
    frameAt(1000);
    expect(el.textContent).toBe('100');
  });

  it('自定义 formatter 输出货币格式', () => {
    const currency = (v: number) => `¥${v.toFixed(2)}`;
    const a = makeEl();
    animateValue(a, 100, 100, { formatter: currency });
    frameAt(600);
    expect(a.textContent).toBe('¥100.00');

    const b = makeEl();
    animateValue(b, 0, 0, { formatter: currency });
    frameAt(600);
    expect(b.textContent).toBe('¥0.00');
  });

  it('progress = min(elapsed/duration, 1)：1000ms 线性下中点写 500', () => {
    const el = makeEl();
    animateValue(el, 0, 1000, { duration: 1000, easing: (t) => t });
    frameAt(500);
    expect(el.textContent).toBe('500');
  });

  it('超出时长后 progress 夹到 1：写 formatter(to) 且不再排帧', () => {
    const onComplete = vi.fn();
    const el = makeEl();
    animateValue(el, 0, 1000, { duration: 1000, easing: (t) => t, onComplete });
    frameAt(1500);
    expect(el.textContent).toBe('1000');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(rafQueue).toHaveLength(0);
  });

  it('插值公式 from+(to-from)*eased：100→200 中点写 150', () => {
    const el = makeEl();
    animateValue(el, 100, 200, { duration: 1000, easing: (t) => t });
    frameAt(500);
    expect(el.textContent).toBe('150');
  });

  it('onComplete 只在完成帧触发一次，之前任何帧都不触发', () => {
    const onComplete = vi.fn();
    const el = makeEl();
    animateValue(el, 0, 100, { duration: 300, easing: (t) => t, onComplete });
    expect(onComplete).not.toHaveBeenCalled();
    frameAt(0);
    frameAt(150);
    expect(onComplete).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(1);
    frameAt(300);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe('100');
    expect(rafQueue).toHaveLength(0);
  });

  it('反向区间 100→0 单调不增且不越过终值（不下探到 0 以下）', () => {
    const el = makeEl();
    animateValue(el, 100, 0, { duration: 1000, easing: (t) => t });
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
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
    expect(values[0]).toBe(100);
    expect(values[10]).toBe(0);
  });

  it('正向动画任何一帧都不得越过终值 100（含越过 duration 的夹紧帧）', () => {
    const el = makeEl();
    animateValue(el, 0, 100, { duration: 1000, easing: (t) => t });
    let max = -Infinity;
    let t = 0;
    let frames = 0;
    while (rafQueue.length > 0) {
      frameAt(t);
      frames += 1;
      max = Math.max(max, Number(el.textContent));
      t += 130; // 130ms 步进：末帧落在 1040ms，progress 必须夹到 1
      if (frames > 30) throw new Error('帧数超限，动画未收敛');
    }
    expect(frames).toBeGreaterThanOrEqual(8);
    expect(max).toBeLessThanOrEqual(100);
    expect(max).toBe(100);
    expect(el.textContent).toBe('100');
  });

  it('duration=0 首帧即完成，回调恰好一次，不续排帧', () => {
    const onComplete = vi.fn();
    const el = makeEl();
    animateValue(el, 0, 42, { duration: 0, onComplete });
    expect(rafQueue).toHaveLength(1);
    frameAt(0);
    expect(el.textContent).toBe('42');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(rafQueue).toHaveLength(0);
  });

  it('duration 为负数时永不完成且值向负向越界（生产未做下界保护）', () => {
    const onComplete = vi.fn();
    const el = makeEl();
    animateValue(el, 0, 100, { duration: -100, onComplete });
    frameAt(0);
    expect(el.textContent).toBe('0');
    frameAt(100);
    // progress = 100/-100 = -1 → 默认 easing(-1) = -3 → 0 + 100*(-3) = -300
    expect(el.textContent).toBe('-300');
    frameAt(200);
    expect(el.textContent).toBe('-800');
    expect(onComplete).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(1);
  });

  it('非数字 from：首帧写 "NaN"，收尾仍写 formatter(to)', () => {
    const el = makeEl();
    animateValue(el, NaN, 100, { duration: 1000, easing: (t) => t });
    frameAt(0);
    expect(el.textContent).toBe('NaN');
    frameAt(1000);
    expect(el.textContent).toBe('100');
  });

  it('非数字 to：收尾写 formatter(NaN) = "NaN"', () => {
    const el = makeEl();
    animateValue(el, 0, NaN, { duration: 1000, easing: (t) => t });
    frameAt(500);
    expect(el.textContent).toBe('NaN');
    frameAt(1000);
    expect(el.textContent).toBe('NaN');
  });

  it('元素为 null：调用本身不抛，首帧抛 TypeError 且回调不触发', () => {
    const onComplete = vi.fn();
    expect(() =>
      animateValue(null as unknown as HTMLElement, 0, 10, { onComplete })
    ).not.toThrow();
    expect(rafQueue).toHaveLength(1);
    expect(() => frameAt(0)).toThrow(TypeError);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// ==================== flashChange ====================

describe('uiPolish - flashChange（真实 CSSOM）', () => {
  it('up 方向写入 8 位 hex 红色，CSSOM 归一化为 rgba(239, 68, 68, 0.125)', () => {
    const el = makeEl();
    flashChange(el, 'up');
    expect(el.style.backgroundColor).toBe('rgba(239, 68, 68, 0.125)');
    expect(el.style.backgroundColor).toContain('rgba(239, 68, 68');
    expect(rgbaAlpha(el.style.backgroundColor)).toBeCloseTo(0x20 / 255, 2);
  });

  it('down 方向写入 8 位 hex 绿色，归一化为 rgba(34, 197, 94, 0.125)', () => {
    const el = makeEl();
    flashChange(el, 'down');
    expect(el.style.backgroundColor).toBe('rgba(34, 197, 94, 0.125)');
    expect(rgbaAlpha(el.style.backgroundColor)).toBeCloseTo(0x20 / 255, 2);
  });

  it('默认 duration=800：首帧写 transition，并排一个 800ms 定时器', () => {
    const el = makeEl();
    flashChange(el, 'up');
    expect(el.style.getPropertyValue('transition')).toBe('none');
    frameAt(0);
    expect(el.style.transition).toBe('background-color 800ms ease-out');
    expect(timers[0].delay).toBe(800);
  });

  it('原背景为空时，首帧回落到 transparent，定时器到期清空', () => {
    const el = makeEl();
    flashChange(el, 'up');
    frameAt(0);
    expect(el.style.backgroundColor).toBe('transparent');
    runTimerOnce();
    expect(el.style.backgroundColor).toBe('');
    expect(el.style.getPropertyValue('transition')).toBe('');
  });

  it('原背景非空时按原值恢复（不被归一化打乱语义）', () => {
    const el = makeEl();
    el.style.backgroundColor = '#0f172a';
    const original = el.style.backgroundColor;
    flashChange(el, 'down');
    expect(el.style.backgroundColor).toBe('rgba(34, 197, 94, 0.125)');
    frameAt(0);
    expect(el.style.backgroundColor).toBe(original);
    runTimerOnce();
    expect(el.style.backgroundColor).toBe(original);
  });

  it('定时器到期前 transition 保持 ease-out，不提前清理', () => {
    const el = makeEl();
    flashChange(el, 'up');
    frameAt(0);
    expect(timers).toHaveLength(1);
    expect(el.style.getPropertyValue('transition')).toBe('background-color 800ms ease-out');
  });
});

// ==================== bounceIn ====================

describe('uiPolish - bounceIn（行内 transform/opacity）', () => {
  it('默认 duration=400ms 同时作用于 transform 与 opacity', () => {
    const el = makeEl();
    bounceIn(el);
    expect(el.style.transition).toContain('transform 400ms');
    expect(el.style.transition).toContain('opacity 400ms ease');
  });

  it('初始状态 scale(0.3) + opacity 0', () => {
    const el = makeEl();
    bounceIn(el);
    expect(el.style.getPropertyValue('transform')).toBe('scale(0.3)');
    expect(el.style.getPropertyValue('opacity')).toBe('0');
    expect(Number(el.style.transform.slice('scale('.length, -1))).toBeLessThan(1);
  });

  it('cubic-bezier 含 1.56 过冲控制点', () => {
    const el = makeEl();
    bounceIn(el);
    expect(el.style.transition).toContain('cubic-bezier(0.34, 1.56, 0.64, 1)');
    expect(el.style.transition).toContain('1.56');
  });

  it('首帧后进入 scale(1) + opacity 1 终态', () => {
    const el = makeEl();
    bounceIn(el);
    expect(rafQueue).toHaveLength(1);
    frameAt(0);
    expect(el.style.getPropertyValue('transform')).toBe('scale(1)');
    expect(el.style.getPropertyValue('opacity')).toBe('1');
    expect(rafQueue).toHaveLength(0);
  });
});

// ==================== slideToDelete ====================

describe('uiPolish - slideToDelete（行内 transform/opacity）', () => {
  it('left 方向位移 -100% 并透明', () => {
    const el = makeEl();
    slideToDelete(el, 'left');
    expect(el.style.getPropertyValue('transform')).toBe('translateX(-100%)');
    expect(el.style.getPropertyValue('opacity')).toBe('0');
  });

  it('right 方向位移 100%', () => {
    const el = makeEl();
    slideToDelete(el, 'right');
    expect(el.style.getPropertyValue('transform')).toBe('translateX(100%)');
  });

  it('方向默认 left', () => {
    const el = makeEl();
    slideToDelete(el);
    expect(el.style.transform).toBe('translateX(-100%)');
  });

  it('transition 为 300ms ease-in（transform 与 opacity 各一条）', () => {
    const el = makeEl();
    const onDone = vi.fn();
    slideToDelete(el, 'left', onDone);
    expect(el.style.transition).toBe('transform 300ms ease-in, opacity 300ms ease-in');
    const timer = runTimerOnce();
    expect(timer.delay).toBe(300);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('onDone 在定时器到期前不触发', () => {
    const el = makeEl();
    const onDone = vi.fn();
    slideToDelete(el, 'right', onDone);
    expect(onDone).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1);
    expect(timers[0].delay).toBe(300);
  });
});

// ==================== flipCard ====================

describe('uiPolish - flipCard（两段式）', () => {
  it('总时长默认 600，前后各 duration/2=300', () => {
    const front = makeEl();
    const back = makeEl();
    flipCard(front, back);
    expect(front.style.transition).toBe('transform 300ms ease-in');
    const timer = runTimerOnce();
    expect(timer.delay).toBe(300);
    expect(back.style.transition).toBe('transform 300ms ease-out');
  });

  it('front 先转到 rotateY(90deg)', () => {
    const front = makeEl();
    const back = makeEl();
    flipCard(front, back);
    expect(front.style.getPropertyValue('transform')).toBe('rotateY(90deg)');
    expect(front.style.transform).toContain('90deg');
  });

  it('后半程 front 隐藏、back 归零到 rotateY(0deg)', () => {
    const front = makeEl();
    const back = makeEl();
    flipCard(front, back);
    runTimerOnce();
    expect(front.style.getPropertyValue('display')).toBe('none');
    expect(back.style.getPropertyValue('transform')).toBe('rotateY(0deg)');
    expect(back.style.transform).toContain('0deg');
  });

  it('自定义 duration=400 时定时器为 200ms', () => {
    const front = makeEl();
    const back = makeEl();
    flipCard(front, back, 400);
    expect(front.style.transition).toBe('transform 200ms ease-in');
    const timer = runTimerOnce();
    expect(timer.delay).toBe(200);
  });
});

// ==================== typewriter ====================

describe('uiPolish - typewriter（逐字符宏任务）', () => {
  it('默认 speed=50ms，调用即写首字符并排 50ms 定时器', () => {
    const el = makeEl();
    const runner = typewriter(el, 'ab');
    expect(el.textContent).toBe('a');
    expect(timers[0].delay).toBe(50);
    runner.stop();
    runAllTimers();
  });

  it('逐字符推进直到完整文本', async () => {
    const el = makeEl();
    const { promise } = typewriter(el, 'Hello');
    const seen: string[] = [el.textContent];
    while (timers.length > 0) {
      runTimerOnce();
      if (timers.length > 0) seen.push(el.textContent);
    }
    expect(el.textContent).toBe('Hello');
    expect(seen).toEqual(['H', 'He', 'Hel', 'Hell', 'Hello']);
    await expect(promise).resolves.toBeUndefined();
  });

  it('空串：不写字符、不排定时器、promise 立即 resolve', async () => {
    const el = makeEl();
    const { promise } = typewriter(el, '');
    expect(el.textContent).toBe('');
    expect(timers).toHaveLength(0);
    await expect(promise).resolves.toBeUndefined();
  });

  it('unicode 按 UTF-16 码元逐单元推进', async () => {
    const text = '你好世界';
    expect(text.length).toBe(4);
    const el = makeEl();
    const { promise } = typewriter(el, text);
    expect(el.textContent).toBe('你');
    expect(text[0]).toBe('你');
    runAllTimers();
    expect(el.textContent).toBe('你好世界');
    await expect(promise).resolves.toBeUndefined();
  });

  it('总时长 = text.length * speed（4 字符 × 50ms）', () => {
    const el = makeEl();
    typewriter(el, 'Test', 50);
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) {
      delays.push(runTimerOnce().delay);
    }
    expect(delays).toEqual([50, 50, 50, 50]);
    expect(delays.reduce((a, b) => a + b, 0)).toBe(200);
    expect(timers).toHaveLength(0);
  });

  it('stop() 后不再追加字符，promise 在下一次定时器后 resolve', async () => {
    const el = makeEl();
    const { stop, promise } = typewriter(el, 'abcd', 10);
    expect(el.textContent).toBe('a');
    stop();
    runAllTimers();
    await expect(promise).resolves.toBeUndefined();
    expect(el.textContent).toBe('a');
  });
});

// ==================== shake ====================

describe('uiPolish - shake（Web Animations 实参）', () => {
  it('jsdom 原生不实现 Element.animate，故 shake 需注入桩（环境事实）', () => {
    const el = makeEl();
    expect(typeof (el as unknown as { animate?: unknown }).animate).toBe('undefined');
  });

  it('默认 intensity=5：第 2/3 帧为 ∓5px', () => {
    const el = makeEl();
    const animate = installAnimate(el);
    shake(el);
    expect(animate).toHaveBeenCalledTimes(1);
    const keyframes = animate.mock.calls[0][0] as Keyframe[];
    expect(keyframes[1].transform).toBe('translateX(-5px)');
    expect(keyframes[2].transform).toBe('translateX(5px)');
  });

  it('6 帧序列正确、第 5 帧为 intensity/2、options 为 400ms ease-in-out', () => {
    const el = makeEl();
    const animate = installAnimate(el);
    shake(el);
    const keyframes = animate.mock.calls[0][0] as Keyframe[];
    const options = animate.mock.calls[0][1] as KeyframeAnimationOptions;
    expect(keyframes).toHaveLength(6);
    expect(keyframes[0].transform).toBe('translateX(0)');
    expect(keyframes[keyframes.length - 1].transform).toBe('translateX(0)');
    expect(keyframes[4].transform).toBe('translateX(2.5px)');
    expect(options).toEqual({ duration: 400, easing: 'ease-in-out' });
  });

  it('首尾都归零，动画结束后不残留位移', () => {
    const el = makeEl();
    const animate = installAnimate(el);
    shake(el);
    const keyframes = animate.mock.calls[0][0] as Keyframe[];
    expect(keyframes[0].transform).toBe('translateX(0)');
    expect(keyframes[keyframes.length - 1].transform).toBe('translateX(0)');
  });

  it('自定义 intensity=10 时振幅与半幅随参数变化', () => {
    const el = makeEl();
    const animate = installAnimate(el);
    shake(el, 10);
    const keyframes = animate.mock.calls[0][0] as Keyframe[];
    expect(keyframes[1].transform).toBe('translateX(-10px)');
    expect(keyframes[2].transform).toBe('translateX(10px)');
    expect(keyframes[4].transform).toBe('translateX(5px)');
  });
});

// ==================== animateBadge ====================

describe('uiPolish - animateBadge（150ms 缩放）', () => {
  it('from===to 直接 return：样式与定时器都不写', () => {
    const el = makeEl();
    animateBadge(el, 5, 5);
    expect(el.style.getPropertyValue('transition')).toBe('');
    expect(el.style.getPropertyValue('transform')).toBe('');
    expect(timers).toHaveLength(0);
    expect(el.textContent).toBe('');
  });

  it('值不同时写入 transition 与 scale(1.3)', () => {
    const el = makeEl();
    animateBadge(el, 3, 7);
    expect(el.style.transition).toBe('transform 150ms ease-out');
    expect(el.style.getPropertyValue('transform')).toBe('scale(1.3)');
  });

  it('缩放因子为 1.3 且大于 1（放大语义）', () => {
    const el = makeEl();
    animateBadge(el, 3, 7);
    const scale = Number(el.style.transform.slice('scale('.length, -1));
    expect(scale).toBe(1.3);
    expect(scale).toBeGreaterThan(1);
  });

  it('150ms 后写 String(to) 并回到 scale(1)', () => {
    const el = makeEl();
    animateBadge(el, 3, 7);
    expect(el.textContent).toBe('');
    const timer = runTimerOnce();
    expect(timer.delay).toBe(150);
    expect(el.textContent).toBe('7');
    expect(el.style.getPropertyValue('transform')).toBe('scale(1)');
  });

  it('从 0 递增到 1', () => {
    const el = makeEl();
    animateBadge(el, 0, 1);
    runTimerOnce();
    expect(el.textContent).toBe('1');
  });

  it('递减 10 → 5', () => {
    const el = makeEl();
    animateBadge(el, 10, 5);
    runTimerOnce();
    expect(el.textContent).toBe('5');
  });
});

// ==================== addGlowEffect ====================

describe('uiPolish - addGlowEffect（真实 MouseEvent）', () => {
  it('默认色为 rgba(59, 130, 246, 0.3)', () => {
    const el = makeEl({ top: 10, left: 5 });
    const cleanup = addGlowEffect(el);
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 105, clientY: 60 }));
    const bg = el.style.getPropertyValue('background');
    expect(bg).toContain('rgba');
    expect(bg).toContain('0.3');
    expect(bg).toContain('rgba(59, 130, 246, 0.3)');
    cleanup();
  });

  it('半径固定 150px，坐标取 clientX-rect.left / clientY-rect.top', () => {
    const el = makeEl({ top: 10, left: 5 });
    const cleanup = addGlowEffect(el);
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 105, clientY: 60 }));
    const bg = el.style.getPropertyValue('background');
    expect(bg).toContain('150px');
    expect(bg).toContain('100px');
    expect(bg).toContain('50px');
    expect(bg).toContain('circle 150px at 100px 50px');
    cleanup();
  });

  it('mouseleave 清空 background', () => {
    const el = makeEl();
    const cleanup = addGlowEffect(el);
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
    el.dispatchEvent(new MouseEvent('mouseleave'));
    expect(el.style.getPropertyValue('background')).toBe('');
    cleanup();
  });

  it('连续 mousemove 跟踪最新坐标', () => {
    const el = makeEl({ top: 0, left: 0 });
    const cleanup = addGlowEffect(el);
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 40 }));
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 80 }));
    expect(el.style.getPropertyValue('background')).toContain('at 60px 80px');
    cleanup();
  });

  it('cleanup 移除两个监听：之后派发事件不再改样式', () => {
    const el = makeEl({ top: 0, left: 0 });
    const removeSpy = vi.spyOn(el, 'removeEventListener');
    const cleanup = addGlowEffect(el);
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));
    expect(el.style.getPropertyValue('background')).toContain('at 20px 20px');
    cleanup();
    expect(removeSpy).toHaveBeenCalledTimes(2);
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 90, clientY: 90 }));
    expect(el.style.getPropertyValue('background')).not.toContain('at 90px 90px');
  });
});

// ==================== animateReorder ====================

describe('uiPolish - animateReorder（FLIP 位移）', () => {
  it('delta = oldTop - newTop：100 - 150 = -50', () => {
    const el = makeEl({ top: 150 });
    animateReorder([el], new Map([[el, 100]]));
    expect(el.style.getPropertyValue('transform')).toBe('translateY(-50px)');
    expect(el.style.getPropertyValue('transition')).toBe('none');
    expect(rafQueue).toHaveLength(1);
  });

  it('|delta| < 1 时直接跳过：不写样式、不排帧', () => {
    const el = makeEl({ top: 100.5 });
    animateReorder([el], new Map([[el, 100]]));
    expect(el.style.getPropertyValue('transform')).toBe('');
    expect(el.style.getPropertyValue('transition')).toBe('');
    expect(rafQueue).toHaveLength(0);
  });

  it('首帧后从 translateY(delta) 过渡回 translateY(0)', () => {
    const el = makeEl({ top: 150 });
    animateReorder([el], new Map([[el, 100]]));
    frameAt(0);
    expect(el.style.transition).toBe('transform 300ms cubic-bezier(0.4, 0, 0.2, 1)');
    expect(el.style.getPropertyValue('transform')).toBe('translateY(0)');
  });

  it('过渡时长为 300ms', () => {
    const el = makeEl({ top: 150 });
    animateReorder([el], new Map([[el, 100]]));
    frameAt(0);
    expect(el.style.transition).toContain('300ms');
  });

  it('使用标准 material 缓动 cubic-bezier(0.4, 0, 0.2, 1)', () => {
    const el = makeEl({ top: 150 });
    animateReorder([el], new Map([[el, 100]]));
    frameAt(0);
    expect(el.style.transition).toContain('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(el.style.transition).toContain('0.4');
    expect(el.style.transition).toContain('0.2');
  });

  it('oldPositions 缺失的节点被跳过', () => {
    const known = makeEl({ top: 150 });
    const unknown = makeEl({ top: 150 });
    animateReorder([known, unknown], new Map([[known, 100]]));
    expect(known.style.getPropertyValue('transform')).toBe('translateY(-50px)');
    expect(unknown.style.getPropertyValue('transform')).toBe('');
    expect(rafQueue).toHaveLength(1);
  });

  it('多节点各自独立：下移为负、上移为正、零位移不动', () => {
    const down = makeEl({ top: 150 });
    const up = makeEl({ top: 50 });
    const still = makeEl({ top: 100 });
    const oldPositions = new Map<HTMLElement, number>([
      [down, 100],
      [up, 100],
      [still, 100],
    ]);
    animateReorder([down, up, still], oldPositions);
    expect(down.style.getPropertyValue('transform')).toBe('translateY(-50px)');
    expect(up.style.getPropertyValue('transform')).toBe('translateY(50px)');
    expect(still.style.getPropertyValue('transform')).toBe('');
    expect(rafQueue).toHaveLength(2);
    frameAt(0);
    frameAt(0);
    expect(down.style.getPropertyValue('transform')).toBe('translateY(0)');
    expect(up.style.getPropertyValue('transform')).toBe('translateY(0)');
    expect(rafQueue).toHaveLength(0);
  });
});
