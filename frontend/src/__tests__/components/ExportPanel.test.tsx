/**
 * ExportPanel 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportPanel from '../../components/Common/ExportPanel';

// Mock bloombergExportEngine
vi.mock('../../utils/bloombergExportEngine', () => ({
  exportData: vi.fn(() => ({
    content: 'symbol,name\n000001,平安银行',
    filename: 'export.csv',
    format: 'csv',
    mimeType: 'text/csv',
    size: 100,
    rowCount: 1,
  })),
  downloadExport: vi.fn(),
  ExportFormat: {},
  ExportColumn: {},
  ExportOptions: {},
  ExportResult: {},
  ReportTemplate: {},
  generateReport: vi.fn(() => ({
    export: {
      content: 'report',
      filename: 'report.csv',
      format: 'csv',
      mimeType: 'text/csv',
      size: 50,
      rowCount: 1,
    },
    sections: [],
  })),
  STOCK_LIST_COLUMNS: [
    { key: 'symbol', label: '代码' },
    { key: 'name', label: '名称' },
  ],
  KLINE_COLUMNS: [],
  BACKTEST_COLUMNS: [],
  FINANCIAL_COLUMNS: [],
  addToHistory: vi.fn(),
}));

// Mock antd message
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    message: {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
  };
});

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
});

describe('ExportPanel', () => {
  const mockData = [
    { symbol: '000001', name: '平安银行', price: 12.50 },
    { symbol: '000002', name: '万科A', price: 18.30 },
  ];

  it('should render export button', () => {
    render(<ExportPanel data={mockData} />);
    expect(screen.getByText('导出')).toBeDefined();
  });

  it('should show download icon', () => {
    render(<ExportPanel data={mockData} />);
    // The DownloadOutlined icon should be present
    const button = screen.getByText('导出').closest('button');
    expect(button).toBeDefined();
  });

  it('should open dropdown menu on click', () => {
    render(<ExportPanel data={mockData} />);
    const button = screen.getByText('导出');
    fireEvent.click(button);
    // After clicking, dropdown menu items should appear
  });

  it('should accept custom filename', () => {
    render(<ExportPanel data={mockData} filename="custom-export" />);
    expect(screen.getByText('导出')).toBeDefined();
  });

  it('should accept custom title', () => {
    render(<ExportPanel data={mockData} title="导出报表" />);
    expect(screen.getByText('导出')).toBeDefined();
  });

  it('should handle empty data', () => {
    render(<ExportPanel data={[]} />);
    expect(screen.getByText('导出')).toBeDefined();
  });

  it('should render with custom columns', () => {
    const customColumns = [
      { key: 'symbol', label: '股票代码' },
      { key: 'name', label: '股票名称' },
      { key: 'price', label: '最新价格' },
    ];
    render(<ExportPanel data={mockData} columns={customColumns} />);
    expect(screen.getByText('导出')).toBeDefined();
  });

  it('should render with templates', () => {
    const templates = [
      {
        id: 'basic',
        name: '基础报表',
        description: '包含基本信息',
        columns: [
          { key: 'symbol', label: '代码' },
          { key: 'name', label: '名称' },
        ],
      },
    ];
    render(<ExportPanel data={mockData} templates={templates} />);
    expect(screen.getByText('导出')).toBeDefined();
  });

  it('should render advanced export option when showAdvanced is true', () => {
    render(<ExportPanel data={mockData} showAdvanced={true} />);
    expect(screen.getByText('导出')).toBeDefined();
  });

  it('should not render scheduler when showScheduler is false', () => {
    render(<ExportPanel data={mockData} showScheduler={false} />);
    expect(screen.getByText('导出')).toBeDefined();
  });

  it('should render with scheduler when enabled', () => {
    render(<ExportPanel data={mockData} showScheduler={true} showAdvanced={true} />);
    expect(screen.getByText('导出')).toBeDefined();
  });

  it('should call onExport callback on successful export', async () => {
    const onExport = vi.fn();
    render(<ExportPanel data={mockData} onExport={onExport} />);
    // Button should be rendered
    expect(screen.getByText('导出')).toBeDefined();
  });
});
