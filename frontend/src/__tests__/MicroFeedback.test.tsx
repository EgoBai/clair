/**
 * MicroFeedback 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  SuccessCheck,
  LoadingDots,
  NumberFlip,
  MicroFeedback,
} from '../components/Common/MicroFeedback';

describe('MicroFeedback', () => {
  describe('SuccessCheck', () => {
    it('渲染SVG勾选动画', () => {
      const { container } = render(<SuccessCheck />);
      const svg = container.querySelector('svg');
      expect(svg).toBeDefined();
    });

    it('支持自定义尺寸', () => {
      const { container } = render(<SuccessCheck size={48} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('48');
      expect(svg?.getAttribute('height')).toBe('48');
    });

    it('支持自定义颜色', () => {
      const { container } = render(<SuccessCheck color="#ff0000" />);
      const circles = container.querySelectorAll('circle');
      expect(circles[0].getAttribute('stroke')).toBe('#ff0000');
    });

    it('默认颜色为绿色', () => {
      const { container } = render(<SuccessCheck />);
      const circles = container.querySelectorAll('circle');
      expect(circles[0].getAttribute('stroke')).toBe('#10b981');
    });
  });

  describe('LoadingDots', () => {
    it('渲染3个加载点', () => {
      const { container } = render(<LoadingDots />);
      const dots = container.querySelectorAll('span span');
      expect(dots.length).toBe(3);
    });

    it('支持自定义颜色', () => {
      const { container } = render(<LoadingDots color="#333" />);
      const dots = container.querySelectorAll('span span');
      // jsdom 会把 #333 转成 rgb(51, 51, 51)
      expect(dots[0].style.backgroundColor).toBe('rgb(51, 51, 51)');
    });

    it('默认颜色为#666', () => {
      const { container } = render(<LoadingDots />);
      const dots = container.querySelectorAll('span span');
      // jsdom 会把 #666 转成 rgb(102, 102, 102)
      expect(dots[0].style.backgroundColor).toBe('rgb(102, 102, 102)');
    });
  });

  describe('NumberFlip', () => {
    it('渲染数字', () => {
      render(<NumberFlip value={42} />);
      expect(screen.getByText('42')).toBeDefined();
    });

    it('支持自定义格式化', () => {
      render(<NumberFlip value={0.856} formatter={(v) => `${(v * 100).toFixed(1)}%`} />);
      expect(screen.getByText('85.6%')).toBeDefined();
    });

    it('支持colorize属性', () => {
      render(<NumberFlip value={5} colorize />);
      expect(screen.getByText('5')).toBeDefined();
    });
  });

  describe('MicroFeedback', () => {
    it('渲染子组件', () => {
      render(
        <MicroFeedback>
          <button>点击我</button>
        </MicroFeedback>
      );
      expect(screen.getByText('点击我')).toBeDefined();
    });

    it('type=none直接渲染子组件', () => {
      render(
        <MicroFeedback type="none">
          <button>按钮</button>
        </MicroFeedback>
      );
      expect(screen.getByText('按钮')).toBeDefined();
    });

    it('type=tap时添加交互样式', () => {
      const { container } = render(
        <MicroFeedback type="tap">
          <div>交互元素</div>
        </MicroFeedback>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.cursor).toBe('pointer');
    });

    it('type=hover时添加交互样式', () => {
      const { container } = render(
        <MicroFeedback type="hover">
          <div>悬停元素</div>
        </MicroFeedback>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.cursor).toBe('pointer');
    });

    it('支持自定义className', () => {
      const { container } = render(
        <MicroFeedback className="custom-feedback">
          <div>内容</div>
        </MicroFeedback>
      );
      expect(container.querySelector('.custom-feedback')).toBeDefined();
    });

    it('mousedown时缩小效果', () => {
      const { container } = render(
        <MicroFeedback type="tap">
          <div>可点击</div>
        </MicroFeedback>
      );
      const wrapper = container.firstChild as HTMLElement;
      fireEvent.mouseDown(wrapper);
      expect(wrapper.style.transform).toBe('scale(0.97)');
    });

    it('mouseup时恢复大小', () => {
      const { container } = render(
        <MicroFeedback type="tap">
          <div>可点击</div>
        </MicroFeedback>
      );
      const wrapper = container.firstChild as HTMLElement;
      fireEvent.mouseDown(wrapper);
      fireEvent.mouseUp(wrapper);
      expect(wrapper.style.transform).toBe('scale(1)');
    });
  });
});
