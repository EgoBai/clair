// @vitest-environment jsdom
/**
 * CollapsibleSection 折叠面板组件测试
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import CollapsibleSection from '../components/Common/CollapsibleSection';

describe('CollapsibleSection', () => {
  it('should render title', () => {
    render(
      <CollapsibleSection title="测试面板">
        <div>内容</div>
      </CollapsibleSection>
    );
    expect(screen.getByText('测试面板')).toBeTruthy();
  });

  it('should render children', () => {
    render(
      <CollapsibleSection title="面板" defaultOpen={true}>
        <div data-testid="child">子内容</div>
      </CollapsibleSection>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('should toggle open/close on click', () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection title="面板" onToggle={onToggle}>
        <div>内容</div>
      </CollapsibleSection>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('should display badge when provided', () => {
    render(
      <CollapsibleSection title="面板" badge={5}>
        <div>内容</div>
      </CollapsibleSection>
    );
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('should display string badge', () => {
    render(
      <CollapsibleSection title="面板" badge="NEW">
        <div>内容</div>
      </CollapsibleSection>
    );
    expect(screen.getByText('NEW')).toBeTruthy();
  });

  it('should render icon when provided', () => {
    render(
      <CollapsibleSection title="面板" icon={<span data-testid="icon">📊</span>}>
        <div>内容</div>
      </CollapsibleSection>
    );
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('should start open when defaultOpen is true', () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection title="面板" defaultOpen={true} onToggle={onToggle}>
        <div>内容</div>
      </CollapsibleSection>
    );

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('should start closed when defaultOpen is false', () => {
    render(
      <CollapsibleSection title="面板" defaultOpen={false}>
        <div>内容</div>
      </CollapsibleSection>
    );

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <CollapsibleSection title="面板" className="custom-class">
        <div>内容</div>
      </CollapsibleSection>
    );
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });

  it('should not show badge when not provided', () => {
    render(
      <CollapsibleSection title="面板">
        <div>内容</div>
      </CollapsibleSection>
    );
    // Badge span should not be present
    const button = screen.getByRole('button');
    const badgeSpans = button.querySelectorAll('span');
    const hasBadge = Array.from(badgeSpans).some(s =>
      s.style.borderRadius === '10px'
    );
    expect(hasBadge).toBe(false);
  });
});
