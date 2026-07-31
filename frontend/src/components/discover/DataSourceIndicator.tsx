/**
 * 数据可信度指示器 — 发掘页专用
 *
 * 解决「演示数据静默兜底」红线问题：任何非真实数据都必须显性告知用户。
 *
 * 后端契约（并行开发中，可能尚未上线）：
 *   响应体在 data 同级或内部带 meta:
 *     { source: 'live' | 'stale' | 'unavailable', updatedAt: string | null, error?: string }
 *   - live        真实实时数据
 *   - stale       缓存/过期数据（展示「缓存数据 + 时间」）
 *   - unavailable 数据不可用（展示「数据不可用 + 重试」）
 *
 * 兼容退化：后端未返回 meta 时，退化为「响应为空即演示」判断（demo）。
 *
 * 暗色主题红线：所有告警一律使用半透明暗色底 + 彩色描边，严禁 antd 默认白底。
 */

import React from 'react';
import { Alert, Button, Tooltip } from 'antd';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';

/** 后端统一元信息契约 */
export interface ApiMeta {
  source: 'live' | 'stale' | 'unavailable';
  updatedAt: string | null;
  error?: string;
}

/**
 * 前端归一化后的数据源状态。
 * 比后端契约多两个前端专属态：
 *   - 'demo'    后端无 meta 且响应为空 → 走了本地演示数据（退化判断）
 *   - 'loading' 尚未加载完成（用于占位，绝不能显示假数值）
 */
export type SourceKind = 'live' | 'stale' | 'unavailable' | 'demo' | 'loading';

export interface DataSourceState {
  kind: SourceKind;
  /** 数据时间戳（stale 态必展示） */
  updatedAt: string | null;
  /** 后端错误原因（unavailable 态展示） */
  error?: string;
}

export const LIVE_SOURCE: DataSourceState = { kind: 'live', updatedAt: null };

/** 该状态是否代表「非真实数据」，需要显性提示 */
export function isUntrusted(s: DataSourceState | undefined): boolean {
  return !!s && s.kind !== 'live' && s.kind !== 'loading';
}

/**
 * 从任意 API 响应体解析数据源状态。
 *
 * @param payload  fetch().json() 的结果（可能为 null / 结构异常）
 * @param isEmpty  业务数据是否为空（由调用方按各自结构判断）
 * @param demoFallback 为空时调用方是否降级到了本地演示数据
 *
 * 判定顺序：
 *   1. payload.meta 或 payload.data.meta 存在 → 严格按契约取 source（后端已上线）
 *   2. 无 meta 且数据为空 → 'demo'（降级到演示数据）/ 'unavailable'（未降级）
 *   3. 其余 → 'live'
 */
export function resolveDataSource(
  payload: any,
  isEmpty: boolean,
  demoFallback: boolean,
): DataSourceState {
  // meta 既可能是 data 的兄弟字段（res.json 直写），也可能在 data 内部（sendSuccess 包装），两种都兼容
  const meta: Partial<ApiMeta> | undefined = payload?.meta ?? payload?.data?.meta;
  if (meta && (meta.source === 'live' || meta.source === 'stale' || meta.source === 'unavailable')) {
    // 后端已按契约返回：meta.source !== 'live' 即判定为非真实数据
    if (isEmpty && demoFallback) {
      // 数据为空且调用方降级到了本地演示数据 → 屏幕上呈现的就是演示数据，如实标注为 demo，
      // 同时保留后端给出的失败原因，Banner 里一并展示
      return { kind: 'demo', updatedAt: meta.updatedAt ?? null, error: meta.error };
    }
    if (meta.source === 'live' && isEmpty) {
      // 契约声称 live 但业务数据为空 → 仍按不可用处理，避免"空的真实"被当成正常
      return { kind: 'unavailable', updatedAt: meta.updatedAt ?? null, error: meta.error };
    }
    return { kind: meta.source, updatedAt: meta.updatedAt ?? null, error: meta.error };
  }
  // 后端尚未返回 meta → 退化为「响应为空即演示」
  if (isEmpty) return { kind: demoFallback ? 'demo' : 'unavailable', updatedAt: null };
  return { kind: 'live', updatedAt: null };
}

/** 请求整体失败（reject / 非 2xx）时的状态 */
export function failedDataSource(demoFallback: boolean, error?: string): DataSourceState {
  return { kind: demoFallback ? 'demo' : 'unavailable', updatedAt: null, error };
}

function formatTs(ts: string | null): string {
  if (!ts) return '时间未知';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('zh-CN', { hour12: false });
}

