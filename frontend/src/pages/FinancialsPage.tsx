/**
 * 财务报表可视化页面
 * 资产负债表 / 利润表 / 现金流量表
 * 参考 Wind / Bloomberg 数据展示风格
 */

import React, { useState, useEffect } from 'react';
import logger from '../utils/logger';
import { apiService } from '../services/api';
import { useParams } from 'react-router-dom';
import { Card, Tabs, Table, Row, Col, Statistic, Tag, Spin, Alert, Select } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';

interface BalanceSheet {
  symbol: string;
  period: string;
  totalAssets: number;
  currentAssets: number;
  nonCurrentAssets: number;
  cash: number;
  accountsReceivable: number;
  inventory: number;
  fixedAssets: number;
  totalLiabilities: number;
  currentLiabilities: number;
  totalEquity: number;
  currentRatio: number;
  debtToAssetRatio: number;
}

interface IncomeStatement {
  symbol: string;
  period: string;
  totalRevenue: number;
  operatingCost: number;
  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
  eps: number;
  grossMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
}

interface CashFlow {
  symbol: string;
  period: string;
  netOperatingCashFlow: number;
  netInvestingCashFlow: number;
  netFinancingCashFlow: number;
  netCashFlow: number;
  freeCashFlow: number;
  operatingCashToNetProfit: number;
}

interface FinancialSummary {
  balanceSheet: BalanceSheet;
  incomeStatement: IncomeStatement;
  cashFlow: CashFlow;
  indicators: {
    grossMargin: number;
    netMargin: number;
    roe: number;
    roa: number;
    currentRatio: number;
    debtToAssetRatio: number;
    revenueGrowth: number;
    profitGrowth: number;
  };
}

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2'];

function formatMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) return `${(value / 10000).toFixed(2)}万亿`;
  if (abs >= 1) return `${value.toFixed(2)}亿`;
  return `${(value * 10000).toFixed(0)}万`;
}

