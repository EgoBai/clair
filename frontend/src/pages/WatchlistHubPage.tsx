/**
 * 📊📈 自选组合 Hub — WatchlistHubPage
 * 
 * 合并原「自选追踪」和「复盘研究」两个独立页面为统一的 Tab 页面。
 * 
 * Tab 1: 📊 自选追踪 — 分组管理 + 实时行情表 + AI总结 + 异动提醒 + 推荐发现
 * Tab 2: 📈 AI复盘   — 区间表现复盘 + 涨跌分布 + AI分析 + 快速回测
 * 
 * 共享数据: 通过 useWatchlistData hook 一次加载行情/异动/信号，
 *          然后通过 WatchlistDataProvider Context 分发给两个 Tab。
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Tabs, Typography, Space } from 'antd';
import {
  StarFilled,
  LineChartOutlined,
  RobotOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { THEME } from '../styles/theme-constants';
import { useWatchlistData } from '../hooks/useWatchlistData';
import { WatchlistDataProvider } from '../contexts/WatchlistDataContext';
import WatchlistPage from './WatchlistPage';
import ReviewPage from './ReviewPage';

const { Text } = Typography;

/* ------------------------------------------------------------------ */
/*  Tab 配置                                                           */
/* ------------------------------------------------------------------ */

type HubTab = 'tracking' | 'review';

const TAB_ITEMS = [
  {
    key: 'tracking' as HubTab,
    label: (
      <Space size={6}>
        <StarFilled style={{ color: '#f59e0b', fontSize: 14 }} />
        <span>自选追踪</span>
      </Space>
    ),
    icon: null as React.ReactNode,
  },
  {
    key: 'review' as HubTab,
    label: (
      <Space size={6}>
        <RobotOutlined style={{ color: THEME.accent, fontSize: 14 }} />
        <span>AI复盘</span>
      </Space>
    ),
    icon: null as React.ReactNode,
  },
];

/* ------------------------------------------------------------------ */
/*  Hub Page                                                           */
/* ------------------------------------------------------------------ */

const WatchlistHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Read active tab from URL: /watchlist?tab=review → review tab
  const rawTab = searchParams.get('tab') || '';
  const activeTab: HubTab = rawTab === 'review' ? 'review' : 'tracking';

  // ---- 共享数据加载 (一次性) ----
  const watchlistData = useWatchlistData(30_000); // 30s auto-refresh

  // Handle tab change — update URL search param
  const handleTabChange = useCallback((key: string) => {
    setSearchParams(key === 'review' ? { tab: 'review' } : {}, { replace: true });
  }, [setSearchParams]);

  // ---- 页面标题 ----
  const pageTitle = useMemo(() => {
    return activeTab === 'review' ? '自选组合 · AI复盘' : '自选组合 · 追踪中心';
  }, [activeTab]);

  return (
    <WatchlistDataProvider value={watchlistData}>
      <div
        className="watchlist-hub-page"
        style={{
          minHeight: '100vh',
          background: THEME.bg,
        }}
      >
        {/* ---- Hub-level Header ---- */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 32px 0',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Space align="center" size={12}>
            <span style={{ fontSize: 26 }}>📊</span>
            <div>
              <Text
                strong
                style={{
                  color: THEME.text,
                  fontSize: 20,
                  display: 'block',
                  lineHeight: 1.3,
                }}
              >
                {pageTitle}
              </Text>
              <Text style={{ color: THEME.textSec, fontSize: 12 }}>
                {watchlistData.totalCount > 0
                  ? `追踪 ${watchlistData.totalCount} 只股票 · ${watchlistData.lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新`
                  : '暂无自选股，请先添加'}
              </Text>
            </div>
            {watchlistData.quotesLoading && (
              <LoadingOutlined style={{ color: THEME.accent, fontSize: 14 }} spin />
            )}
          </Space>
        </div>

        {/* ---- Tabs ---- */}
        <div style={{ padding: '0 32px' }}>
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            destroyInactiveTabPane
            size="large"
            style={{ marginTop: 8 }}
            tabBarStyle={{
              borderBottom: `1px solid ${THEME.border}`,
              marginBottom: 0,
            }}
            items={TAB_ITEMS.map(item => ({
              key: item.key,
              label: item.label,
              children: null,
            }))}
          />

          {/* Tab content — conditionally rendered for performance */}
          <div style={{ marginTop: 0 }}>
            {activeTab === 'tracking' ? (
              <WatchlistPage />
            ) : (
              <ReviewPage />
            )}
          </div>
        </div>
      </div>
    </WatchlistDataProvider>
  );
};

export default WatchlistHubPage;
