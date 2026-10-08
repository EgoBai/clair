/**
 * 市场宽度区块 (MarketBreadthSection) — 消费 `/api/breadth/current` 真实数据
 *
 * ## 为什么放在 DiscoverPage（发掘·市场洞察）而不是新建页面
 *
 * 市场宽度（涨跌家数/涨跌停/新高新低）就是「大盘概览」本身——它回答的是
 * 「今天全市场多少家涨、多少家跌」，属于市场总览的第一层事实，而不是某个
 * 下钻专题。DiscoverPage 顶部已声明「大盘概览 → 板块景气度评估 → 个股深挖」，
 * 且已有「Index + Breadth」区块承载指数卡与市场情绪，语义与布局都最贴切。
 * 新建独立路由会与 navGroups 的 6 组投研工作流产品契约冲突（见 navGroups.test.ts
 * 「应恰好包含 6 个分组」），故本区块以组件形式内嵌，不新增页面/路由。
 *
 *## 诚实契约消费（这是本区块存在的核心原因）
 *
 * 后端 `/api/breadth/current` 的自描述字段必须被真实消费，否则用户会把
 * 「拿不到」误读成「是0」：
 *
 * - `newHighs` / `newLows` 是 **`number | null`**。腾讯行情源不提供历史新高/新低
 *   统计，后端诚实返回 `null`。**`null` ≠ 0**——若渲染成 0，用户会读成
 *   「今日全市场无新高」，这是凭空造数。本区块对 null 显示「该指标数据源未提供」。
 * - `unavailableFields` / `message`：后端给出的字段级不可用清单与中文原因，原样透出。
 * - `dataSource`：真实源名（如 `tencent`），展示给用户以便核对口径。
 * - `caliber`：涨跌停判定口径说明，可展开查看，避免口径误读。
 * - `uncoveredSymbols`：请求了但源侧无报价的标的数（退市/停牌），如实展示覆盖率。
 *
 *## 刻意不展示的模块
 *
 * `/api/breadth/history` 与 `/api/breadth/mcclellan` 目前后端 `dataSource:'unavailable'`
 * （时序未落库）。**绝不能造数**，故本区块不调用、不渲染这两者，也不画任何趋势图。
 * 待时序落库后再单独接入。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'antd';
import {
  ReloadOutlined, RiseOutlined, FallOutlined, InfoCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import breadthService, { type BreadthData } from '../../services/breadthService';
import logger from '../../utils/logger';

// 深色主题（与 DiscoverPage 一致）
const CARD_BG = 'var(--card-bg)';
const BORDER = 'var(--border-default)';
const TEXT = 'var(--text-primary)';
const TEXT_SEC = 'var(--text-secondary)';
/** 涨红跌绿（A 股口径） */
const COLOR_UP = '#ef4444';
const COLOR_DOWN = '#22c55e';
const WARN = '#f59e0b';

const fmtInt = (n: number): string => n.toLocaleString('zh-CN');

/** 成交额格式化（元 → 万亿/亿） */
const fmtAmount = (v: number): string => {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} 万亿`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)} 万`;
  return String(v);
};

/**
 * 单个指标格。
 * `null` 值一律走「不可用」分支——绝不渲染 0。
 */
const Metric: React.FC<{
  label: React.ReactNode;
  value: string | null;
  color?: string;
  /** 值为 null 时的原因说明 */
  nullHint?: string;
}> = ({ label, value, color = TEXT, nullHint }) => (
  <div style={{
    background: 'var(--bg-secondary)', border: `1px solid ${BORDER}`,
    borderRadius: 8, padding: '10px 12px',
  }}>
    <div style={{ fontSize: 11, color: TEXT_SEC, marginBottom: 4 }}>{label}</div>
    {value === null ? (
      <Tooltip title={nullHint || '当前行情源不提供该统计（不可用 ≠ 0）'}>
        <span data-testid="metric-unavailable" style={{ color: WARN, fontSize: 13, fontWeight: 600, cursor: 'help' }}>
          数据源未提供
          <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 11 }} />
        </span>
      </Tooltip>
    ) : (
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'monospace', lineHeight: 1.2 }}>{value}</div>
    )}
  </div>
);

