import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThesisListView from '../components/Research/ThesisListView';
import { useThesisStore, type ThesisCard } from '../store/useThesisStore';

const makeCard = (overrides: Partial<ThesisCard>): ThesisCard => ({
  id: 'thesis_test_1',
  symbol: '600519',
  name: '贵州茅台',
  stance: 'bullish',
  thesis: '高端酒需求稳定。',
  catalysts: '春节动销',
  risks: '批价下行',
  invalidation: '营收转负',
  valuation: { buy: 1200, fair: 1500, sell: 1800 },
  confidence: 'medium',
  evidence: [{ type: 'data', label: '本页行情与财务数据', url: '/stocks/600519' }],
  research: [],
  revisions: [{ at: '2026-11-06T10:00:00.000Z', note: '创建观点卡' }],
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
  ...overrides,
});

const renderList = () => render(
  <MemoryRouter>
    <ThesisListView />
  </MemoryRouter>,
);

describe('观点卡列表', () => {
  beforeEach(() => {
    localStorage.clear();
    useThesisStore.setState({
      cards: [
        makeCard({}),
        makeCard({
          id: 'thesis_test_2',
          symbol: '000002',
          name: '万科A',
          stance: 'watch',
          thesis: '等待销售数据企稳。',
          valuation: { buy: null, fair: null, sell: null },
          evidence: [{ type: 'data', label: '该股公告', url: '/stocks/000002' }],
        }),
      ],
    });
  });

  it('展示全部观点卡并提供个股与证据链接', () => {
    renderList();
    expect(screen.getByText('贵州茅台')).toBeTruthy();
    expect(screen.getByText('万科A')).toBeTruthy();
    expect(screen.getByText('看多')).toBeTruthy();
    expect(screen.getByText('观察')).toBeTruthy();
    expect(screen.getByText('估值 未填写')).toBeTruthy();
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/stocks/600519');
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: '本页行情与财务数据' }).getAttribute('href')).toBe('/stocks/600519');
    // 观点检查区必须渲染；测试环境无行情，结论只能是「待验证」，不能伪造「有效」
    expect(screen.getAllByText(/观点检查/).length).toBe(2);
    expect(screen.getAllByText(/待验证/).length).toBe(2);
    // 375px 下筛选条不能撑破页面，只允许自身横滚
    const filterGroup = screen.getByRole('radiogroup');
    expect(filterGroup.parentElement?.style.overflowX).toBe('auto');
  });

  it('按结论与关键词过滤，不显示不匹配的卡', () => {
    renderList();
    fireEvent.click(screen.getByText('看多 1'));
    expect(screen.getByText('贵州茅台')).toBeTruthy();
    expect(screen.queryByText('万科A')).toBeNull();

    fireEvent.click(screen.getByText('全部 2'));
    const input = screen.getByPlaceholderText('搜索标的、逻辑、风险或证伪条件');
    fireEvent.change(input, { target: { value: '销售数据' } });
    expect(screen.queryByText('贵州茅台')).toBeNull();
    expect(screen.getByText('万科A')).toBeTruthy();
  });

  it('展示研究档案，并可按档案标题或来源检索观点', () => {
    useThesisStore.setState({
      cards: [
        makeCard({
          research: [
            { kind: 'note', id: 'n1', title: '白酒批价跟踪', meta: '学习笔记 · 600519', addedAt: '2026-11-06T10:00:00.000Z' },
            { kind: 'report', id: 'r1', title: 'Q3 点评', meta: '国信证券 · 2026-11-04', url: 'https://example.com/r1', addedAt: '2026-11-06T10:00:00.000Z' },
          ],
        }),
        makeCard({ id: 'thesis_test_2', symbol: '000002', name: '万科A', thesis: '等待销售数据企稳。' }),
      ],
    });
    renderList();
    expect(screen.getAllByText('研究档案').length).toBe(1);
    expect(screen.getByRole('link', { name: '白酒批价跟踪' }).getAttribute('href')).toBe('/knowledge?note=n1');
    expect(screen.getByRole('link', { name: 'Q3 点评' }).getAttribute('href')).toBe('/report-center/r1');

    const input = screen.getByPlaceholderText('搜索标的、逻辑、风险或证伪条件');
    fireEvent.change(input, { target: { value: '国信证券' } });
    expect(screen.getByText('贵州茅台')).toBeTruthy();
    expect(screen.queryByText('万科A')).toBeNull();
  });

  it('空态告诉用户去哪里建立第一张观点卡', () => {
    useThesisStore.setState({ cards: [] });
    renderList();
    expect(screen.getByText('还没有观点卡')).toBeTruthy();
    expect(screen.getByRole('button', { name: /去个股写观点/ })).toBeTruthy();
  });
});