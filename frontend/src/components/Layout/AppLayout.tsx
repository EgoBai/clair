/**
 * 响应式布局组件
 * 支持 PC端侧边栏 + 移动端抽屉菜单
 */

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Drawer, Input, Avatar, Space, Badge } from 'antd';
import {
  HomeOutlined,
  StockOutlined,
  BarChartOutlined,
  StarOutlined,
  MenuOutlined,
  SearchOutlined,
  SettingOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import ErrorBoundary from '../Common/ErrorBoundary';

const { Header, Sider, Content, Footer } = Layout;

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mobileMenuOpen, setMobileMenuOpen, sidebarCollapsed, toggleSidebar } = useAppStore();
  const [searchText, setSearchText] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = [
    { key: '/', icon: <HomeOutlined />, label: '首页' },
    { key: '/stocks', icon: <StockOutlined />, label: '股票列表' },
    { key: '/market', icon: <BarChartOutlined />, label: '市场分析' },
    { key: '/watchlist', icon: <StarOutlined />, label: '自选股' },
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

  // 获取当前选中的菜单项
  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path.startsWith('/stock/')) return ['/stocks'];
    return [path];
  };

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
          collapsed={sidebarCollapsed}
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
              placeholder="搜索股票代码或名称..."
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
            <Button type="text" icon={<SettingOutlined />} size="small" />
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

        {/* 内容区域 - 包裹错误边界 */}
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
    </Layout>
  );
};

export default AppLayout;
