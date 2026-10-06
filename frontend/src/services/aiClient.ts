/**
 * AI Client — 前端AI调用层
 *
 * 封装与后端AI服务的通信，支持流式响应
 */

import { API_ORIGIN } from '../config/apiBase';

/**
 * 后端根地址，来自单一真源 `config/apiBase.ts`（内部读 VITE_API_BASE）。
 *
 * 为什么用 API_ORIGIN 而不是 api.ts 用的 API_BASE_URL：
 * 本文件用 fetch 且**自己拼完整路径** `${地址}/api/ai/chat`，
 * 所以需要的是**根地址**（`https://后端域名`）。API_BASE_URL 已带 `/api` 后缀，
 * 误用它会拼出 `/api/api/ai/chat` —— 多一层 /api，必然 404。
 *
 * dev 下 API_ORIGIN 为空串，请求路径就是相对的 `/api/ai/chat`，交 Vite proxy 转发，
 * 与改动前 `import.meta.env.VITE_API_BASE || ''` 的行为完全一致。
 */
const API_BASE = API_ORIGIN;

// ============================================================
// 类型定义
// ============================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

// ============================================================
// 流式对话
// ============================================================

export async function* chatStream(
  message: string,
  context?: ChatMessage[]
): AsyncGenerator<StreamChunk> {
  const response = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      context,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          yield { content: '', done: true };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.content || '';
          if (content) {
            yield { content, done: false };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  yield { content: '', done: true };
}

// ============================================================
// 非流式对话
// ============================================================

export async function chat(message: string, context?: ChatMessage[], symbol?: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      context,
      symbol,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content;
}

// ============================================================
// 专用分析接口
// ============================================================

export async function analyzeMarket(): Promise<string> {
  const response = await fetch(`${API_BASE}/api/ai/market-analysis`);
  
  if (!response.ok) {
    throw new Error(`Market analysis error: ${response.status}`);
  }

  const data = await response.json();
  return data.analysis;
}

export async function diagnoseStock(symbol: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/ai/diagnose/${symbol}`);
  
  if (!response.ok) {
    throw new Error(`Stock diagnosis error: ${response.status}`);
  }

  const data = await response.json();
  return data.diagnosis;
}

export async function getDailyBriefing(): Promise<string> {
  const response = await fetch(`${API_BASE}/api/ai/daily-briefing`);
  
  if (!response.ok) {
    throw new Error(`Daily briefing error: ${response.status}`);
  }

  const data = await response.json();
  return data.briefing;
}

// ============================================================
// 健康检查
// ============================================================

export async function checkAIHealth(): Promise<{ status: string; provider: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/ai/health`);
    
    if (!response.ok) {
      return { status: 'error', provider: 'unknown' };
    }

    return await response.json();
  } catch {
    return { status: 'error', provider: 'unknown' };
  }
}

export default {
  chatStream,
  chat,
  analyzeMarket,
  diagnoseStock,
  getDailyBriefing,
  checkAIHealth,
};
