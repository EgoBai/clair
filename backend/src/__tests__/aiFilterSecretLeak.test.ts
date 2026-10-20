/**
 * P0-LEAK C-2：错误响应不得泄露 API key 指纹（安全红线）
 *
 * 缺陷（audit 实测，非推演）：
 *   POST /api/ai/filter 异常时 HTTP 500 响应体出现 "****0a09"——
 *   链路：aiService.chat → gatewayFetch 上游 401 → HttpStatusError.message
 *   = `LLM upstream error: 401 - <上游body前500字符>`（llmGateway.ts:21），
 *   而 DeepSeek/OpenAI 的 401 body 恰好携带掩码 key：
 *   `Incorrect API key provided: sk-xxxx...****0a09. You can find your API key at ...`
 *   此前 ai-filter.ts 外层 catch 把 error.message 原样放 `details` 出街。
 *
 * 锁定契约：
 *   1. 任何错误路径的响应体都不得含 key 指纹（sk- 全量 / ****后缀掩码 /
 *      Bearer / 长 hex）——**连掩码都不留**；
 *   2. ai-filter.ts 外层 catch 完全不透传上游 message（正则总有形态漏网，
 *      不透传比脱敏更稳）；inner catch 的 details 保留（AI 解析失败原因有
 *      前端调试价值）但必须经 redactSecrets；
 *   3. 同一泄露链路的相邻 AI 端点（ai-strategy.ts，chatStream 同走
 *      gatewayFetch）同款堵上；
 *   4. redactSecrets 不得误伤普通中文/英文错误文案（防过度修复）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

/** audit 实测泄露时的上游 401 body 形态（DeepSeek 风格，含掩码后缀） */
const LEAKY_401_MESSAGE =
  'LLM upstream error: 401 - {"error":{"message":"Incorrect API key provided: sk-5f31a0c9d8e2b7a4f6d1c3b8e9a2d4f6. ' +
  'You can find your API key at https://platform.deepseek.com/api-keys.","type":"invalid_request_error",' +
  '"param":null,"code":"invalid_request_error"}} ****0a09';

// ---- mock：LLM 与 DB，隔离外网/真实库，只测错误路径的响应体契约 ----
vi.mock('../services/aiService', () => ({
  default: {
    chat: vi.fn(),
    chatStream: vi.fn(),
    analyzeMarket: vi.fn(),
    diagnoseStock: vi.fn(),
    generateStrategy: vi.fn(),
    healthCheck: vi.fn(),
    chatWithAI: vi.fn(),
  },
  chatStream: vi.fn(),
}));

/** 可控的 dbFactory 桩：ai-filter 用 getDb()，ai-strategy 用命名导出 db */
const dbState = {
  throwError: null as Error | null,
  rows: [] as unknown[],
};
vi.mock('../db/dbFactory', () => {
  // 万能 knex 链：任意方法链式调用，await 时返回 dbState.rows
  const makeChain = (): any => {
    const chain: any = new Proxy(
      { then: (res: (r: unknown[]) => void) => Promise.resolve(dbState.rows).then(res) },
      {
        get(target: any, prop: string) {
          if (prop === 'then') return target.then;
          if (prop === 'raw') return (sql: string) => sql;
          return (..._args: unknown[]) => makeChain();
        },
      },
    );
    return chain;
  };
  const dbObj = { connection: (..._args: unknown[]) => makeChain() };
  return {
    db: dbObj,
    getDb: () => {
      if (dbState.throwError) throw dbState.throwError;
      return dbObj;
    },
  };
});

import aiService, { chatStream } from '../services/aiService';
import aiFilterRouter, { redactSecrets } from '../api/ai-filter';
import aiStrategyRouter from '../api/ai-strategy';

/** 响应体中任何一个 key 指纹都不允许出现（连掩码形态也算） */
function assertNoKeyFingerprint(body: unknown, label: string): void {
  const text = JSON.stringify(body);
  expect(text, `${label} 泄露掩码后缀 ****0a09`).not.toContain('****');
  expect(text, `${label} 泄露掩码后缀 0a09`).not.toContain('0a09');
  expect(text, `${label} 泄露 sk- 全量key`).not.toMatch(/sk-[A-Za-z0-9_-]{4,}/);
  expect(text, `${label} 泄露上游原始错误文案`).not.toContain('Incorrect API key');
  expect(text, `${label} 泄露 LLM 网关错误前缀`).not.toContain('LLM upstream error');
}

function buildApp(router: express.Router): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

