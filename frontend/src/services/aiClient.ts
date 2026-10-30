/**
 * AI Client — 前端AI调用层
 *
 * 封装与后端AI服务的通信，支持流式响应
 */

import { API_ORIGIN } from '../config/apiBase';
import {
  readAiResponse,
  readSseFrame,
  type AiFailureKind,
  type AiResult,
} from '../utils/aiResponse';

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
// 结构化结果契约（对齐后端 200 + success:false 的降级语义）
// ============================================================
/**
 * 为什么 `chat()` 不再返回 `Promise<string>`：
 * 后端在 LLM 网关不可用时回 **HTTP 200 + {success:false, dataSource:'unavailable', message:'LLM 网关不可用…'}**
 * （backend/src/api/ai-chat.ts sendUnavailable，commit 1bc2d0d0a）。
 * 字符串返回值无法表达「这次调用没拿到结论」，调用方只能靠 throw 或空串区分，
 * 于是要么把降级当异常抛出（message 取不到时是 `undefined`，用户看到无意义弹窗），
 * 要么把空串/警告文案当成 AI 正文渲染。这里改成可判别的结果类型，
 * 四种结局各自带**可直接上屏的中文原因**，且 `ok:false` 时不携带 text。
 */
export type ChatFailureKind =
  /** 上游依赖（LLM 网关）不可用：服务端正常处理了，业务上没拿到结论 */
  | 'unavailable'
  /** 本次调用失败：超时 / 5xx / 网络异常 */
  | 'failed'
  /** 端点未部署 / 路径不存在（404、501） */
  | 'not-deployed';

export interface ChatSuccess {
  ok: true;
  kind?: undefined;
  /** 确认是真实 AI 内容（已过判据层：非降级、非运维指令） */
  text: string;
  message: '';
}

export interface ChatFailure {
  ok: false;
  kind: ChatFailureKind;
  /** 后端给的中文原因优先；没有则本地诚实兜底，绝不为 undefined / 空串 */
  message: string;
  text?: undefined;
}

export type ChatResult = ChatSuccess | ChatFailure;

/** 本地诚实兜底文案：后端没给中文原因时用，必须「如实 + 可解释」，不含编造结论 */
export const CHAT_FALLBACK_MESSAGE: Record<ChatFailureKind, string> = {
  unavailable: 'AI 服务暂时不可用，请稍后重试',
  failed: 'AI 请求失败，请稍后重试',
  'not-deployed': 'AI 服务接口未部署，暂时无法使用，请稍后重试',
};

/** LLM 不可用（流式路径）——携带可直接上屏的中文原因，供 UI 区分「降级」与「演示兜底」 */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message && message.trim() ? message.trim() : CHAT_FALLBACK_MESSAGE.unavailable);
    this.name = 'AiUnavailableError';
  }
}

/** 判据层 kind → chat 层 kind（判据层的 'error' 对用户说就是「这次调用失败」） */
const CHAT_KIND: Record<AiFailureKind, ChatFailureKind> = {
  unavailable: 'unavailable',
  error: 'failed',
  'not-deployed': 'not-deployed',
};

function toChatResult(verdict: AiResult): ChatResult {
  if (verdict.ok) return { ok: true, text: verdict.text, message: '' };
  const kind = CHAT_KIND[verdict.kind ?? 'error'];
  const message =
    typeof verdict.message === 'string' && verdict.message.trim()
      ? verdict.message.trim()
      : CHAT_FALLBACK_MESSAGE[kind];
  return { ok: false, kind, message };
}

/**
 * 统一的 AI 文本请求通道：把「HTTP 状态 + 响应体」一起交给判据层，
 * 返回可判别的结构化结果。**任何路径都不返回 undefined / 空原因**。
 */
async function requestAiText(path: string, init: RequestInit, field: string): Promise<ChatResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    // 网络层失败（断网 / DNS / CORS）：没有响应体可读，只给本地兜底。
    // 这里刻意不把 fetch 的原始英文错误上屏 —— 用户看不懂，且与「诚实可解释」无关。
    return { ok: false, kind: 'failed', message: CHAT_FALLBACK_MESSAGE.failed };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // 非 JSON 响应（如网关 HTML 错误页）：交给判据层按状态码处理
    data = null;
  }

  return toChatResult(
    readAiResponse(data, {
      field,
      httpStatus: response.status,
      unavailableMessage: CHAT_FALLBACK_MESSAGE.unavailable,
      errorMessage: CHAT_FALLBACK_MESSAGE.failed,
      notDeployedMessage: CHAT_FALLBACK_MESSAGE['not-deployed'],
    }),
  );
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
    // 与 chat() 同口径：端点不存在 vs 服务不可用，两类原因都要说人话
    throw new AiUnavailableError(
      response.status === 404 || response.status === 501
        ? CHAT_FALLBACK_MESSAGE['not-deployed']
        : CHAT_FALLBACK_MESSAGE.unavailable,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new AiUnavailableError(CHAT_FALLBACK_MESSAGE.unavailable);

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

        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue; // 畸形帧跳过（原行为：catch 里静默忽略）
        }
        if (!parsed || typeof parsed !== 'object') continue;

        // 结构化降级帧的 content 是状态说明，不是 AI 回答；统一交给判据层丢弃。
        const frame = readSseFrame(parsed, {
          unavailableMessage: CHAT_FALLBACK_MESSAGE.unavailable,
          errorMessage: CHAT_FALLBACK_MESSAGE.failed,
          notDeployedMessage: CHAT_FALLBACK_MESSAGE['not-deployed'],
        });
        if (frame.degraded) {
          throw new AiUnavailableError(frame.message);
        }
        if (frame.content) {
          yield { content: frame.content, done: false };
        }
      }
    }
  }

  yield { content: '', done: true };
}

// ============================================================
// 非流式对话
// ============================================================

/**
 * 非流式对话。返回**可判别的结构化结果**，不再抛异常、不再返回裸字符串。
 *
 * 四种结局：
 *   - `{ok:true, text}`                      后端 success:true 且 content 非空
 *   - `{ok:false, kind:'unavailable', …}`    200 + success:false + dataSource:'unavailable'
 *   - `{ok:false, kind:'failed', …}`         5xx / 4xx / 网络异常 / 响应体无内容
 *   - `{ok:false, kind:'not-deployed', …}`   404 / 501
 *
 * `message` 优先取后端给的中文原因，取不到时用 CHAT_FALLBACK_MESSAGE 兜底，
 * 因此**永远不会是 undefined 或空串**。
 */
export async function chat(
  message: string,
  context?: ChatMessage[],
  symbol?: string,
): Promise<ChatResult> {
  return requestAiText(
    '/api/ai/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context, symbol, stream: false }),
    },
    'content',
  );
}

// ============================================================
// 专用分析接口
// ============================================================

// 与 chat() 同契约：不再返回裸字符串（旧写法 `return data.analysis` 在后端改
// 用 {success,data:{...}} 信封后恒为 undefined，属于「静默的假成功」）。
export function analyzeMarket(): Promise<ChatResult> {
  return requestAiText('/api/ai/market-analysis', { method: 'GET' }, 'analysis');
}

export function diagnoseStock(symbol: string): Promise<ChatResult> {
  return requestAiText(`/api/ai/diagnose/${symbol}`, { method: 'GET' }, 'diagnosis');
}

export function getDailyBriefing(): Promise<ChatResult> {
  return requestAiText('/api/ai/daily-briefing', { method: 'GET' }, 'briefing');
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
