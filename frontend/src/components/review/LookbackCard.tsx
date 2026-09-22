/**
 * 回头看卡（LookbackCard）—— R0'-6 验证格的最小呈现
 * ============================================================================
 * 四段式：
 *   1. 当时说     —— 判断原文 + 快照日 + 当时价格
 *   2. 实际发生   —— 个股区间涨跌幅（真实价差计算）
 *   3. 超额收益   —— 个股 − 基准，并明确标注所用基准名
 *   4. 是否兑现   —— 中性结论（兑现 / 未兑现 / 数据不足），不含置信度分数
 *
 * 诚实红线：任何缺失字段一律显示「数据不可用 / 快照数据不完整」，
 * 绝不显示 0、不反推、不编造。
 */
import React from 'react';
import { Card, Tag, Button, Typography, Space, Tooltip } from 'antd';
import { DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import { THEME as SharedTheme } from '../../styles/theme-constants';
import type { ReviewSnapshot, SnapshotOutcome } from '../../services/reviewSnapshot';

const { Text } = Typography;

const THEME = {
  cardBg: SharedTheme.cardBg,
  cardBorder: SharedTheme.border,
  text: SharedTheme.text,
  textSecondary: SharedTheme.textSec,
  up: SharedTheme.up,
  down: SharedTheme.down,
  accent: SharedTheme.accent,
};

const VERDICT_META: Record<
  SnapshotOutcome['verdict'],
  { label: string; color: string; bg: string }
> = {
  fulfilled: { label: '方向兑现', color: THEME.up, bg: 'rgba(239,68,68,0.12)' },
  not_fulfilled: { label: '未兑现', color: THEME.down, bg: 'rgba(34,197,94,0.12)' },
  unavailable: { label: '数据不足 · 不可判定', color: THEME.textSecondary, bg: 'rgba(148,163,184,0.12)' },
  insufficient: { label: '快照数据不完整', color: THEME.textSecondary, bg: 'rgba(148,163,184,0.12)' },
  pending: { label: '待观察', color: THEME.textSecondary, bg: 'rgba(148,163,184,0.10)' },
};

const UNAVAILABLE = '数据不可用';

/** 带符号百分比文本（避免在字符串字面量里出现连续加号）。 */
function pctText(v: number): string {
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
}

function pctColor(v: number): string {
  return v > 0 ? THEME.up : v < 0 ? THEME.down : THEME.text;
}

function formatSnapshotDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <Text style={{ color: THEME.textSecondary, fontSize: 12, display: 'block', marginBottom: 2 }}>
      {label}
    </Text>
    <div style={{ fontSize: 13, color: THEME.text, lineHeight: 1.7 }}>{children}</div>
  </div>
);

interface LookbackCardProps {
  snapshot: ReviewSnapshot;
  outcome: SnapshotOutcome;
  onRemove: (id: string) => void;
}

const LookbackCard: React.FC<LookbackCardProps> = ({ snapshot, outcome, onRemove }) => {
  const meta = VERDICT_META[outcome.verdict];

  return (
    <Card
      style={{
        background: THEME.cardBg,
        border: `1px solid ${THEME.cardBorder}`,
        borderRadius: 12,
        marginBottom: 12,
      }}
      bodyStyle={{ padding: 16 }}
    >
      {/* 头部：标的 + 结论 + 删除 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <Space size={8} wrap>
          <HistoryOutlined style={{ color: THEME.accent }} />
          <Text style={{ color: THEME.text, fontSize: 15, fontWeight: 600 }}>
            {snapshot.name}
          </Text>
          <Text style={{ color: THEME.textSecondary, fontSize: 12, fontFamily: 'monospace' }}>
            {snapshot.symbol}
          </Text>
          <Tag style={{ background: meta.bg, color: meta.color, border: 'none', borderRadius: 4 }}>
            {meta.label}
          </Tag>
        </Space>
        <Tooltip title="删除该快照">
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => onRemove(snapshot.id)}
            style={{ color: THEME.textSecondary }}
          />
        </Tooltip>
      </div>

      {/* 1. 当时说 */}
      <Field label="① 当时说">
        <div style={{ whiteSpace: 'pre-wrap', marginBottom: 4 }}>
          {snapshot.thesis.trim().length > 0 ? snapshot.thesis : '（未填写判断原文）'}
        </div>
        <Text style={{ color: THEME.textSecondary, fontSize: 12 }}>
          快照时间 {formatSnapshotDate(snapshot.createdAt)}（{outcome.ageDays.toFixed(1)} 天前） · 当时价格{' '}
          {snapshot.priceAtSnapshot != null ? `¥${snapshot.priceAtSnapshot.toFixed(2)}` : '快照数据不完整'}
        </Text>
      </Field>

      {/* 2. 实际发生 */}
      <Field label="② 实际发生">
        {outcome.stockChangePct != null ? (
          <Text style={{ color: pctColor(outcome.stockChangePct), fontWeight: 600 }}>
            个股区间涨跌幅 {pctText(outcome.stockChangePct)}
          </Text>
        ) : (
          <Text style={{ color: THEME.textSecondary }}>
            {outcome.verdict === 'pending' ? '记录未满最短回看期，暂不计算' : UNAVAILABLE}
          </Text>
        )}
      </Field>

      {/* 3. 超额收益 */}
      <Field label="③ 超额收益（个股 − 基准）">
        {outcome.excessReturnPct != null ? (
          <Text style={{ color: pctColor(outcome.excessReturnPct), fontWeight: 600 }}>
            {pctText(outcome.excessReturnPct)}
            {snapshot.benchmark ? `（基准：${snapshot.benchmark.name}）` : ''}
          </Text>
        ) : (
          <Text style={{ color: THEME.textSecondary }}>
            {UNAVAILABLE}
            {snapshot.benchmark ? `（基准：${snapshot.benchmark.name}）` : '（快照未记录基准）'}
          </Text>
        )}
      </Field>

      {/* 4. 是否兑现 */}
      <Field label="④ 是否兑现">
        <Text style={{ color: meta.color, fontWeight: 600, marginRight: 8 }}>{meta.label}</Text>
        <Text style={{ color: THEME.textSecondary, fontSize: 12 }}>{outcome.reason}</Text>
      </Field>
    </Card>
  );
};

export default LookbackCard;
