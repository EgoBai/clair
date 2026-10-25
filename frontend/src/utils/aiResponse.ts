/**
 * AI 响应判据 — 区分「真实 AI 内容」与「业务失败 / 服务未接入」
 * =========================================================================
 * 背景（P0-FIXEDTRUTH 同族）：
 *   线上 `POST /api/ai/watchlist-summary` 未配置模型服务时返回
 *   `{"summary":"⚠️ AI总结服务未配置：请在 Cloudflare Pages 环境变量中设置 DEEPSEEK_API_KEY 后重试。"}`
 *   —— HTTP 200、无 success 字段、无 error 字段。前端原先只判 `if (data.summary)`，
 *   于是这行**运维配置指令被当作「AI 总结」渲染给用户**。
 *
 * 为什么不能靠「summary 字符串全等匹配」：
 *   运维文案会随平台/变量名变化，任何全等或包含匹配都会在文案一改就失效，
 *   悄悄退回「把运维报错当业务内容显示」的老路。
 *
 * ── 判据分层 ────────────────────────────────────────────────────────────
 *   第 1 层【结构化判据 · 主路径】
 *     后端按约定返回 success 字段时：
 *       success === true  → 成功
 *       success === false → 失败；再按 dataSource==='unavailable' /
 *                            code==='UPSTREAM_UNAVAILABLE' 区分
 *                            「未接入」与「其它失败」
 *     与本地 Express（backend/src/api/ai-chat.ts 的 sendUnavailable）
 *     及 Worker（clair-worker/worker.js）现已完全一致。
 *
 *   第 2 层【运维指令闸门 · 安全网，不可绕过】
 *     任何正文/错误文案命中运维特征（DEEPSEEK_API_KEY / Cloudflare Pages /
 *     环境变量）时：
 *       · 绝不把该文本作为业务内容返回给 UI；
 *       · 判定为「服务未接入」（这类文案按定义就是「环境没配好」）；
 *       · 对外只给本地兜底的中文诚实提示。
 *     这层保证「即使后端漏改 / 部署不同步 / 文案又变了」，
 *     运维指令也永远不会出现在用户界面上。
 *
 *   第 3 层【旧后端降级判据】
 *     后端既未返回 success、又无结构化字段时（老 Worker），
 *     才退回「⚠️ 前缀 + 未配置/未接入/不可用 关键词」的组合信号判定。
 *
 * 三层都基于**结构性信号**（字段存在性 + 状态码 + 语义类别），
 * 没有任何一条依赖某句运维文案的精确全文。
 */

/** 失败类别：未接入（服务/配置缺失）vs 其它失败（超时、模型报错等） */
export type AiFailureKind = 'unavailable' | 'error';

export interface AiVerdict {
  /** 业务是否成功（success===true 且无运维指令污染） */
  ok: boolean;
  /** 失败类别；成功时为 undefined */
  kind?: AiFailureKind;
  /** 可直接展示给用户的中文提示；成功时为 '' */
  message: string;
}

export interface AiOk extends AiVerdict {
  ok: true;
  kind?: undefined;
  message: '';
  /** 确认是真实 AI 内容（已通过运维指令闸门） */
  text: string;
}

export interface AiFail extends AiVerdict {
  ok: false;
  kind: AiFailureKind;
  message: string;
  text?: undefined;
}

export type AiResult = AiOk | AiFail;

/**
 * 运维指令特征 —— 命中即禁止作为业务内容展示。
 * 这是**语义类别**检测（"这段话在讲怎么改部署配置"），不是脆弱的全文等值匹配：
 * 措辞再变也拦得住，而正常业务文案不会命中。
 */
const OPS_INSTRUCTION_PATTERNS: RegExp[] = [
  /DEEPSEEK_API_KEY/i,
  /Cloudflare\s*Pages/i,
  /环境变量/i,
  /请在\s*Cloudflare/i,
];

/** 该文本是否像「运维配置指令」而非业务内容 */
export function looksLikeOpsInstruction(text: unknown): boolean {
  if (typeof text !== 'string' || !text) return false;
  return OPS_INSTRUCTION_PATTERNS.some((re) => re.test(text));
}

