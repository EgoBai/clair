import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StockThesisPanel from '../components/Stock/StockThesisPanel';
import { useThesisStore } from '../store/useThesisStore';

const renderPanel = () => render(
  <MemoryRouter>
    <StockThesisPanel symbol="600519" name="贵州茅台" />
  </MemoryRouter>,
);

describe('我的观点卡', () => {
  beforeEach(() => {
    localStorage.clear();
    useThesisStore.setState({ cards: [] });
  });

  it('未建立时如实空态，保存后显示结论、逻辑与证据链接', async () => {
    renderPanel();
    expect(screen.getByText(/还没有观点卡/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /写观点卡/ }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('看多'));
    fireEvent.change(
      within(dialog).getByPlaceholderText(/高端酒需求稳定/),
      { target: { value: '高端酒需求稳定，直营占比提升带动利润率。' } },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '保存观点' }));

    await waitFor(() => {
      expect(screen.getByText('高端酒需求稳定，直营占比提升带动利润率。')).toBeTruthy();
    });
    expect(screen.getAllByText('看多').length).toBeGreaterThan(0);
    expect(screen.getByText('复盘 1 次')).toBeTruthy();
    expect(screen.getByRole('link', { name: '本页行情与财务数据' }).getAttribute('href')).toBe('/stocks/600519');
    expect(screen.getByRole('link', { name: '该股研报列表' }).getAttribute('href')).toBe('/report-center?symbol=600519');
  });

  it('更新观点会写回复盘记录，不新建第二张卡', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /写观点卡/ }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('观察'));
    fireEvent.change(
      within(dialog).getByPlaceholderText(/高端酒需求稳定/),
      { target: { value: '先观察批价。' } },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '保存观点' }));
    await waitFor(() => expect(screen.getByText('先观察批价。')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /更新观点/ }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(
      within(dialog).getByPlaceholderText(/高端酒需求稳定/),
      { target: { value: '批价企稳，逻辑加强。' } },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '保存观点' }));

    await waitFor(() => expect(screen.getByText('批价企稳，逻辑加强。')).toBeTruthy());
    expect(screen.getByText('复盘 2 次')).toBeTruthy();
    expect(useThesisStore.getState().cards).toHaveLength(1);
    expect(useThesisStore.getState().cards[0].revisions[1].note).toContain('核心逻辑');
  });
});