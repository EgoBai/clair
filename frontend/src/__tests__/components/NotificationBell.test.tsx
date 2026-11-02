/**
 * NotificationBell 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
// 组件内部使用 useNavigate 做站内软跳，必须在 Router 上下文里渲染
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock the notification service
vi.mock('../../services/notificationService', () => ({
  notificationApi: {
    getUnreadCount: vi.fn().mockResolvedValue(5),
    getNotifications: vi.fn().mockResolvedValue([
      { id: '1', title: 'Test Notification', message: 'Test message', read: false, createdAt: new Date().toISOString(), priority: 'normal', type: 'info' },
    ]),
    getStats: vi.fn().mockResolvedValue({ total: 10, unread: 5, read: 5 }),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
  },
  NOTIFICATION_ICONS: { info: 'i', warning: '!', error: 'x', success: 'ok' },
  PRIORITY_COLORS: { low: '#ccc', normal: '#1890ff', high: '#faad14', urgent: '#ff4d4f' },
  formatNotificationTime: vi.fn(() => '刚刚'),
}));

import { NotificationBell } from '../../components/NotificationBell';
import { notificationApi } from '../../services/notificationService';

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    await act(async () => {
      render(<MemoryRouter><NotificationBell userId="test-user" /></MemoryRouter>);
    });
    expect(screen.getByRole('button')).toBeDefined();
  });

  it('fetches unread count on mount', async () => {
    await act(async () => {
      render(<MemoryRouter><NotificationBell userId="test-user" /></MemoryRouter>);
    });
    expect(notificationApi.getUnreadCount).toHaveBeenCalledWith('test-user');
  });

  it('displays unread count badge after load', async () => {
    await act(async () => {
      render(<MemoryRouter><NotificationBell userId="test-user" /></MemoryRouter>);
    });
    await waitFor(() => {
      expect(screen.getByText('5')).toBeDefined();
    }, { timeout: 5000 });
  });

  it('handles fetch error gracefully without crashing', async () => {
    (notificationApi.getUnreadCount as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));
    
    await act(async () => {
      render(<MemoryRouter><NotificationBell userId="test-user" /></MemoryRouter>);
    });
    
    // Should render without throwing
    expect(screen.getByRole('button')).toBeDefined();
  });

  it('changes userId prop triggers refetch', async () => {
    const { rerender } = await act(async () => {
      return render(<MemoryRouter><NotificationBell userId="user-1" /></MemoryRouter>);
    });
    
    await act(async () => {
      rerender(<MemoryRouter><NotificationBell userId="user-2" /></MemoryRouter>);
    });
    
    expect(notificationApi.getUnreadCount).toHaveBeenCalledWith('user-2');
  });
});
