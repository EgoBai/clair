// @vitest-environment jsdom
/**
 * 研报正文详情页：真实正文直出；404 与 unavailable 必须如实说明，
 * 不允许用标题/摘要拼正文，也不允许缺字段补 0。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReportDetailPage from '../pages/ReportDetailPage';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const detail = {
  id: 'AP202611041831416424',
  title: '2026Q3收入同比增长3%，以销定产、全面向C持续推进',
  stockCode: '600519',
  stockName: '贵州茅台',
  orgName: '国信证券',
  authors: ['张向伟', '王新雨'],
  publishDate: '2026-11-04',
  industryName: '白酒Ⅱ',
  paragraphs: ['第一段正文：收入与利润均实现增长。', '第二段正文：风险提示。'],
  paragraphCount: 2,
  pages: 6,
  pdfUrl: 'https://pdf.dfcfw.com/pdf/H3_AP202611041831416424_1.pdf',
  sourceUrl: 'https://data.eastmoney.com/report/zw_stock.jshtml?infocode=AP202611041831416424',
  fetchedAt: '2026-11-07T00:00:00.000Z',
};

const renderPage = (code = 'AP202611041831416424') => render(
  <MemoryRouter initialEntries={[`/report-center/${code}`]}>
    <Routes>
      <Route path="/report-center/:reportId" element={<ReportDetailPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('研报正文详情页', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('真实正文：标题/作者/正文/PDF/来源直出，查看个股链接正确', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetchMock = vi.fn(async () => jsonResponse({ success: true, dataSource: 'real', data: detail }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByText(detail.title)).toBeTruthy();
    expect(document.body.textContent).toContain('国信证券');
    expect(document.body.textContent).toContain('张向伟、王新雨');
    expect(document.body.textContent).toContain('2026-11-04');
    expect(document.body.textContent).toContain('6 页');
    expect(screen.getByText('第一段正文：收入与利润均实现增长。')).toBeTruthy();
    expect(screen.getByText('第二段正文：风险提示。')).toBeTruthy();
    expect(document.body.textContent).toContain('抓取时间：');
    expect(document.body.textContent).not.toContain('2026-11-07T00:00:00.000Z');

    const stockLink = screen.getByRole('link', { name: /查看个股/ });
    expect(stockLink.getAttribute('href')).toBe('/stocks/600519');

    fireEvent.click(screen.getByRole('button', { name: /原始研报 PDF/ }));
    expect(open).toHaveBeenCalledWith(detail.pdfUrl, '_blank', 'noopener,noreferrer');

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe('/api/news/research/reports/AP202611041831416424');
  });

  it('404：明确说未找到，不渲染标题或正文', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: false, code: 'REPORT_NOT_FOUND', error: '未找到该研报',
    }, 404)));

    renderPage('AP000000000000000000');

    expect(await screen.findByText('未找到这篇研报')).toBeTruthy();
    expect(document.body.textContent).not.toContain(detail.title);
    expect(document.body.textContent).toContain('不会编造标题与正文');
  });

  it('dataSource=unavailable：显示真实原因与重试，不用摘要拼正文', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: false,
      dataSource: 'unavailable',
      message: '研报正文源不可用',
      data: { paragraphs: [] },
    })));

    renderPage();

    expect(await screen.findByText('研报正文加载失败：研报正文源不可用')).toBeTruthy();
    expect(screen.getByRole('button', { name: /重试/ })).toBeTruthy();
    expect(document.body.textContent).not.toContain('第一段正文');
  });
});