describe('P0-LEAK C-2 · ai-filter 错误路径不得泄露 API key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.throwError = null;
    dbState.rows = [];
  });

  it('LLM 网关 401（含掩码key的上游body）→ 500 响应体无任何 key 片段', async () => {
    (aiService.chat as any).mockRejectedValue(new Error(LEAKY_401_MESSAGE));

    const res = await request(buildApp(aiFilterRouter))
      .post('/api/ai/filter')
      .send({ query: '涨跌幅大于5%的股票' });

    expect(res.status).toBe(500);
    assertNoKeyFingerprint(res.body, 'ai/filter LLM 401');
    // 响应体不再透传 details（不透传比正则脱敏更稳，形态漏网零风险）
    expect(res.body.details).toBeUndefined();
  });

  it('DB 层异常（message 含连接串密码）→ 响应体不透传', async () => {
    (aiService.chat as any).mockResolvedValue({ content: '{"conditions":[],"explanation":"ok"}' });
    dbState.throwError = new Error('connect ECONNREFUSED postgres://postgres:secretpw@10.0.0.1:5432/clair');

    const res = await request(buildApp(aiFilterRouter))
      .post('/api/ai/filter')
      .send({ query: '涨跌幅大于5%' });

    expect(res.status).toBe(500);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('secretpw');
    expect(text).not.toContain('postgres://');
    expect(res.body.details).toBeUndefined();
  });

  it('AI 返回非 JSON（inner catch）→ details 保留但经脱敏', async () => {
    // LLM 输出里混入一段（假想的）带 key 的文本，验证 inner catch 的脱敏兜底
    (aiService.chat as any).mockResolvedValue({
      content: '抱歉，我的密钥是 sk-deadbeefdeadbeefdeadbeefdeadbeef ****abcd，无法解析',
    });

    const res = await request(buildApp(aiFilterRouter))
      .post('/api/ai/filter')
      .send({ query: '涨超5%' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AI解析失败，请换个说法试试');
    // details 保留（调试价值），但 key 指纹必须被清掉
    expect(res.body.details).toBeDefined();
    assertNoKeyFingerprint(res.body, 'ai/filter inner catch');
  });

  it('正常路径不受影响（防过度修复）：AI 正常返回 → 200 + 结果', async () => {
    (aiService.chat as any).mockResolvedValue({
      content: '{"conditions":[{"field":"changePercent","operator":"gt","value":5}],"sortBy":"changePercent","sortOrder":"desc","limit":10,"explanation":"涨超5%"}',
    });

    const res = await request(buildApp(aiFilterRouter))
      .post('/api/ai/filter')
      .send({ query: '涨超5%' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(0);
  });
});

describe('P0-LEAK C-2 · ai-strategy 同链路同款修复', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chatStream 首帧前抛 401（含掩码key）→ JSON 错误体无 key 片段', async () => {
    // 注意：mock 用普通函数而非 generator——「首帧前抛错」在调用语句处同步触发，
    // 与 generator throw 行为等价，且避免 eslint require-yield（CI 曾因此红）
    (chatStream as any).mockImplementation(() => {
      throw new Error(LEAKY_401_MESSAGE);
    });

    const res = await request(buildApp(aiStrategyRouter))
      .post('/api/ai/strategy-recommend')
      .send({ risk_level: 'moderate' });

    expect(res.status).toBe(500);
    assertNoKeyFingerprint(res.body, 'ai/strategy-recommend LLM 401');
    // 与 ai-filter 外层 catch 同标准：不透传上游 message（正则脱敏有形态漏网）
    expect(res.body.details).toBeUndefined();
    expect(res.body.error).toBe('AI策略推荐失败，请稍后重试');
  });
});

describe('redactSecrets 单元行为（含防过度修复）', () => {
  it('清除 sk- 全量 key / 掩码后缀 / Bearer / 长 hex', () => {
    expect(redactSecrets('bad key sk-5f31a0c9d8e2b7a4 provided')).toBe('bad key [REDACTED] provided');
    expect(redactSecrets('Incorrect API key provided: ****0a09. See docs.')).not.toContain('0a09');
    expect(redactSecrets('Authorization: Bearer abc123def')).toBe('Authorization: Bearer [REDACTED]');
    expect(redactSecrets('token deadbeefcafebabe0123456789abcdef leaked')).not.toContain('deadbeefcafebabe');
  });

  it('不误伤普通错误文案（防过度修复）', () => {
    const plain = 'AI返回格式错误: {"conditions":[]} 涨跌幅大于5%的股票';
    expect(redactSecrets(plain)).toBe(plain);
    // 普通短数字/时间戳/日期不受长hex规则影响
    expect(redactSecrets('HTTP 401 at 2026-10-20T08:00:00Z')).toBe('HTTP 401 at 2026-10-20T08:00:00Z');
    expect(redactSecrets('市值超100亿 marketCap 1000000')).toBe('市值超100亿 marketCap 1000000');
  });
});