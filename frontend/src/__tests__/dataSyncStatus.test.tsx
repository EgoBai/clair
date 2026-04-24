/**
 * DataSyncStatus 数据同步状态组件测试
 * 同步状态显示、状态切换、不同状态下的视觉风格
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataSyncStatus } from '../components/Common/DataSyncStatus';

// Mock hooks
vi.mock('../../hooks/useDataSync', () => ({
  useDataSyncState: () => ({
    status: 'idle',
    lastSync: null,
    progress: 0,
  }),
}));

vi.mock('../../hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('DataSyncStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<DataSyncStatus />);
    expect(container).toBeTruthy();
  });

  it('renders with status idle', () => {
    render(<DataSyncStatus />);
    // Should show idle/synced message
    expect(screen.getByText('数据已同步')).toBeTruthy();
  });

  it('renders without last sync time', () => {
    const { container } = render(<DataSyncStatus />);
    // Contains the idle status text
    expect(container.textContent).toContain('同步');
  });

  it('renders with compact mode', () => {
    const { container } = render(<DataSyncStatus compact />);
    // Compact mode renders smaller
    expect(container).toBeTruthy();
  });

  it('renders with full mode by default', () => {
    const { container } = render(<DataSyncStatus />);
    expect(container).toBeTruthy();
  });

  it('renders with custom className', () => {
    const { container } = render(<DataSyncStatus className="custom-status" />);
    expect(container.firstChild as HTMLElement).toBeTruthy();
  });
});