export default function FinancialsPage() {
  const { symbol } = useParams<{ symbol?: string }>();
  const targetSymbol = symbol || '600519';
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<BalanceSheet[]>([]);
  const [incomeHistory, setIncomeHistory] = useState<IncomeStatement[]>([]);
  const [cashFlowHistory, setCashFlowHistory] = useState<CashFlow[]>([]);
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => {
    loadData();
  }, [targetSymbol]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, bsRes, isRes, cfRes] = await Promise.all([
        apiService.get<FinancialSummary>('/financials/summary', { symbol: targetSymbol }),
        apiService.get<{ periods: BalanceSheet[] }>('/financials/balance-sheet', { symbol: targetSymbol, periods: 4 }),
        apiService.get<{ periods: IncomeStatement[] }>('/financials/income-statement', { symbol: targetSymbol, periods: 4 }),
        apiService.get<{ periods: CashFlow[] }>('/financials/cash-flow', { symbol: targetSymbol, periods: 4 }),
      ]);

      if (summaryRes.success) setSummary(summaryRes.data);
      if (bsRes.success) setBalanceHistory(bsRes.data.periods);
      if (isRes.success) setIncomeHistory(isRes.data.periods);
      if (cfRes.success) setCashFlowHistory(cfRes.data.periods);
    } catch (error) {
      logger.error('加载财务数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" tip="加载财务数据..." /></div>;
  if (!summary) return <Alert message="无法加载财务数据" type="error" showIcon />;

  const { balanceSheet, incomeStatement, cashFlow, indicators } = summary;

  // 资产构成饼图数据
  const assetComposition = [
    { name: '现金', value: balanceSheet.cash },
    { name: '应收账款', value: balanceSheet.accountsReceivable },
    { name: '存货', value: balanceSheet.inventory },
    { name: '固定资产', value: balanceSheet.fixedAssets },
    { name: '其他', value: balanceSheet.totalAssets - balanceSheet.cash - balanceSheet.accountsReceivable - balanceSheet.inventory - balanceSheet.fixedAssets },
  ];

  // 收入成本结构
  const revenueStructure = [
    { name: '营业成本', value: incomeStatement.operatingCost },
    { name: '毛利润', value: incomeStatement.grossProfit },
  ];

  // 现金流结构
  const cashFlowData = cashFlowHistory.map(cf => ({
    period: cf.period,
    经营现金流: cf.netOperatingCashFlow,
    投资现金流: cf.netInvestingCashFlow,
    筹资现金流: cf.netFinancingCashFlow,
  }));

  // 盈利能力雷达图
  const radarData = [
    { metric: 'ROE', value: indicators.roe, fullMark: 30 },
    { metric: '毛利率', value: indicators.grossMargin, fullMark: 60 },
    { metric: '净利率', value: indicators.netMargin, fullMark: 40 },
    { metric: 'ROA', value: indicators.roa, fullMark: 15 },
    { metric: '收入增长', value: Math.max(0, indicators.revenueGrowth), fullMark: 30 },
    { metric: '利润增长', value: Math.max(0, indicators.profitGrowth), fullMark: 40 },
  ];

  // 资产负债表表格
  const bsColumns = [
    { title: '项目', dataIndex: 'label', key: 'label', width: 180 },
    ...balanceHistory.map(bs => ({
      title: bs.period,
      dataIndex: bs.period,
      key: bs.period,
      align: 'right' as const,
      render: (v: number) => v !== null ? formatMoney(v) : '-',
    })),
  ];

  const bsTableData = [
    { label: '总资产', ...Object.fromEntries(balanceHistory.map(bs => [bs.period, bs.totalAssets])) },
    { label: '流动资产', ...Object.fromEntries(balanceHistory.map(bs => [bs.period, bs.currentAssets])) },
    { label: '货币资金', ...Object.fromEntries(balanceHistory.map(bs => [bs.period, bs.cash])) },
    { label: '应收账款', ...Object.fromEntries(balanceHistory.map(bs => [bs.period, bs.accountsReceivable])) },
    { label: '存货', ...Object.fromEntries(balanceHistory.map(bs => [bs.period, bs.inventory])) },
    { label: '固定资产', ...Object.fromEntries(balanceHistory.map(bs => [bs.period, bs.fixedAssets])) },
    { label: '总负债', ...Object.fromEntries(balanceHistory.map(bs => [bs.period, bs.totalLiabilities])) },
    { label: '流动负债', ...Object.fromEntries(balanceHistory.map(bs => [bs.period, bs.currentLiabilities])) },
    { label: '股东权益', ...Object.fromEntries(balanceHistory.map(bs => [bs.period, bs.totalEquity])) },
  ].map((item, i) => ({ ...item, key: i }));

  // 利润表表格
  const incomeColumns = [
    { title: '项目', dataIndex: 'label', key: 'label', width: 180 },
    ...incomeHistory.map(is => ({
      title: is.period,
      dataIndex: is.period,
      key: is.period,
      align: 'right' as const,
      render: (v: number) => v !== null ? formatMoney(v) : '-',
    })),
  ];

  const incomeTableData = [
    { label: '营业收入', ...Object.fromEntries(incomeHistory.map(is => [is.period, is.totalRevenue])) },
    { label: '营业成本', ...Object.fromEntries(incomeHistory.map(is => [is.period, is.operatingCost])) },
    { label: '毛利润', ...Object.fromEntries(incomeHistory.map(is => [is.period, is.grossProfit])) },
    { label: '营业利润', ...Object.fromEntries(incomeHistory.map(is => [is.period, is.operatingProfit])) },
    { label: '净利润', ...Object.fromEntries(incomeHistory.map(is => [is.period, is.netProfit])) },
    { label: '每股收益(EPS)', ...Object.fromEntries(incomeHistory.map(is => [is.period, is.eps])) },
  ].map((item, i) => ({ ...item, key: i }));

  const tabItems = [
    {
      key: 'summary',
      label: '财务摘要',
      children: (
        <>
          {/* 核心指标卡片 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8} md={6}>
              <Card size="small">
                <Statistic title="ROE" value={indicators.roe} precision={2} suffix="%" valueStyle={{ color: indicators.roe > 10 ? '#52c41a' : '#ff4d4f' }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small">
                <Statistic title="毛利率" value={indicators.grossMargin} precision={2} suffix="%" valueStyle={{ color: indicators.grossMargin > 30 ? '#52c41a' : '#faad14' }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small">
                <Statistic title="净利率" value={indicators.netMargin} precision={2} suffix="%" />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small">
                <Statistic title="资产负债率" value={indicators.debtToAssetRatio} precision={2} suffix="%" valueStyle={{ color: indicators.debtToAssetRatio > 60 ? '#ff4d4f' : '#52c41a' }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small">
                <Statistic title="营收增长" value={indicators.revenueGrowth} precision={2} suffix="%" prefix={indicators.revenueGrowth > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} valueStyle={{ color: indicators.revenueGrowth > 0 ? '#52c41a' : '#ff4d4f' }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small">
                <Statistic title="利润增长" value={indicators.profitGrowth} precision={2} suffix="%" prefix={indicators.profitGrowth > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} valueStyle={{ color: indicators.profitGrowth > 0 ? '#52c41a' : '#ff4d4f' }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small">
                <Statistic title="流动比率" value={indicators.currentRatio} precision={2} suffix="倍" />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small">
                <Statistic title="ROA" value={indicators.roa} precision={2} suffix="%" />
              </Card>
            </Col>
          </Row>

          {/* 图表区 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="盈利能力雷达图" size="small">
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                    <PolarRadiusAxis />
                    <Radar name="指标" dataKey="value" stroke="#1890ff" fill="#1890ff" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="资产构成" size="small">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={assetComposition} cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: { name?: string; percent?: number }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {assetComposition.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    {
      key: 'balance',
      label: '资产负债表',
      children: (
        <>
          <Table columns={bsColumns} dataSource={bsTableData} pagination={false} size="small" bordered style={{ marginBottom: 24 }} />
          <Card title="主要资产趋势" size="small">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[...balanceHistory].reverse()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={v => formatMoney(v)} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend />
                <Bar dataKey="totalAssets" name="总资产" fill="#1890ff" />
                <Bar dataKey="totalLiabilities" name="总负债" fill="#ff4d4f" />
                <Bar dataKey="totalEquity" name="股东权益" fill="#52c41a" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      ),
    },
    {
      key: 'income',
      label: '利润表',
      children: (
        <>
          <Table columns={incomeColumns} dataSource={incomeTableData} pagination={false} size="small" bordered style={{ marginBottom: 24 }} />
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Card title="收入与利润趋势" size="small">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[...incomeHistory].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis tickFormatter={v => formatMoney(v)} />
                    <Tooltip formatter={(value) => formatMoney(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="totalRevenue" name="营业收入" stroke="#1890ff" strokeWidth={2} />
                    <Line type="monotone" dataKey="netProfit" name="净利润" stroke="#52c41a" strokeWidth={2} />
                    <Line type="monotone" dataKey="grossProfit" name="毛利润" stroke="#faad14" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="利润率趋势" size="small">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[...incomeHistory].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v) => `${v ?? 0}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="grossMargin" name="毛利率" stroke="#1890ff" strokeWidth={2} />
                    <Line type="monotone" dataKey="netMargin" name="净利率" stroke="#52c41a" strokeWidth={2} />
                    <Line type="monotone" dataKey="roe" name="ROE" stroke="#722ed1" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    {
      key: 'cashflow',
      label: '现金流量表',
      children: (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={8}>
              <Card size="small">
                <Statistic title="经营现金流" value={cashFlow.netOperatingCashFlow} precision={2} suffix="亿" valueStyle={{ color: cashFlow.netOperatingCashFlow > 0 ? '#52c41a' : '#ff4d4f' }} />
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small">
                <Statistic title="投资现金流" value={cashFlow.netInvestingCashFlow} precision={2} suffix="亿" />
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small">
                <Statistic title="筹资现金流" value={cashFlow.netFinancingCashFlow} precision={2} suffix="亿" />
              </Card>
            </Col>
          </Row>
          <Card title="现金流趋势" size="small">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={v => formatMoney(v)} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend />
                <Bar dataKey="经营现金流" fill="#1890ff" />
                <Bar dataKey="投资现金流" fill="#faad14" />
                <Bar dataKey="筹资现金流" fill="#ff4d4f" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>📊 财务报表 - {targetSymbol}</h2>
        <Tag color="blue">最近更新: {new Date().toLocaleDateString('zh-CN')}</Tag>
      </Row>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
}
