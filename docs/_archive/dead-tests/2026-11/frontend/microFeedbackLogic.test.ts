import { describe, it, expect } from 'vitest';

/**
 * 微反馈组件逻辑测试
 * MicroFeedback 动画/反馈/状态管理
 */

type FeedbackType = 'success' | 'error' | 'warning' | 'info' | 'loading';
type FeedbackPosition = 'top' | 'bottom' | 'center';
type AnimationType = 'fade' | 'slide' | 'bounce' | 'scale';

interface FeedbackConfig {
  type: FeedbackType;
  message: string;
  duration: number;
  position: FeedbackPosition;
  animation: AnimationType;
  closable: boolean;
}

interface FeedbackItem {
  id: string;
  config: FeedbackConfig;
  createdAt: number;
  dismissed: boolean;
}

const FEEDBACK_ICONS: Record<FeedbackType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
  loading: '⟳',
};

const FEEDBACK_COLORS: Record<FeedbackType, string> = {
  success: '#52c41a',
  error: '#ff4d4f',
  warning: '#faad14',
  info: '#1890ff',
  loading: '#1890ff',
};

function createFeedback(config: Partial<FeedbackConfig>): FeedbackConfig {
  return {
    type: config.type || 'info',
    message: config.message || '',
    duration: config.duration ?? 3000,
    position: config.position || 'top',
    animation: config.animation || 'fade',
    closable: config.closable ?? true,
  };
}

function getFeedbackIcon(type: FeedbackType): string {
  return FEEDBACK_ICONS[type];
}

function getFeedbackColor(type: FeedbackType): string {
  return FEEDBACK_COLORS[type];
}

function shouldAutoDismiss(config: FeedbackConfig): boolean {
  return config.duration > 0 && config.type !== 'loading';
}

function calcDismissTime(config: FeedbackConfig): number {
  return shouldAutoDismiss(config) ? config.duration : Infinity;
}

function mergeFeedbackConfigs(
  defaults: FeedbackConfig,
  overrides: Partial<FeedbackConfig>
): FeedbackConfig {
  return { ...defaults, ...overrides };
}

function buildFeedbackQueue(
  items: FeedbackItem[],
  maxVisible: number
): { visible: FeedbackItem[]; queued: FeedbackItem[] } {
  const active = items.filter(i => !i.dismissed);
  return {
    visible: active.slice(0, maxVisible),
    queued: active.slice(maxVisible),
  };
}

function dismissFeedback(items: FeedbackItem[], id: string): FeedbackItem[] {
  return items.map(item =>
    item.id === id ? { ...item, dismissed: true } : item
  );
}

function dismissAllFeedback(items: FeedbackItem[]): FeedbackItem[] {
  return items.map(item => ({ ...item, dismissed: true }));
}

function filterExpiredFeedback(items: FeedbackItem[], now: number, maxAge: number): FeedbackItem[] {
  return items.filter(item => now - item.createdAt < maxAge);
}

function groupFeedbackByPosition(
  items: FeedbackItem[]
): Record<FeedbackPosition, FeedbackItem[]> {
  const groups: Record<FeedbackPosition, FeedbackItem[]> = {
    top: [], bottom: [], center: [],
  };
  for (const item of items) {
    groups[item.config.position].push(item);
  }
  return groups;
}

function calcAnimationDuration(animation: AnimationType): number {
  const durations: Record<AnimationType, number> = {
    fade: 200,
    slide: 300,
    bounce: 400,
    scale: 250,
  };
  return durations[animation];
}

function buildKeyframes(animation: AnimationType): Array<{ offset: number; opacity?: number; transform?: string }> {
  switch (animation) {
    case 'fade':
      return [
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ];
    case 'slide':
      return [
        { offset: 0, opacity: 0, transform: 'translateY(-20px)' },
        { offset: 1, opacity: 1, transform: 'translateY(0)' },
      ];
    case 'bounce':
      return [
        { offset: 0, opacity: 0, transform: 'scale(0.3)' },
        { offset: 0.5, opacity: 1, transform: 'scale(1.05)' },
        { offset: 0.7, transform: 'scale(0.9)' },
        { offset: 1, opacity: 1, transform: 'scale(1)' },
      ];
    case 'scale':
      return [
        { offset: 0, opacity: 0, transform: 'scale(0.8)' },
        { offset: 1, opacity: 1, transform: 'scale(1)' },
      ];
  }
}

function isFeedbackDuplicate(a: FeedbackItem, b: FeedbackItem): boolean {
  return a.config.message === b.config.message && a.config.type === b.config.type;
}

