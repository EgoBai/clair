/**
 * 响应式布局组件 v1.3
 * 支持 PC端侧边栏 + 移动端抽屉菜单 + 暗色主题 + 快捷键提示
 */

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Drawer, Input, Avatar, Space, Badge, Tooltip, Dropdown } from 'antd';
import {
  HomeOutlined,
  StockOutlined,
  BarChartOutlined,
  StarOutlined,
  MenuOutlined,
  SearchOutlined,
  SettingOutlined,
  BellOutlined,
  BulbOutlined,
  BulbFilled,
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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
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
    { key: '/backtest', icon: <ThunderboltOutlined />, label: '策略回测' },
    { key: '/portfolio', icon: <WalletOutlined />, label: '投资组合' },
    { type: 'divider' as const },
    // 深度数据
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
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    if (isMobile) setMobileMenuOpen(false);
  };

  const handleSearch = () => {
    if (searchText.trim()) {
      navigate(`/stocks?search=${encodeURIComponent(searchText.trim())}`);
      setSearchText('');
    }
  };

  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path.startsWith('/stock/')) return ['/stocks'];
    return [path];
  };

  // 主题切换菜单
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* PC端侧边栏 */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={preferences.sidebarCollapsed}
          onCollapse={toggleSidebar}
          breakpoint="lg"
          width={200}
          style={{
            background: '#fff',
            borderRight: '1px solid #f0f0f0',
          }}
        >
          <div style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #f0f0f0',
            cursor: 'pointer',
          }}
            onClick={() => navigate('/')}
          >
            <span style={{
              fontSize: preferences.sidebarCollapsed ? 20 : 18,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              {preferences.sidebarCollapsed ? '📈' : '📈 A股分析'}
            </span>
          </div>
          {menuContent}
        </Sider>
      )}

      <Layout>
        {/* 顶部导航栏 */}
        <Header style={{
          background: '#fff',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          <Space>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileMenuOpen(true)}
              />
            )}
            <Input
              className="search-input"
              data-search-input
              placeholder="搜索股票代码或名称 (⌘K)"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: isMobile ? 150 : 280 }}
              allowClear
              size="small"
            />
          </Space>
          <Space>
            <Badge count={0} size="small">
              <Button type="text" icon={<BellOutlined />} size="small" />
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
                <Button type="text" icon={themeIcon} size="small" className="theme-toggle" />
              </Tooltip>
            </Dropdown>

            {/* 快捷键提示 */}
            <Tooltip title="快捷键 (?)">
              <Button
                type="text"
                icon={<QuestionCircleOutlined />}
                size="small"
                onClick={() => {
                  // 触发快捷键提示面板
                  const event = new KeyboardEvent('keydown', { key: '?' });
                  document.dispatchEvent(event);
                }}
              />
            </Tooltip>

            <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>U</Avatar>
          </Space>
        </Header>

        {/* 移动端抽屉菜单 */}
        <Drawer
          title="📈 A股分析"
          placement="left"
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          bodyStyle={{ padding: 0 }}
          width={200}
        >
          {menuContent}
        </Drawer>

        {/* 内容区域 */}
        <Content style={{
          background: '#f5f5f5',
          minHeight: 'calc(100vh - 64px - 54px)',
          overflow: 'auto',
        }}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </Content>

        {/* 页脚 */}
        <Footer style={{
          textAlign: 'center',
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          padding: '12px 24px',
          fontSize: 12,
          color: '#999',
        }}>
          A股行情分析平台 ©{new Date().getFullYear()} | 数据仅供参考，不构成投资建议
        </Footer>
      </Layout>

      {/* 移动端浮动菜单按钮 */}
      {isMobile && (
        <button
          className="mobile-menu-trigger"
          onClick={() => setMobileMenuOpen(true)}
        >
          <MenuOutlined />
        </button>
      )}
    </Layout>
  );
};

export default AppLayout;
