/**
 * UI 微交互工具
 * 提供各种微交互动效和视觉反馈
 */

// 脉冲动画：用于数字更新
export function animateValue(
  element: HTMLElement,
  from: number,
  to: number,
  options: {
    duration?: number;
    easing?: (t: number) => number;
    formatter?: (v: number) => string;
    onComplete?: () => void;
  } = {}
): void {
  const {
    duration = 600,
    easing = (t) => t * (2 - t),
    formatter = (v) => String(Math.round(v)),
    onComplete,
  } = options;

  const startTime = performance.now();

  function update(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);
    const currentValue = from + (to - from) * easedProgress;

    element.textContent = formatter(currentValue);

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = formatter(to);
      onComplete?.();
    }
  }

  requestAnimationFrame(update);
}

// 涨跌闪烁效果
export function flashChange(
  element: HTMLElement,
  direction: 'up' | 'down',
  duration = 800
): void {
  const color = direction === 'up' ? '#ef4444' : '#22c55e';
  const originalBg = element.style.backgroundColor;

  element.style.transition = 'none';
  element.style.backgroundColor = `${color}20`;

  requestAnimationFrame(() => {
    element.style.transition = `background-color ${duration}ms ease-out`;
    element.style.backgroundColor = originalBg || 'transparent';
  });

  setTimeout(() => {
    element.style.transition = '';
    element.style.backgroundColor = originalBg;
  }, duration);
}

// 弹跳效果
export function bounceIn(element: HTMLElement, duration = 400): void {
  element.style.transform = 'scale(0.3)';
  element.style.opacity = '0';
  element.style.transition = `transform ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity ${duration}ms ease`;

  requestAnimationFrame(() => {
    element.style.transform = 'scale(1)';
    element.style.opacity = '1';
  });
}

// 滑动删除
export function slideToDelete(
  element: HTMLElement,
  direction: 'left' | 'right' = 'left',
  onDone?: () => void
): void {
  const distance = direction === 'left' ? '-100%' : '100%';
  element.style.transition = 'transform 300ms ease-in, opacity 300ms ease-in';
  element.style.transform = `translateX(${distance})`;
  element.style.opacity = '0';

  setTimeout(() => {
    onDone?.();
  }, 300);
}

// 翻转效果（用于卡片翻转）
export function flipCard(front: HTMLElement, back: HTMLElement, duration = 600): void {
  front.style.transition = `transform ${duration / 2}ms ease-in`;
  front.style.transform = 'rotateY(90deg)';

  setTimeout(() => {
    front.style.display = 'none';
    back.style.display = '';
    back.style.transition = `transform ${duration / 2}ms ease-out`;
    back.style.transform = 'rotateY(0deg)';
  }, duration / 2);
}

// 打字机效果
export function typewriter(
  element: HTMLElement,
  text: string,
  speed = 50
): { stop: () => void; promise: Promise<void> } {
  let index = 0;
  let stopped = false;

  const promise = new Promise<void>((resolve) => {
    function type() {
      if (stopped || index >= text.length) {
        resolve();
        return;
      }
      element.textContent += text[index];
      index++;
      setTimeout(type, speed);
    }
    type();
  });

  return {
    stop: () => { stopped = true; },
    promise,
  };
}

// 抖动效果（用于错误提示）
export function shake(element: HTMLElement, intensity = 5): void {
  const keyframes: Keyframe[] = [
    { transform: 'translateX(0)' },
    { transform: `translateX(-${intensity}px)` },
    { transform: `translateX(${intensity}px)` },
    { transform: `translateX(-${intensity}px)` },
    { transform: `translateX(${intensity / 2}px)` },
    { transform: 'translateX(0)' },
  ];

  element.animate(keyframes, {
    duration: 400,
    easing: 'ease-in-out',
  });
}

// 渐变光标跟踪
export function addGlowEffect(element: HTMLElement, color = 'rgba(59, 130, 246, 0.3)'): () => void {
  const handler = (e: MouseEvent) => {
    const rect = element.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    element.style.background = `radial-gradient(circle 150px at ${x}px ${y}px, ${color}, transparent)`;
  };

  const leaveHandler = () => {
    element.style.background = '';
  };

  element.addEventListener('mousemove', handler);
  element.addEventListener('mouseleave', leaveHandler);

  return () => {
    element.removeEventListener('mousemove', handler);
    element.removeEventListener('mouseleave', leaveHandler);
  };
}

// 通知数字跳动动画
export function animateBadge(element: HTMLElement, from: number, to: number): void {
  if (from === to) return;

  element.style.transition = 'transform 150ms ease-out';
  element.style.transform = 'scale(1.3)';

  setTimeout(() => {
    element.textContent = String(to);
    element.style.transform = 'scale(1)';
  }, 150);
}

// 列表重排动画
export function animateReorder(
  items: HTMLElement[],
  oldPositions: Map<HTMLElement, number>
): void {
  items.forEach((item) => {
    const oldTop = oldPositions.get(item);
    if (oldTop === undefined) return;

    const newTop = item.getBoundingClientRect().top;
    const delta = oldTop - newTop;

    if (Math.abs(delta) < 1) return;

    item.style.transform = `translateY(${delta}px)`;
    item.style.transition = 'none';

    requestAnimationFrame(() => {
      item.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)';
      item.style.transform = 'translateY(0)';
    });
  });
}
