import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiService, batchGetQuotes } from '../services/api';

describe('apiService 兼容导出', () => {
  afterEach(() => vi.restoreAllMocks());

  it('batchGetQuotes 解构导出后仍保留 this', async () => {
    const client = (apiService as unknown as { client: { post: (...args: unknown[]) => Promise<unknown> } }).client;
    const post = vi.spyOn(client, 'post').mockResolvedValue({
      data: { data: [{ symbol: '600519', latestQuote: { closePrice: 1453 } }], success: true },
    });

    const result = await batchGetQuotes(['600519']);

    expect(post).toHaveBeenCalledWith('/stocks/batch/quotes', { symbols: ['600519'] });
    expect((result as { data: Array<{ latestQuote: { closePrice: number } }> }).data[0].latestQuote.closePrice).toBe(1453);
  });
});
