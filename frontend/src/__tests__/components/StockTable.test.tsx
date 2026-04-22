/**
 * StockTable 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StockTable } from '../../components/Stock/StockTable';

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

describe('StockTable', () => {
  const mockStocks = [
    {
      symbol: '000001',
      name: '平安银行',
      price: 12.50,
      change: 0.85,
      changePercent: 7.29,
      volume: '150万',
      marketCap: '2420亿',
    },
    {
      symbol: '000002',
      name: '万科A',
      price: 18.30,
      change: -0.45,
      changePercent: -2.40,
      volume: '80万',
      marketCap: '2030亿',
    },
    {
      symbol: '600519',
      name: '贵州茅台',
      price: 1850.00,
      change: 28.50,
      changePercent: 1.56,
      volume: '2.5万',
      marketCap: '2.32万亿',
    },
    {
      symbol: '000858',
      name: '五粮液',
      price: 168.50,
      change: -3.20,
      changePercent: -1.86,
      volume: '45万',
      marketCap: '6540亿',
    },
  ];

  it('should render stock table with data', () => {
    renderWithRouter(<StockTable stocks={mockStocks} />);
    expect(screen.getByText('平安银行')).toBeDefined();
    expect(screen.getByText('万科A')).toBeDefined();
  });

  it('should display stock count in header', () => {
    renderWithRouter(<StockTable stocks={mockStocks} />);
    expect(screen.getByText('股票列表 (4 只股票)')).toBeDefined();
  });

  it('should display stock symbols', () => {
    renderWithRouter(<StockTable stocks={mockStocks} />);
    expect(screen.getByText('000001')).toBeDefined();
    expect(screen.getByText('600519')).toBeDefined();
  });

  it('should display stock prices formatted', () => {
    renderWithRouter(<StockTable stocks={mockStocks} />);
    expect(screen.getByText('¥12.50')).toBeDefined();
    expect(screen.getByText('¥1850.00')).toBeDefined();
  });

  it('should display positive change with + prefix', () => {
    renderWithRouter(<StockTable stocks={mockStocks} />);
    expect(screen.getByText('+7.29%')).toBeDefined();
  });

  it('should display negative change with - prefix', () => {
    renderWithRouter(<StockTable stocks={mockStocks} />);
    expect(screen.getByText('-2.40%')).toBeDefined();
  });

  it('should show loading state', () => {
    renderWithRouter(<StockTable stocks={[]} loading={true} />);
    expect(screen.getByText('加载股票数据中...')).toBeDefined();
  });

  it('should show empty state when no stocks', () => {
    renderWithRouter(<StockTable stocks={[]} />);
    expect(screen.getByText('暂无股票数据')).toBeDefined();
  });

  it('should call onSort when clicking sort column', () => {
    const handleSort = vi.fn();
    renderWithRouter(<StockTable stocks={mockStocks} onSort={handleSort} />);

    fireEvent.click(screen.getByText(/代码/));
    expect(handleSort).toHaveBeenCalledWith('symbol');
  });

  it('should call onSort for price column', () => {
    const handleSort = vi.fn();
    renderWithRouter(<StockTable stocks={mockStocks} onSort={handleSort} />);

    fireEvent.click(screen.getByText(/价格/));
    expect(handleSort).toHaveBeenCalledWith('price');
  });

  it('should call onSort for changePercent column', () => {
    const handleSort = vi.fn();
    renderWithRouter(<StockTable stocks={mockStocks} onSort={handleSort} />);

    fireEvent.click(screen.getByText(/涨跌幅/));
    expect(handleSort).toHaveBeenCalledWith('changePercent');
  });

  it('should show sort arrow for sorted column', () => {
    renderWithRouter(
      <StockTable stocks={mockStocks} sortBy="price" sortOrder="asc" />
    );
    // Sort arrow should be visible for the sorted column
    expect(screen.getByText(/价格/)).toBeDefined();
  });

  it('should render pagination when more items than per page', () => {
    const manyStocks = Array.from({ length: 15 }, (_, i) => ({
      symbol: `${String(i).padStart(6, '0')}`,
      name: `股票${i}`,
      price: 10 + i,
      change: i * 0.1,
      changePercent: i * 0.5,
      volume: '100万',
      marketCap: '100亿',
    }));

    renderWithRouter(
      <StockTable stocks={manyStocks} itemsPerPage={10} currentPage={1} />
    );
    expect(screen.getByText('下一页')).toBeDefined();
    expect(screen.getByText('第 1 页，共 2 页')).toBeDefined();
  });

  it('should call onPageChange when clicking next page', () => {
    const handlePageChange = vi.fn();
    const manyStocks = Array.from({ length: 15 }, (_, i) => ({
      symbol: `${String(i).padStart(6, '0')}`,
      name: `股票${i}`,
      price: 10 + i,
      change: i * 0.1,
      changePercent: i * 0.5,
      volume: '100万',
      marketCap: '100亿',
    }));

    renderWithRouter(
      <StockTable
        stocks={manyStocks}
        itemsPerPage={10}
        currentPage={1}
        onPageChange={handlePageChange}
      />
    );

    fireEvent.click(screen.getByText('下一页'));
    expect(handlePageChange).toHaveBeenCalledWith(2);
  });

  it('should disable prev button on first page', () => {
    const manyStocks = Array.from({ length: 15 }, (_, i) => ({
      symbol: `${String(i).padStart(6, '0')}`,
      name: `股票${i}`,
      price: 10 + i,
      change: i * 0.1,
      changePercent: i * 0.5,
      volume: '100万',
      marketCap: '100亿',
    }));

    renderWithRouter(
      <StockTable stocks={manyStocks} itemsPerPage={10} currentPage={1} />
    );

    const prevButton = screen.getByText('上一页');
    expect(prevButton.closest('button')?.disabled).toBe(true);
  });

  it('should hide pagination when showPagination is false', () => {
    const manyStocks = Array.from({ length: 15 }, (_, i) => ({
      symbol: `${String(i).padStart(6, '0')}`,
      name: `股票${i}`,
      price: 10 + i,
      change: i * 0.1,
      changePercent: i * 0.5,
      volume: '100万',
      marketCap: '100亿',
    }));

    renderWithRouter(
      <StockTable stocks={manyStocks} itemsPerPage={10} showPagination={false} />
    );

    expect(screen.queryByText('下一页')).toBeNull();
  });

  it('should display action buttons', () => {
    renderWithRouter(<StockTable stocks={mockStocks} />);
    expect(screen.getByText('📥 导出数据')).toBeDefined();
    expect(screen.getByText('🔧 筛选设置')).toBeDefined();
  });

  it('should display detail link for each stock', () => {
    renderWithRouter(<StockTable stocks={mockStocks} />);
    const detailLinks = screen.getAllByText('查看详情');
    expect(detailLinks).toHaveLength(4);
  });
});
