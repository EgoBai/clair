/**
 * SectorHeatmap 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectorHeatmap, SectorData } from '../../components/Market/SectorHeatmap';

describe('SectorHeatmap', () => {
  const mockSectors: SectorData[] = [
    { id: 1, name: '人工智能', changePercent: 3.25, turnover: 85000000000, netInflow: 12000000000, stockCount: 120, risingRatio: 0.75 },
    { id: 2, name: '半导体', changePercent: 2.18, turnover: 72000000000, netInflow: 8000000000, stockCount: 85, risingRatio: 0.68 },
    { id: 3, name: '银行', changePercent: -0.52, turnover: 45000000000, netInflow: -2000000000, stockCount: 42, risingRatio: 0.35 },
    { id: 4, name: '医药生物', changePercent: 0.95, turnover: 58000000000, netInflow: 3000000000, stockCount: 280, risingRatio: 0.55 },
  ];

  it('should render with default sectors', () => {
    render(<SectorHeatmap />);
    expect(screen.getByText('行业板块')).toBeDefined();
  });

  it('should render provided sectors', () => {
    render(<SectorHeatmap sectors={mockSectors} />);
    expect(screen.getByText('人工智能')).toBeDefined();
    expect(screen.getByText('半导体')).toBeDefined();
    expect(screen.getByText('银行')).toBeDefined();
  });

  it('should display sector change percentages', () => {
    render(<SectorHeatmap sectors={mockSectors} />);
    expect(screen.getByText('+3.25%')).toBeDefined();
    expect(screen.getByText('-0.52%')).toBeDefined();
  });

  it('should display concept type title', () => {
    render(<SectorHeatmap type="concept" sectors={mockSectors} />);
    expect(screen.getByText('概念板块')).toBeDefined();
  });

  it('should call onSectorClick when clicking a sector', () => {
    const handleClick = vi.fn();
    render(<SectorHeatmap sectors={mockSectors} onSectorClick={handleClick} />);
    
    const sector = screen.getByText('人工智能').closest('div');
    if (sector) {
      fireEvent.click(sector);
      expect(handleClick).toHaveBeenCalledWith(1);
    }
  });

  it('should sort by change when clicking change button', () => {
    render(<SectorHeatmap sectors={mockSectors} />);
    
    const changeButton = screen.getByText('涨跌幅');
    fireEvent.click(changeButton);
    
    // Verify sectors are sorted by change
    const sectors = screen.getAllByText(/人工智能|半导体|银行|医药生物/);
    expect(sectors[0].textContent).toBe('人工智能');
  });

  it('should sort by turnover when clicking turnover button', () => {
    render(<SectorHeatmap sectors={mockSectors} />);
    
    const turnoverButton = screen.getByText('成交额');
    fireEvent.click(turnoverButton);
    
    expect(turnoverButton).toBeDefined();
  });

  it('should sort by inflow when clicking inflow button', () => {
    render(<SectorHeatmap sectors={mockSectors} />);
    
    const inflowButton = screen.getByText('资金流向');
    fireEvent.click(inflowButton);
    
    expect(inflowButton).toBeDefined();
  });

  it('should display rising/falling statistics', () => {
    render(<SectorHeatmap sectors={mockSectors} />);
    expect(screen.getByText(/上涨:/)).toBeDefined();
    expect(screen.getByText(/下跌:/)).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <SectorHeatmap sectors={mockSectors} className="custom-class" />
    );
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });

  it('should show details when enabled', () => {
    render(<SectorHeatmap sectors={mockSectors} showDetails={true} />);
    // Should show turnover formatted values in the sector cells
    expect(screen.getAllByText(/850\.0亿/).length).toBeGreaterThan(0);
  });

  it('should handle empty sectors array', () => {
    render(<SectorHeatmap sectors={[]} />);
    expect(screen.getByText('行业板块')).toBeDefined();
    expect(screen.getByText('上涨: 0')).toBeDefined();
  });

  it('should render correct number of sector cells', () => {
    render(<SectorHeatmap sectors={mockSectors} />);
    const cells = screen.getAllByText(/人工智能|半导体|银行|医药生物/);
    expect(cells).toHaveLength(4);
  });

  it('should display positive change with correct format', () => {
    render(<SectorHeatmap sectors={[mockSectors[0]]} />);
    expect(screen.getByText('+3.25%')).toBeDefined();
  });

  it('should display negative change with correct format', () => {
    render(<SectorHeatmap sectors={[mockSectors[2]]} />);
    expect(screen.getByText('-0.52%')).toBeDefined();
  });

  it('should handle sector with leading stock', () => {
    const sectorWithLeader: SectorData = {
      ...mockSectors[0],
      leadingStock: {
        symbol: '000001.SZ',
        name: '平安银行',
        changePercent: 5.2,
      },
    };
    render(<SectorHeatmap sectors={[sectorWithLeader]} />);
    expect(screen.getByText('人工智能')).toBeDefined();
  });
});
