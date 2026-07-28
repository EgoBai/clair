/**
 * 知识库 RAG 一期 — 轻量级本地检索增强（确定性，无向量库、无 API key）
 *
 * 算法：中文双字 bigram + 英文/数字 token 分词；对每条笔记的
 * question/answer/tags/symbol 建 token 集；打分 = 词项重叠 TF 加权
 * （tags ×3、question ×2、answer ×1、symbol 精确命中 +5）+ 时间衰减微加权。
 *
 * 纯函数，可测试。数据来自 knowledgeStore.getEntries()。
 */

import { getEntries } from './knowledgeStore';
import type { KnowledgeCategory } from './knowledgeStore';

// ============================================================
// 类型
// ============================================================

export interface RetrievedNote {
  id: string;
  category: KnowledgeCategory;
  question: string;
  answer: string;
  tags: string[];
  symbol?: string;
  score: number;
}

export interface RetrieveOpts {
  limit?: number;
  symbol?: string;
}

// ============================================================
// 分词 — 确定性
// ============================================================

/** 中文双字 bigram + 英文/数字 token；全部小写 */
function tokenize(text: string): string[] {
  const lower = (text || '').toLowerCase();
  const tokens: string[] = [];

  // 英文 / 数字 token
  const en = lower.match(/[a-z0-9]+/g);
  if (en) tokens.push(...en);

  // 中文连续段 → 双字 bigram（单字则原样）
  const cjk = lower.match(/[一-龥]+/g) || [];
  for (const seg of cjk) {
    if (seg.length === 1) {
      tokens.push(seg);
    } else {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

// ============================================================
// 检索
// ============================================================

/**
 * 检索与 query 相关的投资笔记（确定性打分，score<=0 不返回）。
 * @returns 按分数降序、最多 limit(默认3) 条
 */
export function retrieveRelevantNotes(
  query: string,
  opts: RetrieveOpts = {},
): RetrievedNote[] {
  const limit = opts.limit ?? 3;
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  const querySet = new Set(queryTokens);

  const now = Date.now();
  const results: RetrievedNote[] = [];

  for (const e of getEntries()) {
    const qSet = new Set(tokenize(e.question));
    const aSet = new Set(tokenize(e.answer));
    const tSet = new Set(tokenize(e.tags.join(' ')));
    const sLower = e.symbol ? e.symbol.toLowerCase() : '';

    let score = 0;

    // 词项重叠 TF 加权（按命中字段分别计分）
    let qHit = 0;
    let aHit = 0;
    let tHit = 0;
    for (const t of querySet) {
      if (qSet.has(t)) qHit++;
      if (aSet.has(t)) aHit++;
      if (tSet.has(t)) tHit++;
    }
    score += qHit * 2 + aHit * 1 + tHit * 3;

    // symbol 精确命中：query 含该 symbol token，或外部指定 symbol 一致
    if (sLower) {
      for (const t of querySet) {
        if (t === sLower) score += 5;
      }
      if (opts.symbol && opts.symbol.toLowerCase() === sLower) score += 5;
    }

    if (score <= 0) continue;

    // 时间衰减：越新微加权（180 天内线性，最多 +0.5）
    const days = (now - new Date(e.createdAt).getTime()) / 86_400_000;
    if (Number.isFinite(days) && days >= 0) {
      score += Math.max(0, 1 - days / 180) * 0.5;
    }

    results.push({
      id: e.id,
      category: e.category,
      question: e.question,
      answer: e.answer,
      tags: e.tags || [],
      symbol: e.symbol,
      score: Math.round(score * 100) / 100,
    });
  }

  results.sort((x, y) => y.score - x.score);
  return results.slice(0, limit);
}

// ============================================================
// 上下文构建
// ============================================================

const MAX_ANSWER = 200; // 单条 answer 截断字数
const MAX_TOTAL = 1200; // 整体上限

/**
 * 把命中笔记压缩为一段系统提示文本，注入给 AI 作为上下文。
 */
export function buildRagContext(notes: RetrievedNote[]): string {
  if (notes.length === 0) return '';

  const prefix = '以下是用户个人投资笔记，回答时可引用并注明来自笔记：\n';
  const body = notes
    .map(n => {
      const answer =
        n.answer.length > MAX_ANSWER ? n.answer.slice(0, MAX_ANSWER) + '…' : n.answer;
      const tags = n.tags.length ? ' #' + n.tags.join(' #') : '';
      return `[${n.category}] ${n.question} → ${answer}${tags}`;
    })
    .join('\n');

  let text = prefix + body;
  if (text.length > MAX_TOTAL) {
    text = text.slice(0, MAX_TOTAL) + '…';
  }
  return text;
}
