/**
 * aiMetrics — AI 响应时延埋点（F12 / A-07）
 *
 * 目标基线：AI 响应 P95 ≤ 8s。
 *
 * 设计约束：
 * - 零外部依赖，不引入任何 APM/SDK
 * - 内存环形缓冲为主，localStorage 持久化为辅（跨刷新保留最近样本）
 * - 采集两个关键指标：
 *     ttfbMs  —— 首字时延（用户感知「AI 开始说话」的时间）
 *     totalMs —— 完整响应时延（流结束 / 请求返回）
 * - 只记录时延与成败，不记录对话内容，避免隐私外泄
 */

// ============================================================
// 类型
// ============================================================

export interface AiMetricSample {
  /** 逻辑端点，如 'ai/chat'、'ai/watchlist-summary' */
  endpoint: string;
  /** 首字时延（毫秒）；非流式或未收到首字时为 null */
  ttfbMs: number | null;
  /** 完整响应时延（毫秒） */
  totalMs: number;
  /** 是否成功（降级/异常记 false） */
  ok: boolean;
  /** 采样时间戳（epoch ms） */
  at: number;
}

export interface AiMetricStat {
  endpoint: string;
  count: number;
  successCount: number;
  successRate: number;
  ttfb: { p50: number | null; p95: number | null };
  total: { p50: number | null; p95: number | null };
  /** 是否满足 P95 ≤ 8s 基线；样本不足时为 null */
  meetsSla: boolean | null;
}

export interface AiMetricSummary {
  generatedAt: number;
  /** P95 SLA 阈值（毫秒） */
  slaP95Ms: number;
  overall: AiMetricStat;
  byEndpoint: AiMetricStat[];
}

// ============================================================
// 配置
// ============================================================

const STORAGE_KEY = 'clair_ai_metrics_v1';
/** 环形缓冲容量；超出后覆盖最旧样本 */
const CAPACITY = 200;
/** SLA 基线：P95 ≤ 8s */
export const SLA_P95_MS = 8000;

// ============================================================
// 环形缓冲
// ============================================================

let buffer: AiMetricSample[] = [];
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      buffer = parsed
        .filter(
          (s: unknown): s is AiMetricSample =>
            !!s &&
            typeof (s as AiMetricSample).endpoint === 'string' &&
            typeof (s as AiMetricSample).totalMs === 'number',
        )
        .slice(-CAPACITY);
    }
  } catch {
    // 存储损坏时丢弃，不影响主流程
    buffer = [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    // 隐私模式 / 配额满：仅内存统计，静默降级
  }
}

// ============================================================
// 记录
// ============================================================

/**
 * 记录一次 AI 调用的时延样本
 */
export function recordAiMetric(sample: Omit<AiMetricSample, 'at'> & { at?: number }): void {
  load();
  const entry: AiMetricSample = {
    endpoint: sample.endpoint,
    ttfbMs: sample.ttfbMs != null && sample.ttfbMs >= 0 ? Math.round(sample.ttfbMs) : null,
    totalMs: Math.max(0, Math.round(sample.totalMs)),
    ok: sample.ok,
    at: sample.at ?? Date.now(),
  };
  buffer.push(entry);
  if (buffer.length > CAPACITY) {
    buffer = buffer.slice(-CAPACITY);
  }
  persist();
}

/**
 * 计时器工厂 —— 在 AI 调用处使用：
 *
 *   const t = startAiTimer('ai/chat');
 *   ... 收到首个 chunk 时： t.firstToken();
 *   ... 正常结束：           t.end(true);
 *   ... 失败/降级：          t.end(false);
 */
export function startAiTimer(endpoint: string) {
  const startedAt = now();
  let ttfbMs: number | null = null;
  let settled = false;

  return {
    /** 收到首字时调用；重复调用只记第一次 */
    firstToken(): void {
      if (ttfbMs === null) ttfbMs = now() - startedAt;
    },
    /** 结束计时并落样本；重复调用忽略 */
    end(ok: boolean): void {
      if (settled) return;
      settled = true;
      recordAiMetric({ endpoint, ttfbMs, totalMs: now() - startedAt, ok });
    },
  };
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

// ============================================================
// 统计
// ============================================================

/**
 * 线性插值分位数。samples 需为已排序的升序数组。
 */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return Math.round(sorted[0]);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return Math.round(sorted[lo]);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo));
}

function buildStat(endpoint: string, samples: AiMetricSample[]): AiMetricStat {
  const totals = samples.map(s => s.totalMs).sort((a, b) => a - b);
  const ttfbs = samples
    .map(s => s.ttfbMs)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const successCount = samples.filter(s => s.ok).length;
  const totalP95 = percentile(totals, 95);

  return {
    endpoint,
    count: samples.length,
    successCount,
    successRate: samples.length ? Number((successCount / samples.length).toFixed(4)) : 0,
    ttfb: { p50: percentile(ttfbs, 50), p95: percentile(ttfbs, 95) },
    total: { p50: percentile(totals, 50), p95: totalP95 },
    meetsSla: totalP95 == null ? null : totalP95 <= SLA_P95_MS,
  };
}

/**
 * 读取聚合汇总（P50 / P95 / 成功率 / SLA 达标）
 */
export function getAiMetricsSummary(): AiMetricSummary {
  load();
  const endpoints = Array.from(new Set(buffer.map(s => s.endpoint))).sort();
  return {
    generatedAt: Date.now(),
    slaP95Ms: SLA_P95_MS,
    overall: buildStat('__all__', buffer),
    byEndpoint: endpoints.map(ep => buildStat(ep, buffer.filter(s => s.endpoint === ep))),
  };
}

/** 读取原始样本（调试用） */
export function getAiMetricSamples(): AiMetricSample[] {
  load();
  return [...buffer];
}

/** 清空采集数据 */
export function clearAiMetrics(): void {
  buffer = [];
  loaded = true;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/**
 * 控制台可读汇总，便于人工核对 SLA。
 * 开发环境下挂到 window.__clairAiMetrics 方便随时查看。
 */
export function formatAiMetricsSummary(): string {
  const s = getAiMetricsSummary();
  const fmt = (v: number | null) => (v == null ? '—' : `${v}ms`);
  const lines = [
    `AI 时延汇总（SLA: P95 ≤ ${s.slaP95Ms}ms）`,
    `总计 ${s.overall.count} 次，成功率 ${(s.overall.successRate * 100).toFixed(1)}%`,
    `  首字   P50 ${fmt(s.overall.ttfb.p50)} / P95 ${fmt(s.overall.ttfb.p95)}`,
    `  完整   P50 ${fmt(s.overall.total.p50)} / P95 ${fmt(s.overall.total.p95)}  ${
      s.overall.meetsSla == null ? '' : s.overall.meetsSla ? '✅ 达标' : '❌ 超标'
    }`,
  ];
  for (const e of s.byEndpoint) {
    lines.push(
      `[${e.endpoint}] ${e.count} 次 · 首字 P95 ${fmt(e.ttfb.p95)} · 完整 P95 ${fmt(e.total.p95)}`,
    );
  }
  return lines.join('\n');
}

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as Record<string, unknown>).__clairAiMetrics = {
    summary: getAiMetricsSummary,
    samples: getAiMetricSamples,
    print: () => console.log(formatAiMetricsSummary()),
    clear: clearAiMetrics,
  };
}
