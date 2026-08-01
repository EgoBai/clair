/**
 * ETF 中心页
 * 概览统计 / ETF 列表（类型筛选+排序）/ 折溢价套利机会 / 选中 ETF 分析卡
 * 数据依赖后端 /api/etf 接口；接口未接入时如实显示空态，不使用伪造演示数据。
 */

import { useMemo, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Select, Space } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined } from '@ant-design/icons';
import { THEME, GOLD } from '../styles/theme-constants';
import logger from '../utils/logger';
import { type ETFData } from '../utils/etfDemo';
import {
  analyzeETF,
  detectArbitrageOpportunities,
  type ETFAnalysis,
  type ArbitrageOpportunity,
} from '../utils/etfAnalysisEngine';
import {
  analyzePremiumDiscount,
  type PremiumDiscountResult,
} from '../utils/etfPremiumDiscountEngine';

const { Title, Text } = Typography;
const { Option } = Select;

/** 涨/正=红，跌/负=绿（中国习惯）；折溢价：溢价(正)=红，折价(负)=绿 */
const flowColor = (v: number): string => (v >= 0 ? THEME.up : THEME.down);
const signArrow = (v: number) =>
  v >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />;
const round2 = (x: number): number => Number(x.toFixed(2));
const formatAmount = (val: number): string => {
  if (val >= 1e8) return (val / 1e8).toFixed(1) + '亿';
  if (val >= 1e4) return (val / 1e4).toFixed(0) + '万';
  return val.toFixed(0);
};

const typeLabels: Record<string, { label: string; color: string }> = {
  index: { label: '指数型', color: 'blue' },
  sector: { label: '行业型', color: 'orange' },
  qdii: { label: 'QDII', color: 'purple' },
  commodity: { label: '商品型', color: 'gold' },
  bond: { label: '债券型', color: 'green' },
  theme: { label: '主题型', color: 'cyan' },
};

/** 页面 ETFData → 分析引擎 ETFData（适配字段语义） */
function toAnalysisETF(e: ETFData) {
  return {
    ticker: e.symbol,
    name: e.name,
    nav: e.nav,
    price: round2(e.nav * (1 + e.premiumRate / 100)),
    premium: e.premiumRate,
    trackingError: e.trackingError,
    volume: e.volume,
    turnover: e.turnover,
    aum: e.totalAssets,
    aumChange: 0,
    expenseRatio: e.expenseRatio,
    sector: e.type,
    holdings: [],
  };
}

/** 页面 ETFData → 折溢价引擎 ETFData */
function toPremiumETF(e: ETFData) {
  const shares = e.nav > 0 ? Math.round(e.totalAssets / e.nav) : 1;
  return {
    symbol: e.symbol,
    name: e.name,
    nav: e.nav,
    marketPrice: round2(e.nav * (1 + e.premiumRate / 100)),
    totalAssets: e.totalAssets,
    shares,
    trackingError: e.trackingError,
    expenseRatio: e.expenseRatio,
    dividendYield: e.dividendYield,
    volume: e.volume,
    creationRedemptionUnit: 1e6,
    underlying: e.benchmark,
  };
}

// ETF 后端数据接口（/api/etf）尚未实现；以空数据呈现，杜绝伪造演示数据
const etfList: ETFData[] = [];

