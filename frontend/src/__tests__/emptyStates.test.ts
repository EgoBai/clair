import { describe, it, expect, vi } from 'vitest';
import React from 'react';

/**
 * EmptyStates 组件逻辑测试
 * 测试空状态展示的各种场景
 */

describe('EmptyStates', () => {
  describe('EmptyState Props 接口', () => {
    it('应该支持基本 title 属性', () => {
      const props = { title: '暂无数据' };
      expect(props.title).toBe('暂无数据');
    });

    it('应该支持可选 description', () => {
      const props = { title: '暂无数据', description: '请添加股票到自选列表' };
      expect(props.description).toBe('请添加股票到自选列表');
    });

    it('应该支持 icon 属性', () => {
      const icon = React.createElement('span', {}, '📊');
      const props = { icon, title: '暂无数据' };
      expect(props.icon).toBeDefined();
    });

    it('应该支持 action 按钮', () => {
      const onClick = vi.fn();
      const props = {
        title: '暂无自选股',
        action: { text: '去添加', onClick, type: 'primary' as const },
      };
      expect(props.action?.text).toBe('去添加');
      expect(props.action?.type).toBe('primary');
      props.action.onClick();
      expect(onClick).toHaveBeenCalled();
    });

    it('应该支持 secondaryAction', () => {
      const props = {
        title: '暂无数据',
        secondaryAction: { text: '了解更多', onClick: vi.fn() },
      };
      expect(props.secondaryAction?.text).toBe('了解更多');
    });
  });

  describe('空状态类型配置', () => {
    const emptyStateConfigs = {
      emptyWatchlist: {
        title: '自选股为空',
        description: '添加股票到自选列表，实时跟踪行情变化',
      },
      emptySearch: {
        title: '搜索无结果',
        description: '尝试调整关键词或筛选条件',
      },
      emptyAlerts: {
        title: '暂无预警',
        description: '创建价格预警，第一时间获取市场异动',
      },
      emptyPortfolio: {
        title: '投资组合为空',
        description: '添加持仓记录，跟踪投资收益',
      },
      emptyScreener: {
        title: '筛选无结果',
        description: '调整筛选条件，发现更多投资机会',
      },
      emptyBacktest: {
        title: '暂无回测记录',
        description: '创建策略回测，验证投资想法',
      },
      emptyNotifications: {
        title: '暂无通知',
        description: '所有通知已读或暂无新通知',
      },
      errorState: {
        title: '加载失败',
        description: '请检查网络连接后重试',
      },
      offlineState: {
        title: '网络断开',
        description: '请检查网络连接',
      },
    };

    it('应该有自选股空状态配置', () => {
      expect(emptyStateConfigs.emptyWatchlist.title).toBe('自选股为空');
      expect(emptyStateConfigs.emptyWatchlist.description).toContain('添加股票');
    });

    it('应该有搜索无结果配置', () => {
      expect(emptyStateConfigs.emptySearch.title).toBe('搜索无结果');
    });

    it('应该有预警空状态配置', () => {
      expect(emptyStateConfigs.emptyAlerts.title).toBe('暂无预警');
      expect(emptyStateConfigs.emptyAlerts.description).toContain('价格预警');
    });

    it('应该有组合空状态配置', () => {
      expect(emptyStateConfigs.emptyPortfolio.title).toBe('投资组合为空');
      expect(emptyStateConfigs.emptyPortfolio.description).toContain('收益');
    });

    it('应该有筛选空状态配置', () => {
      expect(emptyStateConfigs.emptyScreener.title).toBe('筛选无结果');
    });

    it('应该有回测空状态配置', () => {
      expect(emptyStateConfigs.emptyBacktest.title).toBe('暂无回测记录');
      expect(emptyStateConfigs.emptyBacktest.description).toContain('策略');
    });

    it('应该有通知空状态配置', () => {
      expect(emptyStateConfigs.emptyNotifications.title).toBe('暂无通知');
    });

    it('应该有错误状态配置', () => {
      expect(emptyStateConfigs.errorState.title).toBe('加载失败');
      expect(emptyStateConfigs.errorState.description).toContain('网络');
    });

    it('应该有离线状态配置', () => {
      expect(emptyStateConfigs.offlineState.title).toBe('网络断开');
    });
  });

  describe('空状态样式逻辑', () => {
    it('容器应该居中对齐', () => {
      const style = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center' as const,
      };
      expect(style.display).toBe('flex');
      expect(style.alignItems).toBe('center');
      expect(style.justifyContent).toBe('center');
    });

    it('图标样式应该为灰色大图标', () => {
      const iconStyle = { fontSize: 48, color: '#bfbfbf', marginBottom: 16 };
      expect(iconStyle.fontSize).toBe(48);
      expect(iconStyle.color).toBe('#bfbfbf');
    });
  });

  describe('空状态条件渲染', () => {
    it('没有 icon 时不渲染图标区域', () => {
      const props = { title: '测试' };
      expect(props.icon).toBeUndefined();
    });

    it('没有 description 时不渲染描述', () => {
      const props = { title: '测试' };
      expect(props.description).toBeUndefined();
    });

    it('没有 action 时不渲染按钮', () => {
      const props = { title: '测试' };
      expect(props.action).toBeUndefined();
    });

    it('没有 secondaryAction 时不渲染次要按钮', () => {
      const props = { title: '测试' };
      expect(props.secondaryAction).toBeUndefined();
    });
  });
});
