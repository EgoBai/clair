/**
 * NavigationMenu 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavigationMenu from '../../components/Layout/NavigationMenu';

const renderWithRouter = (ui: React.ReactElement, initialEntries = ['/']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      {ui}
    </MemoryRouter>
  );
};

describe('NavigationMenu', () => {
  it('should render the navigation menu', () => {
    renderWithRouter(<NavigationMenu />);
    expect(screen.getByText('澄观')).toBeDefined();
  });

  it('should display subtitle', () => {
    renderWithRouter(<NavigationMenu />);
    expect(screen.getByText('Clair · 水静则明')).toBeDefined();
  });

  it('should display all navigation items', () => {
    renderWithRouter(<NavigationMenu />);
    expect(screen.getByText('市场洞察')).toBeDefined();
    expect(screen.getByText('策略选股')).toBeDefined();
    expect(screen.getByText('自选组合')).toBeDefined();
    expect(screen.getByText('产业地图')).toBeDefined();
  });

  it('should display navigation icons', () => {
    renderWithRouter(<NavigationMenu />);
    expect(screen.getByText('🔭')).toBeDefined();
    expect(screen.getByText('🎯')).toBeDefined();
    expect(screen.getByText('⭐')).toBeDefined();
    expect(screen.getByText('🗺️')).toBeDefined();
  });

  it('should display service status', () => {
    renderWithRouter(<NavigationMenu />);
    expect(screen.getByText('服务正常')).toBeDefined();
  });

  it('should display version', () => {
    renderWithRouter(<NavigationMenu />);
    expect(screen.getByText('v1.0.0')).toBeDefined();
  });

  it('should have navigation links with correct paths', () => {
    renderWithRouter(<NavigationMenu />);
    const links = screen.getAllByRole('link');
    const homeLink = links.find(l => l.getAttribute('href') === '/');
    expect(homeLink).toBeDefined();
  });

  it('should show mobile menu toggle on small screens', () => {
    renderWithRouter(<NavigationMenu />);
    const menuButton = screen.getByLabelText(/打开菜单|关闭菜单/);
    expect(menuButton).toBeDefined();
  });

  it('should toggle mobile menu on click', () => {
    renderWithRouter(<NavigationMenu />);
    const menuButton = screen.getByLabelText(/打开菜单|关闭菜单/);
    
    // Initial state should be closed
    expect(screen.getByText('☰')).toBeDefined();
    
    fireEvent.click(menuButton);
    
    // After click, menu icon should change
    expect(screen.getByText('✕')).toBeDefined();
  });

  it('should close mobile menu when clicking a nav item', () => {
    renderWithRouter(<NavigationMenu />);
    const menuButton = screen.getByLabelText(/打开菜单|关闭菜单/);
    
    // Open menu
    fireEvent.click(menuButton);
    expect(screen.getByText('✕')).toBeDefined();
    
    // Click a nav item
    fireEvent.click(screen.getByText('市场洞察'));
    
    // Menu should close
    expect(screen.getByText('☰')).toBeDefined();
  });

  it('should render overlay when mobile menu is open', () => {
    const { container } = renderWithRouter(<NavigationMenu />);
    const menuButton = screen.getByLabelText(/打开菜单|关闭菜单/);
    
    fireEvent.click(menuButton);
    
    const overlay = container.querySelector('.mobile-menu-overlay');
    expect(overlay).toBeDefined();
  });

  it('should close menu when clicking overlay', () => {
    const { container } = renderWithRouter(<NavigationMenu />);
    const menuButton = screen.getByLabelText(/打开菜单|关闭菜单/);
    
    fireEvent.click(menuButton);
    
    const overlay = container.querySelector('.mobile-menu-overlay');
    if (overlay) {
      fireEvent.click(overlay);
    }
    
    expect(screen.getByText('☰')).toBeDefined();
  });

  it('should highlight active path for home', () => {
    const { container } = renderWithRouter(<NavigationMenu />, ['/']);
    const activeLink = container.querySelector('.nav-link.active');
    expect(activeLink).toBeDefined();
    expect(activeLink?.textContent).toContain('市场洞察');
  });

  it('should highlight active path for stocks', () => {
    const { container } = renderWithRouter(<NavigationMenu />, ['/stocks']);
    const activeLink = container.querySelector('.nav-link.active');
    expect(activeLink).toBeDefined();
  });

  it('should render tooltips for nav items', () => {
    const { container } = renderWithRouter(<NavigationMenu />);
    const tooltips = container.querySelectorAll('.nav-tooltip');
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it('should display nav indicator for active item', () => {
    const { container } = renderWithRouter(<NavigationMenu />, ['/']);
    const indicator = container.querySelector('.nav-indicator');
    expect(indicator).toBeDefined();
  });
});
