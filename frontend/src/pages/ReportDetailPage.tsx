/**
 * 单篇研报正文详情页
 *
 * 数据源：Worker / Express 的 GET /api/news/research/reports/:infoCode。
 * 接口只返回东方财富研报正文页 zwinfo.notice_content 的真实分段；
 * 未知编号 404、上游不可用 dataSource:'unavailable'，本页不编造正文。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Space, Tag, Typography } from 'antd';
import {
  ArrowLeftOutlined, FilePdfOutlined, LinkOutlined,
} from '@ant-design/icons';
import { EmptyState, ErrorState, LoadingState } from '../components/Common/StateComponents';

const { Text } = Typography;

interface ReportDetail {
  id: string;
  title: string;
  stockCode: string;
  stockName: string;
  orgName: string;
  authors: string[];
  publishDate: string;
  industryName: string;
  paragraphs: string[];
  paragraphCount: number;
  pages: number | null;
  pdfUrl: string;
  sourceUrl: string;
  fetchedAt?: string;
}

interface DetailEnvelope {
  success?: boolean;
  dataSource?: string;
  error?: string;
  message?: string;
  data?: ReportDetail;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function openExternal(url: string): void {
  if (!isHttpUrl(url)) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function textOrDash(value: unknown): string {
  const s = String(value ?? '').trim();
  return s || '—';
}

/** 抓取时间按本地时间展示；无法解析时原样保留，便于排查接口。 */
function formatFetchedAt(value?: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function readEnvelope(response: Response): Promise<DetailEnvelope> {
  const text = await response.text().catch(() => '');
  if (!text.trim()) throw new Error(`响应为空（HTTP ${response.status}）`);
  try {
    return JSON.parse(text) as DetailEnvelope;
  } catch {
    throw new Error(`响应不是合法 JSON（HTTP ${response.status}）`);
  }
}

export default function ReportDetailPage() {
  const { reportId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const reload = useCallback(() => setRetryKey((v) => v + 1), []);

  useEffect(() => {
    const code = String(reportId || '').trim();
    if (!code) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);
    setDetail(null);

    (async () => {
      try {
        const resp = await fetch(`/api/news/research/reports/${encodeURIComponent(code)}`, { signal: ac.signal });
        const body = await readEnvelope(resp);
        if (ac.signal.aborted) return;
        if (resp.status === 404) {
          setNotFound(true);
          return;
        }
        if (!resp.ok) {
          throw new Error(body.message || body.error || `研报正文接口请求失败（HTTP ${resp.status}）`);
        }
        if (body.dataSource === 'unavailable' || body.success === false) {
          throw new Error(body.message || body.error || '研报正文暂不可用');
        }
        const data = body.data;
        if (!data || !Array.isArray(data.paragraphs) || data.paragraphs.length === 0) {
          throw new Error('接口未返回任何正文段落；本页不会用摘要或标题拼凑正文。');
        }
        setDetail(data);
      } catch (e) {
        if (ac.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setError((e as Error)?.message || '研报正文接口请求失败');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [reportId, retryKey]);

  return (
    <div data-testid="report-detail-page" style={{ padding: 24, maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <Link to="/report-center" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeftOutlined style={{ marginRight: 6 }} />
          返回研报中心
        </Link>
      </div>

      {loading ? <LoadingState fullPage tip="正在加载研报正文..." /> : null}

      {!loading && notFound ? (
        <Card>
          <EmptyState
            title="未找到这篇研报"
            description="该研报编号在东方财富研报正文页不存在，或上游没有返回正文。本页不会编造标题与正文。"
            action={{ text: '返回研报中心', onClick: () => navigate('/report-center'), type: 'primary' }}
          />
        </Card>
      ) : null}

      {!loading && !notFound && error ? (
        <Card>
          <ErrorState message={`研报正文加载失败：${error}`} onRetry={reload} />
        </Card>
      ) : null}

      {!loading && !notFound && !error && detail ? (
        <article>
          <Card style={{ marginBottom: 16 }}>
            <Space size={8} wrap style={{ marginBottom: 10 }}>
              <Tag style={{ margin: 0, color: 'var(--color-up)', background: 'transparent', borderColor: 'var(--color-up)' }}>
                真实研报正文
              </Tag>
              {detail.industryName ? <Tag style={{ margin: 0 }}>{detail.industryName}</Tag> : null}
            </Space>
            <h1 style={{
              margin: '0 0 10px',
              fontSize: 'clamp(20px, 2.4vw, 28px)',
              lineHeight: 1.4,
              color: 'var(--text-primary)',
            }}>
              {textOrDash(detail.title)}
            </h1>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 16px',
              color: 'var(--text-tertiary)',
              fontSize: 13,
            }}>
              <span>{textOrDash(detail.orgName)}</span>
              <span>{detail.authors.length ? detail.authors.join('、') : '作者 —'}</span>
              <span>{textOrDash(detail.publishDate)}</span>
              <span>{detail.pages != null ? `${detail.pages} 页` : '页数 —'}</span>
            </div>
            <Space size={8} wrap style={{ marginTop: 16 }}>
              {detail.stockCode ? (
                <Link to={`/stocks/${encodeURIComponent(detail.stockCode)}`}>
                  <Button>查看个股 {detail.stockName || detail.stockCode}</Button>
                </Link>
              ) : null}
              {isHttpUrl(detail.pdfUrl) ? (
                <Button icon={<FilePdfOutlined />} onClick={() => openExternal(detail.pdfUrl)}>
                  原始研报 PDF
                </Button>
              ) : null}
              {isHttpUrl(detail.sourceUrl) ? (
                <Button icon={<LinkOutlined />} onClick={() => openExternal(detail.sourceUrl)}>
                  来源页面
                </Button>
              ) : null}
            </Space>
          </Card>

          <Card
            title="正文"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{detail.paragraphs.length} 段</Text>}
          >
            <div style={{ maxWidth: 820 }}>
              {detail.paragraphs.map((p, index) => (
                <p
                  key={`${index}-${p.slice(0, 12)}`}
                  style={{
                    margin: '0 0 14px',
                    fontSize: 15,
                    lineHeight: 1.95,
                    color: 'var(--text-primary)',
                    textAlign: 'justify',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {p}
                </p>
              ))}
            </div>
          </Card>

          <Card size="small" style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.8 }}>
              正文来自东方财富研报正文页（notice_content）；PDF 为原始研报文件，版权归原研究机构所有。
              本页只做研究留存，不替代原始研报，也不构成投资建议。
              {detail.fetchedAt ? ` 抓取时间：${formatFetchedAt(detail.fetchedAt)}` : ''}
            </Text>
          </Card>
        </article>
      ) : null}
    </div>
  );
}
