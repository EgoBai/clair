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
  Card, Tag, Empty, Input, Typography, Space, Button, Modal, Select,
  Statistic, Tooltip, Row, Col, message,
} from 'antd';
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
} from '@ant-design/icons';
import {
  getEntries,
  deleteEntry,
  getCategoryCounts,
  searchEntries,
  saveManualNote,
  getNoteStats,
  CATEGORIES,
  type KnowledgeEntry,
  type KnowledgeCategory,
  type NoteStats,
} from '../utils/knowledgeStore';
import { renderMarkdown } from '../utils/markdown';
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
}

const NoteCard: React.FC<NoteCardProps> = ({ entry, expanded, onToggle, onDelete }) => {
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

  // ============================================================
  // 数据加载
  // ============================================================
  const loadData = useCallback(() => {
    const all = searchQuery ? searchEntries(searchQuery) : getEntries(activeCategory || undefined);
    setEntries(all);
    setStats(getNoteStats());
  }, [activeCategory, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const counts = useMemo(() => getCategoryCounts(), [entries]);

  // ============================================================
  // 操作
  // ============================================================
  const handleDelete = useCallback((id: string) => {
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
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <Empty
              image={
                <div style={{
                  width: 120, height: 120, margin: '0 auto 24px',
                  borderRadius: 60, background: 'rgba(59,130,246,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BookOutlined style={{ fontSize: 48, color: THEME.textMuted }} />
                </div>
              }
              description={null}
            >
              <div style={{ marginBottom: 24 }}>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 8,
                }}>
                  还没有投资笔记
                </div>
                <div style={{ fontSize: 14, color: TEXT_SEC, lineHeight: 1.8 }}>
                  <div style={{ marginBottom: 4 }}>
                    在 <Tag color="purple" style={{ borderRadius: 4 }}>AI 对话</Tag> 中，
                    点击每条 AI 回复下方的
                  </div>
                  <Tag
                    color="blue"
                    style={{
                      borderRadius: 4, fontSize: 13, padding: '2px 10px',
                      margin: '4px 0',
                    }}
                  >
                    📝 保存到投资笔记
                  </Tag>
                  <div style={{ marginTop: 4 }}>
                    按钮即可自动记录研究内容
                  </div>
                </div>
              </div>
              <Space direction="vertical" size={12} style={{ width: '100%', maxWidth: 320 }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openModal}
                  block
                  size="large"
                  style={{ borderRadius: 10 }}
                >
                  手动写第一条笔记
                </Button>
                <Button
                  icon={<BulbOutlined />}
                  onClick={() => navigate('/')}
                  block
                  style={{ borderRadius: 10 }}
                >
                  去 AI 对话中提问
                </Button>
              </Space>
            </Empty>
          </div>
        ) : (
          <div>
            {entries.map(entry => (
              <NoteCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                onDelete={() => handleDelete(entry.id)}
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
      </div>
    </div>
  );
};

export default KnowledgeBase;
