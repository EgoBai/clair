/**
 * 图表动画工具
 * 数据更新动画、状态过渡、交互反馈动画
 */

export interface AnimationConfig {
  duration: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce';
  delay?: number;
  stagger?: number;
}

export interface TransitionState<T> {
  from: T;
  to: T;
  progress: number;
  isActive: boolean;
}

// 预设动画配置
export const ANIMATION_PRESETS: Record<string, AnimationConfig> = {
  fast: { duration: 200, easing: 'easeOut' },
  normal: { duration: 400, easing: 'easeInOut' },
  slow: { duration: 800, easing: 'easeInOut' },
  bounce: { duration: 600, easing: 'bounce' },
  stagger: { duration: 300, easing: 'easeOut', stagger: 50 },
};

/**
 * 缓动函数
 */
export const easings: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  bounce: (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
};

/**
 * 数值插值
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * 数组插值
 */
export function lerpArray(start: number[], end: number[], t: number): number[] {
  return start.map((v, i) => lerp(v, end[i] ?? v, t));
}

/**
 * 颜色插值 (hex格式)
 */
export function lerpColor(start: string, end: string, t: number): string {
  const parseHex = (hex: string) => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  };

  const s = parseHex(start);
  const e = parseHex(end);
  const r = Math.round(lerp(s[0], e[0], t));
  const g = Math.round(lerp(s[1], e[1], t));
  const b = Math.round(lerp(s[2], e[2], t));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 数据更新动画器
 * 逐帧将数据从from状态过渡到to状态
 */
export function createDataAnimator<T extends Record<string, number>>(
  from: T,
  to: T,
  config: AnimationConfig,
  onUpdate: (current: T) => void,
  onComplete?: () => void
): { cancel: () => void; progress: () => number } {
  const easingFn = easings[config.easing] || easings.easeInOut;
  let startTime: number | null = null;
  let animationFrame: number | null = null;
  let cancelled = false;
  let currentProgress = 0;

  const keys = Object.keys(from) as (keyof T)[];

  const animate = (timestamp: number) => {
    if (cancelled) return;

    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime - (config.delay || 0);

    if (elapsed < 0) {
      animationFrame = requestAnimationFrame(animate);
      return;
    }

    const rawProgress = Math.min(elapsed / config.duration, 1);
    currentProgress = easingFn(rawProgress);

    const current = {} as T;
    for (const key of keys) {
      (current as any)[key] = lerp(
        Number(from[key]) || 0,
        Number(to[key]) || 0,
        currentProgress
      );
    }

    onUpdate(current);

    if (rawProgress < 1) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      onComplete?.();
    }
  };

  animationFrame = requestAnimationFrame(animate);

  return {
    cancel: () => {
      cancelled = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
    },
    progress: () => currentProgress,
  };
}

/**
 * 点脉冲动画配置
 * 用于数据点hover/click时的视觉反馈
 */
export function getPulseAnimation(
  baseRadius: number,
  maxRadius: number,
  duration: number = 600
): { keyframes: string; duration: number } {
  return {
    keyframes: `
      @keyframes pulse {
        0% { r: ${baseRadius}; opacity: 1; }
        50% { r: ${maxRadius}; opacity: 0.5; }
        100% { r: ${baseRadius}; opacity: 1; }
      }
    `,
    duration,
  };
}

/**
 * 入场动画 (图表元素从下往上滑入)
 */
export function getSlideInAnimation(
  index: number,
  stagger: number = 50,
  duration: number = 400
): { animation: string; delay: number } {
  return {
    animation: `slideIn ${duration}ms ease-out forwards`,
    delay: index * stagger,
  };
}

/**
 * 数据变化高亮动画
 * 当数据值变化时，短暂高亮显示
 */
export function getChangeHighlight(
  isPositive: boolean,
  intensity: number = 0.8
): { bg: string; animation: string; duration: number } {
  const color = isPositive ? `rgba(207, 19, 34, ${intensity})` : `rgba(63, 134, 0, ${intensity})`;
  return {
    bg: color,
    animation: 'highlight 1s ease-out forwards',
    duration: 1000,
  };
}

/**
 * 骨架屏闪烁动画
 */
export function getSkeletonAnimation(): string {
  return `
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `;
}

/**
 * 数字滚动动画配置
 * 用于大数字更新时的计数器效果
 */
export interface CounterAnimationConfig {
  start: number;
  end: number;
  duration: number;
  decimals: number;
  easing: keyof typeof easings;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

export function animateCounter(config: CounterAnimationConfig): { cancel: () => void } {
  const { start, end, duration, decimals, easing, onUpdate, onComplete } = config;
  const easingFn = easings[easing] || easings.easeOut;
  let startTime: number | null = null;
  let frame: number | null = null;
  let cancelled = false;

  const animate = (timestamp: number) => {
    if (cancelled) return;
    if (!startTime) startTime = timestamp;

    const progress = Math.min((timestamp - startTime) / duration, 1);
    const easedProgress = easingFn(progress);
    const current = lerp(start, end, easedProgress);

    onUpdate(Number(current.toFixed(decimals)));

    if (progress < 1) {
      frame = requestAnimationFrame(animate);
    } else {
      onComplete?.();
    }
  };

  frame = requestAnimationFrame(animate);

  return {
    cancel: () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    },
  };
}

/**
 * 生成CSS关键帧
 */
export function generateKeyframes(): string {
  return `
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes highlight {
      0% { filter: brightness(1.5); }
      100% { filter: brightness(1); }
    }
    @keyframes countUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    ${getSkeletonAnimation()}
  `;
}
