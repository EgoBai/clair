/**
 * ResponsiveMenu 响应式菜单组件
 * 桌面端显示侧边栏菜单，移动端折叠为汉堡菜单
 */
import React, { useState, useCallback } from 'react';
import { Menu, Drawer, Button, type MenuProps } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

export interface MenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  path?: string;
  children?: MenuItem[];
  parentKey?: string;
}

// 扁平化菜单
export function flattenMenu(items: MenuItem[]): MenuItem[] {
  const result: MenuItem[] = [];
  const walk = (list: MenuItem[], parent?: string) => {
    list.forEach((item) => {
      result.push({ ...item, parentKey: parent });
      if (item.children) walk(item.children, item.key);
    });
  };
  walk(items);
  return result;
}

// 查找菜单项
export function findMenuItem(items: MenuItem[], key: string): MenuItem | undefined {
  for (const item of items) {
    if (item.key === key) return item;
    if (item.children) {
      const found = findMenuItem(item.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

interface ResponsiveMenuProps {
  items: MenuItem[];
  mode?: 'inline' | 'horizontal';
  collapsed?: boolean;
  className?: string;
}

export const ResponsiveMenu: React.FC<ResponsiveMenuProps> = ({
  items,
  mode = 'inline',
  collapsed = false,
  className = '',
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const toAntdItems = useCallback((menuItems: MenuItem[]): MenuProps['items'] => {
    return menuItems.map((item) => ({
      key: item.key,
      icon: item.icon,
      label: item.label,
      children: item.children ? toAntdItems(item.children) : undefined,
    }));
  }, []);

  const handleClick: MenuProps['onClick'] = useCallback(({ key }: { key: string }) => {
    const item = findMenuItem(items, key);
    if (item?.path) {
      navigate(item.path);
      setMobileOpen(false);
    }
  }, [items, navigate, setMobileOpen]);

  // Find selected key from current path
  const flatItems = flattenMenu(items);
  const selectedKey = flatItems.find((i) => i.path === location.pathname)?.key || '';

  // Find open keys (parent keys of selected item)
  const selectedItem = flatItems.find((i) => i.key === selectedKey);
  const openKeys = selectedItem?.parentKey ? [selectedItem.parentKey] : [];

  return (
    <>
      {/* Mobile hamburger */}
      <div className="mobile-menu-btn" style={{ display: 'none' }}>
        <Button
          type="text"
          icon={<MenuOutlined />}
          onClick={() => setMobileOpen(true)}
        />
      </div>

      {/* Desktop menu */}
      <div className={`desktop-menu ${className}`}>
        <Menu
          mode={mode}
          selectedKeys={[selectedKey]}
          defaultOpenKeys={openKeys}
          items={toAntdItems(items)}
          onClick={handleClick}
          inlineCollapsed={collapsed}
        />
      </div>

      {/* Mobile drawer */}
      <Drawer
        title="菜单"
        placement="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        width={250}
      >
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={openKeys}
          items={toAntdItems(items)}
          onClick={handleClick}
        />
      </Drawer>
    </>
  );
};

export default React.memo(ResponsiveMenu);