/**
 * 旧后端的降级信号（后端未返回 success 字段时使用）。
 * 分两组，用于区分两类失败：
 *   - 「服务/配置层面不可用」→ unavailable（未配置 / 未接入 / 不可用 / 未生效）
 *   - 「本次调用失败」→ error（失败）
 * 两组都不依赖某句文案的精确全文，只看是否命中该类别的语义信号词。
 */
const LEGACY_UNAVAILABLE_SIGNALS = /未配置|未接入|不可用|未生效/;

/** 后端返回体里可能承载运维文案的字段（按优先级） */
const OPS_CANDIDATE_FIELDS = ['message', 'error', 'summary', 'analysis', 'content'];

export interface ClassifyOptions {
  /** 「服务未接入」时展示给用户的中文提示 */
  unavailableMessage: string;
  /** 「其它失败」时展示给用户的中文提示 */
  errorMessage: string;
}

/**
 * 只做**成败分类**，不取内容 —— 供「成功体里没有单一文本字段」的端点复用
 * （如 /api/ai/filter：成功时内容在 data.results 里）。
 *
 * @param data 已解析的响应体
 */
export function classifyAiResponse(data: unknown, opts: ClassifyOptions): AiVerdict {
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

  // ── 第 2 层：运维指令闸门（先于一切成功判定）──
  // 后端任一字段漏出运维指令 → 整份响应不可作为业务内容展示。
  for (const field of OPS_CANDIDATE_FIELDS) {
    if (looksLikeOpsInstruction(body[field])) {
      return { ok: false, kind: 'unavailable', message: opts.unavailableMessage };
    }
  }

  if (body.success === true) {
    return { ok: true, message: '' };
  }

  if (body.success === false) {
    const unavailable =
      body.dataSource === 'unavailable' || body.code === 'UPSTREAM_UNAVAILABLE';
    // message 是后端给的面向用户文案；缺失或含运维指令时用本地兜底。
    const serverMessage = typeof body.message === 'string' ? body.message.trim() : '';
    const message =
      serverMessage && !looksLikeOpsInstruction(serverMessage)
        ? serverMessage
        : unavailable
          ? opts.unavailableMessage
          : opts.errorMessage;
    return { ok: false, kind: unavailable ? 'unavailable' : 'error', message };
  }

  // 既无 success 也无运维指令：无 success 字段的老后端。
  // 「失败」只能靠内容里的信号判定（见 readAiResponse 的第 3 层），
  // 这里无法判定就按「失败」处理 —— 宁可说不可用，不把未知响应当成功。
  return { ok: false, kind: 'error', message: opts.errorMessage };
}

export interface ReadAiOptions extends ClassifyOptions {
  /** 内容字段名，如 'summary' / 'analysis' / 'content' */
  field: string;
}

/**
 * 判定一次「返回单一文本」的 AI 接口响应，并取出可展示的内容。
 *
 * @param data  已解析的响应体
 * @param opts  字段名与两类失败的用户可见文案
 */
export function readAiResponse(data: unknown, opts: ReadAiOptions): AiResult {
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

  // ── 第 3 层：旧后端降级判据（后端未返回 success 字段时）──
  if (body.success !== true && body.success !== false) {
    const rawText = typeof body[opts.field] === 'string' ? (body[opts.field] as string) : '';
    if (rawText) {
      if (rawText.trimStart().startsWith('⚠️')) {
        // 「服务/配置不可用」优先判 unavailable，其余失败信号（含「失败」）归 error
        const kind: AiFailureKind = LEGACY_UNAVAILABLE_SIGNALS.test(rawText)
          ? 'unavailable'
          : 'error';
        return {
          ok: false,
          kind,
          message: kind === 'unavailable' ? opts.unavailableMessage : opts.errorMessage,
        };
      }
      return { ok: true, message: '', text: rawText };
    }
  }

  const verdict = classifyAiResponse(data, opts);
  if (!verdict.ok) return verdict as AiFail;

  const rawText = typeof body[opts.field] === 'string' ? (body[opts.field] as string) : '';
  if (!rawText.trim()) {
    // success:true 但内容为空 —— 没有内容就是没有内容，不当成成功
    return { ok: false, kind: 'error', message: opts.errorMessage };
  }
  return { ok: true, message: '', text: rawText };
}
