/**
 * 用户设置页面
 * 个人信息 / 主题偏好 / 通知设置 / 操作历史
 */

import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Switch, Select, Button, Tabs, List, Tag, Divider, Row, Col, message, Avatar, Statistic } from 'antd';
import { UserOutlined, BellOutlined, EyeOutlined, HistoryOutlined, LogoutOutlined } from '@ant-design/icons';

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: 'zh-CN' | 'en-US';
  notifications: {
    email: boolean;
    push: boolean;
    priceAlert: boolean;
    newsAlert: boolean;
    weeklyReport: boolean;
  };
  display: {
    defaultPageSize: number;
    chartType: 'candlestick' | 'line';
    showVolume: boolean;
    klineDefaultPeriod: string;
  };
}

interface HistoryItem {
  id: string;
  type: string;
  target: string;
  detail: string;
  timestamp: string;
}

const ACTION_TYPE_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  stock_view: { label: '查看股票', color: 'blue', icon: '👁' },
  search: { label: '搜索', color: 'cyan', icon: '🔍' },
  add_watchlist: { label: '加入自选', color: 'green', icon: '⭐' },
  remove_watchlist: { label: '移除自选', color: 'orange', icon: '❌' },
  set_alert: { label: '设置预警', color: 'purple', icon: '🔔' },
  run_backtest: { label: '运行回测', color: 'geekblue', icon: '📊' },
  update_portfolio: { label: '更新组合', color: 'gold', icon: '💼' },
};

export default function UserSettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [loginForm] = Form.useForm();

  useEffect(() => {
    checkAuth();
    loadHistory();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('user_token');
    if (!token) return;
    try {
      const res = await fetch('/api/user/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.data);
        setSettings(data.data.settings);
        setIsLoggedIn(true);
      }
    } catch {}
  };

  const loadHistory = async () => {
    const token = localStorage.getItem('user_token');
    if (!token) return;
    try {
      const res = await fetch('/api/user/history?pageSize=50', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setHistory(data.data.items);
    } catch {}
  };

  const handleLogin = async (values: any) => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('user_token', data.data.token);
        setUser(data.data.user);
        setSettings(data.data.user.settings);
        setIsLoggedIn(true);
        message.success('登录成功');
        loadHistory();
      } else {
        message.error(data.message);
      }
    } catch {
      message.error('登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: any) => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('user_token', data.data.token);
        setUser(data.data.user);
        setSettings(data.data.user.settings);
        setIsLoggedIn(true);
        message.success('注册成功');
      } else {
        message.error(data.message);
      }
    } catch {
      message.error('注册失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (values: any) => {
    const token = localStorage.getItem('user_token');
    if (!token) return;
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        message.success('设置已保存');
      }
    } catch {
      message.error('保存失败');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user_token');
    setUser(null);
    setIsLoggedIn(false);
    message.success('已登出');
  };

  // 未登录状态
  if (!isLoggedIn) {
    return (
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <Card title="👤 用户登录">
          <Form form={loginForm} onFinish={handleLogin} layout="vertical">
            <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }]}>
              <Input prefix={<UserOutlined />} placeholder="请输入邮箱" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>登录</Button>
            </Form.Item>
          </Form>

          <Divider>或注册新账号</Divider>

          <Form onFinish={handleRegister} layout="vertical">
            <Form.Item name="nickname" label="昵称" rules={[{ required: true, min: 2 }]}>
              <Input placeholder="请输入昵称" />
            </Form.Item>
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
              <Input placeholder="请输入邮箱" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
              <Input.Password placeholder="至少6位密码" />
            </Form.Item>
            <Form.Item>
              <Button htmlType="submit" loading={loading} block>注册</Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    );
  }

  // 登录后设置页面
  const tabItems = [
    {
      key: 'profile',
      label: '👤 个人信息',
      children: (
        <Card>
          <Row gutter={24} align="middle">
            <Col>
              <Avatar size={80} icon={<UserOutlined />} src={user?.avatar} />
            </Col>
            <Col flex="auto">
              <h3 style={{ margin: 0 }}>{user?.nickname}</h3>
              <p style={{ color: '#999', margin: '4px 0' }}>{user?.email}</p>
              <Tag color="blue">注册于 {user?.createdAt?.slice(0, 10)}</Tag>
            </Col>
          </Row>
        </Card>
      ),
    },
    {
      key: 'display',
      label: '🎨 显示设置',
      children: (
        <Card>
          <Form
            initialValues={settings}
            onFinish={handleSaveSettings}
            layout="vertical"
          >
            <Form.Item name="theme" label="主题偏好">
              <Select options={[
                { value: 'light', label: '☀️ 浅色' },
                { value: 'dark', label: '🌙 深色' },
                { value: 'system', label: '💻 跟随系统' },
              ]} />
            </Form.Item>
            <Form.Item name="language" label="语言">
              <Select options={[
                { value: 'zh-CN', label: '中文' },
                { value: 'en-US', label: 'English' },
              ]} />
            </Form.Item>
            <Form.Item label="默认K线周期" name={['display', 'klineDefaultPeriod']}>
              <Select options={[
                { value: '5m', label: '5分钟' },
                { value: '15m', label: '15分钟' },
                { value: '60m', label: '60分钟' },
                { value: 'day', label: '日线' },
                { value: 'week', label: '周线' },
              ]} />
            </Form.Item>
            <Form.Item label="显示成交量" name={['display', 'showVolume']} valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">保存设置</Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'notifications',
      label: '🔔 通知偏好',
      children: (
        <Card>
          <Form initialValues={settings?.notifications} onFinish={(v) => handleSaveSettings({ notifications: v })} layout="vertical">
            <Form.Item name="email" label="邮件通知" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="push" label="推送通知" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="priceAlert" label="价格预警" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="newsAlert" label="新闻推送" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="weeklyReport" label="周报" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">保存</Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'history',
      label: '📜 操作历史',
      children: (
        <Card>
          <List
            dataSource={history}
            renderItem={(item) => {
              const typeInfo = ACTION_TYPE_MAP[item.type] || { label: item.type, color: 'default', icon: '📌' };
              return (
                <List.Item>
                  <List.Item.Meta
                    avatar={<span style={{ fontSize: 20 }}>{typeInfo.icon}</span>}
                    title={
                      <span>
                        <Tag color={typeInfo.color}>{typeInfo.label}</Tag>
                        {item.target}
                      </span>
                    }
                    description={item.detail || new Date(item.timestamp).toLocaleString('zh-CN')}
                  />
                </List.Item>
              );
            }}
            locale={{ emptyText: '暂无操作记录' }}
          />
        </Card>
      ),
    },
  ];

  return (
    <div style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>⚙️ 用户设置</h2>
        <Button icon={<LogoutOutlined />} onClick={handleLogout}>登出</Button>
      </Row>
      <Tabs items={tabItems} />
    </div>
  );
}
