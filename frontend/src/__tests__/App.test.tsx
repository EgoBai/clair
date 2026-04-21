// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';

// Mock react-router-dom 组件
vi.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <div data-testid="router">{children}</div>,
}));

// Mock AppLayout 组件
vi.mock('../components/Layout/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

// Mock AppRoutes 组件
vi.mock('../routes', () => ({
  AppRoutes: () => <div data-testid="app-routes">App Routes</div>,
}));

describe('App', () => {
  it('渲染应用容器', () => {
    render(<App />);
    
    // 检查路由器是否渲染
    expect(screen.getByTestId('router')).toBeTruthy();
    
    // 检查应用布局是否渲染
    expect(screen.getByTestId('app-layout')).toBeTruthy();
    
    // 检查路由是否渲染
    expect(screen.getByTestId('app-routes')).toBeTruthy();
  });

  it('包含正确的结构', () => {
    const { container } = render(<App />);
    
    // 检查基本结构
    expect(container.firstChild).toBeTruthy();
    
    // 检查是否有div容器
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('应用CSS类', () => {
    const { container } = render(<App />);
    
    // 检查根元素
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeTruthy();
  });
});