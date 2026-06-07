/**
 * 预警管理页面
 * 功能：预警规则管理、触发历史、快速创建
 */

import React, { useState, useCallback, useMemo } from 'react';

// ── 类型定义 ──
type AlertOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'cross_above' | 'cross_below' | 'change_pct';

interface AlertRule {
  id: string;
  name: string;
  stockCode: string;
  field: string;
  operator: AlertOperator;
  threshold: number;
  level: 'info' | 'warning' | 'critical';
  enabled: boolean;
  description: string;
  createdAt: string;
}

interface AlertTrigger {
  id: string;
  ruleId: string;
  ruleName: string;
  stockCode: string;
  triggeredAt: string;
  currentValue: number;
  threshold: number;
  level: 'info' | 'warning' | 'critical';
  message: string;
  acknowledged: boolean;
}

// ── 模拟数据 ──
const MOCK_RULES: AlertRule[] = [
  {
    id: 'rule-1',
    name: '茅台突破1800',
    stockCode: '600519',
    field: 'price',
    operator: 'gt',
    threshold: 1800,
    level: 'info',
    enabled: true,
    description: '贵州茅台股价突破1800元时提醒',
    createdAt: '2026-04-15T10:00:00Z',
  },
  {
    id: 'rule-2',
    name: '宁德时代跌幅超5%',
    stockCode: '300750',
    field: 'change_pct',
    operator: 'lt',
    threshold: -5,
    level: 'warning',
    enabled: true,
    description: '宁德时代跌幅超过5%时警告',
    createdAt: '2026-04-18T14:30:00Z',
  },
  {
    id: 'rule-3',
    name: '比亚迪涨停',
    stockCode: '002594',
    field: 'change_pct',
    operator: 'gte',
    threshold: 9.9,
    level: 'critical',
    enabled: false,
    description: '比亚迪接近涨停时紧急提醒',
    createdAt: '2026-04-20T09:00:00Z',
  },
];

const MOCK_TRIGGERS: AlertTrigger[] = [
  {
    id: 'trigger-1',
    ruleId: 'rule-1',
    ruleName: '茅台突破1800',
    stockCode: '600519',
    triggeredAt: '2026-04-22T10:15:00Z',
    currentValue: 1815.5,
    threshold: 1800,
    level: 'info',
    message: '贵州茅台当前价格1815.50元，已突破1800元',
    acknowledged: false,
  },
  {
    id: 'trigger-2',
    ruleId: 'rule-2',
    ruleName: '宁德时代跌幅超5%',
    stockCode: '300750',
    triggeredAt: '2026-04-21T14:45:00Z',
    currentValue: -5.23,
    threshold: -5,
    level: 'warning',
    message: '宁德时代当前跌幅-5.23%，超过-5%阈值',
    acknowledged: true,
  },
];

// ── 工具函数 ──
const OPERATOR_LABELS: Record<AlertOperator, string> = {
  gt: '大于',
  lt: '小于',
  gte: '大于等于',
  lte: '小于等于',
  eq: '等于',
  neq: '不等于',
  cross_above: '上穿',
  cross_below: '下穿',
  change_pct: '涨跌幅',
};

const LEVEL_COLORS: Record<string, string> = {
  info: '#1890ff',
  warning: '#faad14',
  critical: '#ff4d4f',
};

const LEVEL_LABELS: Record<string, string> = {
  info: '普通',
  warning: '警告',
  critical: '紧急',
};

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
};

// ── 子组件 ──

/** 预警规则卡片 */
const RuleCard: React.FC<{
  rule: AlertRule;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ rule, onToggle, onDelete }) => (
  <div
    style={{
      padding: '16px',
      borderRadius: '8px',
      border: `1px solid ${rule.enabled ? '#e8e8e8' : '#f0f0f0'}`,
      background: rule.enabled ? '#fff' : '#fafafa',
      opacity: rule.enabled ? 1 : 0.7,
      transition: 'all 0.2s',
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: LEVEL_COLORS[rule.level],
            }}
          />
          <span style={{ fontWeight: 600, fontSize: '15px' }}>{rule.name}</span>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '3px',
              background: '#f5f5f5',
              color: '#666',
            }}
          >
            {rule.stockCode}
          </span>
        </div>
        <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
          {rule.description}
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#999' }}>
          <span>条件: {rule.field} {OPERATOR_LABELS[rule.operator]} {rule.threshold}</span>
          <span>级别: {LEVEL_LABELS[rule.level]}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={() => onToggle(rule.id)}
          title={rule.enabled ? '停用' : '启用'}
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            border: '1px solid #d9d9d9',
            background: rule.enabled ? '#fff' : '#f0f7ff',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          {rule.enabled ? '停用' : '启用'}
        </button>
        <button
          onClick={() => onDelete(rule.id)}
          title="删除"
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ffccc7',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#ff4d4f',
          }}
        >
          🗑️
        </button>
      </div>
    </div>
    <div style={{ fontSize: '11px', color: '#bbb' }}>
      创建于 {formatTime(rule.createdAt)}
    </div>
  </div>
);

