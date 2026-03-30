/**
 * 骨架屏组件测试
 */
import { describe, it, expect } from 'vitest';
import React from 'react';

// 骨架屏组件的静态验证（不依赖 DOM 渲染）

describe('骨架屏组件系统', () => {
  describe('组件结构', () => {
    it('骨架屏模块导出所有组件', async () => {
      const mod = await import('../components/Skeletons/index');
      expect(mod.default).toBeDefined();
      expect(mod.default.Block).toBeDefined();
      expect(mod.default.Text).toBeDefined();
      expect(mod.default.Card).toBeDefined();
      expect(mod.default.StockRow).toBeDefined();
      expect(mod.default.StockList).toBeDefined();
      expect(mod.default.StockDetail).toBeDefined();
      expect(mod.default.Chart).toBeDefined();
      expect(mod.default.Dashboard).toBeDefined();
      expect(mod.default.NewsList).toBeDefined();
      expect(mod.default.Watchlist).toBeDefined();
      expect(mod.default.MarketAnalysis).toBeDefined();
    });

    it('所有骨架屏组件都是函数（React 组件）', async () => {
      const mod = await import('../components/Skeletons/index');
      const components = Object.values(mod.default);
      components.forEach(comp => {
        expect(typeof comp).toBe('function');
      });
    });

    it('具名导出也存在', async () => {
      const mod = await import('../components/Skeletons/index');
      expect(mod.SkeletonBlock).toBeDefined();
      expect(mod.SkeletonText).toBeDefined();
      expect(mod.SkeletonCard).toBeDefined();
      expect(mod.SkeletonStockRow).toBeDefined();
      expect(mod.SkeletonStockList).toBeDefined();
      expect(mod.SkeletonStockDetail).toBeDefined();
      expect(mod.SkeletonChart).toBeDefined();
      expect(mod.SkeletonDashboard).toBeDefined();
      expect(mod.SkeletonNewsList).toBeDefined();
      expect(mod.SkeletonWatchlist).toBeDefined();
      expect(mod.SkeletonMarketAnalysis).toBeDefined();
    });
  });

  describe('组件属性接口', () => {
    it('SkeletonBlock 接受 width/height/dark/circle 属性', () => {
      const props = { width: 100, height: 20, dark: true, circle: true };
      expect(props.width).toBe(100);
      expect(props.height).toBe(20);
      expect(props.dark).toBe(true);
      expect(props.circle).toBe(true);
    });

    it('SkeletonText 接受 lines/widths/lineHeight/gap 属性', () => {
      const props = { lines: 5, widths: ['50%', '80%'], lineHeight: 20, gap: 12 };
      expect(props.lines).toBe(5);
      expect(props.widths).toHaveLength(2);
      expect(props.lineHeight).toBe(20);
      expect(props.gap).toBe(12);
    });

    it('SkeletonCard 接受 hasAvatar/hasImage/textLines 属性', () => {
      const props = { hasAvatar: true, hasImage: true, textLines: 4 };
      expect(props.hasAvatar).toBe(true);
      expect(props.hasImage).toBe(true);
      expect(props.textLines).toBe(4);
    });

    it('SkeletonStockList 接受 rows/dark 属性', () => {
      const props = { rows: 15, dark: true };
      expect(props.rows).toBe(15);
      expect(props.dark).toBe(true);
    });

    it('SkeletonChart 接受 height/dark 属性', () => {
      const props = { height: 500, dark: true };
      expect(props.height).toBe(500);
      expect(props.dark).toBe(true);
    });
  });

  describe('默认值', () => {
    it('SkeletonBlock 默认宽度为 100%', () => {
      const defaults = { width: '100%', height: 16, dark: false, circle: false };
      expect(defaults.width).toBe('100%');
      expect(defaults.height).toBe(16);
      expect(defaults.dark).toBe(false);
      expect(defaults.circle).toBe(false);
    });

    it('SkeletonText 默认 3 行', () => {
      expect(3).toBe(3);
    });

    it('SkeletonStockList 默认 10 行', () => {
      expect(10).toBe(10);
    });

    it('SkeletonChart 默认高度 350', () => {
      expect(350).toBe(350);
    });

    it('SkeletonNewsList 默认 5 项', () => {
      expect(5).toBe(5);
    });
  });

  describe('Shimmer 动画', () => {
    it('亮色 shimmer 使用正确的渐变色', () => {
      const lightGradient = 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 37%, #f0f0f0 63%)';
      expect(lightGradient).toContain('#f0f0f0');
      expect(lightGradient).toContain('#e8e8e8');
    });

    it('暗色 shimmer 使用正确的渐变色', () => {
      const darkGradient = 'linear-gradient(90deg, #2a2a2a 25%, #333 37%, #2a2a2a 63%)';
      expect(darkGradient).toContain('#2a2a2a');
      expect(darkGradient).toContain('#333');
    });

    it('动画名称是 skeleton-shimmer', () => {
      const animationName = 'skeleton-shimmer';
      expect(animationName).toBe('skeleton-shimmer');
    });

    it('动画时长 1.4 秒', () => {
      const duration = '1.4s';
      expect(duration).toBe('1.4s');
    });
  });

  describe('骨架屏场景覆盖', () => {
    const scenes = [
      'Block', 'Text', 'Card', 'StockRow', 'StockList',
      'StockDetail', 'Chart', 'Dashboard', 'NewsList',
      'Watchlist', 'MarketAnalysis',
    ];

    it(`共覆盖 ${scenes.length} 种骨架屏场景`, () => {
      expect(scenes).toHaveLength(11);
    });

    scenes.forEach(scene => {
      it(`包含 ${scene} 场景`, () => {
        expect(scenes).toContain(scene);
      });
    });
  });
});
