/**
 * 多信号融合面板 — Ant Design 卡片布局
 * 将每个信号封装为圆角卡片，清晰展示方向/置信度/时间周期
 */

import { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Progress, Spin, Typography, Collapse } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface Signal {
  name: string;
  source: string;
  value: number | string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  timeframe: 'short' | 'medium' | 'long';
  detail?: string;
}

interface MultiSignalData {
  symbol: string;
  signals: Signal[];
  summary: {
    bullish: number;
    bearish: number;
    neutral: number;
    overall: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  };
  narrative: string;
  timestamp: string;
}

interface MultiSignalPanelProps {
  symbol: string;
}

const DIRECTION_CONFIG = {
  bullish: { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', icon: <RiseOutlined />, label: '看多' },
  bearish: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: <FallOutlined />, label: '看空' },
  neutral: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: <MinusOutlined />, label: '中性' },
} as const;

const TIMEFRAME_CONFIG = {
  short: { color: 'blue', label: '短期' },
  medium: { color: 'purple', label: '中期' },
  long: { color: 'cyan', label: '长期' },
} as const;

export default function MultiSignalPanel({ symbol }: MultiSignalPanelProps) {
  const [data, setData] = useState<MultiSignalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;

    const fetchSignals = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/ai/multi-signal/${symbol}`);
        if (!res.ok) throw new Error('Failed to fetch signals');

        const result = await res.json();
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || 'Unknown error');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch');
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
  }, [symbol]);

  if (loading) {
    return (
      <Card style={{ marginBottom: 12, borderRadius: 8 }}>
        <Spin tip="加载多信号数据...">
          <div style={{ height: 120 }} />
        </Spin>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={{ marginBottom: 12, borderRadius: 8 }}>
        <Text type="danger">信号加载失败: {error}</Text>
      </Card>
    );
  }

  if (!data) return null;

  const { signals, summary, narrative } = data;
  const totalSignals = summary.bullish + summary.bearish + summary.neutral;
  const bullishPct = totalSignals > 0 ? (summary.bullish / totalSignals) * 100 : 0;
  const bearishPct = totalSignals > 0 ? (summary.bearish / totalSignals) * 100 : 0;

  const overallCfg = DIRECTION_CONFIG[summary.overall];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DashboardOutlined style={{ color: overallCfg.color }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>多信号融合分析</span>
          </div>
          <Tag
            color={summary.overall === 'bullish' ? 'green' : summary.overall === 'bearish' ? 'red' : 'gold'}
            style={{ fontSize: 13, fontWeight: 600, padding: '2px 12px', borderRadius: 20 }}
          >
            {overallCfg.icon} {overallCfg.label} · 置信度 {(summary.confidence * 100).toFixed(0)}%
          </Tag>
        </div>
      }
      size="small"
      style={{ marginBottom: 12, borderRadius: 8 }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      {/* 信号分布统计条 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 12 }}>
              <RiseOutlined style={{ color: '#22c55e', marginRight: 4 }} />
              <Text style={{ color: '#22c55e', fontWeight: 600 }}>{summary.bullish} 看多</Text>
            </span>
            <span style={{ fontSize: 12 }}>
              <FallOutlined style={{ color: '#ef4444', marginRight: 4 }} />
              <Text style={{ color: '#ef4444', fontWeight: 600 }}>{summary.bearish} 看空</Text>
            </span>
            <span style={{ fontSize: 12 }}>
              <MinusOutlined style={{ color: '#f59e0b', marginRight: 4 }} />
              <Text style={{ color: '#f59e0b', fontWeight: 600 }}>{summary.neutral} 中性</Text>
            </span>
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            共 {totalSignals} 个信号
          </Text>
        </div>
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ width: `${bullishPct}%`, background: '#22c55e', transition: 'width 0.5s' }} />
          <div style={{ width: `${bearishPct}%`, background: '#ef4444', transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* 信号卡片网格 */}
      <Row gutter={[12, 12]}>
        {signals.map((signal, idx) => {
          const cfg = DIRECTION_CONFIG[signal.direction];
          const tfCfg = TIMEFRAME_CONFIG[signal.timeframe];
          return (
            <Col xs={24} sm={12} md={8} key={idx}>
              <Card
                size="small"
                hoverable
                style={{
                  borderRadius: 8,
                  borderLeft: `3px solid ${cfg.color}`,
                  background: cfg.bg,
                  height: '100%',
                }}
                styles={{ body: { padding: '12px 14px' } }}
              >
                {/* 头部: 图标 + 名称 + 时间周期 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 18, color: cfg.color }}>{cfg.icon}</span>
                    <Text strong style={{ fontSize: 13 }}>{signal.name}</Text>
                  </div>
                  <Tag color={tfCfg.color} style={{ fontSize: 10, borderRadius: 4, margin: 0, padding: '0 6px', lineHeight: '20px' }}>
                    <ClockCircleOutlined style={{ marginRight: 2 }} />
                    {tfCfg.label}
                  </Tag>
                </div>

                {/* 详情描述 */}
                {signal.detail && (
                  <div style={{ marginBottom: 10 }}>
                    <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
                      {signal.detail}
                    </Text>
                  </div>
                )}

                {/* 底部: 来源 + 数值 + 置信度 */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Tag style={{ fontSize: 10, borderRadius: 4, margin: 0, padding: '0 6px', lineHeight: '18px' }}>
                    {signal.source}
                  </Tag>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: cfg.color, fontFamily: 'monospace', lineHeight: 1.2 }}>
                      {signal.value}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      置信度 {(signal.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {/* 置信度进度条 */}
                <div style={{ marginTop: 8 }}>
                  <Progress
                    percent={signal.confidence * 100}
                    size="small"
                    showInfo={false}
                    strokeColor={cfg.color}
                    trailColor="rgba(255,255,255,0.06)"
                    style={{ margin: 0, lineHeight: 0 }}
                  />
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* AI 叙事报告 — 可折叠 */}
      {narrative && (
        <Collapse
          ghost
          size="small"
          style={{ marginTop: 16, background: 'transparent' }}
          items={[
            {
              key: 'narrative',
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ThunderboltOutlined style={{ color: '#3b82f6' }} />
                  <Text strong style={{ fontSize: 13 }}>AI 分析报告</Text>
                </div>
              ),
              children: (
                <div
                  style={{
                    background: 'rgba(30,41,59,0.5)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    border: '1px solid rgba(59,130,246,0.2)',
                  }}
                >
                  {narrative.split('\n').map((line, i) => {
                    if (line.startsWith('# '))
                      return <Title key={i} level={5} style={{ color: 'var(--text-primary)', margin: '12px 0 6px' }}>{line.slice(2)}</Title>;
                    if (line.startsWith('## '))
                      return <Text key={i} strong style={{ display: 'block', margin: '10px 0 4px', fontSize: 14, color: 'var(--text-primary)' }}>{line.slice(3)}</Text>;
                    if (line.startsWith('### '))
                      return <Text key={i} style={{ display: 'block', margin: '8px 0 2px', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{line.slice(4)}</Text>;
                    if (line.startsWith('> '))
                      return (
                        <blockquote key={i} style={{ borderLeft: '2px solid #3b82f6', paddingLeft: 12, margin: '8px 0', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          {line.slice(2)}
                        </blockquote>
                      );
                    if (line.startsWith('- '))
                      return <li key={i} style={{ color: 'var(--text-secondary)', marginLeft: 16, fontSize: 13 }}>{line.slice(2)}</li>;
                    if (line.trim() === '') return <br key={i} />;
                    return <p key={i} style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7, margin: '4px 0' }}>{line}</p>;
                  })}
                </div>
              ),
            },
          ]}
        />
      )}

      {/* 底部信息 */}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}>
        <span>数据来源: {[...new Set(signals.map(s => s.source))].join(', ')}</span>
        <span>{new Date(data.timestamp).toLocaleString('zh-CN')}</span>
      </div>
    </Card>
  );
}
