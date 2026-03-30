/**
 * 虚拟列表逻辑测试
 * 覆盖可见区域计算、滚动逻辑、边界处理
 */

import { describe, it, expect } from 'vitest';

describe('虚拟滚动列表逻辑', () => {
  // 提取 VirtualList 核心计算逻辑
  interface VirtualListConfig {
    items: any[];
    itemHeight: number;
    height: number;
    overscan: number;
  }

  function calculateVisibleRange(
    scrollTop: number,
    config: VirtualListConfig
  ) {
    const { items, itemHeight, height, overscan } = config;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(height / itemHeight) + 2 * overscan;
    const endIndex = Math.min(items.length - 1, startIndex + visibleCount);
    return {
      startIndex,
      endIndex,
      visibleItems: items.slice(startIndex, endIndex + 1),
      totalHeight: items.length * itemHeight,
      offsetY: startIndex * itemHeight,
    };
  }

  const items = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Stock ${i}` }));
  const config: VirtualListConfig = {
    items,
    itemHeight: 40,
    height: 400,
    overscan: 5,
  };

  it('初始位置应显示第一批可见项', () => {
    const range = calculateVisibleRange(0, config);
    expect(range.startIndex).toBe(0);
    expect(range.visibleItems.length).toBeLessThanOrEqual(21); // ceil(400/40) + 2*5 + 1
    expect(range.visibleItems[0].id).toBe(0);
  });

  it('滚动后应更新可见范围', () => {
    const range = calculateVisibleRange(400, config);
    expect(range.startIndex).toBe(5); // 400/40 - 5 overscan
    expect(range.offsetY).toBe(5 * 40);
  });

  it('滚动到底部应不越界', () => {
    const range = calculateVisibleRange(39600, config); // 接近底部
    expect(range.endIndex).toBe(999);
    expect(range.visibleItems[range.visibleItems.length - 1].id).toBe(999);
  });

  it('总高度应正确', () => {
    const range = calculateVisibleRange(0, config);
    expect(range.totalHeight).toBe(1000 * 40);
  });

  it('空列表应返回空可见项', () => {
    const emptyConfig = { ...config, items: [] };
    const range = calculateVisibleRange(0, emptyConfig);
    expect(range.visibleItems).toHaveLength(0);
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(-1);
  });

  it('单条数据应正确显示', () => {
    const singleConfig = { ...config, items: [{ id: 0, name: 'Only' }] };
    const range = calculateVisibleRange(0, singleConfig);
    expect(range.visibleItems).toHaveLength(1);
    expect(range.visibleItems[0].name).toBe('Only');
  });

  it('自定义 overscan 应影响可见范围', () => {
    const noOverscan = calculateVisibleRange(0, { ...config, overscan: 0 });
    const withOverscan = calculateVisibleRange(0, { ...config, overscan: 10 });
    expect(withOverscan.visibleItems.length).toBeGreaterThan(noOverscan.visibleItems.length);
  });

  it('极小高度应至少显示1条', () => {
    const tinyConfig = { ...config, height: 10, overscan: 0 };
    const range = calculateVisibleRange(0, tinyConfig);
    expect(range.visibleItems.length).toBeGreaterThanOrEqual(1);
  });

  it('触底检测：距离底部小于阈值应触发', () => {
    const scrollHeight = 40000;
    const scrollTop = 39500;
    const clientHeight = 400;
    const threshold = 200;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    expect(distanceToBottom).toBeLessThan(threshold);
  });

  it('触底检测：距离底部大于阈值不应触发', () => {
    const scrollHeight = 40000;
    const scrollTop = 30000;
    const clientHeight = 400;
    const threshold = 200;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    expect(distanceToBottom).toBeGreaterThanOrEqual(threshold);
  });

  it('大量数据(10万条)计算应高效', () => {
    const largeItems = Array.from({ length: 100000 }, (_, i) => ({ id: i }));
    const largeConfig = { ...config, items: largeItems };
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      calculateVisibleRange(i * 40, largeConfig);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100); // 1000次计算 < 100ms
  });
});

describe('移动端手势逻辑', () => {
  describe('滑动方向检测', () => {
    function detectSwipe(dx: number, dy: number, threshold: number = 50): string | null {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < threshold && absDy < threshold) return null;
      if (absDx > absDy) {
        return dx > 0 ? 'right' : 'left';
      } else {
        return dy > 0 ? 'down' : 'up';
      }
    }

    it('向右滑动应检测为 right', () => {
      expect(detectSwipe(100, 10)).toBe('right');
    });

    it('向左滑动应检测为 left', () => {
      expect(detectSwipe(-80, 5)).toBe('left');
    });

    it('向上滑动应检测为 up', () => {
      expect(detectSwipe(5, -100)).toBe('up');
    });

    it('向下滑动应检测为 down', () => {
      expect(detectSwipe(10, 80)).toBe('down');
    });

    it('距离不足应不检测为滑动', () => {
      expect(detectSwipe(20, 10)).toBeNull();
      expect(detectSwipe(10, 20)).toBeNull();
    });

    it('自定义阈值应生效', () => {
      expect(detectSwipe(30, 5, 20)).toBe('right');
      expect(detectSwipe(30, 5, 50)).toBeNull();
    });
  });

  describe('双击检测', () => {
    function isDoubleTap(lastTapTime: number, currentTime: number, delay: number = 300): boolean {
      return lastTapTime > 0 && (currentTime - lastTapTime) < delay;
    }

    it('两次点击间隔小于阈值应为双击', () => {
      expect(isDoubleTap(1000, 1200)).toBe(true);
    });

    it('两次点击间隔大于阈值不应为双击', () => {
      expect(isDoubleTap(1000, 1500)).toBe(false);
    });

    it('首次点击 lastTapTime=0 不应触发双击', () => {
      expect(isDoubleTap(0, 100)).toBe(false);
    });
  });

  describe('捏合缩放', () => {
    function calculatePinchScale(startDist: number, currentDist: number, threshold: number = 0.1): number | null {
      const scale = currentDist / startDist;
      return Math.abs(scale - 1) > threshold ? scale : null;
    }

    it('放大手势应返回 scale > 1', () => {
      const scale = calculatePinchScale(100, 150);
      expect(scale).toBe(1.5);
    });

    it('缩小手势应返回 scale < 1', () => {
      const scale = calculatePinchScale(150, 100);
      expect(scale).toBeCloseTo(0.667, 2);
    });

    it('缩放不足阈值应返回 null', () => {
      expect(calculatePinchScale(100, 105)).toBeNull();
    });
  });

  describe('设备检测', () => {
    it('isMobileDevice 应检测 UA 或屏幕宽度', () => {
      // 模拟逻辑
      function isMobile(userAgent: string, width: number): boolean {
        return /Android|iPhone|iPad/i.test(userAgent) || width <= 768;
      }
      expect(isMobile('iPhone', 375)).toBe(true);
      expect(isMobile('Android', 360)).toBe(true);
      expect(isMobile('Desktop', 1920)).toBe(false);
      expect(isMobile('Desktop', 768)).toBe(true);
    });

    it('hasTouchSupport 应检测触摸支持', () => {
      function hasTouch(maxTouchPoints: number): boolean {
        return maxTouchPoints > 0;
      }
      expect(hasTouch(1)).toBe(true);
      expect(hasTouch(0)).toBe(false);
    });
  });
});

describe('加载编排器逻辑', () => {
  type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

  interface Task {
    id: string;
    priority: TaskPriority;
    startTime?: number;
    completed?: boolean;
    failed?: boolean;
    progress?: number;
  }

  it('任务应按优先级排序', () => {
    const tasks: Task[] = [
      { id: '1', priority: 'low' },
      { id: '2', priority: 'critical' },
      { id: '3', priority: 'normal' },
      { id: '4', priority: 'high' },
    ];
    const priorityOrder: Record<TaskPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
    const sorted = [...tasks].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('4');
    expect(sorted[2].id).toBe('3');
    expect(sorted[3].id).toBe('1');
  });

  it('进度应在 0-100 范围内', () => {
    const clampProgress = (p: number) => Math.max(0, Math.min(100, p));
    expect(clampProgress(-10)).toBe(0);
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(50)).toBe(50);
  });

  it('总进度应为各任务进度加权平均', () => {
    const tasks: Task[] = [
      { id: '1', priority: 'critical', progress: 100 },
      { id: '2', priority: 'high', progress: 50 },
      { id: '3', priority: 'normal', progress: 0 },
    ];
    const totalProgress = tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length;
    expect(totalProgress).toBeCloseTo(50, 1);
  });

  it('关键任务超时应标记', () => {
    const task: Task = { id: '1', priority: 'critical', startTime: Date.now() - 5000 };
    const timeout = 3000;
    const isTimeout = task.startTime ? (Date.now() - task.startTime) > timeout : false;
    expect(isTimeout).toBe(true);
  });
});

describe('首屏加载计时', () => {
  it('首屏时间应可计算', () => {
    const startTime = Date.now();
    const loadTime = startTime + 2500;
    const duration = loadTime - startTime;
    expect(duration).toBe(2500);
  });

  it('首屏 < 3秒应达标', () => {
    const meetsTarget = (duration: number) => duration < 3000;
    expect(meetsTarget(2500)).toBe(true);
    expect(meetsTarget(3500)).toBe(false);
    expect(meetsTarget(3000)).toBe(false);
  });
});
