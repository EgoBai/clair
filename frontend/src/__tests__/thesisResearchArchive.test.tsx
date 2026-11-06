import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StockThesisPanel from '../components/Stock/StockThesisPanel';
import { useThesisStore, type ThesisCard } from '../store/useThesisStore';
import { apiService } from '../services/api';

const makeCard = (): ThesisCard => ({
  id: 'thesis_archive_1',
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
});

const seedNote = () => {
  localStorage.setItem('clair_knowledge_base', JSON.stringify([{
    id: 'note_archive_1',
    question: '白酒批价与渠道跟踪',
    answer: '批价企稳，渠道库存回落。',
    category: '学习笔记',
    tags: ['白酒'],
    page: '手动笔记',
    symbol: '600519',
    createdAt: '2026-11-05T02:00:00.000Z',
  }]));
};

const renderPanel = () => render(
  <MemoryRouter>
    <StockThesisPanel symbol="600519" name="贵州茅台" />
  </MemoryRouter>,
);

describe('观点卡研究档案', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    useThesisStore.setState({ cards: [makeCard()] });
    seedNote();
  });

  it('关联笔记：列出真实笔记、写入档案、可回到知识库定位并移除', async () => {
    renderPanel();
    expect(screen.getByText('研究档案')).toBeTruthy();
    expect(screen.getByText('还没有关联笔记或研报。把研究过程沉淀到这里，复盘时不用重新找。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /关联笔记/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('白酒批价与渠道跟踪')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('白酒批价与渠道跟踪'));
    fireEvent.click(await within(dialog).findByRole('button', { name: '关联选中（1）' }));

    await waitFor(() => {
      expect(useThesisStore.getState().cards[0].research).toHaveLength(1);
    });
    const link = await screen.findByRole('link', { name: '白酒批价与渠道跟踪' });
    expect(link.getAttribute('href')).toBe('/knowledge?note=note_archive_1');
    expect(screen.getAllByText('学习笔记 · 600519 · 2026-11-05').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '移除笔记：白酒批价与渠道跟踪' }));
    await waitFor(() => expect(useThesisStore.getState().cards[0].research).toHaveLength(0));
    expect(screen.getByText('还没有关联笔记或研报。把研究过程沉淀到这里，复盘时不用重新找。')).toBeTruthy();
  });

  it('沉淀研报：读取真实接口、保存来源与链接、外链用新窗口打开', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(apiService, 'get').mockResolvedValue({
      success: true,
      data: {
        items: [{
          id: 'report_archive_1',
          title: '2026Q3点评：营收利润均超预期',
          orgName: '国信证券',
          publishDate: '2026-11-04',
          rating: '增持',
          url: 'https://example.com/report/1',
        }],
      },
    });

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /沉淀研报/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('2026Q3点评：营收利润均超预期')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('2026Q3点评：营收利润均超预期'));
    fireEvent.click(await within(dialog).findByRole('button', { name: '沉淀选中（1）' }));

    await waitFor(() => {
      const research = useThesisStore.getState().cards[0].research;
      expect(research).toHaveLength(1);
      expect(research[0]).toMatchObject({
        kind: 'report',
        id: 'report_archive_1',
        title: '2026Q3点评：营收利润均超预期',
        meta: '国信证券 · 2026-11-04',
        url: 'https://example.com/report/1',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '2026Q3点评：营收利润均超预期' }));
    expect(open).toHaveBeenCalledWith('https://example.com/report/1', '_blank', 'noopener,noreferrer');
  });
});