export const MarketBreadthSection: React.FC = () => {
  const [data, setData] = useState<BreadthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await breadthService.getCurrent();
      setData(d);
    } catch (err) {
      // 诚实红线：请求失败如实置空并展示原因，绝不退回本地推算/演示值
      logger.warn('市场宽度接口不可用:', err);
      setData(null);
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = data ? data.advancing + data.declining + data.unchanged : 0;
  const upPct = total > 0 ? (data!.advancing / total) * 100 : 0;
  const flatPct = total > 0 ? (data!.unchanged / total) * 100 : 0;
  const downPct = total > 0 ? (data!.declining / total) * 100 : 0;

  return (
    <div
      data-testid="market-breadth-section"
      style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
          市场宽度
          <Tooltip title="全市场真实涨跌家数（逐标的行情本地聚合），非估算值">
            <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 11, color: TEXT_SEC }} />
          </Tooltip>
          {data?.dataSource && (
            <span style={{ fontSize: 10, color: TEXT_SEC, marginLeft: 8, fontWeight: 400 }}>
              数据源 {data.dataSource}
            </span>
          )}
        </span>
        <span
          onClick={load}
          style={{ fontSize: 12, color: TEXT_SEC, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ReloadOutlined spin={loading} /> 刷新
        </span>
      </div>

      {/* (a) 请求失败 */}
      {error && !data && (
        <div
          data-testid="breadth-error"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
            borderRadius: 8, background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.35)', color: WARN, fontSize: 12, lineHeight: 1.6,
          }}
        >
          <WarningOutlined style={{ marginTop: 2 }} />
          <span>市场宽度接口请求失败：{error}。这表示未能取到数据，不代表全市场没有涨跌家数。</span>
        </div>
      )}

      {/* (b) 加载中 —— 不渲染任何占位数值 */}
      {!error && loading && !data && (
        <div style={{ color: TEXT_SEC, fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
          市场宽度加载中…
        </div>
      )}

      {/* (c) 真实数据 */}
      {data && !loading && (
        <>
          {/* 涨跌分布条 */}
          <div style={{ display: 'flex', height: 22, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
            <Tooltip title={`上涨 ${data.advancing} 家（${upPct.toFixed(1)}%）`}>
              <div style={{
                width: `${upPct}%`, background: COLOR_UP, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', fontSize: 11,
              }}>
                {upPct > 10 && `涨 ${data.advancing}`}
              </div>
            </Tooltip>
            <Tooltip title={`平盘 ${data.unchanged} 家（${flatPct.toFixed(1)}%）`}>
              <div style={{
                width: `${flatPct}%`, background: 'rgba(148,163,184,0.35)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: TEXT, fontSize: 11,
              }}>
                {flatPct > 8 && `平 ${data.unchanged}`}
              </div>
            </Tooltip>
            <Tooltip title={`下跌 ${data.declining} 家（${downPct.toFixed(1)}%）`}>
              <div style={{
                width: `${downPct}%`, background: COLOR_DOWN, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', fontSize: 11,
              }}>
                {downPct > 10 && `跌 ${data.declining}`}
              </div>
            </Tooltip>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <Metric label={<><RiseOutlined /> 上涨家数</>} value={fmtInt(data.advancing)} color={COLOR_UP} />
            <Metric label={<><FallOutlined /> 下跌家数</>} value={fmtInt(data.declining)} color={COLOR_DOWN} />
            <Metric label="平盘家数" value={fmtInt(data.unchanged)} color={TEXT_SEC} />
            <Metric label="涨跌比" value={data.advanceDeclineRatio?.toFixed(2)} color={data.advanceDeclineRatio >= 1 ? COLOR_UP : COLOR_DOWN} />
            <Metric label="涨停" value={data.limitUp == null ? null : fmtInt(data.limitUp)} color={COLOR_UP}
              nullHint="后端未返回涨跌停家数（不可用 ≠ 0 家）" />
            <Metric label="跌停" value={data.limitDown == null ? null : fmtInt(data.limitDown)} color={COLOR_DOWN}
              nullHint="后端未返回涨跌停家数（不可用 ≠ 0 家）" />
            {/*诚实红线：newHighs/newLows 为 null 时显示「数据源未提供」，绝不显示 0 */}
            <Metric label="创新高" value={data.newHighs == null ? null : fmtInt(data.newHighs)} color={COLOR_UP}
              nullHint={data.message || '腾讯行情源不提供历史新高统计（null = 不可用，不是 0 家）'} />
            <Metric label="创新低" value={data.newLows == null ? null : fmtInt(data.newLows)} color={COLOR_DOWN}
              nullHint={data.message || '腾讯行情源不提供历史新低统计（null = 不可用，不是 0 家）'} />
            <Metric label="全市场成交额" value={data.turnover == null ? null : fmtAmount(data.turnover)} color={TEXT} />
          </div>

          {/* 字段级不可用说明：把「为什么没有」讲清楚 */}
          {data.unavailableFields && data.unavailableFields.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: WARN, lineHeight: 1.6 }}>
              ⚠ 以下字段当前数据源未提供（不可用，不等于 0）：{data.unavailableFields.join('、')}
            </div>
          )}

          {/* 覆盖率与口径：如实展示，避免把「没覆盖」当成「没有」 */}
          <div style={{ marginTop: 8, fontSize: 11, color: TEXT_SEC, lineHeight: 1.7 }}>
            {typeof data.uncoveredSymbols === 'number' && data.uncoveredSymbols > 0 && (
              <div>
                清单内 {data.totalStocks} 只，其中 {data.uncoveredSymbols} 只源侧无报价（退市/长期停牌/不在行情库），未计入涨跌家数。
              </div>
            )}
            {data.caliber && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: 'pointer', color: TEXT_SEC }}>涨跌停判定口径</summary>
                <div style={{ marginTop: 4, color: TEXT_SEC }}>{data.caliber}</div>
              </details>
            )}
          </div>
        </>
      )}

      {/* (d) 刻意不渲染 history / mcclellan —— 后端时序未落库，画出来就是造假 */}
    </div>
  );
};

export default MarketBreadthSection;