/**
 * Motion Design Tokens
 * 统一管理所有动画/过渡时间和缓动参数
 */

// 检测减弱动画偏好
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 基础时长（毫秒）
export const MOTION_DURATION = {
  instant: 0,
  micro: 100,
  fast: 150,
  normal: 200,
  slow: 300,
  slower: 500,
  lazy: 800,
} as const;

// 缓动曲线
export const EASING = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

// 预设时序组合
export const TIMING = {
  hover: { duration: MOTION_DURATION.fast, easing: EASING.standard },
  modal: { duration: MOTION_DURATION.normal, easing: EASING.decelerate },
  pageTransition: { duration: MOTION_DURATION.slow, easing: EASING.standard },
  tooltip: { duration: MOTION_DURATION.micro, easing: EASING.decelerate },
  notification: { duration: MOTION_DURATION.normal, easing: EASING.spring },
  dropdown: { duration: MOTION_DURATION.fast, easing: EASING.decelerate },
  collapse: { duration: MOTION_DURATION.slow, easing: EASING.standard },
  fade: { duration: MOTION_DURATION.normal, easing: EASING.standard },
} as const;

// 关键帧动画定义
export const ANIMATIONS = {
  fadeIn: `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`,
  slideUp: `@keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`,
  slideDown: `@keyframes slideDown { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`,
  scaleIn: `@keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`,
  pulse: `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`,
  spin: `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`,
  shimmer: `@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`,
  flash: `@keyframes flash { 0%, 100% { opacity: 1; } 25% { opacity: 0.3; } 75% { opacity: 0.8; } }`,
  bounceIn: `@keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { transform: scale(1); opacity: 1; } }`,
  shake: `@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }`,
} as const;

// 微交互样式
export const MICRO = {
  tap: {
    active: { transform: 'scale(0.97)', transition: `transform ${MOTION_DURATION.micro}ms ${EASING.standard}` },
    style: { transform: 'scale(1)', transition: `transform ${MOTION_DURATION.micro}ms ${EASING.standard}` },
  },
  hover: {
    lift: { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', transition: `all ${MOTION_DURATION.fast}ms ${EASING.standard}` },
    glow: { boxShadow: '0 0 0 3px rgba(24, 144, 255, 0.2)', transition: `box-shadow ${MOTION_DURATION.fast}ms ${EASING.standard}` },
  },
  focus: {
    ring: { boxShadow: '0 0 0 2px rgba(24, 144, 255, 0.2)', outline: '2px solid transparent', outlineOffset: '2px' },
  },
} as const;

// 组件级动画配置
export const COMPONENTS = {
  tooltip: { duration: MOTION_DURATION.micro, easing: EASING.decelerate },
  dropdown: { duration: MOTION_DURATION.fast, easing: EASING.decelerate },
  notification: { duration: MOTION_DURATION.normal, easing: EASING.spring },
  modal: { duration: MOTION_DURATION.normal, easing: EASING.decelerate },
  drawer: { duration: MOTION_DURATION.slow, easing: EASING.standard },
  card: { duration: MOTION_DURATION.fast, easing: EASING.standard },
  table: { duration: MOTION_DURATION.fast, easing: EASING.standard },
  tab: { duration: MOTION_DURATION.fast, easing: EASING.standard },
} as const;

// Spring 物理参数
export const SPRING = {
  gentle: { mass: 1, damping: 20, stiffness: 300 },
  wobbly: { mass: 1, damping: 10, stiffness: 400 },
  stiff: { mass: 1, damping: 30, stiffness: 500 },
  molasses: { mass: 1, damping: 40, stiffness: 200 },
} as const;

// 手势动画
export const GESTURES = {
  swipeLeft: { duration: MOTION_DURATION.slow, easing: EASING.accelerate, distance: -100 },
  swipeRight: { duration: MOTION_DURATION.slow, easing: EASING.accelerate, distance: 100 },
  pullRefresh: { duration: MOTION_DURATION.slow, easing: EASING.spring, threshold: 80 },
  pinchZoom: { duration: MOTION_DURATION.fast, easing: EASING.standard, minScale: 0.5, maxScale: 3 },
} as const;

// 工具函数
export function getDuration(base: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : base;
}

export function getEasing(easing: keyof typeof EASING): string {
  return EASING[easing];
}

// 交错延迟计算
export function staggerDelay(index: number, base = 30, max = 500): number {
  return Math.min(Math.sqrt(index) * base, max);
}
