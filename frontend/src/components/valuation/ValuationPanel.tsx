/**
 * 估值分析面板
 *
 * 数据来源：Worker GET /api/valuation/:symbol（真实源拼装，见 clair-worker/worker.js handleValuation）：
 *   腾讯实时行情（价格/PE/PB/总市值）+ 东财年报指标（EPS/BPS/ROE/成长）
 *   + 东财 F10 现金流量表/资产负债表（自由现金流/有息负债）+ 新浪近 1023 根收盘价。
 *
 * 诚实红线：
 *   · 接口没给的字段一律渲染「—」，不用 0、不按股价×股本倒算、不套行业均值猜公允价值；
 *   · 历史分位是「逐日只用当日已披露的最近年报 EPS/BPS」的近似分位（非 TTM 口径），
 *     页面原样披露口径，不写成「真实 PE 历史分位」；
 *   · DCF 只在真实自由现金流>0 且股本/有息负债齐全时计算，缺失就说明为什么没有目标价。
 */

import React, { useEffect, useState } from 'react';
import { Card, Typography, Tag, Empty, Skeleton, Row, Col, Tooltip } from 'antd';
import { FundOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { THEME } from '../../styles/theme-constants';
import { dcfValuation } from '../../utils/valuationModel';

const { Text } = Typography;
const TEXT_PRIMARY = THEME.text;
const TEXT_SECONDARY = THEME.textSec;
const BORDER = THEME.border;
const ACCENT = '#2962FF';
const MISSING = '—';

/** Worker /api/valuation/:symbol 的 data 契约（字段可为 null，缺失即空态） */
export interface ValuationApiData {
  symbol: string;
  name: string | null;
  industry: string | null;
  asOf: string | null;
  price: number | null;
  marketCap: number | null;
  marketCapUnit: 'yuan' | null;
  pe: number | null;
  pb: number | null;
  peg: number | null;
  pePercentile3y: number | null;
  pbPercentile3y: number | null;
  pePercentileSampleCount: number | null;
  pbPercentileSampleCount: number | null;
  eps: number | null;
  bps: number | null;
  roe: number | null;
  profitGrowth: number | null;
  revenueGrowth: number | null;
  reportDate: string | null;
  dcfInput: {
    freeCashFlow: number;
    growthRate: number;
    terminalGrowthRate: number;
    discountRate: number;
    projectionYears: number;
    shares: number;
    netDebt: number;
  } | null;
  dcfNote: string | null;
  notes: string[];
  dataSource: string | null;
}

export interface ValuationApiResponse {
  success?: boolean;
  dataSource?: string;
  data?: ValuationApiData;
  message?: string;
  error?: string;
}

function fmt(v: number | null | undefined, digits = 2, suffix = ''): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : MISSING;
}

/** 总市值（元）→ 万亿/亿 可读串；缺失返回「—」 */
export function formatValuationMarketCap(yuan: number | null | undefined): string {
  if (typeof yuan !== 'number' || !Number.isFinite(yuan) || yuan <= 0) return MISSING;
  if (yuan >= 1e12) return `${(yuan / 1e12).toFixed(2)}万亿`;
  if (yuan >= 1e8) return `${(yuan / 1e8).toFixed(2)}亿`;
  return `${yuan.toFixed(0)}元`;
}

/** 分位高=相对历史更贵。只做区间描述，不据此给买卖建议。 */
function percentileLabel(p: number | null): { text: string; color: string } | null {
  if (p === null || !Number.isFinite(p)) return null;
  if (p >= 80) return { text: '历史偏高', color: 'var(--color-up)' };
  if (p <= 20) return { text: '历史偏低', color: 'var(--color-down)' };
  return { text: '历史中位', color: TEXT_SECONDARY };
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>
        {label}
        {hint && (
          <Tooltip title={hint}>
            <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 11 }} />
          </Tooltip>
        )}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, fontFamily: '"DIN Alternate",monospace' }}>{value}</div>
    </div>
  );
}

const ValuationPanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [data, setData] = useState<ValuationApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;
    setLoading(true);
    setError(null);
    setUnavailableReason(null);
    setData(null);

    (async () => {
      try {
        const resp = await fetch(`/api/valuation/${encodeURIComponent(symbol)}`, { signal: ac.signal });
        if (resp.status === 404) throw new Error('估值接口未部署（HTTP 404）');
        if (!resp.ok) throw new Error(`估值接口不可用（HTTP ${resp.status}）`);
        const payload = (await resp.json()) as ValuationApiResponse;
        if (!alive) return;
        if (payload.success === false) throw new Error(payload.message || payload.error || '估值接口返回 success=false');
        if (!payload.data) throw new Error('估值接口未返回 data');
        if (payload.dataSource === 'unavailable') {
          setUnavailableReason((payload.data.notes && payload.data.notes[0]) || payload.message || '上游未返回该标的估值所需数据');
          return;
        }
        setData(payload.data);
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [symbol]);

  const sourceTag = data
    ? (data.dataSource === 'real'
      ? <Tag color="green" style={{ fontSize: 10, borderRadius: 4, marginLeft: 8 }}>真实计算</Tag>
      : <Tag color="orange" style={{ fontSize: 10, borderRadius: 4, marginLeft: 8 }}>部分真实（年报指标缺失）</Tag>)
    : null;

  let body: React.ReactNode;
  if (loading) {
    body = <Skeleton active paragraph={{ rows: 4 }} title={false} />;
  } else if (error) {
    body = <Empty description={`估值数据不可用：${error}`} style={{ padding: '16px 0' }} />;
  } else if (unavailableReason) {
    body = <Empty description={unavailableReason} style={{ padding: '16px 0' }} />;
  } else if (!data) {
    body = <Empty description="估值接口未返回数据" style={{ padding: '16px 0' }} />;
  } else {
    const peTag = percentileLabel(data.pePercentile3y);
    const pbTag = percentileLabel(data.pbPercentile3y);
    let dcf: { intrinsic: number; upside: number; low: number; high: number; confidence: string; growth: number; discount: number; terminal: number; years: number } | string;
    if (data.dcfInput && data.price && data.price > 0) {
      const r = dcfValuation({
        freeCashFlow: data.dcfInput.freeCashFlow,
        growthRate: data.dcfInput.growthRate,
        terminalGrowthRate: data.dcfInput.terminalGrowthRate,
        discountRate: data.dcfInput.discountRate,
        projectionYears: data.dcfInput.projectionYears,
        shares: data.dcfInput.shares,
        netDebt: data.dcfInput.netDebt,
      });
      dcf = {
        intrinsic: r.intrinsicValue,
        upside: Math.round(((r.intrinsicValue - data.price) / data.price) * 10000) / 100,
        low: r.fairValueRange.low,
        high: r.fairValueRange.high,
        confidence: r.confidence,
        growth: data.dcfInput.growthRate * 100,
        discount: data.dcfInput.discountRate * 100,
        terminal: data.dcfInput.terminalGrowthRate * 100,
        years: data.dcfInput.projectionYears,
      };
    } else {
      dcf = data.dcfNote || 'DCF 输入不完整，未计算目标价（不用假设值顶替）。';
    }

    body = (
      <div>
        <Row gutter={16}>
          <Col xs={12} sm={6}><StatCell label="PE（动）" value={fmt(data.pe)} /></Col>
          <Col xs={12} sm={6}><StatCell label="PB" value={fmt(data.pb)} /></Col>
          <Col xs={12} sm={6}><StatCell label="PEG" value={fmt(data.peg)} hint="PE ÷ 净利同比增速（%）；增速≤0 时 PEG 不适用，显示「—」" /></Col>
          <Col xs={12} sm={6}><StatCell label="总市值" value={formatValuationMarketCap(data.marketCap)} /></Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 4 }}>
          <Col xs={12} sm={6}>
            <StatCell
              label="PE 三年分位"
              value={fmt(data.pePercentile3y, 1, '%')}
              hint={`逐日使用当日已披露的最近年报 EPS（报告期次年 4 月底生效），近 3 年收盘价的年报口径近似分位，样本 ${data.pePercentileSampleCount ?? MISSING} 个交易日`}
            />
            {peTag && <Tag style={{ fontSize: 10, color: peTag.color, background: 'transparent', borderColor: peTag.color }}>{peTag.text}</Tag>}
          </Col>
          <Col xs={12} sm={6}>
            <StatCell
              label="PB 三年分位"
              value={fmt(data.pbPercentile3y, 1, '%')}
              hint={`逐日使用当日已披露的最近年报 BPS（报告期次年 4 月底生效），近 3 年收盘价的年报口径近似分位，样本 ${data.pbPercentileSampleCount ?? MISSING} 个交易日`}
            />
            {pbTag && <Tag style={{ fontSize: 10, color: pbTag.color, background: 'transparent', borderColor: pbTag.color }}>{pbTag.text}</Tag>}
          </Col>
          <Col xs={12} sm={6}><StatCell label="EPS / BPS（最新年报）" value={`${fmt(data.eps)} / ${fmt(data.bps)}`} hint={data.reportDate ? `报告期 ${data.reportDate}` : '年报指标缺失'} /></Col>
          <Col xs={12} sm={6}><StatCell label="ROE / 净利同比" value={`${fmt(data.roe, 1, '%')} / ${fmt(data.profitGrowth, 1, '%')}`} /></Col>
        </Row>

        <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 6 }}>
            DCF 折现现金流
            {typeof dcf === 'object' && (
              <Tag style={{ fontSize: 10, marginLeft: 8 }} color={dcf.confidence === 'high' ? 'green' : 'default'}>
                置信度 {dcf.confidence}
              </Tag>
            )}
          </div>
          {typeof dcf === 'string' ? (
            <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>{dcf}</Text>
          ) : (
            <>
              <Row gutter={16}>
                <Col xs={8}><StatCell label="内在价值（每股）" value={`${dcf.intrinsic.toFixed(2)} 元`} /></Col>
                <Col xs={8}><StatCell label="相对现价" value={`${dcf.upside >= 0 ? '+' : ''}${dcf.upside.toFixed(2)}%`} /></Col>
                <Col xs={8}><StatCell label="敏感性区间" value={`${dcf.low.toFixed(2)} ~ ${dcf.high.toFixed(2)} 元`} /></Col>
              </Row>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 4 }}>
                假设：营收/现金流增速 {dcf.growth.toFixed(2)}%、永续 {dcf.terminal.toFixed(1)}%、折现率 {dcf.discount.toFixed(1)}%、预测 {dcf.years} 年；
                区间为内在价值 ±30%。模型输出是假设的函数，不是价格预测。
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 8, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.7 }}>
          {data.asOf && <span>行情日期 {data.asOf}；</span>}
          {data.reportDate && <span>财务报告期 {data.reportDate}；</span>}
          {data.notes.map((n, i) => <div key={i}>· {n}</div>)}
        </div>
      </div>
    );
  }

  return (
    <Card
      size="small"
      title={
        <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>
          <FundOutlined style={{ color: ACCENT, marginRight: 6 }} />
          估值分析
          {sourceTag}
        </span>
      }
      style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
    >
      {body}
    </Card>
  );
};

export default ValuationPanel;
