/**
 * AI模型解释可视化组件
 * 特征重要性雷达图、因子贡献热力图、决策树可视化
 */

import React, { useMemo } from 'react';
import { Card, Row, Col, Typography, Progress, Tag, Space, Tooltip, Divider } from 'antd';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Cell, Treemap, Tooltip as RTooltip,
} from 'recharts';
import type { ModelExplanation, FeatureImportance, FactorContribution } from '../../utils/aiModelExplainer';

const { Text } = Typography;

interface ModelExplanationVizProps {
  explanation: ModelExplanation;
  compact?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  fundamental: '#52c41a',
  technical: '#1890ff',
  sentiment: '#fa8c16',
  macro: '#722ed1',
};

const CATEGORY_LABELS: Record<string, string> = {
  fundamental: '基本面',
  technical: '技术面',
  sentiment: '市场情绪',
  macro: '宏观环境',
};

/**
 * 特征重要性雷达图
 */
export const FeatureRadarChart: React.FC<{ features: FeatureImportance[] }> = ({ features }) => {
  const radarData = useMemo(() => {
    const categoryScores: Record<string, { total: number; count: number }> = {};
    features.forEach(f => {
      if (!categoryScores[f.category]) categoryScores[f.category] = { total: 0, count: 0 };
      categoryScores[f.category].total += f.importance * 100;
      categoryScores[f.category].count++;
    });
    return Object.entries(categoryScores).map(([cat, data]) => ({
      category: CATEGORY_LABELS[cat] || cat,
      score: Math.round(data.total / data.count),
      fullMark: 100,
    }));
  }, [features]);

  return (
    <ResponsiveContainer width="100%" height={250}>
      <RadarChart data={radarData}>
        <PolarGrid />
        <PolarAngleAxis dataKey="category" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Radar
          name="重要性"
          dataKey="score"
          stroke="#1890ff"
          fill="#1890ff"
          fillOpacity={0.3}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
};

/**
 * 因子贡献柱状图
 */
export const FactorBarChart: React.FC<{ factors: FactorContribution[] }> = ({ factors }) => {
  const barData = useMemo(() =>
    factors.map(f => ({
      name: f.factor,
      contribution: f.contribution,
      score: f.score,
    })).sort((a, b) => b.contribution - a.contribution),
    [factors]
  );

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={barData} layout="vertical" margin={{ left: 80 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
        <RTooltip
          formatter={(value, name) => [
            `${Number(value).toFixed(1)}${name === 'contribution' ? '分' : ''}`,
            name === 'contribution' ? '贡献度' : '评分',
          ] as any}
        />
        <Bar dataKey="contribution" fill="#1890ff">
          {barData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.score >= 80 ? '#52c41a' : entry.score >= 70 ? '#1890ff' : '#fa8c16'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * 特征分类树图
 */
export const FeatureTreemap: React.FC<{ features: FeatureImportance[] }> = ({ features }) => {
  const treeData = useMemo(() => {
    const grouped: Record<string, { name: string; size: number; color: string }[]> = {};
    features.forEach(f => {
      const cat = CATEGORY_LABELS[f.category] || f.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({
        name: f.feature,
        size: Math.round(f.importance * 1000),
        color: f.direction === 'positive' ? CATEGORY_COLORS[f.category] : '#cf1322',
      });
    });
    return Object.entries(grouped).map(([name, children]) => ({ name, children }));
  }, [features]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <Treemap
        data={treeData}
        dataKey="size"
        nameKey="name"
        content={(({ x, y, width, height, name, root }: { x: number; y: number; width: number; height: number; name: string; root?: { color?: string } }) => {
          if (width < 30 || height < 20) return null;
          return (
            <g>
              <rect x={x} y={y} width={width} height={height} fill={root?.color || '#1890ff'} fillOpacity={0.7} stroke="#fff" />
              <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={10}>
                {name}
              </text>
            </g>
          );
        }) as any}
      >
        <RTooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={({ payload }: any) => {
            if (!payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div style={{ background: '#fff', padding: 8, border: '1px solid #ddd', borderRadius: 4 }}>
                <Text strong>{String(d.name || d.feature)}</Text>
                <br />
                <Text type="secondary">重要性: {(Number(d.size || 0) / 10).toFixed(1)}%</Text>
              </div>
            );
          }}
        />
      </Treemap>
    </ResponsiveContainer>
  );
};

/**
 * 决策路径可视化
 */
export const DecisionPathViz: React.FC<{ explanation: ModelExplanation }> = ({ explanation }) => {
  const { decisionPath, confidence } = explanation;

  return (
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      {/* 连接线 */}
      <div style={{
        position: 'absolute', left: 11, top: 12, bottom: 12, width: 2,
        background: '#e8e8e8',
      }} />

      {decisionPath.map((step, idx) => {
        const isLast = idx === decisionPath.length - 1;
        const color = step.result ? '#52c41a' : '#cf1322';
        return (
          <div
            key={step.step}
            style={{
              position: 'relative',
              marginBottom: isLast ? 0 : 12,
              paddingLeft: 20,
            }}
          >
            {/* 节点 */}
            <div style={{
              position: 'absolute', left: -16, top: 4,
              width: 12, height: 12, borderRadius: '50%',
              background: color, border: '2px solid #fff',
              boxShadow: `0 0 0 2px ${color}40`,
            }} />
            <div style={{
              background: step.result ? '#f6ffed' : '#fff2e8',
              border: `1px solid ${step.result ? '#b7eb8f' : '#ffbb96'}`,
              borderRadius: 6, padding: '6px 12px',
            }}>
              <Space>
                <Text style={{ fontSize: 12 }}>
                  {step.result ? '✅' : '❌'} Step {step.step}: {step.condition}
                </Text>
                <Tag color={step.result ? 'green' : 'red'} style={{ fontSize: 10 }}>
                  权重 {(step.impact * 100).toFixed(0)}%
                </Tag>
              </Space>
            </div>
          </div>
        );
      })}

      {/* 最终置信度 */}
      <div style={{ marginTop: 12, paddingLeft: 4 }}>
        <Space>
          <Text strong style={{ fontSize: 13 }}>最终置信度:</Text>
          <Progress
            percent={Math.round(confidence * 100)}
            size="small"
            strokeColor={confidence >= 0.8 ? '#52c41a' : confidence >= 0.6 ? '#1890ff' : '#fa8c16'}
            style={{ width: 160 }}
          />
        </Space>
      </div>
    </div>
  );
};

/**
 * 综合模型解释可视化面板
 */
const ModelExplanationViz: React.FC<ModelExplanationVizProps> = ({ explanation, compact = false }) => {
  if (compact) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <FeatureRadarChart features={explanation.features} />
        <FactorBarChart factors={explanation.factors} />
      </Space>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      <Col span={12}>
        <Card size="small" title="多维特征雷达">
          <FeatureRadarChart features={explanation.features} />
        </Card>
      </Col>
      <Col span={12}>
        <Card size="small" title="因子贡献度">
          <FactorBarChart factors={explanation.factors} />
        </Card>
      </Col>
      <Col span={12}>
        <Card size="small" title="特征分布">
          <FeatureTreemap features={explanation.features} />
        </Card>
      </Col>
      <Col span={12}>
        <Card size="small" title="决策路径">
          <DecisionPathViz explanation={explanation} />
        </Card>
      </Col>
    </Row>
  );
};

export default ModelExplanationViz;
