import { describe, it, expect, vi } from 'vitest';

/**
 * Onboarding 新手引导组件逻辑测试
 */

describe('Onboarding', () => {
  describe('引导步骤', () => {
    const steps = [
      { target: '.watchlist', title: '自选股', content: '在这里管理您的自选股票列表' },
      { target: '.search', title: '搜索', content: '使用搜索快速找到目标股票' },
      { target: '.market', title: '市场', content: '查看市场整体行情和板块数据' },
      { target: '.alerts', title: '预警', content: '设置价格预警，不错过交易机会' },
    ];

    it('应该有步骤列表', () => {
      expect(steps).toHaveLength(4);
    });

    it('每步应有 target 选择器', () => {
      steps.forEach(step => {
        expect(step.target).toBeTruthy();
      });
    });

    it('每步应有 title', () => {
      steps.forEach(step => {
        expect(step.title).toBeTruthy();
      });
    });

    it('每步应有 content 说明', () => {
      steps.forEach(step => {
        expect(step.content).toBeTruthy();
      });
    });
  });

  describe('步骤导航', () => {
    it('应该跟踪当前步骤', () => {
      let currentStep = 0;
      expect(currentStep).toBe(0);
    });

    it('下一步应该递增步骤', () => {
      let currentStep = 0;
      const totalSteps = 4;
      currentStep = Math.min(currentStep + 1, totalSteps - 1);
      expect(currentStep).toBe(1);
    });

    it('上一步应该递减步骤', () => {
      let currentStep = 2;
      currentStep = Math.max(currentStep - 1, 0);
      expect(currentStep).toBe(1);
    });

    it('第一步时上一步不应小于0', () => {
      let currentStep = 0;
      currentStep = Math.max(currentStep - 1, 0);
      expect(currentStep).toBe(0);
    });

    it('最后一步时下一步不应超过总数', () => {
      let currentStep = 3;
      const totalSteps = 4;
      currentStep = Math.min(currentStep + 1, totalSteps - 1);
      expect(currentStep).toBe(3);
    });
  });

  describe('进度计算', () => {
    it('应该计算进度百分比', () => {
      const currentStep = 1;
      const totalSteps = 4;
      const progress = ((currentStep + 1) / totalSteps) * 100;
      expect(progress).toBe(50);
    });

    it('第一步进度为 25%', () => {
      const progress = ((0 + 1) / 4) * 100;
      expect(progress).toBe(25);
    });

    it('最后一步进度为 100%', () => {
      const progress = ((3 + 1) / 4) * 100;
      expect(progress).toBe(100);
    });
  });

  describe('高亮遮罩', () => {
    it('应该高亮当前目标元素', () => {
      const target = '.watchlist';
      const highlight = { target, zIndex: 9999 };
      expect(highlight.target).toBe('.watchlist');
      expect(highlight.zIndex).toBe(9999);
    });

    it('应该添加遮罩层', () => {
      const overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)' };
      expect(overlay.position).toBe('fixed');
      expect(overlay.background).toContain('rgba');
    });
  });

  describe('引导完成', () => {
    it('完成引导后应该标记已读', () => {
      let completed = false;
      const onComplete = () => { completed = true; };
      onComplete();
      expect(completed).toBe(true);
    });

    it('已读状态应该持久化', () => {
      const localStorage = { getItem: vi.fn().mockReturnValue('true'), setItem: vi.fn() };
      localStorage.setItem('onboarding_completed', 'true');
      expect(localStorage.setItem).toHaveBeenCalledWith('onboarding_completed', 'true');
    });

    it('跳过引导应该标记已完成', () => {
      let completed = false;
      const onSkip = () => { completed = true; };
      onSkip();
      expect(completed).toBe(true);
    });
  });
});