function deduplicateFeedback(items: FeedbackItem[]): FeedbackItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.config.type}:${item.config.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

describe('微反馈组件逻辑', () => {
  describe('createFeedback', () => {
    it('should use defaults', () => {
      const fb = createFeedback({});
      expect(fb.type).toBe('info');
      expect(fb.duration).toBe(3000);
      expect(fb.position).toBe('top');
      expect(fb.closable).toBe(true);
    });

    it('should accept overrides', () => {
      const fb = createFeedback({ type: 'success', message: 'Done!', duration: 5000 });
      expect(fb.type).toBe('success');
      expect(fb.duration).toBe(5000);
    });
  });

  describe('getFeedbackIcon', () => {
    it('should return icon for each type', () => {
      expect(getFeedbackIcon('success')).toBe('✓');
      expect(getFeedbackIcon('error')).toBe('✕');
      expect(getFeedbackIcon('warning')).toBe('⚠');
      expect(getFeedbackIcon('info')).toBe('ℹ');
      expect(getFeedbackIcon('loading')).toBe('⟳');
    });
  });

  describe('getFeedbackColor', () => {
    it('should return color for each type', () => {
      expect(getFeedbackColor('success')).toBe('#52c41a');
      expect(getFeedbackColor('error')).toBe('#ff4d4f');
    });
  });

  describe('shouldAutoDismiss', () => {
    it('should auto dismiss non-loading with duration', () => {
      expect(shouldAutoDismiss(createFeedback({ type: 'info', duration: 3000 }))).toBe(true);
    });

    it('should not auto dismiss loading', () => {
      expect(shouldAutoDismiss(createFeedback({ type: 'loading', duration: 3000 }))).toBe(false);
    });

    it('should not auto dismiss with zero duration', () => {
      expect(shouldAutoDismiss(createFeedback({ duration: 0 }))).toBe(false);
    });
  });

  describe('calcDismissTime', () => {
    it('should return duration', () => {
      expect(calcDismissTime(createFeedback({ duration: 5000 }))).toBe(5000);
    });

    it('should return Infinity for loading', () => {
      expect(calcDismissTime(createFeedback({ type: 'loading', duration: 3000 }))).toBe(Infinity);
    });
  });

  describe('buildFeedbackQueue', () => {
    it('should split visible and queued', () => {
      const items: FeedbackItem[] = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        config: createFeedback({ message: `msg ${i}` }),
        createdAt: Date.now(),
        dismissed: false,
      }));
      const { visible, queued } = buildFeedbackQueue(items, 3);
      expect(visible).toHaveLength(3);
      expect(queued).toHaveLength(2);
    });

    it('should exclude dismissed', () => {
      const items: FeedbackItem[] = [
        { id: '1', config: createFeedback({}), createdAt: Date.now(), dismissed: true },
        { id: '2', config: createFeedback({}), createdAt: Date.now(), dismissed: false },
      ];
      const { visible } = buildFeedbackQueue(items, 10);
      expect(visible).toHaveLength(1);
    });
  });

  describe('dismissFeedback', () => {
    it('should dismiss specific item', () => {
      const items: FeedbackItem[] = [
        { id: '1', config: createFeedback({}), createdAt: Date.now(), dismissed: false },
        { id: '2', config: createFeedback({}), createdAt: Date.now(), dismissed: false },
      ];
      const result = dismissFeedback(items, '1');
      expect(result[0].dismissed).toBe(true);
      expect(result[1].dismissed).toBe(false);
    });
  });

  describe('dismissAllFeedback', () => {
    it('should dismiss all', () => {
      const items: FeedbackItem[] = [
        { id: '1', config: createFeedback({}), createdAt: Date.now(), dismissed: false },
        { id: '2', config: createFeedback({}), createdAt: Date.now(), dismissed: false },
      ];
      const result = dismissAllFeedback(items);
      expect(result.every(i => i.dismissed)).toBe(true);
    });
  });

  describe('calcAnimationDuration', () => {
    it('should return durations for each animation', () => {
      expect(calcAnimationDuration('fade')).toBe(200);
      expect(calcAnimationDuration('slide')).toBe(300);
      expect(calcAnimationDuration('bounce')).toBe(400);
      expect(calcAnimationDuration('scale')).toBe(250);
    });
  });

  describe('buildKeyframes', () => {
    it('should return keyframes for each animation', () => {
      const fade = buildKeyframes('fade');
      expect(fade).toHaveLength(2);
      expect(fade[0].opacity).toBe(0);

      const bounce = buildKeyframes('bounce');
      expect(bounce.length).toBeGreaterThan(2);
    });
  });

  describe('isFeedbackDuplicate', () => {
    it('should detect duplicates', () => {
      const a: FeedbackItem = { id: '1', config: createFeedback({ type: 'info', message: 'hi' }), createdAt: 0, dismissed: false };
      const b: FeedbackItem = { id: '2', config: createFeedback({ type: 'info', message: 'hi' }), createdAt: 0, dismissed: false };
      expect(isFeedbackDuplicate(a, b)).toBe(true);
    });

    it('should not flag different messages', () => {
      const a: FeedbackItem = { id: '1', config: createFeedback({ type: 'info', message: 'a' }), createdAt: 0, dismissed: false };
      const b: FeedbackItem = { id: '2', config: createFeedback({ type: 'info', message: 'b' }), createdAt: 0, dismissed: false };
      expect(isFeedbackDuplicate(a, b)).toBe(false);
    });
  });

  describe('deduplicateFeedback', () => {
    it('should remove duplicates keeping first', () => {
      const items: FeedbackItem[] = [
        { id: '1', config: createFeedback({ type: 'info', message: 'hi' }), createdAt: 0, dismissed: false },
        { id: '2', config: createFeedback({ type: 'info', message: 'hi' }), createdAt: 0, dismissed: false },
        { id: '3', config: createFeedback({ type: 'error', message: 'hi' }), createdAt: 0, dismissed: false },
      ];
      const result = deduplicateFeedback(items);
      expect(result).toHaveLength(2);
    });
  });
});
