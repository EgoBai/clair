/**
 * 产业地图页 SegmentNode 数据防御测试
 *
 * 背景：线上点击「产业地图」曾整页报
 *   "Cannot read properties of undefined (reading 'description')"
 * 本测试锁定三种数据形态都必须渲染成功、不得抛异常。
 *
 * 关于 fixture：REAL_SEGMENT 是本地后端真实响应的原文拷贝，来源是
 *   curl --noproxy '*' http://127.0.0.1:3001/api/industry-chains/ai-computing
 * → data.chain.layers[0].segments[0]（optical-chip / 光芯片）
 * 未做任何编造；断言用的名称与描述都是该真实数据里的原值。
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import { SegmentNode } from '../pages/IndustryMapPage';
import type { ChainNodeData } from '../types/industryChain';

/** 真实 segment（本地后端 ai-computing 上游第 1 个环节，原文拷贝） */
const REAL_SEGMENT = {
  id: 'optical-chip',
  name: '光芯片',
  description: '光通信核心器件，决定传输速率和距离',
  layerId: 'upstream',
  stockFilter: {
    industries: ['电子', '通信'],
    nameKeywords: ['光', '光电', '激光', '光模块', '光器件'],
    excludeKeywords: ['光伏', '光电股份'],
    marketCapMin: 30,
    leaderCount: 3,
  },
  companies: [
    { symbol: '300308', name: '中际旭创', marketCap: 7003, changePercent: -2.96, currentPrice: 594.5, position: 'leader', competitiveAdvantage: '市值机械设备第1' },
    { symbol: '300502', name: '新易盛', marketCap: 3510, changePercent: -3.57, currentPrice: 251.69, position: 'leader', competitiveAdvantage: '市值计算机第2' },
    { symbol: '300394', name: '天孚通信', marketCap: 2149, changePercent: -1.91, currentPrice: 196.98, position: 'leader', competitiveAdvantage: '市值通信第3' },
    { symbol: '002281', name: '光迅科技', marketCap: 1014, changePercent: -4.74, currentPrice: 122.53, position: 'other' },
  ],
  characteristics: {
    marketSize: '2025年预计500亿元',
    growthRate: 'CAGR 25%',
    competitiveLandscape: '集中度高，龙头效应明显',
    barriers: ['技术门槛高', '研发投入大', '客户认证周期长'],
    keyDrivers: ['AI算力需求', '数据中心升级', '5G建设'],
  },
  upstreamTo: [],
  downstreamTo: ['optical-module'],
};

const renderNode = (data: unknown) =>
  render(
    <MemoryRouter>
      <ReactFlowProvider>
        <SegmentNode
          data={data as ChainNodeData}
          selected={false}
          id="n1"
          type="segment"
          dragging={false}
          zIndex={0}
          isConnectable={false}
          xPos={0}
          yPos={0}
        />
      </ReactFlowProvider>
    </MemoryRouter>
  );

describe('SegmentNode 数据防御', () => {
  it('形态一：data 为 undefined —— 渲染「数据不完整」且不抛异常', () => {
    expect(() => renderNode(undefined)).not.toThrow();
    expect(screen.getByText('数据不完整')).toBeTruthy();
  });

  it('形态二：data 为 {} （segment 缺失）—— 渲染「数据不完整」且不抛异常', () => {
    expect(() => renderNode({})).not.toThrow();
    expect(screen.getByText('数据不完整')).toBeTruthy();
  });

  it('形态三：segment 为 {} （字段全缺）—— 回落占位文案，不抛异常', () => {
    expect(() => renderNode({ segment: {}, layerType: 'upstream' })).not.toThrow();
    expect(screen.getByText('未命名环节')).toBeTruthy();
    expect(screen.getByText('暂无描述')).toBeTruthy();
    expect(screen.getByText('暂无数据')).toBeTruthy();
  });

  it('形态四：真实后端 segment —— 渲染真实名称与描述', () => {
    renderNode({ segment: REAL_SEGMENT, layerType: 'upstream' });
    expect(screen.getByText('光芯片')).toBeTruthy();
    expect(screen.getByText('光通信核心器件，决定传输速率和距离')).toBeTruthy();
    expect(screen.getByText('4家公司')).toBeTruthy();
    expect(screen.getByText('3家龙头')).toBeTruthy();
  });

  it('description 超长时截断且以省略号结尾', () => {
    renderNode({
      segment: { ...REAL_SEGMENT, description: '一二三四五六七八九十'.repeat(5) },
      layerType: 'upstream',
    });
    const truncated = screen.getByText(/^\S{30}\.\.\.$/);
    expect(truncated.textContent).toBe('一二三四五六七八九十'.repeat(3).slice(0, 30) + '...');
  });
});
