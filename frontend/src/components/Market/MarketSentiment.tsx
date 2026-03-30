/**
 * 市场情绪仪表盘
 * 涨跌比、换手率、成交量、市场情绪分数
 * 参考同花顺市场情绪指标
 */

import React, { useMemo } from 'react';
import { Card, Row, Col, Progress, Statistic, Typography, Tag, Tooltip } from 'antd';
import {
  RiseOutlined, FallOutlined, SwapOutlined, FireOutlined,
  ThunderboltOutlined, SmileOutlined, FrownOutlined, MehOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface SentimentProps {
  riseCount: number;
  fallCount: number;
  flatCount: number;
  limitUp: number;
  limitDown: number;
  totalTurnover: number;
  avgChangePercent: number;
  avgTurnoverRate?: number;
}

function calcSentimentScore(props: SentimentProps): number {
  const { riseCount, fallCount, limitUp, limitDown, avgChangePercent } = props;
  const total = riseCount + fallCount + (props.flatCount || 0);
  if (total === 0) return 0;

  // 涨跌比分数 (-30 ~ 30)
  const ratioScore = ((riseCount - fallCount) / total) * 30;

  // 涨停/跌停分数 (-20 ~ 20)
  const limitScore = ((limitUp - limitDown) / Math.max(total, 1)) * 200;

  // 平均涨跌幅分数 (-30 ~ 30)
  const changeScore = Math.max(-30, Math.min(30, avgChangePercent * 6));

  // 综合分 (-100 ~ 100)
  return Math.round(Math.max(-100, Math.min(100, ratioScore + limitScore + changeScore)));
}

function getSentimentInfo(score: number): { label: string; color: string; icon: React.ReactNode } {
  if (score >= 60) return { label: '极度乐观', color: '#f5222d', icon: <SmileOutlined /> };
  if (score >= 30) return { label: '偏乐观', color: '#fa8c16', icon: <SmileOutlined /> };
  if (score >= 10) return { label: '温和乐观', color: '#faad14', icon: <MehOutlined /> };
  if (score >= -10) return { label: '中性', color: '#52c41a', icon: <MehOutlined /> };
  if (score >= -30) return { label: '温和悲观', color: '#1890ff', icon: <MehOutlined /> };
  if (score >= -60) return { label: '偏悲观', color: '#722ed1', icon: <FrownOutlined /> };
  return { label: '极度悲观', color: '#2f54eb', icon: <FrownOutlined /> };
}

export default function MarketSentiment({
  riseCount,
  fallCount,
  flatCount = 0,
  limitUp,
  limitDown,
  totalTurnover,
  avgChangePercent,
  avgTurnoverRate,
}: SentimentProps) {
  const total = riseCount + fallCount + flatCount;
  const score = useMemo(() => calcSentimentScore({
    riseCount, fallCount, flatCount, limitUp, limitDown, totalTurnover, avgChangePercent, avgTurnoverRate,
  }), [riseCount, fallCount, flatCount, limitUp, limitDown, totalTurnover, avgChangePercent, avgTurnoverRate]);

  const sentiment = getSentimentInfo(score);

  const risePercent = total > 0 ? (riseCount / total * 100) : 0;
  const fallPercent = total > 0 ? (fallCount / total * 100) : 0;
  const flatPercent = total > 0 ? (flatCount / total * 100) : 0;

  return (
    <Card
      title={
        <span>
          <ThunderboltOutlined style={{ marginRight: 8 }} />
          市场情绪
        </span>
      }
      size="small"
    >
      {/* 情绪分数 */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: sentiment.color, lineHeight: 1.2 }}>
          {score}
        </div>
        <Tag
          icon={sentiment.icon}
          color={sentiment.color}
          style={{ marginTop: 4, fontSize: 14 }}
        >
          {sentiment.label}
        </Tag>
      </div>

      {/* 涨跌分布 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 12 }}>涨跌分布</Text>
          <Text style={{ fontSize: 12 }}>{total} 只</Text>
        </div>
        <div style={{
          display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden',
          background: '#f0f0f0',
        }}>
          <Tooltip title={`上涨: ${riseCount} 只 (${risePercent.toFixed(1)}%)`}>
            <div style={{
              width: `${risePercent}%`,
              background: '#f5222d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: risePercent > 5 ? undefined : 0,
            }}>
              {risePercent > 10 && <Text style={{ color: '#fff', fontSize: 11 }}>{riseCount}</Text>}
            </div>
          </Tooltip>
          <Tooltip title={`平盘: ${flatCount} 只`}>
            <div style={{
              width: `${flatPercent}%`,
              background: '#d9d9d9',
              minWidth: flatPercent > 5 ? undefined : 0,
            }} />
          </Tooltip>
          <Tooltip title={`下跌: ${fallCount} 只 (${fallPercent.toFixed(1)}%)`}>
            <div style={{
              width: `${fallPercent}%`,
              background: '#52c41a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: fallPercent > 5 ? undefined : 0,
            }}>
              {fallPercent > 10 && <Text style={{ color: '#fff', fontSize: 11 }}>{fallCount}</Text>}
            </div>
          </Tooltip>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <Text type="danger" style={{ fontSize: 12 }}>
            <RiseOutlined /> {riseCount}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <SwapOutlined /> {flatCount}
          </Text>
          <Text type="success" style={{ fontSize: 12 }}>
            <FallOutlined /> {fallCount}
          </Text>
        </div>
      </div>

      {/* 核心指标 */}
      <Row gutter={[8, 8]}>
        <Col span={12}>
          <div style={{ background: '#fff1f0', padding: '8px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#666' }}>涨停</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f5222d' }}>{limitUp}</div>
          </div>
        </Col>
        <Col span={12}>
          <div style={{ background: '#f6ffed', padding: '8px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#666' }}>跌停</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a' }}>{limitDown}</div>
          </div>
        </Col>
        <Col span={12}>
          <div style={{ background: '#e6f7ff', padding: '8px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#666' }}>成交额</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>
              {(totalTurnover / 1e12).toFixed(2)}万亿
            </div>
          </div>
        </Col>
        <Col span={12}>
          <div style={{ background: '#fff7e6', padding: '8px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#666' }}>平均涨跌</div>
            <div style={{
              fontSize: 16, fontWeight: 600,
              color: avgChangePercent > 0 ? '#f5222d' : avgChangePercent < 0 ? '#52c41a' : '#666',
            }}>
              {avgChangePercent > 0 ? '+' : ''}{avgChangePercent.toFixed(2)}%
            </div>
          </div>
        </Col>
      </Row>
    </Card>
  );
}
