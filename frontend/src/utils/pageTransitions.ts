/**
 * 页面转场动画系统
 * 提供统一的页面切换过渡效果
 */

// 转场类型
export type TransitionType =
  | 'fade'          // 淡入淡出
  | 'slide-left'    // 向左滑入
  | 'slide-right'   // 向右滑入
  | 'slide-up'      // 向上滑入
  | 'slide-down'    // 向下滑入
  | 'zoom'          // 缩放
  | 'scale-up'      // 从小放大
  | 'none';         // 无动画

// 转场配置
export interface TransitionConfig {
  type: TransitionType;
  duration: number;       // 毫秒
  easing: string;         // CSS easing
  delay?: number;         // 延迟
  reduceMotion?: boolean; // 是否尊重减弱动画偏好
}

// 转场预设
export const TRANSITION_PRESETS: Record<string, TransitionConfig> = {
  default: { type: 'fade', duration: 200, easing: 'ease-out' },
  page: { type: 'slide-left', duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  modal: { type: 'scale-up', duration: 200, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  drawer: { type: 'slide-right', duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  dropdown: { type: 'slide-down', duration: 150, easing: 'ease-out' },
  instant: { type: 'none', duration: 0, easing: 'linear' },
};

/**
 * 检测用户是否偏好减弱动画
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 获取转场CSS样式
 */
export function getTransitionCSS(config: TransitionConfig): {
  enter: string;
  enterActive: string;
  exit: string;
  exitActive: string;
} {
  const { type, duration, easing, delay = 0 } = config;

  if (type === 'none' || (config.reduceMotion && prefersReducedMotion())) {
    return {
      enter: '',
      enterActive: '',
      exit: '',
      exitActive: '',
    };
  }

  const _transitionStr = `all ${duration}ms ${easing} ${delay}ms`;

  switch (type) {
    case 'fade':
      return {
        enter: 'opacity-0',
        enterActive: `transition-[opacity] duration-${Math.round(duration)} opacity-100`,
        exit: 'opacity-100',
        exitActive: `transition-[opacity] duration-${Math.round(duration)} opacity-0`,
      };
    case 'slide-left':
      return {
        enter: 'translate-x-full opacity-0',
        enterActive: `transition-all duration-${Math.round(duration)} translate-x-0 opacity-100`,
        exit: 'translate-x-0 opacity-100',
        exitActive: `transition-all duration-${Math.round(duration)} -translate-x-full opacity-0`,
      };
    case 'slide-right':
      return {
        enter: '-translate-x-full opacity-0',
        enterActive: `transition-all duration-${Math.round(duration)} translate-x-0 opacity-100`,
        exit: 'translate-x-0 opacity-100',
        exitActive: `transition-all duration-${Math.round(duration)} translate-x-full opacity-0`,
      };
    case 'slide-up':
      return {
        enter: 'translate-y-full opacity-0',
        enterActive: `transition-all duration-${Math.round(duration)} translate-y-0 opacity-100`,
        exit: 'translate-y-0 opacity-100',
        exitActive: `transition-all duration-${Math.round(duration)} -translate-y-full opacity-0`,
      };
    case 'slide-down':
      return {
        enter: '-translate-y-full opacity-0',
        enterActive: `transition-all duration-${Math.round(duration)} translate-y-0 opacity-100`,
        exit: 'translate-y-0 opacity-100',
        exitActive: `transition-all duration-${Math.round(duration)} translate-y-full opacity-0`,
      };
    case 'zoom':
      return {
        enter: 'scale-0 opacity-0',
        enterActive: `transition-all duration-${Math.round(duration)} scale-100 opacity-100`,
        exit: 'scale-100 opacity-100',
        exitActive: `transition-all duration-${Math.round(duration)} scale-0 opacity-0`,
      };
    case 'scale-up':
      return {
        enter: 'scale-95 opacity-0',
        enterActive: `transition-all duration-${Math.round(duration)} scale-100 opacity-100`,
        exit: 'scale-100 opacity-100',
        exitActive: `transition-all duration-${Math.round(duration)} scale-95 opacity-0`,
      };
    default:
      return { enter: '', enterActive: '', exit: '', exitActive: '' };
  }
}

/**
 * 生成内联转场样式（不依赖Tailwind的动态值）
 */
export function getInlineTransitionStyle(
  config: TransitionConfig,
  phase: 'enter' | 'exit'
): React.CSSProperties {
  const { type, duration, easing, delay = 0 } = config;

  if (type === 'none' || (config.reduceMotion && prefersReducedMotion())) {
    return {};
  }

  const base: React.CSSProperties = {
    transition: `all ${duration}ms ${easing} ${delay}ms`,
  };

  const transforms: Record<TransitionType, { enter: string; exit: string }> = {
    fade: { enter: 'opacity(1)', exit: 'opacity(0)' },
    'slide-left': { enter: 'translateX(0) opacity(1)', exit: 'translateX(-100%) opacity(0)' },
    'slide-right': { enter: 'translateX(0) opacity(1)', exit: 'translateX(100%) opacity(0)' },
    'slide-up': { enter: 'translateY(0) opacity(1)', exit: 'translateY(-100%) opacity(0)' },
    'slide-down': { enter: 'translateY(0) opacity(1)', exit: 'translateY(100%) opacity(0)' },
    zoom: { enter: 'scale(1) opacity(1)', exit: 'scale(0) opacity(0)' },
    'scale-up': { enter: 'scale(1) opacity(1)', exit: 'scale(0.95) opacity(0)' },
    none: { enter: '', exit: '' },
  };

  return {
    ...base,
    transform: transforms[type]?.[phase] ?? '',
  };
}

/**
 * 路由转场映射器
 * 根据路由路径决定转场类型
 */
export class RouteTransitionMapper {
  private mappings = new Map<RegExp, TransitionType>();
  private defaultTransition: TransitionType = 'fade';

  addRule(pattern: RegExp, transition: TransitionType): this {
    this.mappings.set(pattern, transition);
    return this;
  }

  setDefault(transition: TransitionType): this {
    this.defaultTransition = transition;
    return this;
  }

  getTransition(fromPath: string, toPath: string): TransitionType {
    // 检查目标路径的规则
    for (const [pattern, transition] of this.mappings) {
      if (pattern.test(toPath)) {
        return transition;
      }
    }
    return this.defaultTransition;
  }

  // 页面层级关系决定方向
  getDirectionalTransition(fromPath: string, toPath: string): TransitionType {
    const fromDepth = (fromPath.match(/\//g) || []).length;
    const toDepth = (toPath.match(/\//g) || []).length;

    if (toDepth > fromDepth) return 'slide-left';   // 进入子页面
    if (toDepth < fromDepth) return 'slide-right';  // 返回父页面
    return 'fade';                                   // 同级切换
  }
}

/**
 * 交错动画延迟计算
 * 用于列表项依次进入动画
 */
export function calculateStaggerDelay(
  index: number,
  options: {
    baseDelay?: number;   // 基础延迟（默认50ms）
    maxDelay?: number;    // 最大延迟（默认500ms）
    easing?: 'linear' | 'ease-out' | 'ease-in';
  } = {}
): number {
  const { baseDelay = 50, maxDelay = 500, easing = 'ease-out' } = options;

  let factor: number;
  switch (easing) {
    case 'linear':
      factor = index;
      break;
    case 'ease-in':
      factor = index * index;
      break;
    case 'ease-out':
    default:
      factor = Math.sqrt(index);
      break;
  }

  return Math.min(factor * baseDelay, maxDelay);
}

/**
 * 滚动进入观察器
 * 元素进入视口时触发动画
 */
export class ScrollRevealObserver {
  private observer: IntersectionObserver | null = null;
  private elements = new Set<Element>();

  constructor(
    private options: IntersectionObserverInit & {
      animationClass?: string;
      once?: boolean;
    } = {}
  ) {
    if (typeof window === 'undefined') return;

    const { animationClass = 'animate-fade-in', once = true, ...observerOptions } = options;

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add(animationClass);
          if (once) {
            this.observer?.unobserve(entry.target);
            this.elements.delete(entry.target);
          }
        } else if (!once) {
          entry.target.classList.remove(animationClass);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px',
      ...observerOptions,
    });
  }

  observe(element: Element): void {
    if (this.observer && !this.elements.has(element)) {
      this.elements.add(element);
      this.observer.observe(element);
    }
  }

  unobserve(element: Element): void {
    if (this.observer) {
      this.observer.unobserve(element);
      this.elements.delete(element);
    }
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.elements.clear();
  }
}

/**
 * 动画帧计时器
 * 用于精确的动画时序控制
 */
export class AnimationTimer {
  private startTime = 0;
  private rafId = 0;

  start(duration: number, onUpdate: (progress: number) => void, onComplete?: () => void): void {
    this.startTime = performance.now();

    const tick = (currentTime: number) => {
      const elapsed = currentTime - this.startTime;
      const progress = Math.min(elapsed / duration, 1);

      onUpdate(progress);

      if (progress < 1) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        onComplete?.();
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
  }
}
