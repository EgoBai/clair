// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { message } from 'antd';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  polishNote: vi.fn(),
}));

vi.mock('../utils/api', () => ({
  apiFetch: (...args: unknown[]) => mocks.apiFetch(...args),
}));

vi.mock('../utils/notePolish', () => ({
  polishNote: (...args: unknown[]) => mocks.polishNote(...args),
}));

vi.mock('../utils/knowledgeStore', () => {
  const note = {
    id: 'note-real-1',
    question: '测试投资笔记',
    answer: '原始笔记正文',
    category: '学习笔记',
    tags: [],
    createdAt: '2026-10-31T00:00:00.000Z',
    page: '手动笔记',
  };
  return {
    CATEGORIES: [{ key: '学习笔记', label: '学习笔记', icon: '笔记', desc: '测试分类' }],
    getEntries: () => [note],
    searchEntries: () => [note],
    getCategoryCounts: () => ({ 学习笔记: 1 }),
    getNoteStats: () => ({
      total: 1,
      thisWeek: 1,
      topCategory: { key: '学习笔记', label: '学习笔记', icon: '笔记', count: 1 },
    }),
    deleteEntry: vi.fn(),
    saveManualNote: vi.fn(),
    updateEntry: vi.fn(),
  };
});

import StrategyTemplatesPage from '../pages/StrategyTemplatesPage';
import KnowledgeBase from '../pages/KnowledgeBase';
import { chat } from '../services/aiClient';

const UNAVAILABLE = {
  success: false,
  dataSource: 'unavailable',
  code: 'UPSTREAM_UNAVAILABLE',
  error: 'AI服务暂时不可用',
  message: 'LLM 网关不可用（余额不足/超时/模型错误），未生成任何对话内容',
};

const UNAVAILABLE_FRAME = {
  content: '\n\n⚠️ AI服务暂时不可用',
  done: true,
  ...UNAVAILABLE,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  } as unknown as Response;
}

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

function renderStrategyPage(aiResponse: Response) {
  mocks.apiFetch.mockImplementation(async (path: string) => {
    if (String(path).includes('/api/ai/strategy-recommend')) return aiResponse;
    return jsonResponse({ success: true, data: { templates: [] } });
  });
  return render(
    <MemoryRouter>
      <StrategyTemplatesPage />
    </MemoryRouter>,
  );
}

async function requestStrategyRecommendation() {
  fireEvent.click(screen.getByRole('button', { name: /AI推荐/ }));
  fireEvent.click(await screen.findByRole('button', { name: /获取推荐/ }));
}

describe('StrategyTemplatesPage 结构化降级', () => {
  it('success:false + unavailable 时显示后端原因，且不生成 AI分析结果假卡片', async () => {
    renderStrategyPage(sseResponse([UNAVAILABLE_FRAME]));
    await requestStrategyRecommendation();

    await screen.findByText(UNAVAILABLE.message);
    expect(screen.getByText('AI 策略推荐不可用')).toBeTruthy();
    expect(screen.queryByText('AI分析结果')).toBeNull();
    expect(document.body.textContent).not.toContain('⚠️ AI服务暂时不可用');
  });

  it('success:true 时正常渲染真实策略卡片', async () => {
    renderStrategyPage(sseResponse([{
      content: JSON.stringify({
        strategies: [{ name: '真实 AI 策略', description: '真实模型返回的策略说明' }],
      }),
      done: true,
      success: true,
      dataSource: 'real',
    }]));
    await requestStrategyRecommendation();

    await screen.findByText('真实 AI 策略');
    expect(screen.getByText('真实模型返回的策略说明')).toBeTruthy();
    expect(screen.queryByText('AI 策略推荐不可用')).toBeNull();
  });
});

describe('aiClient.chat 结构化结果', () => {
  it('200 + unavailable 返回可判别中文失败，不抛 undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(UNAVAILABLE)));

    const result = await chat('请润色笔记');

    expect(result).toEqual({
      ok: false,
      kind: 'unavailable',
      message: UNAVAILABLE.message,
    });
    expect(result.message).not.toContain('undefined');
  });

  it('后端未提供中文原因时使用诚实中文兜底', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      ...UNAVAILABLE,
      message: 'Gateway timeout',
    })));

    const result = await chat('请润色笔记');

    expect(result).toEqual({
      ok: false,
      kind: 'unavailable',
      message: 'AI 服务暂时不可用，请稍后重试',
    });
  });

  it('success:true 时正常返回真实正文', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      dataSource: 'real',
      content: '真实 AI 润色正文',
    })));

    await expect(chat('请润色笔记')).resolves.toEqual({
      ok: true,
      text: '真实 AI 润色正文',
      message: '',
    });
  });
});

describe('KnowledgeBase 润色提示', () => {
  it('unavailable 时把后端中文原因交给 UI，且提示不含 undefined', async () => {
    mocks.polishNote.mockResolvedValue({
      ok: false,
      kind: 'unavailable',
      message: UNAVAILABLE.message,
    });
    const warning = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);

    render(
      <MemoryRouter>
        <KnowledgeBase />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /润色/ }));

    await waitFor(() => {
      expect(warning).toHaveBeenCalledWith(
        `${UNAVAILABLE.message}（润色已降级，原文未改动）`,
      );
    });
    expect(String(warning.mock.calls[0]?.[0])).not.toContain('undefined');
  });
});

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.polishNote.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
