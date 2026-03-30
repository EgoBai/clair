/**
 * 前端通知服务测试
 * Round 124
 */

import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_ICONS,
  NOTIFICATION_LABELS,
  PRIORITY_COLORS,
  formatNotificationTime,
} from '../services/notificationService';

describe('通知服务 - 常量映射', () => {
  it('应包含所有通知类型的图标', () => {
    const types = [
      'price_alert', 'news', 'system', 'trade', 'report',
      'watchlist_update', 'limit_up', 'limit_down', 'volume_surge',
    ];
    types.forEach(type => {
      expect(NOTIFICATION_ICONS[type as keyof typeof NOTIFICATION_ICONS]).toBeDefined();
      expect(NOTIFICATION_ICONS[type as keyof typeof NOTIFICATION_ICONS].length).toBeGreaterThan(0);
    });
  });

  it('应包含所有通知类型的标签', () => {
    expect(NOTIFICATION_LABELS.price_alert).toBe('价格预警');
    expect(NOTIFICATION_LABELS.news).toBe('新闻资讯');
    expect(NOTIFICATION_LABELS.system).toBe('系统通知');
    expect(NOTIFICATION_LABELS.trade).toBe('交易通知');
    expect(NOTIFICATION_LABELS.limit_up).toBe('涨停通知');
    expect(NOTIFICATION_LABELS.limit_down).toBe('跌停通知');
    expect(NOTIFICATION_LABELS.volume_surge).toBe('放量异动');
  });

  it('应包含所有优先级的颜色', () => {
    expect(PRIORITY_COLORS.urgent).toBe('#ff4d4f');
    expect(PRIORITY_COLORS.high).toBe('#fa8c16');
    expect(PRIORITY_COLORS.medium).toBe('#1890ff');
    expect(PRIORITY_COLORS.low).toBe('#8c8c8c');
  });
});

describe('通知服务 - 时间格式化', () => {
  it('应显示"刚刚"当时间差小于60秒', () => {
    const now = Date.now();
    expect(formatNotificationTime(now - 10000)).toBe('刚刚');
    expect(formatNotificationTime(now - 59000)).toBe('刚刚');
  });

  it('应显示分钟当时间差小于1小时', () => {
    const now = Date.now();
    expect(formatNotificationTime(now - 60000)).toBe('1分钟前');
    expect(formatNotificationTime(now - 3000000)).toBe('50分钟前');
  });

  it('应显示小时当时间差小于1天', () => {
    const now = Date.now();
    expect(formatNotificationTime(now - 3600000)).toBe('1小时前');
    expect(formatNotificationTime(now - 72000000)).toBe('20小时前');
  });

  it('应显示天当时间差小于7天', () => {
    const now = Date.now();
    expect(formatNotificationTime(now - 86400000)).toBe('1天前');
    expect(formatNotificationTime(now - 432000000)).toBe('5天前');
  });

  it('应显示日期当时间差大于7天', () => {
    const now = Date.now();
    const result = formatNotificationTime(now - 604800001);
    expect(result).not.toContain('天前');
    expect(result).not.toContain('小时前');
    expect(result).toContain('/');
  });

  it('应处理当前时间', () => {
    expect(formatNotificationTime(Date.now())).toBe('刚刚');
  });

  it('应处理过去很远的时间', () => {
    const result = formatNotificationTime(0);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });
});
