/**
 * 响应式布局组件
 */

import React, { useState } from 'react';
import { Layout, Menu, Button, Drawer, Input, Avatar, Space } from 'antd';
import {
  HomeOutlined,
  StockOutlined,
  BarChartOutlined,
  StarOutlined,
  MenuOutlined,
  SearchOutlined,
  SettingOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';

const { Header, Sider, Content, Footer } = Layout;

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mobileMenuOpen, setMobileMenuOpen, sidebarCollapsed, toggleSidebar } = useAppStore();
  const [searchText, setSearchText] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  React.useEffect(() => {
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

  const menuContent = (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
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
          }}>
            <span style={{ fontSize: sidebarCollapsed ? 20 : 18, fontWeight: 700 }}>
              {sidebarCollapsed ? '📈' : '📈 A股分析'}
            </span>
          </div>
          {menuContent}
        </Sider>
      )}

      <Layout>
        {/* 头部 */}
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
              placeholder="搜索股票..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: isMobile ? 150 : 250 }}
              allowClear
              size="small"
            />
          </Space>
          <Space>
            <Button type="text" icon={<BulbOutlined />} size="small" />
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

        {/* 内容区 */}
        <Content style={{
          background: '#f5f5f5',
          minHeight: 'calc(100vh - 64px - 70px)',
          overflow: 'auto',
        }}>
          <Outlet />
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
