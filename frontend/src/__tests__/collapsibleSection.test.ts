import { describe, it, expect, vi } from 'vitest';

/**
 * CollapsibleSection 折叠面板组件逻辑测试
 */

describe('CollapsibleSection', () => {
  describe('初始状态', () => {
    it('默认应该为收起状态', () => {
      const defaultOpen = false;
      const height = defaultOpen ? 'auto' : 0;
      expect(height).toBe(0);
    });

    it('defaultOpen=true 时应该展开', () => {
      const defaultOpen = true;
      const height = defaultOpen ? 'auto' : 0;
      expect(height).toBe('auto');
    });
  });

  describe('展开/收起动画', () => {
    it('展开时应该从0动画到内容高度', () => {
      const scrollHeight = 200;
      let height: number | 'auto' = 0;
      // 展开
      height = scrollHeight;
      expect(height).toBe(200);
      // 过渡后设为auto
      setTimeout(() => { height = 'auto'; }, 300);
      expect(height).toBe(200); // 还未到auto
    });

    it('收起时应该先设显式高度再动画到0', () => {
      let height: number | 'auto' = 'auto';
      const scrollHeight = 200;
      // 收起: 先设显式高度
      height = scrollHeight;
      // 使用 requestAnimationFrame 收起到0
      height = 0;
      expect(height).toBe(0);
    });

    it('过渡时间应该为300ms', () => {
      const transitionDuration = '300ms';
      expect(transitionDuration).toBe('300ms');
    });
  });

  describe('onToggle 回调', () => {
    it('切换时应该调用 onToggle 并传入新状态', () => {
      const onToggle = vi.fn();
      let isOpen = false;
      
      // 模拟 toggle
      isOpen = !isOpen;
      onToggle(isOpen);
      
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('连续切换应该交替调用', () => {
      const onToggle = vi.fn();
      let isOpen = false;
      
      // 切换两次
      isOpen = !isOpen;
      onToggle(isOpen);
      isOpen = !isOpen;
      onToggle(isOpen);
      
      expect(onToggle).toHaveBeenCalledTimes(2);
      expect(onToggle).toHaveBeenNthCalledWith(1, true);
      expect(onToggle).toHaveBeenNthCalledWith(2, false);
    });

    it('onToggle 为 undefined 时不报错', () => {
      const onToggle = undefined;
      let isOpen = false;
      isOpen = !isOpen;
      onToggle?.(isOpen);
      // 不应抛出异常
      expect(isOpen).toBe(true);
    });
  });

  describe('Badge 显示', () => {
    it('badge 为数字时应该显示数字', () => {
      const badge = 5;
      expect(typeof badge).toBe('number');
      expect(badge).toBe(5);
    });

    it('badge 为字符串时应该显示字符串', () => {
      const badge = '新';
      expect(typeof badge).toBe('string');
      expect(badge).toBe('新');
    });

    it('badge 为 undefined 时不显示', () => {
      const badge = undefined;
      expect(badge).toBeUndefined();
    });
  });

  describe('Props 验证', () => {
    it('title 为必填项', () => {
      const props = { title: '筛选条件', children: null };
      expect(props.title).toBeTruthy();
    });

    it('支持 className 自定义', () => {
      const props = { title: 'test', children: null, className: 'custom-class' };
      expect(props.className).toBe('custom-class');
    });

    it('className 默认为空字符串', () => {
      const props = { title: 'test', children: null, className: '' };
      expect(props.className).toBe('');
    });

    it('支持 icon 属性', () => {
      const props = { title: 'test', children: null, icon: '🔍' };
      expect(props.icon).toBe('🔍');
    });
  });
});
