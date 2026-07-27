/**
 * LLM 网关 — 上游健壮性硬化层（P0-b）
 *
 * 为 aiService 中针对 LLM 上游的 HTTP 调用提供四项保护：
 *  1. 请求级超时（基于 AbortController）
 *  2. 指数退避重试（仅网络错误 / 429 / 5xx，4xx 不重试）
 *  3. 按 provider 维度的简单熔断器（连续失败 → 打开 → 半开探测）
 *  4. 轻量调用 / 成本计量（内存计数器）
 *
 * 设计原则：与 aiService 完全解耦，仅暴露 gatewayFetch 与计量函数，
 * 不改变 aiService 对外导出的函数签名与行为语义。状态全部存于内存。
 */

// ============================================================
// 错误类型
// ============================================================

/** 上游 HTTP 错误：携带状态码，供重试策略判定是否可重试 */
class HttpStatusError extends Error {
  constructor(public readonly status: number, body: string) {
    super(`LLM upstream error: ${status} - ${body.slice(0, 500)}`);
    this.name = 'HttpStatusError';
  }
}

/** 熔断器打开时抛出的错误，带 CIRCUIT_OPEN 标识，便于上层快速识别 */
export class CircuitOpenError extends Error {
  /** 错误标识，上层可用 isCircuitOpenError 或直接比对此字段 */
  readonly code = 'CIRCUIT_OPEN' as const;
  constructor(public readonly provider: string) {
    super(`Circuit breaker OPEN for provider: ${provider}`);
    this.name = 'CircuitOpenError';
  }
}

/** 类型守卫：判断错误是否由熔断器打开引起 */
export function isCircuitOpenError(err: unknown): err is CircuitOpenError {
  return (
    err instanceof CircuitOpenError ||
    (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'CIRCUIT_OPEN')
  );
}

// ============================================================
// 超时（AbortController）
// ============================================================

/**
 * 用 AbortController 包裹一个异步调用，超时后自动 abort。
 * fn 接收 signal，应将其透传到底层 fetch，使超时能真正中断请求。
 */
async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// 重试（指数退避）
// ============================================================

interface RetryOptions {
  /** 最大重试次数（不含首次请求） */
  retries: number;
  /** 判定某次错误是否值得重试 */
  shouldRetry: (err: unknown) => boolean;
  /** 退避基准毫秒数，实际延迟 = base * 2^attempt */
  baseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指数退避重试：第 attempt 次重试延迟为 base * 2^attempt。
 * 仅在 shouldRetry 返回 true 且仍有重试额度时重试；否则立即抛出末次错误。
 */
async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const base = opts.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // 最后一次仍失败，或错误明确不可重试 → 退出循环
      if (attempt === opts.retries || !opts.shouldRetry(err)) break;
      const delay = base * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ============================================================
// 熔断器（按 provider 维度）
// ============================================================

type BreakerState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
  private state: BreakerState = 'closed';
  private consecutiveFailures = 0;
  private openUntil = 0;
  private probeInFlight = false;

  constructor(
    private readonly name: string,
    private readonly threshold = 5,
    private readonly resetMs = 60_000,
  ) {}

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // 打开期结束 → 进入半开，放行一个探测请求
      if (Date.now() >= this.openUntil) {
        this.state = 'half-open';
        this.probeInFlight = false;
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    if (this.state === 'half-open') {
      // 半开状态同时只允许一个探测，其余请求快速失败
      if (this.probeInFlight) {
        throw new CircuitOpenError(this.name);
      }
      this.probeInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.probeInFlight = false;
    }
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.state === 'half-open') {
      this.toOpen();
    } else if (this.consecutiveFailures >= this.threshold) {
      this.toOpen();
    }
  }

  private toOpen(): void {
    this.state = 'open';
    this.openUntil = Date.now() + this.resetMs;
    this.probeInFlight = false;
  }

  snapshot(): { state: BreakerState; consecutiveFailures: number } {
    return { state: this.state, consecutiveFailures: this.consecutiveFailures };
  }
}

