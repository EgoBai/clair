/**
 * 构建信息端点测试（P0-VER）
 * ============================================================================
 * 守护的诚实红线：
 *   1. `/api/version` 必须始终可访问，且**不带任何伪造的 commit**。
 *      没注入 GIT_COMMIT_SHA 时 commit 必须是 null —— 一个假的 sha 会让版本一致性
 *      门禁永远显示「通过」，比没有 sha 危险得多。
 *   2. /health 与 /api/version 的构建信息必须同源（同一个 buildInfo()），
 *      不允许出现两个真源。
 *   3. 脏的环境变量值（空串 / 'unknown' / 占位符 / 非十六进制）必须一律视为「未注入」。
 *   4. appVersion 必须复用 app.ts 内唯一的 APP_VERSION 常量。
 *
 * 实现注记：buildInfo() 的 commit/buildTime 在**模块加载时**求值一次并缓存，
 * 所以「注入不同环境变量」的用例必须 vi.resetModules() + 动态 import 重新求值。
 * 每次重载会连带重求整个 app.ts 依赖图（约 6–7 秒），故：
 *   - 这类用例合并成尽可能少的重载次数；
 *   - 显式放大 testTimeout。**绝不能让它超时**——一旦超时的动态 import 悬在后台，
 *     其环境变量还原代码就不会执行，会污染后续用例（本文件开发时确实踩到了：
 *     一个 5s 超时导致紧随其后的用例拿到了错误的 env 而假失败）。
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';

const COMMIT_ENV_KEYS = [
  'GIT_COMMIT_SHA',
  'BUILD_COMMIT',
  'SOURCE_COMMIT',
  'CF_PAGES_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_SHA',
] as const;

const HEX40 = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const HEX40_ALT = 'ffffffffffffffffffffffffffffffffffffffff';

function cleanCommitEnv(): Record<string, undefined> {
  const o: Record<string, undefined> = {};
  for (const k of COMMIT_ENV_KEYS) o[k] = undefined;
  return o;
}

/** 以给定 env 重载 app.ts，返回一个可探测的 app。调用方负责在断言后不再依赖 env。 */
async function loadWithEnv(env: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    vi.resetModules();
    const mod = await import('../app');
    return mod.app;
  } finally {
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe('/api/version — 构建信息', () => {
  it('返回 200 且带全部约定字段', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('commit');
    expect(res.body).toHaveProperty('commitKnown');
    expect(res.body).toHaveProperty('commitShort');
    expect(res.body).toHaveProperty('buildTime');
    expect(res.body).toHaveProperty('appVersion');
    expect(res.body).toHaveProperty('nodeEnv');
    expect(res.body).toHaveProperty('startedAt');
    expect(res.body).toHaveProperty('nodeVersion');
    expect(res.body).toHaveProperty('service');
  });

  it('appVersion 非空，且不与 /health.version 冲突（单一版本真源）', async () => {
    const versionRes = await request(app).get('/api/version');
    expect(versionRes.body.appVersion).toBeTruthy();

    const healthRes = await request(app).get('/health');
    if (healthRes.status === 200) {
      // 同一进程不得对外自报两个版本号（第41 项历史教训）
      expect(versionRes.body.appVersion).toBe(healthRes.body.version);
    } else {
      // 无DB 时 /health 走 503 降级分支，但**降级分支也必须带 build**，
      // 否则「线上挂了 → 查不出版本」这个最需要信息的时刻反而没有信息。
      expect(healthRes.status).toBe(503);
      expect(healthRes.body.build).toBeTruthy();
      expect(healthRes.body.build.appVersion).toBe(versionRes.body.appVersion);
    }
  });

  it('commit 要么是合法 sha，要么是 null —— 绝不存在「看起来真实的假 sha」', async () => {
    const res = await request(app).get('/api/version');
    const { commit, commitKnown, commitShort } = res.body;
    if (commit === null) {
      expect(commitKnown).toBe(false);
      expect(commitShort).toBeNull();
    } else {
      expect(commit).toMatch(/^[0-9a-f]{7,40}$/);
      expect(commitKnown).toBe(true);
      expect(commitShort).toBe(commit.slice(0, 7));
    }
  });

  it('未注入任何 commit 环境变量时 commit 为 null（诚实未知），不是假 sha', async () => {
    const res = await request(app).get('/api/version');
    const injected = COMMIT_ENV_KEYS.some((k) => {
      const v = process.env[k];
      return v && /^[0-9a-f]{7,40}$/i.test(v.trim());
    });
    if (injected) {
      // CI 真注入了 sha，则改为验证它被正确识别（不浪费一次模块重载）
      const first = COMMIT_ENV_KEYS.map((k) => process.env[k]).find((v) => v && /^[0-9a-f]{7,40}$/i.test(v.trim()));
      expect(res.body.commit).toBe(first!.trim().toLowerCase());
    } else {
      expect(res.body.commit).toBeNull();
      expect(res.body.commitKnown).toBe(false);
    }
  });

  it('startedAt 是合法 ISO 时间（进程启动时间可核验，不冒充 buildTime）', async () => {
    const res = await request(app).get('/api/version');
    expect(Number.isNaN(Date.parse(res.body.startedAt))).toBe(false);
  });

  it('buildTime 未注入时为 null（不用启动时间冒充构建时间）', async () => {
    if (process.env.BUILD_TIME || process.env.BUILD_TIMESTAMP) return; // CI 注入了则跳过
    const res = await request(app).get('/api/version');
    expect(res.body.buildTime).toBeNull();
  });

  it('根路径 / 自报端点清单里含 version', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.endpoints.version).toBe('/api/version');
  });
});

