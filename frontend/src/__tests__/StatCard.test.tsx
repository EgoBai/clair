/**
 * StatCard 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import StatCard from '../components/StatCard';

describe('StatCard', () => {
  it('渲染图标、数值和标签', () => {
    render(<StatCard icon="📈" value={1234} label="总市值" />);
    expect(screen.getByText('📈')).toBeDefined();
    expect(screen.getByText('1234')).toBeDefined();
    expect(screen.getByText('总市值')).toBeDefined();
  });

  it('支持字符串value', () => {
    render(<StatCard icon="%" value="85.6%" label="胜率" />);
    expect(screen.getByText('85.6%')).toBeDefined();
  });

  it('支持自定义className', () => {
    const { container } = render(
      <StatCard icon="📊" value={100} label="测试" className="custom-card" />
    );
    expect(container.querySelector('.custom-card')).toBeDefined();
  });

  it('默认className为空', () => {
    const { container } = render(
      <StatCard icon="📊" value={100} label="测试" />
    );
    const card = container.querySelector('.stat-card');
    expect(card).toBeDefined();
    expect(card?.className).toBe('stat-card ');
  });

  it('使用React.memo包装', () => {
    // React.memo 组件有 $$typeof 属性标记为 REACT_MEMO_TYPE
    expect((StatCard as any).$$typeof).toBeDefined();
  });
});
