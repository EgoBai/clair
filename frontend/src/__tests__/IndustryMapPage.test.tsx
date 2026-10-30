// @vitest-environment jsdom
/**
 * 产业地图页（IndustryMapPage）页面级渲染回归测试
 *
 * 用户报的现象：切到「产业地图」整页显示
 *   "产业地图 渲染失败 / Cannot read properties of undefined (reading 'description')"
 *
 * 实测根因（非推测）：
 *   - 本地后端  GET {API}/api/industry-chains/:id → { success, data: { chain: {...} } }
 *   - 线上 worker GET 同一路径                    → { success, data: { ...chain } }（**无 chain 包裹层**）
 *   旧代码只认第一种：`data.data.chain` 在线上是 undefined → selectedChain 为 undefined
 *   → 页面 `chain.description`（第 750 行）抛错 → 整页渲染失败。
 *
 * 本测试用**线上真实响应原文**（见 ONLINE_DETAIL_RESP，拷贝自
 *   curl --noproxy '*' https://clair-api.pages.dev/api/industry-chains/ai-computing
 * 2026-10-27 抓取）驱动页面，锁定两种返回形态都必须渲染出真实环节，且不出现「渲染失败」。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import IndustryMapPage from '../pages/IndustryMapPage';

/** 线上真实响应原文（data 下没有 chain 包裹层） */
const ONLINE_DETAIL_RESP = {
  success: true,
  data: {
    id: 'ai-computing',
    name: 'AI算力产业链',
    description: '从芯片到应用的AI算力全链条',
    theme: 'AI',
    hotLevel: 95,
    layers: [
      {
        id: 'upstream',
        name: '上游',
        type: 'upstream',
        description: '核心硬件和基础组件',
        order: 1,
        segments: [
          {
            id: 'optical-chip',
            name: '光芯片',
            description: '光通信核心器件',
            layerId: 'upstream',
            companies: [],
            downstreamTo: ['optical-module'],
          },
          {
            id: 'pcb',
            name: 'PCB/载板',
            description: '电子元器件基础',
            layerId: 'upstream',
            companies: [{ symbol: '002916', name: '深南电路', position: 'leader' }],
            downstreamTo: ['server'],
          },
        ],
      },
      {
        id: 'midstream',
        name: '中游',
        type: 'midstream',
        description: '核心设备和系统集成',
        order: 2,
        segments: [
          {
            id: 'optical-module',
            name: '光模块',
            description: '光电转换核心器件',
            layerId: 'midstream',
            companies: [
              { symbol: '300308', name: '中际旭创', position: 'leader' },
              { symbol: '300502', name: '新易盛', position: 'challenger' },
            ],
            upstreamTo: ['optical-chip'],
            downstreamTo: ['switch'],
          },
          {
            id: 'switch',
            name: '交换机',
            description: '网络核心设备',
            layerId: 'midstream',
            companies: [{ symbol: '000063', name: '中兴通讯', position: 'leader' }],
            upstreamTo: ['optical-module'],
            downstreamTo: ['data-center'],
          },
          {
            id: 'server',
            name: '服务器',
            description: '算力载体',
            layerId: 'midstream',
            companies: [
              { symbol: '000977', name: '浪潮信息', position: 'leader' },
              { symbol: '603019', name: '中科曙光', position: 'challenger' },
            ],
            upstreamTo: ['pcb'],
            downstreamTo: ['data-center'],
          },
        ],
      },
      {
        id: 'downstream',
        name: '下游',
        type: 'downstream',
        description: '应用场景',
        order: 3,
        segments: [
          {
            id: 'data-center',
            name: '数据中心',
            description: '算力基础设施',
            layerId: 'downstream',
            companies: [{ symbol: '603881', name: '数据港', position: 'leader' }],
            upstreamTo: ['switch', 'server'],
            downstreamTo: ['ai-application'],
          },
          {
            id: 'ai-application',
            name: 'AI应用',
            description: 'AI技术落地',
            layerId: 'downstream',
            companies: [{ symbol: '688111', name: '金山办公', position: 'leader' }],
            upstreamTo: ['data-center'],
            downstreamTo: [],
          },
        ],
      },
    ],
  },
};

/** 本地后端形态：同一个 chain 体，但多一层 chain 包裹（本地 3001 实测结构） */
const LOCAL_DETAIL_RESP = {
  success: true,
  data: { chain: ONLINE_DETAIL_RESP.data },
};

