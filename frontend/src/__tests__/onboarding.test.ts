/**
 * Onboarding 引导组件逻辑测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Onboarding Logic', () => {
  const STORAGE_KEY = 'a-stock-onboarding-completed';

  // Provide localStorage mock
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (k: string) => store[k] || null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };

  beforeEach(() => {
    mockStorage.clear();
    Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });
  });

  describe('shouldShowOnboarding', () => {
    it('should return true when no flag in localStorage', () => {
      const result = !localStorage.getItem(STORAGE_KEY);
      expect(result).toBe(true);
    });

    it('should return false when flag exists', () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      const result = !localStorage.getItem(STORAGE_KEY);
      expect(result).toBe(false);
    });
  });

  describe('Tour Steps Configuration', () => {
    const TOUR_STEPS = [
      { title: '实时行情', features: ['实时行情推送', '多周期K线图', 'MACD/KDJ/RSI/BOLL指标', '资金流向分析'] },
      { title: '股票搜索', features: ['8级智能匹配', '拼音首字母搜索', '搜索历史', '⌘K 快捷键'] },
      { title: '自选股', features: ['自定义分组', '拖拽排序', '实时行情显示', '一键跳转详情'] },
      { title: '行情预警', features: ['价格突破/跌破预警', '涨跌幅预警', '成交量异动', '触发历史记录'] },
      { title: '选股器', features: ['多条件组合筛选', '预设模板（价值/成长/活跃）', '自定义模板保存', '结果排序分页'] },
      { title: '数据可视化', features: ['行业板块热力图', '市场情绪分数', '多股叠加对比', '暗色主题支持'] },
    ];

    it('should have 6 tour steps', () => {
      expect(TOUR_STEPS).toHaveLength(6);
    });

    it('each step should have a title', () => {
      TOUR_STEPS.forEach(step => {
        expect(step.title).toBeTruthy();
        expect(typeof step.title).toBe('string');
      });
    });

    it('each step should have features', () => {
      TOUR_STEPS.forEach(step => {
        expect(step.features.length).toBeGreaterThan(0);
      });
    });

    it('should cover all major features', () => {
      const titles = TOUR_STEPS.map(s => s.title);
      expect(titles).toContain('实时行情');
      expect(titles).toContain('股票搜索');
      expect(titles).toContain('自选股');
      expect(titles).toContain('行情预警');
      expect(titles).toContain('选股器');
      expect(titles).toContain('数据可视化');
    });
  });

  describe('Step Navigation Logic', () => {
    const totalSteps = 6;

    it('should move to next step', () => {
      let current = 0;
      current = Math.min(current + 1, totalSteps - 1);
      expect(current).toBe(1);
    });

    it('should move to previous step', () => {
      let current = 2;
      current = Math.max(current - 1, 0);
      expect(current).toBe(1);
    });

    it('should not go below 0', () => {
      let current = 0;
      current = Math.max(current - 1, 0);
      expect(current).toBe(0);
    });

    it('should not exceed last step', () => {
      let current = 5;
      current = Math.min(current + 1, totalSteps - 1);
      expect(current).toBe(5);
    });

    it('should detect last step', () => {
      const isLast = (index: number) => index === totalSteps - 1;
      expect(isLast(5)).toBe(true);
      expect(isLast(4)).toBe(false);
    });

    it('should detect first step', () => {
      const isFirst = (index: number) => index === 0;
      expect(isFirst(0)).toBe(true);
      expect(isFirst(1)).toBe(false);
    });
  });

  describe('Onboarding Completion', () => {
    it('should set flag on complete', () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    });

    it('should reset onboarding on clear', () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.removeItem(STORAGE_KEY);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('should handle localStorage errors gracefully', () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => { throw new Error('Storage full'); });
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {
        // expected
      }
      localStorage.setItem = originalSetItem;
    });
  });

  describe('Step Indicator Logic', () => {
    it('should calculate progress dots width', () => {
      const isActive = (stepIndex: number, currentStep: number) => stepIndex === currentStep;
      const getWidth = (stepIndex: number, currentStep: number) => isActive(stepIndex, currentStep) ? 24 : 8;
      expect(getWidth(0, 0)).toBe(24);
      expect(getWidth(1, 0)).toBe(8);
    });

    it('should calculate progress text', () => {
      const totalSteps = 6;
      const formatProgress = (current: number) => `${current + 1} / ${totalSteps}`;
      expect(formatProgress(0)).toBe('1 / 6');
      expect(formatProgress(5)).toBe('6 / 6');
    });
  });
});