const breakers = new Map<string, CircuitBreaker>();

function getBreaker(provider: string): CircuitBreaker {
  let b = breakers.get(provider);
  if (!b) {
    b = new CircuitBreaker(provider);
    breakers.set(provider, b);
  }
  return b;
}

// ============================================================
// 调用 / 成本计量（内存计数器）
// ============================================================

interface ProviderStat {
  calls: number;
  failures: number;
  totalTokens: number;
}

const stats = new Map<string, ProviderStat>();

function ensureStat(provider: string): ProviderStat {
  let s = stats.get(provider);
  if (!s) {
    s = { calls: 0, failures: 0, totalTokens: 0 };
    stats.set(provider, s);
  }
  return s;
}

/** 上报一次成功调用（由 aiService 在拿到可用响应后调用） */
export function recordGatewaySuccess(provider: string): void {
  ensureStat(provider).calls++;
}

/** 上报一次失败调用（含网络/超时/熔断/上游错误） */
export function recordGatewayFailure(provider: string): void {
  ensureStat(provider).failures++;
}

/** 上报本次响应的 token 用量（若上游返回 usage 字段） */
export function reportGatewayUsage(provider: string, totalTokens: number): void {
  if (totalTokens > 0) ensureStat(provider).totalTokens += totalTokens;
}

export interface GatewayStats {
  providers: Record<string, ProviderStat>;
  breakers: Record<string, { state: string; consecutiveFailures: number }>;
}

/** 暴露当前网关计量与熔断器状态，供健康检查 / 运维接口使用 */
export function getGatewayStats(): GatewayStats {
  const providers: Record<string, ProviderStat> = {};
  for (const [k, v] of stats) providers[k] = { ...v };
  const breakersOut: Record<string, { state: string; consecutiveFailures: number }> = {};
  for (const [k, v] of breakers) breakersOut[k] = v.snapshot();
  return { providers, breakers: breakersOut };
}

// ============================================================
// 统一网关入口
// ============================================================

export interface GatewayOptions {
  /** 流式调用：首字节超时更短（默认 20s），非流式默认 30s */
  streaming?: boolean;
  /** 覆盖默认超时毫秒数 */
  timeoutMs?: number;
  /** 覆盖默认重试次数（不含首次） */
  retries?: number;
}

/**
 * 统一的 LLM 上游 HTTP 调用包装：超时 + 重试 + 熔断 + 计量。
 *
 * 调用成功时返回 fetch 的 Response（已保证 response.ok）；
 * 上游非 2xx 会抛出 HttpStatusError（429/5xx 已按重试策略消费）。
 *
 * @param provider 供应商维度标识，用于熔断与计量，如 'deepseek' / 'openai' / 'claude' / 'local'
 * @param url      上游请求地址
 * @param init     fetch 初始化参数（method / headers / body）
 */
export async function gatewayFetch(
  provider: string,
  url: string,
  init: RequestInit,
  opts: GatewayOptions = {},
): Promise<Response> {
  const streaming = opts.streaming ?? false;
  const timeoutMs = opts.timeoutMs ?? (streaming ? 20_000 : 30_000);
  const retries = opts.retries ?? 2;

  const breaker = getBreaker(provider);

  return breaker.exec(async () => {
    try {
      const response = await withRetry(
        () =>
          withTimeout(async (signal: AbortSignal) => {
            const resp = await fetch(url, { ...init, signal });
            if (!resp.ok) {
              const body = await resp.text();
              throw new HttpStatusError(resp.status, body);
            }
            return resp;
          }, timeoutMs),
        {
          retries,
          shouldRetry: (err: unknown) => {
            if (err instanceof HttpStatusError) {
              const s = err.status;
              // 仅 429 / 5xx 可重试；其余 4xx 视为不可重试
              return s === 429 || s >= 500;
            }
            // 网络错误 / 超时（AbortError）视为可重试
            return true;
          },
        },
      );
      recordGatewaySuccess(provider);
      return response;
    } catch (err) {
      recordGatewayFailure(provider);
      throw err;
    }
  });
}
