/**
 * 通知铃铛组件
 * 显示未读数量，点击展开通知列表
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppNotification,
  NotificationStats,
  notificationApi,
  NOTIFICATION_ICONS,
  PRIORITY_COLORS,
  formatNotificationTime,
} from '../services/notificationService';

interface NotificationBellProps {
  userId: string;
  pollingInterval?: number;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  userId,
  pollingInterval = 30000,
}) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 获取未读数
  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await notificationApi.getUnreadCount(userId);
      setUnreadCount(count);
    } catch {
      // 静默失败
    }
  }, [userId]);

  // 获取通知列表
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [list, statsData] = await Promise.all([
        notificationApi.getUserNotifications(userId, { limit: 20 }),
        notificationApi.getStats(userId),
      ]);
      setNotifications(list);
      setStats(statsData);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // 定时轮询未读数
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, pollingInterval);
    return () => clearInterval(interval);
  }, [fetchUnreadCount, pollingInterval]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 打开面板时加载通知
  const handleToggle = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
  };

  // 标记已读
  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationApi.markAsRead(id);
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true, readAt: Date.now() } : n))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  // 全部已读
  const handleMarkAllAsRead = async () => {
    await notificationApi.markAllAsRead(userId);
    setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: Date.now() })));
    setUnreadCount(0);
  };

  // 删除通知
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationApi.deleteNotification(id);
    const deleted = notifications.find(n => n.id === id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (deleted && !deleted.read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  // 点击通知
  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.read) {
      handleMarkAsRead(notification.id, {} as React.MouseEvent);
    }
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  };

  return (
    <div className="notification-bell-wrapper" ref={dropdownRef} style={{ position: 'relative' }}>
      {/* 铃铛按钮 */}
      <button
        className="notification-bell-btn"
        onClick={handleToggle}
        aria-label="通知"
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '20px',
          padding: '8px',
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            className="notification-badge"
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: '#ff4d4f',
              color: '#fff',
              borderRadius: '10px',
              padding: '0 6px',
              fontSize: '11px',
              lineHeight: '18px',
              minWidth: '18px',
              textAlign: 'center',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div
          className="notification-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            width: '380px',
            maxHeight: '500px',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* 头部 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '15px' }}>
              通知 {unreadCount > 0 && `(${unreadCount}条未读)`}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1890ff',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                全部已读
              </button>
            )}
          </div>

          {/* 通知列表 */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                加载中...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                暂无通知
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 16px',
                    borderBottom: '1px solid #f5f5f5',
                    cursor: 'pointer',
                    background: n.read ? '#fff' : '#f0f7ff',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = n.read ? '#fafafa' : '#e6f0ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.read ? '#fff' : '#f0f7ff')}
                >
                  {/* 图标 */}
                  <div style={{ fontSize: '24px', flexShrink: 0, lineHeight: 1 }}>
                    {n.icon || NOTIFICATION_ICONS[n.type] || '🔔'}
                  </div>

                  {/* 内容 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <span
                        style={{
                          fontWeight: n.read ? 400 : 600,
                          fontSize: '14px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.title}
                      </span>
                      <span style={{ fontSize: '12px', color: '#999', flexShrink: 0 }}>
                        {formatNotificationTime(n.createdAt)}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '13px',
                        color: '#666',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {n.body}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          background: PRIORITY_COLORS[n.priority] + '20',
                          color: PRIORITY_COLORS[n.priority],
                        }}
                      >
                        {n.priority === 'urgent' ? '紧急' : n.priority === 'high' ? '重要' : n.priority === 'medium' ? '普通' : '低'}
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                    {!n.read && (
                      <button
                        onClick={e => handleMarkAsRead(n.id, e)}
                        title="标记已读"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '2px',
                        }}
                      >
                        ✅
                      </button>
                    )}
                    <button
                      onClick={e => handleDelete(n.id, e)}
                      title="删除"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '2px',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 底部统计 */}
          {stats && (
            <div
              style={{
                padding: '8px 16px',
                borderTop: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#999',
              }}
            >
              <span>共 {stats.total} 条通知</span>
              <span>
                价格预警 {stats.byType.price_alert || 0} | 新闻 {stats.byType.news || 0} | 系统 {stats.byType.system || 0}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