/** 触发历史项 */
const TriggerItem: React.FC<{
  trigger: AlertTrigger;
  onAcknowledge: (id: string) => void;
}> = ({ trigger, onAcknowledge }) => (
  <div
    style={{
      display: 'flex',
      gap: '12px',
      padding: '12px 16px',
      borderBottom: '1px solid #f5f5f5',
      background: trigger.acknowledged ? '#fff' : '#f0f7ff',
    }}
  >
    <div
      style={{
        width: '4px',
        borderRadius: '2px',
        background: LEVEL_COLORS[trigger.level],
        flexShrink: 0,
      }}
    />
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontWeight: 500, fontSize: '14px' }}>{trigger.ruleName}</span>
        <span style={{ fontSize: '12px', color: '#999' }}>{formatTime(trigger.triggeredAt)}</span>
      </div>
      <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px' }}>{trigger.message}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '3px',
            background: LEVEL_COLORS[trigger.level] + '20',
            color: LEVEL_COLORS[trigger.level],
          }}
        >
          {LEVEL_LABELS[trigger.level]}
        </span>
        <span style={{ fontSize: '12px', color: '#999' }}>
          股票: {trigger.stockCode} | 阈值: {trigger.threshold} | 实际: {trigger.currentValue}
        </span>
        {!trigger.acknowledged && (
          <button
            onClick={() => onAcknowledge(trigger.id)}
            style={{
              marginLeft: 'auto',
              padding: '2px 8px',
              borderRadius: '3px',
              border: '1px solid #1890ff',
              background: '#fff',
              color: '#1890ff',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            确认
          </button>
        )}
      </div>
    </div>
  </div>
);

/** 统计卡片 */
const StatCard: React.FC<{
  title: string;
  value: number | string;
  icon: string;
  color?: string;
}> = ({ title, value, icon, color = '#1890ff' }) => (
  <div
    style={{
      padding: '16px',
      borderRadius: '8px',
      background: '#fff',
      border: '1px solid #e8e8e8',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flex: 1,
    }}
  >
    <div
      style={{
        width: '40px',
        height: '40px',
        borderRadius: '8px',
        background: color + '15',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
      }}
    >
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>{title}</div>
      <div style={{ fontSize: '24px', fontWeight: 600, color }}>{value}</div>
    </div>
  </div>
);

// ── 主组件 ──
const AlertsPage: React.FC = () => {
  const [rules, setRules] = useState<AlertRule[]>(MOCK_RULES);
  const [triggers, setTriggers] = useState<AlertTrigger[]>(MOCK_TRIGGERS);
  const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // 表单状态
  const [newRule, setNewRule] = useState({
    name: '',
    stockCode: '',
    field: 'price',
    operator: 'gt' as AlertOperator,
    threshold: 0,
    level: 'info' as 'info' | 'warning' | 'critical',
    description: '',
  });

  // 计算统计
  const stats = useMemo(() => {
    const activeRules = rules.filter(r => r.enabled).length;
    const triggersToday = triggers.filter(t => {
      const today = new Date().toDateString();
      return new Date(t.triggeredAt).toDateString() === today;
    }).length;
    const unacknowledged = triggers.filter(t => !t.acknowledged).length;
    const byLevel = { info: 0, warning: 0, critical: 0 };
    triggers.forEach(t => byLevel[t.level]++);
    return { activeRules, triggersToday, unacknowledged, byLevel, totalRules: rules.length };
  }, [rules, triggers]);

  // 操作
  const handleToggleRule = useCallback((id: string) => {
    setRules(prev => prev.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }, []);

  const handleDeleteRule = useCallback((id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleAcknowledge = useCallback((id: string) => {
    setTriggers(prev => prev.map(t => (t.id === id ? { ...t, acknowledged: true } : t)));
  }, []);

  const handleCreateRule = useCallback(() => {
    if (!newRule.name || !newRule.stockCode) return;
    const rule: AlertRule = {
      ...newRule,
      id: `rule-${Date.now()}`,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    setRules(prev => [rule, ...prev]);
    setNewRule({ name: '', stockCode: '', field: 'price', operator: 'gt', threshold: 0, level: 'info', description: '' });
    setShowCreateForm(false);
  }, [newRule]);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>🔔 预警管理</h1>
          <p style={{ margin: '4px 0 0', color: '#999', fontSize: '14px' }}>
            管理股票预警规则，实时监控市场异动
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: 'none',
            background: '#1890ff',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          + 新建预警
        </button>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <StatCard title="活跃规则" value={stats.activeRules} icon="⚡" color="#1890ff" />
        <StatCard title="今日触发" value={stats.triggersToday} icon="🔔" color="#faad14" />
        <StatCard title="未确认" value={stats.unacknowledged} icon="⚠️" color="#ff4d4f" />
        <StatCard title="紧急告警" value={stats.byLevel.critical} icon="🚨" color="#ff4d4f" />
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '1px solid #e8e8e8' }}>
        <button
          onClick={() => setActiveTab('rules')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'rules' ? 600 : 400,
            color: activeTab === 'rules' ? '#1890ff' : '#666',
            borderBottom: activeTab === 'rules' ? '2px solid #1890ff' : '2px solid transparent',
          }}
        >
          预警规则 ({rules.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'history' ? 600 : 400,
            color: activeTab === 'history' ? '#1890ff' : '#666',
            borderBottom: activeTab === 'history' ? '2px solid #1890ff' : '2px solid transparent',
          }}
        >
          触发历史 ({triggers.length})
        </button>
      </div>

      {/* 创建表单模态 */}
      {showCreateForm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowCreateForm(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '24px',
              width: '480px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px' }}>新建预警规则</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>规则名称</label>
                <input
                  value={newRule.name}
                  onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder="例如：茅台突破1800"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #d9d9d9', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>股票代码</label>
                <input
                  value={newRule.stockCode}
                  onChange={e => setNewRule({ ...newRule, stockCode: e.target.value })}
                  placeholder="例如：600519"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #d9d9d9', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>监控字段</label>
                  <select
                    value={newRule.field}
                    onChange={e => setNewRule({ ...newRule, field: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #d9d9d9' }}
                  >
                    <option value="price">价格</option>
                    <option value="volume">成交量</option>
                    <option value="change_pct">涨跌幅</option>
                    <option value="turnover">换手率</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>条件</label>
                  <select
                    value={newRule.operator}
                    onChange={e => setNewRule({ ...newRule, operator: e.target.value as AlertOperator })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #d9d9d9' }}
                  >
                    {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
                      <option key={op} value={op}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>阈值</label>
                  <input
                    type="number"
                    value={newRule.threshold}
                    onChange={e => { const val = parseFloat(e.target.value); setNewRule({ ...newRule, threshold: Number.isFinite(val) ? val : 0 }); }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #d9d9d9', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>告警级别</label>
                  <select
                    value={newRule.level}
                    onChange={e => setNewRule({ ...newRule, level: e.target.value as 'info' | 'warning' | 'critical' })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #d9d9d9' }}
                  >
                    <option value="info">普通</option>
                    <option value="warning">警告</option>
                    <option value="critical">紧急</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>描述（可选）</label>
                <textarea
                  value={newRule.description}
                  onChange={e => setNewRule({ ...newRule, description: e.target.value })}
                  placeholder="预警规则说明..."
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #d9d9d9', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => setShowCreateForm(false)}
                style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleCreateRule}
                style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#1890ff', color: '#fff', cursor: 'pointer' }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 内容区域 */}
      {activeTab === 'rules' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔔</div>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>暂无预警规则</div>
              <div style={{ fontSize: '14px' }}>点击右上角"新建预警"创建第一个规则</div>
            </div>
          ) : (
            rules.map(rule => (
              <RuleCard key={rule.id} rule={rule} onToggle={handleToggleRule} onDelete={handleDeleteRule} />
            ))
          )}
        </div>
      ) : (
        <div
          style={{
            borderRadius: '8px',
            border: '1px solid #e8e8e8',
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          {triggers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>暂无触发记录</div>
              <div style={{ fontSize: '14px' }}>预警规则触发后将在此显示</div>
            </div>
          ) : (
            triggers.map(trigger => (
              <TriggerItem key={trigger.id} trigger={trigger} onAcknowledge={handleAcknowledge} />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