const CHAINS_LIST_RESP = {
  success: true,
  data: {
    chains: [
      {
        id: 'ai-computing',
        name: 'AI算力产业链',
        description: '从芯片到应用的AI算力全链条',
        theme: 'AI',
        hotLevel: 95,
        segmentCount: 7,
      },
    ],
  },
};

const AI_UNAVAILABLE_FRAME = {
  content: '\n\n⚠️ AI服务暂时不可用',
  done: true,
  success: false,
  dataSource: 'unavailable',
  code: 'UPSTREAM_UNAVAILABLE',
  error: 'AI服务暂时不可用',
  message: 'LLM 网关不可用（余额不足/超时/模型错误），未生成任何对话内容',
};

function sseResponse(frames: unknown[]): Response {
  const payload = `${frames.map(frame => `data: ${JSON.stringify(frame)}\n`).join('')}data: [DONE]\n`;
  const bytes = new TextEncoder().encode(payload);
  let sent = false;
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        },
      }),
    },
  } as unknown as Response;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/industry-map']}>
      <IndustryMapPage />
    </MemoryRouter>
  );

/** 按 URL 分派真实响应；未命中的路径返回 200 空成功（不编造业务数据） */
const installFetchMock = (detailResp: unknown, chatResponse?: Response) => {
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/ai/chat')) {
      return chatResponse ?? sseResponse([]);
    }
    const body =
      u.includes('/api/industry-chains/') ? detailResp
      : u.includes('/api/industry-chains') ? CHAINS_LIST_RESP
      : u.includes('/api/sectors/momentum') ? { success: true, data: [] }
      : { success: true, data: null };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      body: null,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('IndustryMapPage 渲染防御', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('线上返回形态（data 下无 chain 包裹层）：渲染真实环节，不崩溃', async () => {
    installFetchMock(ONLINE_DETAIL_RESP);
    renderPage();

    await waitFor(() => expect(screen.getByText('AI 产业地图')).toBeTruthy());
    // 真实环节名称与描述必须出现在 DOM 里
    await waitFor(() => expect(screen.getAllByText('光芯片').length).toBeGreaterThan(0));
    expect(screen.getAllByText('数据中心').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AI应用').length).toBeGreaterThan(0);
    // 环节描述来自真实响应
    expect(screen.getAllByText('算力基础设施').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('渲染失败');
  });

  it('本地返回形态（data.chain）：同样渲染真实环节，不崩溃', async () => {
    installFetchMock(LOCAL_DETAIL_RESP);
    renderPage();

    await waitFor(() => expect(screen.getAllByText('光芯片').length).toBeGreaterThan(0));
    expect(screen.getAllByText('服务器').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('渲染失败');
  });

  it('详情接口返回无法识别的形态：给出空态而不是整页崩溃', async () => {
    installFetchMock({ success: true, data: {} });
    renderPage();

    await waitFor(() => expect(screen.getByText('暂无产业链数据')).toBeTruthy());
    expect(document.body.textContent).not.toContain('渲染失败');
  });

  it('AI SSE 结构化降级：显示后端中文原因，不把 content 当解读正文', async () => {
    installFetchMock(ONLINE_DETAIL_RESP, sseResponse([AI_UNAVAILABLE_FRAME]));
    renderPage();

    const input = await screen.findByPlaceholderText('询问产业链相关问题...');
    fireEvent.change(input, { target: { value: '当前景气度如何？' } });
    fireEvent.click(screen.getByRole('button', { name: /提问/ }));

    await screen.findByText(AI_UNAVAILABLE_FRAME.message);
    expect(screen.getByText('AI 解读不可用')).toBeTruthy();
    expect(document.body.textContent).not.toContain('⚠️ AI服务暂时不可用');
  });

  it('AI SSE success:true：正常渲染真实解读正文', async () => {
    installFetchMock(ONLINE_DETAIL_RESP, sseResponse([{
      content: '真实 AI 产业链解读',
      done: true,
      success: true,
      dataSource: 'real',
    }]));
    renderPage();

    const input = await screen.findByPlaceholderText('询问产业链相关问题...');
    fireEvent.change(input, { target: { value: '当前景气度如何？' } });
    fireEvent.click(screen.getByRole('button', { name: /提问/ }));

    await screen.findByText('真实 AI 产业链解读');
    expect(screen.queryByText('AI 解读不可用')).toBeNull();
  });
});
