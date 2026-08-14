/**
 * llmGateway LLM 网关测试（超时 + 重试 + 熔断 + 计量）
 *
 * 策略：stub 全局 fetch，绝不访问真实外网。
 * 注意：breakers / stats 为模块级状态，各用例使用独立 provider 名隔离。
 * 为避免真实退避等待，除重试用例外一律 retries:0（重试用例 retries:1，单次 500ms 退避）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  gatewayFetch,
  recordGatewaySuccess,
  recordGatewayFailure,
  reportGatewayUsage,
  getGatewayStats,
  CircuitOpenError,
  isCircuitOpenError,
} from '../services/llmGateway';

function okResponse(body = '{"ok":true}') {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response;
}

function errResponse(status: number, body = 'upstream error') {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const INIT: RequestInit = { method: 'POST', body: '{}' };

describe('llmGateway', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('成功路径与计量', () => {
    it('上游 2xx → 返回 Response 并记录成功调用', async () => {
      const fetchMock = vi.fn().mockResolvedValue(okResponse());
      vi.stubGlobal('fetch', fetchMock);

      const resp = await gatewayFetch('p-success', 'https://llm.example/v1/chat', INIT, { retries: 0 });
      expect(resp.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const stats = getGatewayStats();
      expect(stats.providers['p-success'].calls).toBe(1);
      expect(stats.providers['p-success'].failures).toBe(0);
      expect(stats.breakers['p-success'].state).toBe('closed');
    });

    it('recordGatewaySuccess / recordGatewayFailure / reportGatewayUsage 正确累计', () => {
      recordGatewaySuccess('p-manual');
      recordGatewaySuccess('p-manual');
      recordGatewayFailure('p-manual');
      reportGatewayUsage('p-manual', 1200);
      reportGatewayUsage('p-manual', 800);
      reportGatewayUsage('p-manual', 0); // 0 不计入

      const s = getGatewayStats().providers['p-manual'];
      expect(s.calls).toBe(2);
      expect(s.failures).toBe(1);
      expect(s.totalTokens).toBe(2000);
    });
  });

  describe('HTTP 错误与重试策略', () => {
    it('4xx（非 429）不重试，直接抛 HttpStatusError', async () => {
      const fetchMock = vi.fn().mockResolvedValue(errResponse(400, 'bad request'));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        gatewayFetch('p-400', 'https://llm.example/v1/chat', INIT, { retries: 2 }),
      ).rejects.toMatchObject({ name: 'HttpStatusError' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const stats = getGatewayStats();
      expect(stats.providers['p-400'].failures).toBe(1);
    });

    it('5xx 按指数退避重试，最终成功则返回响应', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(errResponse(500))
        .mockResolvedValueOnce(okResponse());
      vi.stubGlobal('fetch', fetchMock);

      const resp = await gatewayFetch('p-500-then-ok', 'https://llm.example/v1/chat', INIT, {
        retries: 1,
      });
      expect(resp.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // 最终成功：calls+1，failures 不增
      const s = getGatewayStats().providers['p-500-then-ok'];
      expect(s.calls).toBe(1);
      expect(s.failures).toBe(0);
    });

    it('5xx 重试耗尽后抛出 HttpStatusError', async () => {
      const fetchMock = vi.fn().mockResolvedValue(errResponse(503));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        gatewayFetch('p-503', 'https://llm.example/v1/chat', INIT, { retries: 1 }),
      ).rejects.toMatchObject({ name: 'HttpStatusError', status: 503 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('网络错误（fetch reject）视为可重试', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValueOnce(okResponse());
      vi.stubGlobal('fetch', fetchMock);

      const resp = await gatewayFetch('p-net', 'https://llm.example/v1/chat', INIT, { retries: 1 });
      expect(resp.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('网络错误重试耗尽后抛出末次错误', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        gatewayFetch('p-net-fail', 'https://llm.example/v1/chat', INIT, { retries: 0 }),
      ).rejects.toThrow('network down');
    });
  });

  describe('熔断器', () => {
    it('连续 5 次失败后熔断打开，后续请求快速失败（不发请求）', async () => {
      const fetchMock = vi.fn().mockResolvedValue(errResponse(500));
      vi.stubGlobal('fetch', fetchMock);
      const provider = 'p-circuit';

      // 5 次失败（retries:0 避免退避等待）→ 达到阈值熔断
      for (let i = 0; i < 5; i++) {
        await expect(
          gatewayFetch(provider, 'https://llm.example/v1/chat', INIT, { retries: 0 }),
        ).rejects.toMatchObject({ name: 'HttpStatusError' });
      }
      expect(fetchMock).toHaveBeenCalledTimes(5);

      const statsBefore = getGatewayStats();
      expect(statsBefore.breakers[provider].state).toBe('open');
      expect(statsBefore.breakers[provider].consecutiveFailures).toBe(5);

      // 第 6 次：熔断器直接拒绝，不再发请求
      fetchMock.mockClear();
      await expect(
        gatewayFetch(provider, 'https://llm.example/v1/chat', INIT, { retries: 0 }),
      ).rejects.toBeInstanceOf(CircuitOpenError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('CircuitOpenError 携带 CIRCUIT_OPEN code，isCircuitOpenError 识别', async () => {
      const fetchMock = vi.fn().mockResolvedValue(errResponse(500));
      vi.stubGlobal('fetch', fetchMock);
      const provider = 'p-circuit-guard';

      for (let i = 0; i < 5; i++) {
        await gatewayFetch(provider, 'https://llm.example/v1/chat', INIT, { retries: 0 }).catch(
          () => {},
        );
      }

      const err = await gatewayFetch(provider, 'https://llm.example/v1/chat', INIT, {
        retries: 0,
      }).catch((e) => e);
      expect(isCircuitOpenError(err)).toBe(true);
      expect((err as CircuitOpenError).code).toBe('CIRCUIT_OPEN');
      expect((err as CircuitOpenError).provider).toBe(provider);

      // 普通错误不被误判
      expect(isCircuitOpenError(new Error('x'))).toBe(false);
      expect(isCircuitOpenError(null)).toBe(false);
    });

    it('失败次数未达阈值时熔断器保持 closed，成功调用重置计数', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(errResponse(500))
        .mockResolvedValueOnce(errResponse(500))
        .mockResolvedValueOnce(okResponse());
      vi.stubGlobal('fetch', fetchMock);
      const provider = 'p-reset';

      await gatewayFetch(provider, 'https://llm.example/v1/chat', INIT, { retries: 0 }).catch(() => {});
      await gatewayFetch(provider, 'https://llm.example/v1/chat', INIT, { retries: 0 }).catch(() => {});
      expect(getGatewayStats().breakers[provider].consecutiveFailures).toBe(2);

      await gatewayFetch(provider, 'https://llm.example/v1/chat', INIT, { retries: 0 });
      const snap = getGatewayStats().breakers[provider];
      expect(snap.state).toBe('closed');
      expect(snap.consecutiveFailures).toBe(0);
    });
  });
});
