import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, Button, Checkbox, Empty, Input, List, Modal, Space, Spin, Tag, Typography, message,
} from 'antd';
import {
  BookOutlined, DeleteOutlined, FileTextOutlined, PlusOutlined, SearchOutlined,
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import { getEntries, type KnowledgeEntry } from '../../utils/knowledgeStore';
import {
  useThesisStore,
  type ThesisCard,
  type ThesisResearchKind,
  type ThesisResearchLink,
} from '../../store/useThesisStore';

const { Text } = Typography;

interface BackendReport {
  id?: string;
  title?: string;
  stockCode?: string;
  stockName?: string;
  orgName?: string;
  publishDate?: string;
  rating?: string;
  url?: string;
}

function fmtDate(value: unknown): string {
  const raw = String(value ?? '');
  if (!raw) return '—';
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw;
}

function noteMeta(entry: KnowledgeEntry): string {
  const parts: string[] = [entry.category];
  if (entry.symbol) parts.push(entry.symbol);
  parts.push(fmtDate(entry.createdAt));
  return parts.join(' · ');
}

function reportMeta(report: BackendReport): string {
  return [report.orgName, fmtDate(report.publishDate)].filter(Boolean).join(' · ') || '研报';
}

function openExternal(url?: string): void {
  if (!url || !/^https?:\/\//i.test(url)) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * 研究档案的只读列表：笔记回到知识库定位，研报打开原始链接。
 * 动态外链不使用 <a href={表达式}>，避免整页导航丢掉 /clair/ basename。
 */
export const ThesisResearchLinks: React.FC<{
  links: ThesisResearchLink[];
  onRemove?: (link: ThesisResearchLink) => void;
}> = ({ links, onRemove }) => {
  if (!links.length) {
    return <Text type="secondary" style={{ fontSize: 12 }}>还没有关联笔记或研报。把研究过程沉淀到这里，复盘时不用重新找。</Text>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {links.map((item) => (
        <div
          key={`${item.kind}-${item.id}`}
          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}
        >
          <div style={{ minWidth: 0 }}>
            <Space size={6} wrap>
              {item.kind === 'note'
                ? <BookOutlined style={{ color: 'var(--accent-solid)' }} />
                : <FileTextOutlined style={{ color: 'var(--accent-solid)' }} />}
              {item.kind === 'note' ? (
                <Link to={`/knowledge?note=${encodeURIComponent(item.id)}`} style={{ fontSize: 13 }}>
                  {item.title}
                </Link>
              ) : item.url ? (
                <button
                  type="button"
                  onClick={() => openExternal(item.url)}
                  style={{
                    background: 'none', border: 0, padding: 0, margin: 0, font: 'inherit',
                    color: 'var(--accent-solid)', textAlign: 'left', cursor: 'pointer', fontSize: 13,
                  }}
                >
                  {item.title}
                </button>
              ) : (
                <span style={{ fontSize: 13 }}>{item.title}</span>
              )}
              <Tag style={{ margin: 0, fontSize: 11 }}>{item.kind === 'note' ? '笔记' : '研报'}</Tag>
            </Space>
            <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>{item.meta || '—'}</div>
          </div>
          {onRemove && (
            <Button
              type="text"
              size="small"
              danger
              aria-label={`移除${item.kind === 'note' ? '笔记' : '研报'}：${item.title}`}
              icon={<DeleteOutlined />}
              onClick={() => onRemove(item)}
            />
          )}
        </div>
      ))}
    </div>
  );
};

interface PickerProps {
  open: boolean;
  onCancel: () => void;
  symbol: string;
  existing: ThesisResearchLink[];
  onLinked: (count: number) => void;
}

const NotePickerModal: React.FC<PickerProps> = ({ open, onCancel, symbol, existing, onLinked }) => {
  const linkResearch = useThesisStore((state) => state.linkResearch);
  const [notes, setNotes] = useState<KnowledgeEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setNotes(getEntries());
    setQuery('');
    setSelected([]);
  }, [open]);

  const linkedIds = useMemo(
    () => new Set(existing.filter((item) => item.kind === 'note').map((item) => item.id)),
    [existing],
  );
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return notes.filter((entry) => {
      if (linkedIds.has(entry.id)) return false;
      if (!keyword) return true;
      return [entry.question, entry.answer, entry.category, entry.symbol ?? '']
        .some((field) => field.toLowerCase().includes(keyword));
    });
  }, [linkedIds, notes, query]);

  const save = () => {
    let count = 0;
    for (const id of selected) {
      const entry = notes.find((item) => item.id === id);
      if (!entry) continue;
      const ok = linkResearch(symbol, {
        kind: 'note',
        id: entry.id,
        title: entry.question,
        meta: noteMeta(entry),
      });
      if (ok) count += 1;
    }
    onLinked(count);
    if (count > 0) message.success(`已关联 ${count} 条笔记`);
    onCancel();
  };

  return (
    <Modal
      title="关联投资笔记"
      open={open}
      onCancel={onCancel}
      onOk={save}
      okText={selected.length ? `关联选中（${selected.length}）` : '关联选中'}
      okButtonProps={{ disabled: selected.length === 0 }}
      cancelText="取消"
      width={720}
      destroyOnClose
      styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
    >
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索笔记标题、内容、分类或代码"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        allowClear
        style={{ marginBottom: 12 }}
      />
      {notes.length === 0 ? (
        <Empty description="还没有投资笔记。先到知识库写一条，再回来沉淀。">
          <Link to="/knowledge"><Button type="primary">去写笔记</Button></Link>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={query ? '没有匹配的笔记' : '该股相关笔记都已加入档案'}
        />
      ) : (
        <List
          size="small"
          dataSource={filtered}
          renderItem={(entry) => (
            <List.Item>
              <Checkbox
                checked={selected.includes(entry.id)}
                onChange={(event) => {
                  setSelected((prev) => (event.target.checked
                    ? [...prev, entry.id]
                    : prev.filter((id) => id !== entry.id)));
                }}
                style={{ width: '100%' }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{entry.question || '未命名笔记'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {noteMeta(entry)}
                  </div>
                </div>
              </Checkbox>
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
};

const ReportPickerModal: React.FC<PickerProps> = ({ open, onCancel, symbol, existing, onLinked }) => {
  const linkResearch = useThesisStore((state) => state.linkResearch);
  const [reports, setReports] = useState<BackendReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const digits = symbol.replace(/\D/g, '');
    setLoading(true);
    setError(null);
    setSelected([]);
    apiService.get<{ items?: BackendReport[] }>('/news/research/reports', { symbol: digits, limit: 50 })
      .then((response) => {
        if (!active) return;
        const data = response.data ?? {};
        const items = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
        setReports(items);
        if (response.success === false) {
          setError(response.error || '研报接口暂不可用');
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message || '研报接口请求失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, reloadToken, symbol]);

  const linkedIds = useMemo(
    () => new Set(existing.filter((item) => item.kind === 'report').map((item) => item.id)),
    [existing],
  );
  const available = reports.filter((report) => {
    const id = String(report.id ?? '').trim();
    return id && !linkedIds.has(id);
  });

  const save = () => {
    let count = 0;
    for (const id of selected) {
      const report = reports.find((item) => String(item.id ?? '') === id);
      if (!report) continue;
      const ok = linkResearch(symbol, {
        kind: 'report',
        id,
        title: String(report.title ?? '未命名研报'),
        meta: reportMeta(report),
        url: typeof report.url === 'string' ? report.url : undefined,
      });
      if (ok) count += 1;
    }
    onLinked(count);
    if (count > 0) message.success(`已沉淀 ${count} 篇研报`);
    onCancel();
  };

  return (
    <Modal
      title="沉淀研报到研究档案"
      open={open}
      onCancel={onCancel}
      onOk={save}
      okText={selected.length ? `沉淀选中（${selected.length}）` : '沉淀选中'}
      okButtonProps={{ disabled: selected.length === 0 }}
      cancelText="取消"
      width={760}
      destroyOnClose
      styles={{ body: { maxHeight: '62vh', overflowY: 'auto' } }}
    >
      {loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}><Spin tip="正在加载真实研报..." /></div>
      ) : error ? (
        <Alert
          type="warning"
          showIcon
          message="研报源暂不可用"
          description={error}
          action={<Button size="small" onClick={() => setReloadToken((value) => value + 1)}>重试</Button>}
        />
      ) : reports.length === 0 ? (
        <Empty description="该股暂无可关联的研报" />
      ) : available.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该股研报都已经在档案里" />
      ) : (
        <List
          size="small"
          dataSource={available}
          renderItem={(report) => {
            const id = String(report.id ?? '');
            const title = String(report.title ?? '未命名研报');
            return (
              <List.Item>
                <Checkbox
                  checked={selected.includes(id)}
                  onChange={(event) => {
                    setSelected((prev) => (event.target.checked
                      ? [...prev, id]
                      : prev.filter((item) => item !== id)));
                  }}
                  style={{ width: '100%' }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {reportMeta(report)}
                      {report.rating ? ` · ${report.rating}` : ''}
                    </div>
                  </div>
                </Checkbox>
              </List.Item>
            );
          }}
        />
      )}
    </Modal>
  );
};

/** 个股页「我的观点」里的研究档案区：展示 + 关联笔记 + 沉淀研报。 */
export const ThesisResearchSection: React.FC<{ card: ThesisCard }> = ({ card }) => {
  const unlinkResearch = useThesisStore((state) => state.unlinkResearch);
  const [picker, setPicker] = useState<ThesisResearchKind | null>(null);

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Space size={6} wrap>
          <BookOutlined style={{ color: 'var(--accent-solid)' }} />
          <Text strong style={{ fontSize: 13 }}>研究档案</Text>
          <Tag style={{ margin: 0 }}>{card.research.length} 条</Tag>
        </Space>
        <Space size={6} wrap>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setPicker('note')}>关联笔记</Button>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => setPicker('report')}>沉淀研报</Button>
        </Space>
      </div>
      <div style={{ marginTop: 10 }}>
        <ThesisResearchLinks
          links={card.research}
          onRemove={(link) => unlinkResearch(card.symbol, link.kind, link.id)}
        />
      </div>
      <NotePickerModal
        open={picker === 'note'}
        onCancel={() => setPicker(null)}
        symbol={card.symbol}
        existing={card.research}
        onLinked={() => undefined}
      />
      <ReportPickerModal
        open={picker === 'report'}
        onCancel={() => setPicker(null)}
        symbol={card.symbol}
        existing={card.research}
        onLinked={() => undefined}
      />
    </div>
  );
};

export default ThesisResearchSection;