export default function ETFPage() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedSymbol, setSelectedSymbol] = useState<string>(etfList[0]?.symbol ?? '');

  // ── 引擎封装（全部 try/catch 降级，绝不让页面崩溃） ──
  const analysisData = useMemo(() => etfList.map(toAnalysisETF), []);

  const arbitrageList: ArbitrageOpportunity[] = useMemo(() => {
    try {
      return detectArbitrageOpportunities(analysisData);
    } catch (e) {
      logger.error('[ETF] detectArbitrageOpportunities failed', e);
      return [];
    }
  }, [analysisData]);

  const selected = etfList.find((e) => e.symbol === selectedSymbol) ?? etfList[0];
  const selectedAnalysis: ETFAnalysis | null = useMemo(() => {
    if (!selected) return null;
    try {
      return analyzeETF(toAnalysisETF(selected));
    } catch (e) {
      logger.error('[ETF] analyzeETF failed', e);
      return null;
    }
  }, [selected]);

  const selectedPremium: PremiumDiscountResult | null = useMemo(() => {
    if (!selected) return null;
    try {
      return analyzePremiumDiscount(toPremiumETF(selected));
    } catch (e) {
      logger.error('[ETF] analyzePremiumDiscount failed', e);
      return null;
    }
  }, [selected]);

  // ── ① 概览统计 ──
  const totalAssets = etfList.reduce((s, e) => s + e.totalAssets, 0);
  const avgChange =
    etfList.length > 0 ? etfList.reduce((s, e) => s + e.changePercent, 0) / etfList.length : 0;
  const risingCount = etfList.filter((e) => e.changePercent > 0).length;
  const fallingCount = etfList.filter((e) => e.changePercent < 0).length;

  const filteredList = typeFilter === 'all' ? etfList : etfList.filter((e) => e.type === typeFilter);

  // ── ② ETF 列表列 ──
  const columns = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 80,
      render: (val: string) => <Text strong style={{ color: THEME.text }}>{val}</Text>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 120,
      render: (val: string, record: ETFData) => (
        <Space>
          <Text strong style={{ color: THEME.text }}>{val}</Text>
          <Tag color={typeLabels[record.type]?.color}>{typeLabels[record.type]?.label}</Tag>
        </Space>
      ),
    },
    {
      title: '最新净值',
      dataIndex: 'nav',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.nav - b.nav,
      render: (val: number) => <Text style={{ color: THEME.text }}>{val.toFixed(4)}</Text>,
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.changePercent - b.changePercent,
      render: (val: number) => (
        <Text style={{ color: flowColor(val) }}>
          {signArrow(val)} {val >= 0 ? '+' : ''}{val.toFixed(2)}%
        </Text>
      ),
    },
    {
      title: '折溢价率',
      dataIndex: 'premiumRate',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.premiumRate - b.premiumRate,
      render: (val: number) => (
        <Text style={{ color: flowColor(val) }}>
          {val >= 0 ? '+' : ''}{val.toFixed(2)}%
        </Text>
      ),
    },
    {
      title: '规模(亿)',
      dataIndex: 'totalAssets',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.totalAssets - b.totalAssets,
      render: (val: number) => <Text style={{ color: THEME.text }}>{(val / 1e8).toFixed(0)}</Text>,
    },
    {
      title: '成交额',
      dataIndex: 'turnover',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.turnover - b.turnover,
      render: (val: number) => <Text style={{ color: THEME.textSec }}>{formatAmount(val)}</Text>,
    },
    {
      title: '股息率',
      dataIndex: 'dividendYield',
      width: 80,
      render: (val: number) => <Text style={{ color: THEME.textSec }}>{val > 0 ? `${val}%` : '-'}</Text>,
    },
    {
      title: '管理费',
      dataIndex: 'expenseRatio',
      width: 80,
      render: (val: number) => <Text style={{ color: THEME.textSec }}>{val}%</Text>,
    },
    {
      title: '跟踪误差',
      dataIndex: 'trackingError',
      width: 90,
      render: (val: number) => (
        <Text type={val > 0.5 ? 'danger' : undefined} style={val <= 0.5 ? { color: THEME.textSec } : undefined}>
          {val}%
        </Text>
      ),
    },
  ];

  const arbRiskColor = (r: ArbitrageOpportunity['risk']) =>
    r === 'high' ? THEME.up : r === 'medium' ? GOLD : THEME.down;

  return (
    <div style={{ background: THEME.bg, padding: 24, minHeight: '100vh' }}>
      <Title level={3} style={{ color: THEME.text, marginBottom: 4 }}>
        ETF 中心
      </Title>
      <Space style={{ marginBottom: 16 }}>
        <Text style={{ color: THEME.textSec }}>
          指数 / 行业 / QDII / 商品 / 债券 / 主题 · 后端数据尚未接入
        </Text>
      </Space>

      {/* ① 概览统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic title={<span style={{ color: THEME.textSec }}>ETF 总数</span>} value={etfList.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>总规模</span>}
              value={(totalAssets / 1e8).toFixed(0)}
              suffix="亿"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>平均涨跌</span>}
              value={avgChange}
              precision={2}
              suffix="%"
              valueStyle={{ color: flowColor(avgChange) }}
              prefix={avgChange >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>涨 / 跌</span>}
              value={risingCount}
              valueStyle={{ color: THEME.up }}
              suffix={<Text style={{ fontSize: 14 }}> / <Text style={{ color: THEME.down }}>{fallingCount}</Text></Text>}
            />
          </Card>
        </Col>
      </Row>

      {/* ② ETF 列表 */}
      <Card
        title={<span style={{ color: THEME.text }}>ETF 基金列表</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginBottom: 16 }}
        extra={
          <Select value={typeFilter} onChange={setTypeFilter} style={{ width: 120 }} size="small">
            <Option value="all">全部类型</Option>
            <Option value="index">指数型</Option>
            <Option value="sector">行业型</Option>
            <Option value="qdii">QDII</Option>
            <Option value="commodity">商品型</Option>
            <Option value="bond">债券型</Option>
            <Option value="theme">主题型</Option>
          </Select>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredList}
          rowKey="symbol"
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1000 }}
          onRow={(record) => ({
            onClick: () => setSelectedSymbol(record.symbol),
            style: { cursor: 'pointer', background: record.symbol === selectedSymbol ? THEME.surface : undefined },
          })}
        />
        <Text style={{ color: THEME.textSec, fontSize: 12 }}>
          点击任意行可加载下方「选中 ETF 分析卡」（调用 etfAnalysisEngine.analyzeETF）。
        </Text>
      </Card>

      {/* ③ 折溢价套利机会面板（detectArbitrageOpportunities） */}
      <Card
        title={<span style={{ color: THEME.text }}>折溢价套利机会（|溢价率| &gt; 1%）</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginBottom: 16 }}
      >
        {arbitrageList.length === 0 ? (
          <Text style={{ color: THEME.textSec }}>当前数据中无显著折溢价套利机会。</Text>
        ) : (
          <Row gutter={[16, 16]}>
            {arbitrageList.map((o) => (
              <Col xs={24} md={12} key={o.ticker}>
                <div
                  style={{
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    background: o.type === '溢价套利' ? 'rgba(244,63,94,0.10)' : 'rgba(34,197,94,0.10)',
                  }}
                >
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Text strong style={{ color: THEME.text }}>{o.ticker} {o.name}</Text>
                    <Tag color="default" style={{ color: o.type === '溢价套利' ? THEME.up : THEME.down, borderColor: o.type === '溢价套利' ? THEME.up : THEME.down }}>
                      {o.type}
                    </Tag>
                  </Space>
                  <div style={{ margin: '8px 0 4px', color: THEME.textSec, fontSize: 12 }}>
                    利差 {o.spread.toFixed(2)}% · 预估收益 {o.estimatedProfit.toFixed(2)}% · 风险
                    <Text style={{ color: arbRiskColor(o.risk), marginLeft: 4 }}>{o.risk}</Text>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      {/* ④ 选中 ETF 分析卡（analyzeETF + analyzePremiumDiscount） */}
      <Card
        title={
          <span style={{ color: THEME.text }}>
            选中 ETF 分析卡：{selected?.name}（{selected?.symbol}）
          </span>
        }
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border }}
      >
        {selectedAnalysis ? (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Space direction="vertical" size={8}>
                <Tag color="default" style={{ color: THEME.accent, borderColor: THEME.accent }}>
                  综合评分 {selectedAnalysis.overallScore}
                </Tag>
                <div style={{ color: THEME.text }}>
                  估值：
                  <Text style={{ color: selectedAnalysis.valuation === 'premium' ? THEME.up : selectedAnalysis.valuation === 'discount' ? THEME.down : THEME.textSec }}>
                    {selectedAnalysis.valuation === 'premium' ? '溢价' : selectedAnalysis.valuation === 'discount' ? '折价' : '平价'}
                  </Text>
                </div>
                <div style={{ color: THEME.text }}>
                  建议：
                  <Text style={{ color: selectedAnalysis.recommendation === 'buy' ? THEME.up : selectedAnalysis.recommendation === 'avoid' ? THEME.down : THEME.textSec, marginLeft: 4 }}>
                    {selectedAnalysis.recommendation === 'buy' ? '买入' : selectedAnalysis.recommendation === 'hold' ? '持有' : '回避'}
                  </Text>
                </div>
              </Space>
            </Col>
            <Col xs={24} md={8}>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Text style={{ color: THEME.textSec }}>流动性评分 {selectedAnalysis.liquidityScore}</Text>
                <Text style={{ color: THEME.textSec }}>效率评分 {selectedAnalysis.efficiencyScore}</Text>
                {selectedPremium && (
                  <>
                    <Text style={{ color: THEME.textSec }}>折溢价引擎·流动性 {selectedPremium.liquidityScore}</Text>
                    <Text style={{ color: THEME.textSec }}>折溢价引擎·跟踪效率 {selectedPremium.trackingEfficiency}</Text>
                  </>
                )}
              </Space>
            </Col>
            <Col xs={24} md={8}>
              <Text style={{ color: THEME.textSec }}>分析理由</Text>
              <ul style={{ color: THEME.text, paddingLeft: 18, margin: '4px 0' }}>
                {selectedAnalysis.reasons.map((r, i) => (
                  <li key={i} style={{ fontSize: 13 }}>{r}</li>
                ))}
              </ul>
            </Col>
          </Row>
        ) : (
          <Text style={{ color: THEME.textSec }}>暂无 ETF 数据，无法分析。</Text>
        )}
      </Card>
    </div>
  );
}
