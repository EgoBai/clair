/**
 * 「策略信号」诚实标注回归测试（P0-DEADLINK）
 *
 * 背景：
 *   `/api/stocks/:symbol/strategy` 这条死链曾在前端三处被调用
 *   （StockDetailPage / WatchlistPage / useWatchlistData），实测后端 404：
 *   `{"code":"NOT_FOUND","message":"接口未找到: GET /api/stocks/600519/strategy"}`，
 *   且 `rg "stocks/.*strategy" backend/src` 零命中——后端**从未注册**该端点。
 *
 *   按项目诚实数据红线：页面要展示「综合评分 / 仓位建议 / RSI」这类**推断性内容**，
 *   后端无真实算法支撑时**不得**新造一个返回编造评分的端点，
 *   正确做法是前端显式标注「该功能未接入」，而不是留空白 / 展示 0 值 / 报错。
 *
 * 本测试锁定两件事：
 *   1. 前端**不得**存在指向 `/api/stocks/:symbol/strategy` 的可执行调用
 *      （注释 / 文档字符串里的历史说明不算，故只剥离注释后再断言）；
 *   2. 指数详情页必须把「技术分析未接入」作为**说明文案**展示，
 *      而不是空白、不是 0 值、不是抛错——即 unavailable 列表里必须有这条。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(here, rel), 'utf-8');

/** 剥离块注释与行注释，避免把「历史死链说明」误判成可执行调用 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('策略信号：无后端支撑时诚实标注，不留死链', () => {
  describe('死链断言', () => {
    const targets = [
      '../pages/IndexDetailPage.tsx',
      '../pages/StockDetailPage.tsx',
      '../pages/WatchlistPage.tsx',
      '../hooks/useWatchlistData.ts',
      '../utils/backtestDemo.ts',
    ];

    it.each(targets)('%s 不含指向 /api/stocks/:symbol/strategy 的可执行调用', (rel) => {
      const code = stripComments(readSrc(rel));
      // 允许 strategy-templates / ai/strategy-recommend / ai/strategy 等真实端点，
      // 只拦「stocks/.../strategy」这一条不存在的路径
      expect(code, `${rel} 仍存在指向未注册端点 /api/stocks/:symbol/strategy 的调用`).not.toMatch(
        /api\/stocks\/[^`'"]*\/strategy/,
      );
    });

    it('后端确实没有实现该端点（证明前端必须标注而非调用）', () => {
      const beRoot = join(here, '../../../backend/src');
      const { execSync } = require('child_process') as typeof import('child_process');
      const out = execSync(
        `rg -n "stocks/.*strategy|/:symbol/strategy" ${JSON.stringify(beRoot)} || true`,
        { encoding: 'utf-8' },
      );
      expect(out.trim(), '后端竟出现了 strategy 死链路径的实现，前端应改指而非标注').toBe('');
    });
  });

  describe('未接入时的展示形态：说明文案，而非空白/ 0 值', () => {
    it('指数详情页把技术分析列入 unavailable 说明列表', () => {
      const src = readSrc('../pages/IndexDetailPage.tsx');
      // 必须存在「未接入」字样的说明，且明确点出综合评分/仓位建议/RSI
      expect(src).toMatch(/技术分析.*未接入|未接入.*技术分析/);
      expect(src).toMatch(/综合评分|仓位建议|RSI/);
    });

    it('unavailable 非空时才渲染 Alert，空态不留白', () => {
      const src = readSrc('../pages/IndexDetailPage.tsx');
      // 有条件渲染 + 逐条列出文案
      expect(src).toMatch(/unavailable\.length\s*>\s*0/);
      expect(src).toMatch(/unavailable\.map\(/);
    });

    it('诚实说明块不得用 0 值 / 空数组冒充已接入', () => {
      const src = readSrc('../pages/IndexDetailPage.tsx');
      const block = src.slice(src.indexOf('const missing'), src.indexOf('setUnavailable(missing)'));
      // 该段只允许 push 说明文案，不允许把评分类字段置0 充数
      expect(block).not.toMatch(/(综合评分|评分|仓位|RSI)\s*[:=]\s*0\b/);
    });
  });
});
