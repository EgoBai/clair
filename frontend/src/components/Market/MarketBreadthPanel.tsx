/**
 * 市场宽度面板组件
 * 展示涨跌家数、市场情绪、McClellan指标
 */

import React from 'react';
import { Card, Row, Col, Statistic, Progress, Tag, Spin, Tooltip } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

export interface BreadthData {
  timestamp: number;
  advancing: number;
  declining: number;
  unchanged: number;
  totalStocks: number;
  advanceDeclineRatio: number;
  newHighs: number;
  newLows: number;
  upVolume: number;
  downVolume: number;
  volumeRatio: number;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number;
}

interface MarketBreadthPanelProps {
  data?: BreadthData | null;
  loading?: boolean;
  onRefresh?: () => void;
  compact?: boolean;
}

const sentimentColors: Record<string, string> = {
  bullish: '#52c41a',
  bearish: '#ff4d4f',
  neutral: '#faad14',
};

const sentimentLabels: Record<string, string> = {
  bullish: '偏多',
  bearish: '偏空',
  neutral: '中性',
};

export const MarketBreadthPanel: React.FC<MarketBreadthPanelProps> = ({
  data,
  loading = false,
  onRefresh,
  compact = false,
}) => {
  if (loading) {
    return (
      <Card title="市场宽度分析" className="breadth-panel">
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="市场宽度分析" className="breadth-panel">
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          暂无数据
        </div>
      </Card>
    );
  }

  const total = data.advancing + data.declining + data.unchanged;
  const advancePercent = (data.advancing / total) * 100;
  const declinePercent = (data.declining / total) * 100;
  const unchangedPercent = (data.unchanged / total) * 100;

  const formatVolume = (vol: number): string => {
    if (vol >= 1e12) return (vol / 1e12).toFixed(1) + '万亿';
    if (vol >= 1e8) return (vol / 1e8).toFixed(1) + '亿';
    if (vol >= 1e4) return (vol / 1e4).toFixed(1) + '万';
    return vol.toString();
  };

  return (
    <Card
      title={
        <span>
          市场宽度分析
          <Tooltip title="实时涨跌家数比、成交量分布、市场情绪指标">
            <InfoCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
          </Tooltip>
        </span>
      }
      className="breadth-panel"
      extra={
        onRefresh && (
          <a onClick={onRefresh} style={{ fontSize: 12 }}>
            刷新
          </a>
        )
      }
    >
      {/* 涨跌分布条 */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            height: 24,
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: `${advancePercent}%`,
              backgroundColor: '#52c41a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 12,
              minWidth: advancePercent > 8 ? 'auto' : 0,
            }}
          >
            {advancePercent > 8 && `涨 ${data.advancing}`}
          </div>
          <div
            style={{
              width: `${unchangedPercent}%`,
              backgroundColor: '#d9d9d9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: '#666',
              minWidth: unchangedPercent > 5 ? 'auto' : 0,
            }}
          >
            {unchangedPercent > 5 && `平 ${data.unchanged}`}
          </div>
          <div
            style={{
              width: `${declinePercent}%`,
              backgroundColor: '#ff4d4f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 12,
              minWidth: declinePercent > 8 ? 'auto' : 0,
            }}
          >
            {declinePercent > 8 && `跌 ${data.declining}`}
          </div>
        </div>
      </div>

      {/* 核心指标 */}
      <Row gutter={[16, 16]}>
        <Col span={compact ? 12 : 6}>
          <Statistic
            title="涨跌比"
            value={data.advanceDeclineRatio}
            precision={2}
            prefix={
              data.advanceDeclineRatio >= 1 ? (
                <ArrowUpOutlined style={{ color: '#52c41a' }} />
              ) : (
                <ArrowDownOutlined style={{ color: '#ff4d4f' }} />
              )
            }
            valueStyle={{
              color: data.advanceDeclineRatio >= 1 ? '#52c41a' : '#ff4d4f',
              fontSize: compact ? 18 : 24,
            }}
          />
        </Col>
        <Col span={compact ? 12 : 6}>
          <Statistic
            title="量比"
            value={data.volumeRatio}
            precision={2}
            prefix={
              data.volumeRatio >= 1 ? (
                <ArrowUpOutlined style={{ color: '#52c41a' }} />
              ) : (
                <ArrowDownOutlined style={{ color: '#ff4d4f' }} />
              )
            }
            valueStyle={{
              color: data.volumeRatio >= 1 ? '#52c41a' : '#ff4d4f',
              fontSize: compact ? 18 : 24,
            }}
          />
        </Col>
        <Col span={compact ? 12 : 6}>
          <Statistic
            title="新高新低"
            value={`${data.newHighs} / ${data.newLows}`}
            valueStyle={{ fontSize: compact ? 18 : 24 }}
          />
        </Col>
        <Col span={compact ? 12 : 6}>
          <div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 14, marginBottom: 4 }}>
              市场情绪
            </div>
            <Tag
              color={sentimentColors[data.marketSentiment]}
              style={{ fontSize: 16, padding: '4px 12px' }}
            >
              {sentimentLabels[data.marketSentiment]}
            </Tag>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
              情绪分数: {data.sentimentScore}
            </div>
          </div>
        </Col>
      </Row>

      {/* 情绪分数条 */}
      {!compact && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: '#999',
              marginBottom: 4,
            }}
          >
            <span>极度悲观</span>
            <span>中性</span>
            <span>极度乐观</span>
          </div>
          <div
            style={{
              position: 'relative',
              height: 8,
              background: 'linear-gradient(to right, #ff4d4f, #faad14 50%, #52c41a)',
              borderRadius: 4,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: `${((data.sentimentScore + 100) / 200) * 100}%`,
                top: -4,
                width: 16,
                height: 16,
                backgroundColor: '#fff',
                border: '2px solid #333',
                borderRadius: '50%',
                transform: 'translateX(-50%)',
              }}
            />
          </div>
        </div>
      )}

      {/* 成交量分布 */}
      {!compact && (
        <Row gutter={16} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
          <Col span={12}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: '#52c41a' }}>
                <ArrowUpOutlined /> 上涨成交量
              </span>
              <span style={{ fontSize: 12 }}>{formatVolume(data.upVolume)}</span>
            </div>
            <Progress
              percent={Math.round((data.upVolume / (data.upVolume + data.downVolume)) * 100)}
              strokeColor="#52c41a"
              showInfo={false}
              size="small"
            />
          </Col>
          <Col span={12}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: '#ff4d4f' }}>
                <ArrowDownOutlined /> 下跌成交量
              </span>
              <span style={{ fontSize: 12 }}>{formatVolume(data.downVolume)}</span>
            </div>
            <Progress
              percent={Math.round((data.downVolume / (data.upVolume + data.downVolume)) * 100)}
              strokeColor="#ff4d4f"
              showInfo={false}
              size="small"
            />
          </Col>
        </Row>
      )}
    </Card>
  );
};

export default MarketBreadthPanel;
