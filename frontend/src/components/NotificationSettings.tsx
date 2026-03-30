/**
 * 通知设置组件
 * 管理用户通知偏好、订阅类型、免打扰时段
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  NotificationPreferences,
  NotificationType,
  notificationApi,
  NOTIFICATION_LABELS,
} from '../services/notificationService';

interface NotificationSettingsProps {
  userId: string;
  onClose?: () => void;
}

const ALL_TYPES: NotificationType[] = [
  'price_alert',
  'limit_up',
  'limit_down',
  'volume_surge',
  'watchlist_update',
  'news',
  'trade',
  'report',
  'system',
];

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ userId, onClose }) => {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationApi.getPreferences(userId);
      setPrefs(data);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      await notificationApi.updatePreferences(userId, prefs);
      if (onClose) onClose();
    } catch {
      // 静默失败
    } finally {
      setSaving(false);
    }
  };

  const toggleSubscription = (type: NotificationType) => {
    if (!prefs) return;
    const existing = prefs.subscriptions.find(s => s.type === type);
    if (existing) {
      setPrefs({
        ...prefs,
        subscriptions: prefs.subscriptions.map(s =>
          s.type === type ? { ...s, enabled: !s.enabled } : s
        ),
      });
    } else {
      setPrefs({
        ...prefs,
        subscriptions: [
          ...prefs.subscriptions,
          {
            userId,
            type,
            channels: ['in_app'],
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      });
    }
  };

  const isSubscriptionEnabled = (type: NotificationType): boolean => {
    const sub = prefs?.subscriptions.find(s => s.type === type);
    return sub ? sub.enabled : true; // 默认开启
  };

  if (loading || !prefs) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>;
  }

  return (
    <div
      className="notification-settings"
      style={{
        width: '480px',
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      }}
    >
      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '16px' }}>通知设置</span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#999',
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ padding: '20px' }}>
        {/* 全局开关 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs.globalEnabled}
              onChange={e => setPrefs({ ...prefs, globalEnabled: e.target.checked })}
            />
            <span style={{ fontWeight: 500, fontSize: '15px' }}>启用通知</span>
          </label>
        </div>

        {/* 渠道开关 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '10px', color: '#333' }}>
            通知渠道
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={prefs.pushEnabled}
                onChange={e => setPrefs({ ...prefs, pushEnabled: e.target.checked })}
                disabled={!prefs.globalEnabled}
              />
              <span>浏览器推送通知</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={prefs.emailEnabled}
                onChange={e => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
                disabled={!prefs.globalEnabled}
              />
              <span>邮件通知</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={prefs.smsEnabled}
                onChange={e => setPrefs({ ...prefs, smsEnabled: e.target.checked })}
                disabled={!prefs.globalEnabled}
              />
              <span>短信通知</span>
            </label>
          </div>
        </div>

        {/* 订阅类型 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '10px', color: '#333' }}>
            订阅通知类型
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {ALL_TYPES.map(type => (
              <label
                key={type}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '4px',
                  background: isSubscriptionEnabled(type) ? '#f0f7ff' : '#f5f5f5',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSubscriptionEnabled(type)}
                  onChange={() => toggleSubscription(type)}
                  disabled={!prefs.globalEnabled}
                />
                <span style={{ fontSize: '13px' }}>{NOTIFICATION_LABELS[type]}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 免打扰时段 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '10px', color: '#333' }}>
            免打扰时段
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={prefs.quietHoursEnabled}
              onChange={e => setPrefs({ ...prefs, quietHoursEnabled: e.target.checked })}
              disabled={!prefs.globalEnabled}
            />
            <span>启用免打扰</span>
          </label>
          {prefs.quietHoursEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '24px' }}>
              <input
                type="time"
                value={prefs.quietHoursStart}
                onChange={e => setPrefs({ ...prefs, quietHoursStart: e.target.value })}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d9d9d9' }}
              />
              <span>至</span>
              <input
                type="time"
                value={prefs.quietHoursEnd}
                onChange={e => setPrefs({ ...prefs, quietHoursEnd: e.target.value })}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d9d9d9' }}
              />
            </div>
          )}
        </div>

        {/* 每日摘要 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs.dailyDigest}
              onChange={e => setPrefs({ ...prefs, dailyDigest: e.target.checked })}
              disabled={!prefs.globalEnabled}
            />
            <span>每日通知摘要</span>
            <span style={{ fontSize: '12px', color: '#999' }}>（汇总当天通知，每日推送一次）</span>
          </label>
        </div>

        {/* 每日最大通知数 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#333' }}>
            每日最大通知数
          </div>
          <input
            type="number"
            value={prefs.maxDailyNotifications}
            onChange={e => setPrefs({ ...prefs, maxDailyNotifications: parseInt(e.target.value, 10) || 0 })}
            min={1}
            max={1000}
            disabled={!prefs.globalEnabled}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #d9d9d9',
              width: '120px',
            }}
          />
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          padding: '12px 20px',
          borderTop: '1px solid #f0f0f0',
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '4px',
              border: '1px solid #d9d9d9',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 20px',
            borderRadius: '4px',
            border: 'none',
            background: '#1890ff',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  );
};

export default NotificationSettings;
