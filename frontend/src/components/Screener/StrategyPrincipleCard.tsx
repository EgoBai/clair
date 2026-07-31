/**
 * 策略原理卡（对标芝士财富「策略原理 + 排雷提示」）
 *
 * 设计约束：卡片内所有文案均由 ScreenerPage 中**真实执行的筛选条件**推导，
 * 不写死任何"原理文案"。
 * - 「筛选逻辑」直接渲染 StrategyCondition.expr —— 该表达式与 filter 实际执行的
 *   判定同源（filter 由 conditions 组合而成，见 ScreenerPage 的 buildFilter）。
 * - 「排雷提示」由 conditions 触及的字段集合推导，每条都对应一个代码事实，
 *   例如 `pe > 0` 会真实过滤掉 PE 缺失/为负的标的。
 */

import React from 'react';
import { Card, Tag, Tooltip } from 'antd';
import { WarningOutlined, FunctionOutlined } from '@ant-design/icons';
import { THEME } from '../../styles/theme-constants';

const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const BORDER = THEME.border;
const CARD_BG = THEME.cardBg;

/**
 * 单个筛选条件的展示契约 —— label 为人话，expr 为代码中真实执行的判定式。
 * 调用方（ScreenerPage）在此基础上扩展 test 谓词，filter 由 test 组合而成，
 * 保证 expr 与实际执行逻辑不会脱节。
 */
export interface StrategyCondition {
  /** 依赖的 StockData 字段（用于推导排雷提示） */
  field: string;
  /** 人类可读描述 */
  label: string;
  /** 与 test 同源的判定表达式 */
  expr: string;
}

export interface StrategyPrincipleCardProps {
  name: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  /** 策略定义中已有的 explanation 字段 */
  explanation: string;
  /** 真实执行的条件列表（AND 关系） */
  conditions: StrategyCondition[];
  /** 结果来自后端打分接口而非本地条件筛选 */
  apiEndpoint?: string;
  /** 命中数量 / 全市场样本量 */
  matchedCount: number;
  totalCount: number;
}

/**
 * 由真实条件推导排雷提示。每一条都能在代码里找到对应依据，
 * 找不到依据的（如涨跌停、财务造假）一律不编。
 */
function deriveRiskNotes(
  conditions: StrategyCondition[],
  apiEndpoint?: string,
): string[] {
  const notes: string[] = [];
  const fields = new Set(conditions.map((c) => c.field));
  const exprs = conditions.map((c) => c.expr).join(' ');

  if (apiEndpoint) {
    notes.push(
      `结果由后端 ${apiEndpoint} 接口打分返回，评分口径以接口实现为准，本页不做二次校验。`,
    );
  }

  if (fields.has('pe') || fields.has('pb')) {
    notes.push(
      '条件含 PE/PB 且要求为正值，PE/PB 缺失或为负（亏损、净资产为负）的标的会被直接排除，可能漏掉周期底部或困境反转标的。',
    );
  }

  if (fields.has('changePercent') || fields.has('turnoverRate') || fields.has('amplitude')) {
    notes.push(
      '涨跌幅/换手率/振幅取自当日行情快照，为单日数值，未做多日连续性验证，次日可能不再满足条件。',
    );
  }

  if (!fields.has('name')) {
    notes.push(
      '本策略未排除 ST/*ST 及退市风险标的，命中结果需自行核对上市状态。',
    );
  }

  if (/marketCapNum\s*<\s*500000/.test(exprs)) {
    notes.push(
      '限定市值 < 50 亿，小市值标的流动性较弱、波动更大，冲击成本与停牌风险高于大盘股。',
    );
  }

  if (fields.has('industry')) {
    notes.push(
      '行业条件按行业名称包含匹配，行业分类随数据源口径变化，边缘行业可能被误纳或漏筛。',
    );
  }

  notes.push(
    '筛选池为 /api/stocks 返回的行情列表；字段缺失的标的在数值比较中会被判定为不满足条件而被过滤。',
  );

  return notes;
}

export const StrategyPrincipleCard: React.FC<StrategyPrincipleCardProps> = ({
  name,
  description,
  color,
  icon,
  explanation,
  conditions,
  apiEndpoint,
  matchedCount,
  totalCount,
}) => {
  const riskNotes = deriveRiskNotes(conditions, apiEndpoint);
  const hitRate = totalCount > 0 ? (matchedCount / totalCount) * 100 : 0;

  return (
    <Card
      className="strategy-principle-card"
      style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
      styles={{ body: { padding: '16px' } }}
      title={
        <span style={{ color: TEXT, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color, fontSize: 18 }}>{icon}</span>
          <span>{name} — 策略原理</span>
          <Tag color={color} style={{ margin: 0 }}>{description}</Tag>
        </span>
      }
    >
      {/* 命中概况 —— 来自真实筛选结果 */}
      <div style={{ color: TEXT_SEC, fontSize: 12, marginBottom: 12 }}>
        本次命中 <b style={{ color }}>{matchedCount}</b> 只 / 样本池 {totalCount} 只
        （命中率 {hitRate.toFixed(1)}%）
      </div>

      {/* 1. 策略逻辑 —— 取自策略定义的 explanation 字段 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: TEXT, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
          为什么是这些股票
        </div>
        <div style={{ color: TEXT_SEC, fontSize: 13, lineHeight: 1.7 }}>{explanation}</div>
      </div>

      {/* 2. 筛选条件 —— 渲染真实执行的判定式 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: TEXT, fontWeight: 700, fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FunctionOutlined style={{ color }} />
          筛选条件
          <span style={{ color: TEXT_SEC, fontWeight: 400, fontSize: 11 }}>
            （全部满足 / AND）
          </span>
        </div>
        {conditions.length === 0 ? (
          <div style={{ color: TEXT_SEC, fontSize: 12 }}>
            本策略不在前端做条件过滤，结果直接来自后端打分接口。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {conditions.map((c) => (
              <div
                key={c.expr}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '6px 10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 6,
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <span style={{ color: TEXT, fontSize: 12, fontWeight: 600 }}>{c.label}</span>
                <code
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: TEXT_SEC,
                    background: 'transparent',
                    wordBreak: 'break-all',
                  }}
                >
                  {c.expr}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. 排雷提示 —— 全部由上方条件推导 */}
      <div>
        <div style={{ color: TEXT, fontWeight: 700, fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <WarningOutlined style={{ color: 'var(--color-down)' }} />
          排雷提示
          <Tooltip title="以下提示均由本策略实际执行的筛选条件推导，不含主观判断">
            <span style={{ color: TEXT_SEC, fontWeight: 400, fontSize: 11, cursor: 'help' }}>
              （条件推导）
            </span>
          </Tooltip>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: TEXT_SEC, fontSize: 12, lineHeight: 1.8 }}>
          {riskNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 10 }}>
          以上为条件与数据口径说明，不构成投资建议。
        </div>
      </div>
    </Card>
  );
};

export default StrategyPrincipleCard;