const KIND_STYLE: Record<Exclude<SourceKind, 'live'>, { color: string; text: string }> = {
  stale: { color: '#f59e0b', text: '缓存数据' },
  demo: { color: '#f59e0b', text: '演示数据' },
  unavailable: { color: '#ef4444', text: '数据不可用' },
  loading: { color: '#64748b', text: '加载中' },
};

/** 单个卡片/表格上的「演示数据 / 缓存数据 / 数据不可用」角标 */
export const DataSourceBadge: React.FC<{ state?: DataSourceState; compact?: boolean }> = ({ state, compact }) => {
  if (!state || state.kind === 'live') return null;
  const cfg = KIND_STYLE[state.kind];
  const tip =
    state.kind === 'stale' ? `缓存数据，数据时间：${formatTs(state.updatedAt)}`
    : state.kind === 'demo' ? '当前展示的是本地演示数据，非真实行情，请勿据此决策'
    : state.kind === 'unavailable' ? `数据不可用${state.error ? '：' + state.error : ''}`
    : '数据加载中';
  return (
    <Tooltip title={tip}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: compact ? 9 : 10, fontWeight: 700, lineHeight: '16px',
          padding: compact ? '0 4px' : '0 6px', borderRadius: 4, cursor: 'help',
          background: cfg.color + '1f',
          color: cfg.color,
          border: `1px solid ${cfg.color}59`,
          whiteSpace: 'nowrap',
        }}
      >
        {state.kind !== 'loading' && <WarningOutlined style={{ fontSize: compact ? 9 : 10 }} />}
        {cfg.text}
        {state.kind === 'stale' && state.updatedAt ? ` · ${formatTs(state.updatedAt)}` : ''}
      </span>
    </Tooltip>
  );
};

export interface DataSourceEntry {
  /** 数据集展示名，如「行业板块」「多因子」 */
  name: string;
  state: DataSourceState;
}

/**
 * 页面顶部固定的显性警示 Banner。
 * 只要存在任一非 live 数据集就必须渲染，禁止静默降级。
 */
export const DataSourceBanner: React.FC<{
  entries: DataSourceEntry[];
  onRetry: () => void;
  retrying?: boolean;
}> = ({ entries, onRetry, retrying }) => {
  const bad = entries.filter(e => isUntrusted(e.state));
  if (bad.length === 0) return null;

  const hasUnavailable = bad.some(e => e.state.kind === 'unavailable');
  const hasDemo = bad.some(e => e.state.kind === 'demo');
  const accent = hasUnavailable ? '#ef4444' : '#f59e0b';

  const title = hasUnavailable
    ? '部分数据不可用 — 页面内容不完整'
    : hasDemo
      ? '当前展示演示数据 — 非真实行情，请勿据此决策'
      : '当前展示缓存数据 — 可能已过期';

  return (
    <Alert
      banner={false}
      showIcon={false}
      // 暗色系警示：半透明底 + 彩色描边，严禁 antd 默认白底
      style={{
        background: accent + '1a',
        border: `1px solid ${accent}66`,
        borderRadius: 10,
        marginBottom: 16,
        padding: '10px 14px',
      }}
      message={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <WarningOutlined style={{ color: accent, fontSize: 16 }} />
          <span style={{ color: accent, fontWeight: 700, fontSize: 13 }}>{title}</span>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={retrying}
            onClick={onRetry}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              borderColor: accent + '99',
              color: accent,
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            重试
          </Button>
        </div>
      }
      description={
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {bad.map(e => (
            <div key={e.name} style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>
              <span style={{ color: 'var(--text-primary, #e2e8f0)', fontWeight: 600 }}>{e.name}</span>
              {'：'}
              {e.state.kind === 'stale' && `缓存数据（数据时间 ${formatTs(e.state.updatedAt)}）`}
              {e.state.kind === 'demo' && `后端返回空数据，已降级为本地演示数据（非真实行情）${e.state.error ? '，原因：' + e.state.error : ''}`}
              {e.state.kind === 'unavailable' && `数据不可用${e.state.error ? '（' + e.state.error + '）' : ''}`}
            </div>
          ))}
        </div>
      }
    />
  );
};

/** 多因子未加载完成时的占位方块（绝不显示假数值） */
export const DimLoadingPlaceholder: React.FC<{ width?: number }> = ({ width = 46 }) => (
  <span
    style={{
      display: 'inline-block', width, height: 16, borderRadius: 3,
      background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
      backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
    }}
  />
);
