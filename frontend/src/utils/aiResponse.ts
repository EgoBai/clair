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

/**
 * 失败类别
 * - unavailable：上游依赖（LLM 网关 / 行情源）不可用 —— 服务端已正常处理，业务上没拿到结论
 * - error：本次调用失败（超时、模型报错、网络异常等）
 * - not-deployed：端点未部署 / 路径不存在（HTTP 404、501）—— 与「依赖不可用」是两回事，
 *   排查方向完全不同（前者是配置/容量，后者是路由没注册），故单列。
 */
export type AiFailureKind = 'unavailable' | 'error' | 'not-deployed';

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

/**
 * 旧后端降级文案判定（供 SSE 帧等「无 success 字段」的场景复用）：
 * `⚠️` 前缀 + 不可用类语义信号同时命中才算，避免误伤正常正文。
 */
export function isLegacyUnavailableText(text: unknown): boolean {
  if (typeof text !== 'string' || !text.trim()) return false;
  return text.trimStart().startsWith('⚠️') && LEGACY_UNAVAILABLE_SIGNALS.test(text);
}

/** 后端返回体里可能承载运维文案的字段（按优先级） */
const OPS_CANDIDATE_FIELDS = ['message', 'error', 'summary', 'analysis', 'content'];

/**
 * 后端响应体里用户可见的中文原因。
 * 只看 `message`（后端明确写的面向用户文案），**不看 `error`**——
 * `error` 是给机器/开发看的（'Not found'、'DEEPSEEK_API_KEY 未配置'），
 * 直接上屏会变成「用户读不懂的英文」或「运维指令泄露」。
 */
function pickServerMessage(body: Record<string, unknown>): string {
  const raw = typeof body.message === 'string' ? body.message.trim() : '';
  if (!raw || looksLikeOpsInstruction(raw) || !/[\u3400-\u9fff]/.test(raw)) return '';
  return raw;
}

export interface ClassifyOptions {
  /** 「服务未接入」时展示给用户的中文提示 */
  unavailableMessage: string;
  /** 「其它失败」时展示给用户的中文提示 */
  errorMessage: string;
  /**
   * HTTP 状态码（可选）。传入后启用传输层判据：
   * 404/501 → not-deployed，其余 >=400 → error。
   * 不传则按旧约定视为 200（保持既有调用点行为不变）。
   */
  httpStatus?: number;
  /** 「端点未部署」时展示给用户的中文提示；缺省回落到 errorMessage */
  notDeployedMessage?: string;
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

  // ── 传输层判据：HTTP 未成功时，响应体里的「成功/降级」字段都不作数 ──
  // 典型：端点未部署时反向代理回 404 + {error:'Not found'}，
  // 若只按 success 字段判（缺 success 就走「老后端」分支）会误判成「失败原因未知」，
  // 排查方向从「路由没注册」被带偏到「模型挂了」。
  const httpStatus = typeof opts.httpStatus === 'number' ? opts.httpStatus : 200;
  if (httpStatus >= 400) {
    const serverMessage = pickServerMessage(body);
    if (httpStatus === 404 || httpStatus === 501) {
      return {
        ok: false,
        kind: 'not-deployed',
        message: serverMessage || opts.notDeployedMessage || opts.errorMessage,
      };
    }
    return { ok: false, kind: 'error', message: serverMessage || opts.errorMessage };
  }

  if (body.success === true) {
    return { ok: true, message: '' };
  }

  if (body.success === false) {
    const unavailable =
      body.dataSource === 'unavailable' || body.code === 'UPSTREAM_UNAVAILABLE';
    // message 是后端给的面向用户中文文案；缺失、非中文或含运维指令时用本地兜底。
    const serverMessage = pickServerMessage(body);
    const message = serverMessage || (unavailable ? opts.unavailableMessage : opts.errorMessage);
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
 * 取正文：先看顶层字段，再退回 `data` 信封里的同名字段。
 * 后端 sendHonest 系端点（如 /api/ai/diagnose/:symbol）把内容放在
 * `{success:true, data:{...}}` 里，只查顶层会把**真实成功**误判成失败。
 */
function pickText(body: Record<string, unknown>, field: string): string {
  const top = typeof body[field] === 'string' ? (body[field] as string) : '';
  if (top) return top;
  const envelope = body.data;
  if (envelope && typeof envelope === 'object') {
    const nested = (envelope as Record<string, unknown>)[field];
    if (typeof nested === 'string') return nested;
  }
  return '';
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
  // HTTP 已失败时跳过：404/500 的响应体不是业务体，绝不走「有文本就算成功」的旧路径。
  const httpFailed = typeof opts.httpStatus === 'number' && opts.httpStatus >= 400;
  if (!httpFailed && body.success !== true && body.success !== false) {
    const rawText = pickText(body, opts.field);
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

  const rawText = pickText(body, opts.field);
  if (!rawText.trim()) {
    // success:true 但内容为空 —— 没有内容就是没有内容，不当成成功
    return { ok: false, kind: 'error', message: opts.errorMessage };
  }
  return { ok: true, message: '', text: rawText };
}

// ============================================================
// SSE 流式帧判读（/api/ai/chat 流式、/api/ai/strategy-recommend）
// ============================================================
/**
 * 为什么单独有这一层：SSE 端点的 HTTP 码恒为 200（响应头一发出就改不了），
 * 降级语义只能由**流内帧**承载。后端 ai-chat.ts / ai-strategy.ts 的降级终止帧形如
 * `{"content":"\n\n⚠️ …","done":true,"success":false,"dataSource":"unavailable",
 *   "code":"UPSTREAM_UNAVAILABLE","message":"LLM 网关不可用…"}`。
 * 消费点若只累加 `content`，就会把「LLM 网关不可用」当成 AI 正文渲染出去
 * —— 那是把降级粉饰成成功，属红线级。
 */
export interface SseFrameRead {
  /** 该帧是否宣告「本次没有拿到 AI 结论」 */
  degraded: boolean;
  kind?: AiFailureKind;
  /** 可直接上屏的中文原因；非降级帧为 '' */
  message: string;
  /** 可累积为 AI 正文的内容；降级帧恒为 '' —— 警告文案绝不当正文 */
  content: string;
}

/** 该帧是否承载「不可用 / 失败」语义（结构化字段 + 旧 ⚠️ 哨兵双判据） */
function isDegradedFrame(body: Record<string, unknown>): boolean {
  return (
    body.success === false ||
    body.dataSource === 'unavailable' ||
    body.code === 'UPSTREAM_UNAVAILABLE' ||
    isLegacyUnavailableText(body.content)
  );
}

/**
 * 判读单个 SSE 帧。降级原因与 classifyAiResponse 同口径：
 * 优先后端 `message`，缺失或命中运维指令闸门时用 opts 的本地诚实兜底。
 */
export function readSseFrame(frame: unknown, opts: ClassifyOptions): SseFrameRead {
  const body = (frame && typeof frame === 'object' ? frame : {}) as Record<string, unknown>;
  const content = typeof body.content === 'string' ? body.content : '';

  if (!isDegradedFrame(body)) return { degraded: false, message: '', content };

  const verdict = classifyAiResponse(body, opts);
  const kind: AiFailureKind = verdict.ok ? 'unavailable' : verdict.kind ?? 'unavailable';
  const message = verdict.ok ? opts.unavailableMessage : verdict.message || opts.unavailableMessage;
  // content 一律丢弃：降级帧里的 ⚠️ 文案是状态说明，不是 AI 回答
  return { degraded: true, kind, message, content: '' };
}