describe('/health — 构建信息同源', () => {
  it('/health 带 build 对象，且与 /api/version 完全一致', async () => {
    const [healthRes, versionRes] = await Promise.all([
      request(app).get('/health'),
      request(app).get('/api/version'),
    ]);
    expect(healthRes.body).toHaveProperty('build');
    // 两个端点必须逐字段相同 —— 同一份 buildInfo()，不存在两个真源
    expect(healthRes.body.build).toEqual(versionRes.body);
  });
});

// ---------------------------------------------------------------------------
// 环境变量矩阵：合并为 5 次模块重载，每次覆盖多个断言。
// ---------------------------------------------------------------------------
describe('commit 解析的诚实性（动态重载 app.ts）', { timeout: 60_000 }, () => {
  it('合法 sha：40 位原样识别 / 7 位短 sha / 大写归一化 —— 三种形态同批验证', async () => {
    // 40 位
    let a = await loadWithEnv({ ...cleanCommitEnv(), GIT_COMMIT_SHA: HEX40 });
    let res = await request(a).get('/api/version');
    expect(res.body.commit).toBe(HEX40);
    expect(res.body.commitKnown).toBe(true);
    expect(res.body.commitShort).toBe(HEX40.slice(0, 7));

    // 7 位短 sha —— git 允许短 sha 作对象名，部署系统常注入短 sha
    a = await loadWithEnv({ ...cleanCommitEnv(), GIT_COMMIT_SHA: 'b9b0564' });
    res = await request(a).get('/api/version');
    expect(res.body.commit).toBe('b9b0564');

    // 大写 —— 归一化为小写，避免大小写造成「版本不一致」假警报
    a = await loadWithEnv({ ...cleanCommitEnv(), GIT_COMMIT_SHA: HEX40.toUpperCase() });
    res = await request(a).get('/api/version');
    expect(res.body.commit).toBe(HEX40);
  });

  it('脏值一律视为未注入 → commit 为 null，绝不透传给外', async () => {
    // 占位符类：unknown / latest / HEAD / 分支名
    let a = await loadWithEnv({ ...cleanCommitEnv(), GIT_COMMIT_SHA: 'unknown', BUILD_COMMIT: 'latest', SOURCE_COMMIT: 'HEAD' });
    let res = await request(a).get('/api/version');
    expect(res.body.commit).toBeNull();
    expect(res.body.commitKnown).toBe(false);
    expect(res.body.commitShort).toBeNull();

    // 空串 / 纯空白
    a = await loadWithEnv({ ...cleanCommitEnv(), GIT_COMMIT_SHA: '   ', BUILD_COMMIT: '' });
    res = await request(a).get('/api/version');
    expect(res.body.commit).toBeNull();

    // 形似 sha 但含非 hex 字符
    a = await loadWithEnv({ ...cleanCommitEnv(), GIT_COMMIT_SHA: 'zzzzzzz' });
    res = await request(a).get('/api/version');
    expect(res.body.commit).toBeNull();
  });

  it('回退顺序：GIT_COMMIT_SHA 优先；前序脏值时继续回退到干净值', async () => {
    // 优先级
    let a = await loadWithEnv({ ...cleanCommitEnv(), GIT_COMMIT_SHA: HEX40, BUILD_COMMIT: 'bbbbbbb', SOURCE_COMMIT: 'ccccccc' });
    let res = await request(a).get('/api/version');
    expect(res.body.commit).toBe(HEX40);

    // GIT_COMMIT_SHA 脏 → 回退 BUILD_COMMIT
    a = await loadWithEnv({ ...cleanCommitEnv(), GIT_COMMIT_SHA: 'unknown', BUILD_COMMIT: HEX40_ALT, SOURCE_COMMIT: 'ccccccc' });
    res = await request(a).get('/api/version');
    expect(res.body.commit).toBe(HEX40_ALT);

    // CF_PAGES_COMMIT_SHA 也纳入候选（后端若跑在 Pages Functions 上）
    a = await loadWithEnv({ ...cleanCommitEnv(), CF_PAGES_COMMIT_SHA: HEX40 });
    res = await request(a).get('/api/version');
    expect(res.body.commit).toBe(HEX40);
  });

  it('BUILD_TIME 支持 ISO 字符串与秒级时间戳，非法值返回 null', async () => {
    // loadWithEnv 在 resetModules+import **之前**写入 env、在之后还原，
    // 所以 buildTime() 读到的正是这里给的值。
    let a = await loadWithEnv({ BUILD_TIME: '2026-10-06T12:00:00Z', BUILD_TIMESTAMP: undefined });
    let res = await request(a).get('/api/version');
    expect(res.body.buildTime).toBe('2026-10-06T12:00:00.000Z');

    // 秒级时间戳（SOURCE_DATE_EPOCH 风格）
    a = await loadWithEnv({ BUILD_TIME: '1791388800', BUILD_TIMESTAMP: undefined });
    res = await request(a).get('/api/version');
    expect(res.body.buildTime).not.toBeNull();
    expect(Number.isNaN(Date.parse(res.body.buildTime))).toBe(false);

    // 非法值 → null（不是 "Invalid Date"）
    a = await loadWithEnv({ BUILD_TIME: 'not-a-date', BUILD_TIMESTAMP: undefined });
    res = await request(a).get('/api/version');
    expect(res.body.buildTime).toBeNull();
  });
});