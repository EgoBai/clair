/**
 * 资金流向桑基图 (Sankey Diagram)
 * 可视化 主力→板块→个股 的资金流转关系
 * 参考 Bloomberg 资金流分析面板
 */

import React, { useMemo } from 'react';
import { Card, Typography, Space } from 'antd';
import { BranchesOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';

const { Text } = Typography;

export interface SankeyNode {
  name: string;
  category?: 'source' | 'industry' | 'stock';
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface FundFlowSankeyProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  title?: string;
  height?: number;
  loading?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  source: '#ef4444',
  industry: '#f59e0b',
  stock: '#3b82f6',
};

const FundFlowSankey = React.memo<FundFlowSankeyProps>(({
  nodes,
  links,
  title = '资金流向桑基图',
  height = 450,
  loading = false,
}) => {
  const option = useMemo(() => {
    if (!nodes || nodes.length === 0 || !links || links.length === 0) {
      return {
        title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
        graphic: {
          type: 'text', left: 'center', top: 'middle',
          style: { text: '暂无资金流向数据', fill: '#999', fontSize: 14 },
        },
      };
    }

    const processedNodes = nodes.map(n => ({
      name: n.name,
      itemStyle: {
        color: CATEGORY_COLORS[n.category || 'source'],
        borderColor: 'rgba(255,255,255,0.3)',
        borderWidth: 1,
      },
      label: {
        color: '#333',
        fontSize: 11,
        fontWeight: 500,
      },
    }));

    const processedLinks = links.map(l => ({
      source: l.source,
      target: l.target,
      value: Math.abs(l.value),
      lineStyle: {
        color: l.value >= 0 ? 'gradient' : 'gradient',
        opacity: 0.35,
      },
    }));

    return {
      title: {
        text: title,
        left: 'center',
        textStyle: { fontSize: 14 },
      },
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        formatter: (params: { dataIndex: number; value: number; name: string; seriesName?: string; dataType?: string; data: { source?: string; target?: string } }) => {
          if (params.dataType === 'edge') {
            const absVal = Math.abs(params.value);
            return `<div style="font-size:12px;line-height:1.8">
              <b>${params.data.source}</b> → <b>${params.data.target}</b><br/>
              净流入: <span style="color:${params.value >= 0 ? '#ef4444' : '#22c55e'}">
                ${formatAmount(params.value)}
              </span>
            </div>`;
          }
          if (params.dataType === 'node') {
            return `<div style="font-size:12px;line-height:1.8">
              <b>${params.name}</b><br/>
              总流量: ${formatAmount(params.value)}
            </div>`;
          }
          return '';
        },
      },
      series: [{
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'left',
        orient: 'horizontal',
        draggable: true,
        top: '8%', bottom: '8%', left: '4%', right: '12%',
        nodeWidth: 18,
        nodeGap: 10,
        data: processedNodes,
        links: processedLinks,
        label: {
          position: 'right',
          fontSize: 11,
        },
        lineStyle: {
          curveness: 0.5,
          opacity: 0.3,
        },
        animationDuration: 800,
        animationEasing: 'cubicOut',
      }],
    };
  }, [nodes, links, title]);

  return (
    <Card
      size="small"
      title={
        <Space>
          <BranchesOutlined style={{ color: '#722ed1' }} />
          <span>{title}</span>
        </Space>
      }
    >
      <ReactECharts
        option={option}
        style={{ height: `${height}px`, width: '100%' }}
        showLoading={loading}
        notMerge={true}
        opts={{ renderer: 'canvas' }}
      />
      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        {Object.entries(CATEGORY_COLORS).map(([key, color]) => (
          <Space key={key} size={4}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              backgroundColor: color, border: '1px solid rgba(0,0,0,0.1)',
            }} />
            <Text style={{ fontSize: 11, color: '#666' }}>
              {key === 'source' ? '资金来源' : key === 'industry' ? '行业板块' : '个股'}
            </Text>
          </Space>
        ))}
      </div>
    </Card>
  );
});

function formatAmount(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
  return val.toFixed(0);
}

export default FundFlowSankey;
