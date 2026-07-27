/**
 * 笔记 AI 润色 — notePolish.ts
 *
 * 战略决策 D5：不做本地模板规则。润色结果必须来自真实 LLM。
 * 因此本文件只负责：拼 prompt + 调用既有 aiClient.chat() + 15s 超时。
 * 不做任何"假润色"模板生成；失败时由调用方降级（保持原文）。
 */

import { chat } from '../services/aiClient';

// 润色超时上限：超过则视为降级（由调用方提示，不修改笔记）
export const POLISH_TIMEOUT_MS = 15000;

function buildPolishPrompt(original: string): string {
  return `请润色以下投资笔记，使其表达更专业、结构更清晰，保留原意与所有数据事实，输出润色后的正文（不要额外解释）：\n\n${original}`;
}

/**
 * 调用真实 LLM 润色笔记正文。
 * - 走 aiClient.chat → 后端 /api/ai/chat（后端已接 LLM 网关：超时/重试/熔断）。
 * - 15s 内未返回则 reject（POLISH_TIMEOUT），由调用方 message.warning 降级。
 * - 不会返回"假润色"内容；失败时直接抛错，交由上层处理。
 */
export async function polishNote(raw: string): Promise<string> {
  const llTask = chat(buildPolishPrompt(raw));
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('POLISH_TIMEOUT')), POLISH_TIMEOUT_MS),
  );
  return Promise.race([llTask, timeout]);
}

export default polishNote;
