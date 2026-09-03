/**
 * 投资笔记 — 个人投资知识积累
 * 
 * 布局: 顶部统计 → 分类 tab → 笔记列表
 * 卡片: 问题(标题) + 答案摘要 + 分类 + 时间
 * 
 * 与 FloatingChat 联动: 
 *   - AI 对话中点击"保存到投资笔记" → ChatPanel 调用 saveEntry()
 *   - 手动写笔记保存 → toast 提示，建议回 FloatingChat 继续对话
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Tag, Input, Typography, Space, Button, Modal, Select,
  Statistic, Tooltip, Row, Col, message, Alert,
} from 'antd';
import { LoadingStateDetail, EmptyState } from '../components/Common/StateComponents';
import {
  SearchOutlined,
  DeleteOutlined,
  BookOutlined,
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  FileTextOutlined,
  CalendarOutlined,
  FireOutlined,
  RiseOutlined,
  MessageOutlined,
  ExclamationCircleOutlined,
  BulbOutlined,
  HighlightOutlined,
} from '@ant-design/icons';
import {
  getEntries,
  deleteEntry,
  getCategoryCounts,
  searchEntries,
  saveManualNote,
  getNoteStats,
  updateEntry,
  CATEGORIES,
  type KnowledgeEntry,
  type KnowledgeCategory,
  type NoteStats,
} from '../utils/knowledgeStore';
import { renderMarkdown } from '../utils/markdown';
import { polishNote } from '../utils/notePolish';
import { useGamificationStore } from '../store/useGamificationStore';
import { THEME } from '../styles/theme-constants';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ============================================================
// 常量
// ============================================================
const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const ACCENT = THEME.accent;

// ============================================================
// 子组件: 统计卡片
// ============================================================

interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  value: string | number;
  suffix?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ icon, iconBg, title, value, suffix }) => (
  <div style={{
    background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14,
    padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
    height: '100%',
  }}>
    <div style={{
      width: 44, height: 44, borderRadius: 12,
      background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {icon}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 2 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: TEXT }}>{value}</span>
        {suffix}
      </div>
    </div>
  </div>
);

// ============================================================
// 子组件: 笔记卡片
// ============================================================

interface NoteCardProps {
  entry: KnowledgeEntry;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onPolish: () => void;
  polishing: boolean;
}

const NoteCard: React.FC<NoteCardProps> = ({ entry, expanded, onToggle, onDelete, onPolish, polishing }) => {
  const categoryInfo = CATEGORIES.find(c => c.key === entry.category);
  const answerPreview = entry.answer.length > 120
    ? entry.answer.slice(0, 120).replace(/\n/g, ' ') + '...'
    : entry.answer.replace(/\n/g, ' ');

  return (
    <Card
      size="small"
      hoverable
      onClick={onToggle}
      style={{
        background: CARD_BG,
        border: `1px solid ${expanded ? ACCENT : BORDER}`,
        borderRadius: 14,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        marginBottom: 12,
      }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      {/* 卡片头部: 标题 + 分类标签 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text
            strong
            style={{
              color: TEXT, fontSize: 15, lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {entry.question}
          </Text>
        </div>
        <Space size={4} style={{ flexShrink: 0 }}>
          {categoryInfo && (
            <Tag
              color="purple"
              style={{ borderRadius: 6, margin: 0, fontSize: 12 }}
            >
              {categoryInfo.icon} {entry.category}
            </Tag>
          )}
          <Tooltip title={entry.id.startsWith('demo-') ? '演示笔记暂不支持 AI 润色' : '用 AI 润色此笔记'}>
            <Button
              type="text"
              size="small"
              icon={<HighlightOutlined />}
              loading={polishing}
              disabled={entry.id.startsWith('demo-')}
              onClick={e => { e.stopPropagation(); onPolish(); }}
              style={{ color: polishing ? undefined : ACCENT }}
            >
              润色
            </Button>
          </Tooltip>
          <Tooltip title="删除此笔记">
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{ color: THEME.textMuted }}
            />
          </Tooltip>
        </Space>
      </div>

      {/* 摘要区域 — 折叠时显示纯文本摘要，展开时显示 Markdown */}
      <div style={{ marginTop: 10 }}>
        {expanded ? (
          <div
            style={{
              color: TEXT_SEC, fontSize: 13, lineHeight: 1.75,
            }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.answer) }}
          />
        ) : (
          <Paragraph
            ellipsis={{ rows: 2 }}
            style={{
              color: TEXT_SEC, fontSize: 13, lineHeight: 1.6, margin: 0,
            }}
          >
            {answerPreview}
          </Paragraph>
        )}
      </div>

      {/* 底部信息: 时间 + 标签 + 来源 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
        fontSize: 12, color: THEME.textMuted, flexWrap: 'wrap',
      }}>
        <CalendarOutlined style={{ fontSize: 12 }} />
        <span>
          {new Date(entry.createdAt).toLocaleDateString('zh-CN', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </span>
        {entry.symbol && (
          <Tag style={{ borderRadius: 4, fontSize: 11, margin: 0 }}>{entry.symbol}</Tag>
        )}
        {entry.page === '手动笔记' ? (
          <Tag color="blue" style={{ borderRadius: 4, fontSize: 11, margin: 0 }}>
            <EditOutlined style={{ fontSize: 10 }} /> 手动
          </Tag>
        ) : (
          <Tag color="green" style={{ borderRadius: 4, fontSize: 11, margin: 0 }}>
            <MessageOutlined style={{ fontSize: 10 }} /> AI 对话
          </Tag>
        )}
        {entry.polished && (
          <Tag color="geekblue" style={{ borderRadius: 4, fontSize: 11, margin: 0 }}>
            <HighlightOutlined style={{ fontSize: 10 }} /> AI 润色
          </Tag>
        )}
        {entry.tags.length > 0 && (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {entry.tags.map(tag => (
              <Tag key={tag} style={{ fontSize: 11, borderRadius: 4, margin: 0 }}>{tag}</Tag>
            ))}
          </span>
        )}
      </div>
    </Card>
  );
};

// ============================================================
// 主页面组件: KnowledgeBase
// ============================================================

const KnowledgeBase: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState<NoteStats>({ total: 0, thisWeek: 0, topCategory: null });

  // 写笔记 Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<KnowledgeCategory>('学习笔记');
  const [saving, setSaving] = useState(false);

  // AI 润色状态：正在润色的笔记 id / 润色对比弹窗
  const [polishingId, setPolishingId] = useState<string | null>(null);
  const [polishModal, setPolishModal] = useState<{
    original: string;
    polished: string;
    entryId: string;
  } | null>(null);

  // ============================================================
  // 数据加载
  // ============================================================
  const loadData = useCallback(() => {
    const all = searchQuery ? searchEntries(searchQuery) : getEntries(activeCategory || undefined);
    if (all.length === 0 && !searchQuery) {
      // 无真实笔记时如实展示空态（不注入演示数据）
      setEntries([]);
      setStats({ total: 0, thisWeek: 0, topCategory: null });
    } else {
      setEntries(all);
      setStats(getNoteStats());
    }
  }, [activeCategory, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const counts = useMemo(() => getCategoryCounts(), [entries]);

  // ============================================================
  // 操作
  // ============================================================
  const handleDelete = useCallback((id: string) => {
    // 演示数据不可删除，直接从前端列表移除
    if (id.startsWith('demo-')) {
      setEntries(prev => prev.filter(e => e.id !== id));
      return;
    }
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: '删除后不可恢复，确认删除此条笔记？',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteEntry(id);
        if (expandedId === id) setExpandedId(null);
        loadData();
      },
    });
  }, [expandedId, loadData]);

  const handleSaveNote = useCallback(() => {
    if (!noteTitle.trim()) return;
    setSaving(true);
    try {
      saveManualNote({
        title: noteTitle.trim(),
        content: noteContent.trim(),
        category: noteCategory,
      });
      setModalVisible(false);
      setNoteTitle('');
      setNoteContent('');
      setNoteCategory('学习笔记');
      loadData();
      // 游戏化埋点：记笔记事件（note_created）
      useGamificationStore.getState().track('note_created');

      // Toast: 保存成功，引导用户可与 AI 继续对话
      message.success({
        content: (
          <span>
            ✅ 笔记已保存！可在
            <MessageOutlined style={{ margin: '0 4px', color: ACCENT }} />
            <strong>AI 对话</strong>中继续深入探讨
          </span>
        ),
        duration: 3,
      });
    } catch {
      message.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }, [noteTitle, noteContent, noteCategory, loadData]);

  const openModal = useCallback(() => {
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory('学习笔记');
    setModalVisible(true);
  }, []);

  // ============================================================
  // AI 润色 (D5: 必须走真实 LLM，由 aiClient.chat → 后端 LLM 网关)
  // ============================================================
  const handlePolish = useCallback(async (entry: KnowledgeEntry) => {
    // 演示笔记不在 localStorage 中，禁用润色
    if (entry.id.startsWith('demo-')) return;
    setPolishingId(entry.id);
    try {
      const polished = await polishNote(entry.answer);
      setPolishModal({ original: entry.answer, polished, entryId: entry.id });
    } catch {
      // 失败/超时：保持原文不变，仅提示降级（不做假润色）
      message.warning('AI 服务暂不可用，润色已降级，原文未改动');
    } finally {
      setPolishingId(null);
    }
  }, []);

  // 采用润色稿：更新笔记正文 + 标记已润色（走既有 store 更新机制）
  const handleAdoptPolish = useCallback(() => {
    if (!polishModal) return;
    updateEntry(polishModal.entryId, { answer: polishModal.polished, polished: true });
    setPolishModal(null);
    loadData();
    message.success('已采用 AI 润色稿');
  }, [polishModal, loadData]);

  // ============================================================
  // 渲染
  // ============================================================
  const topCategoryLabel = stats.topCategory
    ? `${stats.topCategory.icon} ${stats.topCategory.label}`
    : '—';

  return (
    <div style={{
      minHeight: '100vh', background: BG, color: TEXT,
      padding: '24px 32px',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* ============================================================ */}
        {/* 页头: 标题 + 写笔记按钮                                          */}
        {/* ============================================================ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24, flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/')}
              type="text"
              style={{ color: TEXT_SEC }}
            />
            <BookOutlined style={{ fontSize: 22, color: ACCENT }} />
            <Title level={3} style={{ margin: 0, color: TEXT }}>投资笔记</Title>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openModal}
            size="large"
            style={{ borderRadius: 10, fontWeight: 600, padding: '0 24px' }}
          >
            写笔记
          </Button>
        </div>

        {/* ============================================================ */}
        {/* 统计卡片: 总笔记数 / 本周新增 / 最常关注                           */}
        {/* ============================================================ */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <StatCard
              icon={<FileTextOutlined style={{ fontSize: 20, color: ACCENT }} />}
              iconBg="var(--accent-light, rgba(59,130,246,0.12))"
              title="笔记总数"
              value={stats.total}
            />
          </Col>
          <Col xs={24} sm={8}>
            <StatCard
              icon={<CalendarOutlined style={{ fontSize: 20, color: '#34d399' }} />}
              iconBg="rgba(52,211,153,0.12)"
              title="本周新增"
              value={stats.thisWeek}
              suffix={<RiseOutlined style={{ fontSize: 13, color: '#34d399' }} />}
            />
          </Col>
          <Col xs={24} sm={8}>
            <StatCard
              icon={<FireOutlined style={{ fontSize: 20, color: '#fbbf24' }} />}
              iconBg="rgba(251,191,36,0.12)"
              title="最常关注"
              value={topCategoryLabel}
            />
          </Col>
        </Row>

        {/* ============================================================ */}
        {/* 分类 Tabs                                                     */}
        {/* ============================================================ */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap',
        }}>
          <Tag
            color={!activeCategory ? 'blue' : 'default'}
            style={{
              cursor: 'pointer', padding: '6px 16px', borderRadius: 8,
              fontSize: 13, fontWeight: !activeCategory ? 600 : 400,
            }}
            onClick={() => setActiveCategory(null)}
          >
            全部 ({stats.total})
          </Tag>
          {CATEGORIES.map(cat => (
            <Tooltip key={cat.key} title={cat.desc}>
              <Tag
                color={activeCategory === cat.key ? 'blue' : 'default'}
                style={{
                  cursor: 'pointer', padding: '6px 16px', borderRadius: 8,
                  fontSize: 13, fontWeight: activeCategory === cat.key ? 600 : 400,
                }}
                onClick={() =>
                  setActiveCategory(activeCategory === cat.key ? null : cat.key)
                }
              >
                {cat.icon} {cat.label} ({counts[cat.key]})
              </Tag>
            </Tooltip>
          ))}
        </div>

        {/* ============================================================ */}
        {/* 搜索栏                                                        */}
        {/* ============================================================ */}
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索笔记标题、内容或标签..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          allowClear
          style={{
            marginBottom: 20,
            background: 'var(--bg-tertiary, #1c2333)',
            border: `1px solid ${BORDER}`,
            color: TEXT,
            borderRadius: 10,
            height: 42,
          }}
        />

        {/* ============================================================ */}
        {/* 笔记列表 / 空状态                                              */}
        {/* ============================================================ */}
        {entries.length === 0 ? (
          <EmptyState
            icon={<BookOutlined style={{ fontSize: 48, color: THEME.textMuted }} />}
            title="还没有投资笔记"
            description="在 AI 对话中点击「保存到投资笔记」即可自动记录研究内容；或手动创建第一条笔记。"
            action={{ text: '手动写第一条笔记', onClick: openModal, type: 'primary' }}
            secondaryAction={{ text: '去 AI 对话中提问', onClick: () => navigate('/') }}
          />
        ) : (
          <div>
            {entries.map(entry => (
              <NoteCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                onDelete={() => handleDelete(entry.id)}
                onPolish={() => handlePolish(entry)}
                polishing={polishingId === entry.id}
              />
            ))}
            {/* 列表底部提示 */}
            <div style={{
              textAlign: 'center', padding: '24px 0',
              color: THEME.textMuted, fontSize: 12,
            }}>
              ✨ 在 <strong>AI 对话</strong> 中与大模型交流时，
              随时点击 <Tag color="blue" style={{ borderRadius: 4, fontSize: 11 }}>📝 保存到投资笔记</Tag> 来积累你的投资知识
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 写笔记 Modal                                                  */}
        {/* ============================================================ */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <EditOutlined style={{ color: ACCENT }} />
              <span style={{ color: TEXT }}>写投资笔记</span>
            </div>
          }
          open={modalVisible}
          onCancel={() => setModalVisible(false)}
          onOk={handleSaveNote}
          okText="保存笔记"
          cancelText="取消"
          confirmLoading={saving}
          okButtonProps={{ disabled: !noteTitle.trim() }}
          width={640}
          destroyOnClose
          styles={{ body: { padding: '20px 24px' } }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 标题 */}
            <div>
              <div style={{ color: TEXT_SEC, fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
                标题 <span style={{ color: '#ef4444' }}>*</span>
              </div>
              <Input
                placeholder="例如：半导体产业链投资逻辑梳理"
                value={noteTitle}
                onChange={e => setNoteTitle(e.target.value)}
                maxLength={100}
                showCount
                autoFocus
                style={{
                  background: 'var(--bg-tertiary, #1c2333)',
                  border: `1px solid ${BORDER}`,
                  color: TEXT,
                  borderRadius: 8,
                  height: 42,
                }}
              />
            </div>

            {/* 分类 */}
            <div>
              <div style={{ color: TEXT_SEC, fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
                分类
              </div>
              <Select
                value={noteCategory}
                onChange={v => setNoteCategory(v)}
                style={{ width: '100%' }}
                options={CATEGORIES.map(c => ({
                  value: c.key,
                  label: `${c.icon} ${c.label} — ${c.desc}`,
                }))}
              />
            </div>

            {/* 内容 */}
            <div>
              <div style={{ color: TEXT_SEC, fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
                内容
              </div>
              <TextArea
                placeholder="记录你的投资思考、分析、心得...&#10;&#10;支持 Markdown 格式：&#10;**粗体**、- 列表、### 标题"
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                rows={10}
                maxLength={10000}
                showCount
                style={{
                  background: 'var(--bg-tertiary, #1c2333)',
                  border: `1px solid ${BORDER}`,
                  color: TEXT,
                  borderRadius: 8,
                  resize: 'vertical',
                }}
              />
            </div>
          </div>
        </Modal>

        {/* ============================================================ */}
        {/* AI 润色对比弹窗: 原文 vs 润色稿 (采用才覆盖保存)                */}
        {/* ============================================================ */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HighlightOutlined style={{ color: ACCENT }} />
              <span style={{ color: TEXT }}>AI 润色对比</span>
            </div>
          }
          open={!!polishModal}
          onCancel={() => setPolishModal(null)}
          onOk={handleAdoptPolish}
          okText="采用润色稿"
          cancelText="放弃"
          okButtonProps={{ disabled: !polishModal }}
          width={760}
          destroyOnClose
          styles={{ body: { padding: '20px 24px' } }}
        >
          {polishModal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ color: TEXT_SEC, fontSize: 13 }}>
                请确认润色结果，点击下方「采用润色稿」才会覆盖原笔记。
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: THEME.textMuted, marginBottom: 6,
                  }}>
                    原文
                  </div>
                  <div
                    style={{
                      background: 'var(--bg-tertiary, #1c2333)',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10, padding: '12px 14px',
                      fontSize: 13, lineHeight: 1.75, color: TEXT_SEC,
                      maxHeight: 320, overflow: 'auto',
                    }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(polishModal.original) }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 6,
                  }}>
                    AI 润色稿
                  </div>
                  <div
                    style={{
                      background: 'var(--bg-tertiary, #1c2333)',
                      border: `1px solid ${ACCENT}`,
                      borderRadius: 10, padding: '12px 14px',
                      fontSize: 13, lineHeight: 1.75, color: TEXT,
                      maxHeight: 320, overflow: 'auto',
                    }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(polishModal.polished) }}
                  />
                </div>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};

export default KnowledgeBase;
