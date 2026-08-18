/**
 * 事件日历聚合端点（P0-3）
 *
 * 数据源诚实红线：仅接入已验证可访问的真实数据源；未接入/不可达的类别
 * 一律返回空数组并在 `notes` 中显性标注，绝不注入演示/随机数据。
 *
 * 前端契约（与 EventCalendarPage.tsx + eventCalendarEngine.parseEvents 对齐）：
 *   GET /api/event-calendar/events
 *   → { success, data: { raw: RawEventInput[], meta }, dataSource, notes, timestamp }
 *   raw[].{ date, type, symbol?, title, description?, estimatedEffect? }
 *
 * 事件类型：earnings | ex_dividend | ipo | lockup_expiry |
 *          index_rebalance | economic | split | merger
 *
 * 真实数据源接入状态（2026-08-14 沙箱实测）：
 *   - 东方财富事件类报表（RPT_ECONOMICS_CALENDAR / RPT_IPONO_* 等）均返回
 *     9501「报表配置不存在」；RPT_MUTUAL_STOCK_NORTHSTA 返回「服务器繁忙」。
 *   - 现有 lockup-shares 接口为 Math.random 伪数据，按红线剔除，真实解禁源待接入。
 *   故当前所有类别均为「待接入」，端点骨架已就绪，数据源恢复后实现对应 fetch 即可自动填充。
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { createLogger } from '../utils/logger';

const log = createLogger('EventCalendar');

const router = Router();

interface RawEventInput {
  date: string;
  type: string;
  symbol?: string;
  title: string;
  description?: string;
  estimatedEffect?: number;
}

type EventTypeKey =
  | 'earnings'
  | 'ex_dividend'
  | 'ipo'
  | 'lockup_expiry'
  | 'index_rebalance'
  | 'economic'
  | 'split'
  | 'merger';

/** 各事件类型的真实数据源接入说明（诚实标注） */
const SOURCE_NOTES: Record<EventTypeKey, string> = {
  earnings: '财报发布：需接入交易所/东方财富业绩披露预约日历（沙箱暂未接入）',
  ex_dividend: '分红除权：需接入分红送转实施日历（沙箱暂未接入）',
  ipo: '新股上市：需接入东方财富 IPO 日历（RPT_IPONO_* 沙箱返回 9501）',
  lockup_expiry: '限售解禁：现有接口为随机演示数据，按红线剔除；真实解禁源待接入',
  index_rebalance: '指数调仓：需接入指数公司定期调仓公告（沙箱暂未接入）',
  economic: '宏观数据：东方财富经济日历报表沙箱返回 9501（报表配置不存在）',
  split: '送转除权：需接入分红送转实施日历（沙箱暂未接入）',
  merger: '并购重组：需接入重大事项公告（沙箱暂未接入）',
};

/**
 * 可插拔数据源注册表。
 * 仅当 `enabled: true` 且提供了真实 `fetch` 实现时才参与聚合；
 * 否则该类别计入 `pending`，响应中显性标注为待接入。
 * 数据源恢复后，实现对应 fetch 并将 enabled 置 true 即可自动填充事件。
 */
const SOURCES: Partial<Record<EventTypeKey, { enabled: boolean; fetch?: () => Promise<RawEventInput[]> }>> = {
  // 示例（数据源恢复后启用）：
  // economic: { enabled: true, fetch: fetchEconomicCalendar },
};

const fmtDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function collectEvents(): Promise<{ raw: RawEventInput[]; pending: EventTypeKey[] }> {
  const raw: RawEventInput[] = [];
  const pending = new Set<EventTypeKey>();

  for (const key of Object.keys(SOURCE_NOTES) as EventTypeKey[]) {
    const src = SOURCES[key];
    if (!src || !src.enabled || !src.fetch) {
      pending.add(key);
      continue;
    }
    try {
      const evs = await src.fetch!();
      raw.push(...evs);
    } catch (e) {
      log.warn(`事件源 ${key} 拉取失败，按待接入处理:`, { error: (e as Error).message });
      pending.add(key);
    }
  }

  return { raw, pending: [...pending] };
}

router.get('/event-calendar/events', asyncHandler(async (_req, res) => {
  const { raw, pending } = await collectEvents();
  const now = new Date();

  // 仅保留未过期事件（含今日），保持与前端「未来 90 天」视图一致
  const todayStr = fmtDate(now);
  const upcoming = raw
    .filter((e) => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const dataSource = upcoming.length > 0 ? 'partial' : 'unavailable';

  res.json({
    success: true,
    data: {
      raw: upcoming,
      meta: {
        source: dataSource,
        updatedAt: null,
        error: dataSource === 'unavailable' ? '事件日历真实数据源尚未接入' : undefined,
      },
    },
    dataSource,
    notes: {
      integrated: (Object.keys(SOURCE_NOTES) as EventTypeKey[]).filter(
        (k) => SOURCES[k]?.enabled && SOURCES[k]?.fetch,
      ),
      pending: pending.reduce<Record<string, string>>((acc, k) => {
        acc[k] = SOURCE_NOTES[k];
        return acc;
      }, {}),
      message:
        '事件日历真实数据源尚未接入（沙箱下东方财富事件类报表返回 9501/服务器繁忙）。' +
        '页面已如实置空并标注各品类接入状态，端点骨架就绪，数据源恢复后自动填充。',
    },
    timestamp: now.toISOString(),
  });
}));

export default router;
