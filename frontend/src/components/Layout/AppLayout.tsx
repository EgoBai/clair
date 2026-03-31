/**
 * 响应式布局组件 v2
 * 支持 PC端侧边栏 + 移动端抽屉菜单 + 暗色主题 + 快捷键提示 + 平板适配
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Menu, Button, Drawer, Input, Avatar, Space, Badge, Tooltip, Dropdown } from 'antd';
import WebVitalsWidget from '../Common/WebVitalsWidget';
import {
  HomeOutlined,
  StockOutlined,
  BarChartOutlined,
  StarOutlined,
  MenuOutlined,
  SearchOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  DesktopOutlined,
  SunOutlined,
  MoonOutlined,
  FilterOutlined,
  ThunderboltOutlined,
  WalletOutlined,
  ReadOutlined,
  TeamOutlined,
  DashboardOutlined,
  DollarOutlined,
  TrophyOutlined,
  SwapOutlined,
  LockOutlined,
  RobotOutlined,
  FundOutlined,
  FireOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore, ThemeMode } from '../../store/useAppStore';
import ErrorBoundary from '../Common/ErrorBoundary';

const { Header, Sider, Content, Footer } = Layout;

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    mobileMenuOpen, setMobileMenuOpen,
    preferences, toggleSidebar, setTheme,
  } = useAppStore();
  const [searchText, setSearchText] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = [
    // 市场总览
    { key: '/', icon: <HomeOutlined />, label: '首页' },
    { key: '/stocks', icon: <StockOutlined />, label: '股票列表' },
    { key: '/market', icon: <BarChartOutlined />, label: '市场分析' },
    { key: '/market-heat', icon: <FireOutlined />, label: '市场热度' },
    { type: 'divider' as const },
    // 投资工具
    { key: '/watchlist', icon: <StarOutlined />, label: '自选股' },
    { key: '/screener', icon: <FilterOutlined />, label: '选股器' },
    { key: '/advanced-screener', icon: <FilterOutlined />, label: '高级选股' },
    { key: '/backtest', icon: <ThunderboltOutlined />, label: '策略回测' },
    { key: '/portfolio', icon: <WalletOutlined />, label: '投资组合' },
    { key: '/compare', icon: <BarChartOutlined />, label: '股票对比' },
    { key: '/financials', icon: <DollarOutlined />, label: '财务分析' },
    { type: 'divider' as const },
    // 深度数据
    { key: '/sectors', icon: <FundOutlined />, label: '板块分析' },
    { key: '/margin', icon: <DollarOutlined />, label: '融资融券' },
    { key: '/top-traders', icon: <TrophyOutlined />, label: '龙虎榜' },
    { key: '/block-trades', icon: <SwapOutlined />, label: '大宗交易' },
    { key: '/shareholder-changes', icon: <TeamOutlined />, label: '股东增减持' },
    { key: '/lockup-calendar', icon: <LockOutlined />, label: '限售解禁' },
    { key: '/etf', icon: <FundOutlined />, label: 'ETF基金' },
    { type: 'divider' as const },
    // 智能 & 资讯
    { key: '/ai-selection', icon: <RobotOutlined />, label: 'AI选股' },
    { key: '/alerts', icon: <BellOutlined />, label: '预警' },
    { key: '/news', icon: <ReadOutlined />, label: '财经资讯' },
    { key: '/social', icon: <TeamOutlined />, label: '社区讨论' },
    { type: 'divider' as const },
    // 个性化
    { key: '/dashboard', icon: <DashboardOutlined />, label: '自定义仪表盘' },
    { key: '/settings', icon: <DesktopOutlined />, label: '设置' },
  ];

  const handleMenuClick = useCallback(({ key }: { key: string }) => {
    navigate(key);
    if (isMobile) setMobileMenuOpen(false);
  }, [navigate, isMobile, setMobileMenuOpen]);

  const handleSearch = useCallback(() => {
    if (searchText.trim()) {
      navigate(`/stocks?search=${encodeURIComponent(searchText.trim())}`);
      setSearchText('');
      if (isMobile) setMobileMenuOpen(false);
    }
  }, [searchText, navigate, isMobile, setMobileMenuOpen]);

  const getSelectedKeys = useCallback(() => {
    const path = location.pathname;
    if (path.startsWith('/stock/')) return ['/stocks'];
    return [path];
  }, [location.pathname]);

  const themeMenuItems = [
    { key: 'light', icon: <SunOutlined />, label: '浅色' },
    { key: 'dark', icon: <MoonOutlined />, label: '深色' },
    { key: 'system', icon: <DesktopOutlined />, label: '跟随系统' },
  ];

  const themeIcon = preferences.theme === 'dark'
    ? <MoonOutlined />
    : preferences.theme === 'system'
      ? <DesktopOutlined />
      : <SunOutlined />;

  const menuContent = (
    <Menu
      mode="inline"
      selectedKeys={getSelectedKeys()}
      items={menuItems}
      onClick={handleMenuClick}
      style={{ borderRight: 0 }}
    />
  );

  // 平板时使用折叠侧边栏
  const sidebarCollapsed = preferences.sidebarCollapsed || isTablet;
  const sidebarWidth = isTablet ? 64 : 200;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 无障碍跳转链接 */}
      <a href="#main-content" className="skip-link">
        跳转到主要内容
      </a>

      {/* PC端/平板侧边栏 */}
      {!isMobile && (
        <Sider
          collapsible={!isTablet}
          collapsed={sidebarCollapsed}
          onCollapse={isTablet ? undefined : toggleSidebar}
          breakpoint="lg"
          width={sidebarWidth}
          collapsedWidth={64}
          style={{
            background: '#fff',
            borderRight: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid #f0f0f0',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/')}
            role="button"
            aria-label="返回首页"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
          >
            <span style={{
              fontSize: sidebarCollapsed ? 20 : 18,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              {sidebarCollapsed ? '📈' : '📈 A股分析'}
            </span>
          </div>
          {menuContent}
        </Sider>
      )}

      <Layout>
        {/* 顶部导航栏 */}
        <Header style={{
          background: '#fff',
          padding: isMobile ? '0 12px' : '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: isMobile ? 52 : 64,
        }}>
          <Space size={isMobile ? 8 : 16}>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileMenuOpen(true)}
                aria-label="打开菜单"
                className="min-touch-target"
              />
            )}
            <Input
              className="search-input"
              data-search-input
              placeholder={isMobile ? '搜索股票' : '搜索股票代码或名称 (⌘K)'}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: isMobile ? 140 : isTablet ? 200 : 280 }}
              allowClear
              size={isMobile ? 'middle' : 'small'}
              aria-label="搜索股票"
            />
          </Space>
          <Space size={isMobile ? 4 : 8}>
            <Badge count={0} size="small">
              <Button
                type="text"
                icon={<BellOutlined />}
                size={isMobile ? 'middle' : 'small'}
                aria-label="通知"
                className="min-touch-target"
              />
            </Badge>

            {/* 主题切换 */}
            <Dropdown
              menu={{
                items: themeMenuItems,
                selectedKeys: [preferences.theme],
                onClick: ({ key }) => setTheme(key as ThemeMode),
              }}
              trigger={['click']}
            >
              <Tooltip title="切换主题 (Alt+T)">
                <Button
                  type="text"
                  icon={themeIcon}
                  size={isMobile ? 'middle' : 'small'}
                  className="theme-toggle min-touch-target"
                  aria-label="切换主题"
                />
              </Tooltip>
            </Dropdown>

            {/* 快捷键提示 */}
            {!isMobile && (
              <Tooltip title="快捷键 (?)">
                <Button
                  type="text"
                  icon={<QuestionCircleOutlined />}
                  size="small"
                  aria-label="快捷键帮助"
                  onClick={() => {
                    const event = new KeyboardEvent('keydown', { key: '?' });
                    document.dispatchEvent(event);
                  }}
                />
              </Tooltip>
            )}

            <Avatar size={isMobile ? 'default' : 'small'} style={{ backgroundColor: '#1890ff' }}>U</Avatar>
          </Space>
        </Header>

        {/* 移动端抽屉菜单 */}
        <Drawer
          title="📈 A股分析"
          placement="left"
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          bodyStyle={{ padding: 0 }}
          width={240}
          className="mobile-drawer"
        >
          {/* 移动端搜索 */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <Input
              placeholder="搜索股票代码或名称"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              aria-label="搜索股票"
            />
          </div>
          {menuContent}
        </Drawer>

        {/* 内容区域 */}
        <Content
          id="main-content"
          role="main"
          style={{
            background: '#f5f5f5',
            minHeight: 'calc(100vh - 64px - 54px)',
            overflow: 'auto',
            padding: isMobile ? 8 : isTablet ? 12 : 16,
            paddingBottom: isMobile ? 80 : 16, // 移动端留出底部导航空间
          }}
        >
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </Content>

        {/* 页脚 */}
        <Footer style={{
          textAlign: 'center',
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          padding: isMobile ? '8px 12px' : '12px 24px',
          fontSize: isMobile ? 11 : 12,
          color: '#999',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            flexDirection: isMobile ? 'column' : 'row',
          }}>
            <span>A股行情分析平台 ©{new Date().getFullYear()} | 数据仅供参考</span>
            {import.meta.env.DEV && <WebVitalsWidget compact />}
          </div>
        </Footer>
      </Layout>

      {/* 移动端浮动菜单按钮 */}
      {isMobile && (
        <button
          className="mobile-menu-trigger"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="打开菜单"
          style={{
            bottom: 80,
          }}
        >
          <MenuOutlined />
        </button>
      )}
    </Layout>
  );
};

export default AppLayout;
