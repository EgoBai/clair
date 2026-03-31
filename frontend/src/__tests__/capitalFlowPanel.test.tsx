// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CapitalFlowPanel } from '../components/Market/CapitalFlowPanel';

const mockFlowData = [
  { timestamp: 1, mainInflow: 500_000, mainOutflow: 300_000, retailInflow: 50_000, retailOutflow: 30_000, netMainFlow: 200_000 },
  { timestamp: 2, mainInflow: 600_000, mainOutflow: 200_000, retailInflow: 60_000, retailOutflow: 20_000, netMainFlow: 400_000 },
];

const mockSectorFlows = [
  { sector: '科技', netFlow: 300_000, flowTrend: 'accelerating' as const },
  { sector: '金融', netFlow: -100_000, flowTrend: 'decelerating' as const },
];

describe('CapitalFlowPanel', () => {
  it('should render the panel with title', () => {
    render(<CapitalFlowPanel flowData={mockFlowData} sectorFlows={[]} />);
    expect(screen.getByText('💰 资金流向')).toBeDefined();
  });

  it('should display fund flow score when provided', () => {
    render(<CapitalFlowPanel flowData={[]} sectorFlows={[]} fundFlowScore={75} />);
    expect(screen.getByText('75')).toBeDefined();
    expect(screen.getByText('资金面评分')).toBeDefined();
  });

  it('should not render score section when not provided', () => {
    render(<CapitalFlowPanel flowData={[]} sectorFlows={[]} />);
    expect(screen.queryByText('资金面评分')).toBeNull();
  });

  it('should show overview tab by default', () => {
    render(<CapitalFlowPanel flowData={mockFlowData} sectorFlows={[]} />);
    expect(screen.getByTestId('flow-overview')).toBeDefined();
  });

  it('should switch to sectors tab', () => {
    render(<CapitalFlowPanel flowData={[]} sectorFlows={mockSectorFlows} />);
    fireEvent.click(screen.getByText('板块流向'));
    expect(screen.getByTestId('flow-sectors')).toBeDefined();
    expect(screen.getByText('科技')).toBeDefined();
    expect(screen.getByText('金融')).toBeDefined();
  });

  it('should show empty state for sectors', () => {
    render(<CapitalFlowPanel flowData={[]} sectorFlows={[]} />);
    fireEvent.click(screen.getByText('板块流向'));
    expect(screen.getByText('暂无板块数据')).toBeDefined();
  });

  it('should display positive net flow in red', () => {
    render(<CapitalFlowPanel flowData={mockFlowData} sectorFlows={[]} />);
    expect(screen.getByTestId('capital-flow-panel')).toBeDefined();
  });

  it('should handle empty flow data gracefully', () => {
    render(<CapitalFlowPanel flowData={[]} sectorFlows={[]} />);
    expect(screen.getByTestId('capital-flow-panel')).toBeDefined();
  });

  it('should render sector trend icons', () => {
    render(<CapitalFlowPanel flowData={[]} sectorFlows={mockSectorFlows} />);
    fireEvent.click(screen.getByText('板块流向'));
    expect(screen.getByLabelText('accelerating')).toBeDefined();
    expect(screen.getByLabelText('decelerating')).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <CapitalFlowPanel flowData={[]} sectorFlows={[]} className="custom-class" />
    );
    expect(container.querySelector('.custom-class')).toBeDefined();
  });

  it('should format large amounts with 亿', () => {
    const largeData = [
      { timestamp: 1, mainInflow: 250_000_000, mainOutflow: 100_000_000, retailInflow: 0, retailOutflow: 0, netMainFlow: 150_000_000 },
    ];
    render(<CapitalFlowPanel flowData={largeData} sectorFlows={[]} />);
    expect(screen.getAllByText('+1.50亿').length).toBeGreaterThanOrEqual(1);
  });

  it('should show overview tab click back', () => {
    render(<CapitalFlowPanel flowData={mockFlowData} sectorFlows={mockSectorFlows} />);
    fireEvent.click(screen.getByText('板块流向'));
    fireEvent.click(screen.getByText('资金总览'));
    expect(screen.getByTestId('flow-overview')).toBeDefined();
  });
});
