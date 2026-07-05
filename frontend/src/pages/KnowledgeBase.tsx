/**
 * 我的投资笔记 — 手动笔记 + 统计 + 知识库
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag, Empty, Input, Typography, Space, Button, Modal, Select, Statistic, Tooltip, Row, Col } from 'antd';
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

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const KnowledgeBase: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState<NoteStats>({ total: 0, thisWeek: 0, topCategory: null });

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<KnowledgeCategory>('学习笔记');
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    const all = searchQuery ? searchEntries(searchQuery) : getEntries(activeCategory || undefined);
    setEntries(all);
    setStats(getNoteStats());
  };

  useEffect(() => { loadData(); }, [activeCategory, searchQuery]);

  const counts = useMemo(() => getCategoryCounts(), [entries]);

  const handleDelete = (id: string) => {
    deleteEntry(id);
    loadData();
  };

  const handleSaveNote = () => {
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
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const openModal = () => {
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory('学习笔记');
    setModalVisible(true);
  };

  const cardBg = 'var(--bg-secondary, #161b26)';
  const cardBorder = 'var(--border-subtle, rgba(255,255,255,0.06))';
  const textPrimary = 'var(--text-primary, #e8edf5)';
  const textSecondary = 'var(--text-secondary, #8b95a8)';
  const textTertiary = 'var(--text-tertiary, #5a6478)';
  const accentSolid = 'var(--accent-solid, #3b82f6)';
  const accentLight = 'var(--accent-light, rgba(59,130,246,0.12))';
  const inputBg = 'var(--bg-tertiary, #1c2333)';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base, #080b14)', color: textPrimary, padding: '24px 32px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* ====== Header ====== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} type="text" style={{ color: textSecondary }} />
            <BookOutlined style={{ fontSize: 22, color: accentSolid }} />
            <Title level={3} style={{ margin: 0, color: textPrimary }}>我的投资笔记</Title>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openModal}
            style={{ borderRadius: 10, fontWeight: 500 }}>
            写笔记
          </Button>
        </div>

        {/* ====== Stats Bar ====== */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <div style={{
              background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 14,
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileTextOutlined style={{ fontSize: 20, color: accentSolid }} />
              </div>
              <div>
                <Statistic title="总笔记数" value={stats.total} valueStyle={{ fontSize: 22, fontWeight: 700, color: textPrimary }} />
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div style={{
              background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 14,
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(52,211,153,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CalendarOutlined style={{ fontSize: 20, color: '#34d399' }} />
              </div>
              <div>
                <Statistic title="本周新增" value={stats.thisWeek} valueStyle={{ fontSize: 22, fontWeight: 700, color: textPrimary }}
                  suffix={<RiseOutlined style={{ fontSize: 14, color: '#34d399', marginLeft: 4 }} />} />
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div style={{
              background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 14,
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(251,191,36,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FireOutlined style={{ fontSize: 20, color: '#fbbf24' }} />
              </div>
              <div>
                <Statistic title="最常关注"
                  value={stats.topCategory ? `${stats.topCategory.icon} ${stats.topCategory.label}` : '—'}
                  valueStyle={{ fontSize: 16, fontWeight: 600, color: textPrimary }} />
              </div>
            </div>
          </Col>
        </Row>

        {/* ====== Category tabs ====== */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Tag color={!activeCategory ? 'blue' : 'default'}
            style={{ cursor: 'pointer', padding: '4px 14px', borderRadius: 8, fontSize: 13 }}
            onClick={() => setActiveCategory(null)}>
            全部 ({stats.total})
          </Tag>
          {CATEGORIES.map(cat => (
            <Tag key={cat.key}
              color={activeCategory === cat.key ? 'blue' : 'default'}
              style={{ cursor: 'pointer', padding: '4px 14px', borderRadius: 8, fontSize: 13 }}
              onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}>
              {cat.icon} {cat.label} ({counts[cat.key]})
            </Tag>
          ))}
        </div>

        {/* ====== Search (below categories) ====== */}
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索笔记..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            marginBottom: 20, background: inputBg,
            border: `1px solid ${cardBorder}`, color: textPrimary,
            borderRadius: 10, height: 40,
          }}
          allowClear
        />

        {/* ====== Entry list ====== */}
        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div style={{ color: textTertiary }}>
                  <Paragraph style={{ fontSize: 15, marginBottom: 8, color: textSecondary }}>
                    还没有投资笔记
                  </Paragraph>
                  <Paragraph style={{ fontSize: 13, color: textTertiary, lineHeight: 2 }}>
                    在 AI 对话中点击「<Tag color="purple" style={{ cursor: 'default' }}>保存到投资笔记</Tag>」<br />
                    或点击上方「<Button type="link" size="small" icon={<PlusOutlined />} style={{ padding: 0, color: accentSolid }}>写笔记</Button>」手动记录
                  </Paragraph>
                </div>
              }
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {entries.map(entry => (
              <Card key={entry.id} size="small"
                style={{
                  background: cardBg, border: `1px solid ${cardBorder}`,
                  borderRadius: 14, cursor: 'pointer',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                styles={{ body: { padding: '14px 18px' } }}
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: textPrimary, fontSize: 14, fontWeight: 600 }} ellipsis>
                      {entry.question.length > 60 ? entry.question.slice(0, 60) + '...' : entry.question}
                    </Text>
                    <Space size={4}>
                      <Tooltip title={CATEGORIES.find(c => c.key === entry.category)?.desc}>
                        <Tag color="purple" style={{ borderRadius: 6 }}>
                          {CATEGORIES.find(c => c.key === entry.category)?.icon} {entry.category}
                        </Tag>
                      </Tooltip>
                      <DeleteOutlined onClick={e => { e.stopPropagation(); handleDelete(entry.id); }}
                        style={{ color: textTertiary, fontSize: 13, padding: 4 }} />
                    </Space>
                  </div>
                }
              >
                <div style={{ fontSize: 12, color: textTertiary, marginBottom: 8 }}>
                  {new Date(entry.createdAt).toLocaleDateString('zh-CN', {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                  {entry.symbol && <Tag style={{ marginLeft: 8, borderRadius: 4 }}>{entry.symbol}</Tag>}
                  {entry.page === '手动笔记' && (
                    <Tag color="blue" style={{ marginLeft: 4, borderRadius: 4, fontSize: 11 }}>
                      <EditOutlined style={{ fontSize: 10 }} /> 手动
                    </Tag>
                  )}
                </div>
                <div style={{
                  color: textSecondary, fontSize: 13, lineHeight: 1.7,
                  maxHeight: expandedId === entry.id ? 'none' : 80, overflow: 'hidden',
                }} dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.answer) }} />
                {entry.tags.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {entry.tags.map(tag => <Tag key={tag} style={{ fontSize: 11, borderRadius: 4 }}>{tag}</Tag>)}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* ====== Write Note Modal ====== */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <EditOutlined style={{ color: accentSolid }} />
              <span style={{ color: textPrimary }}>写投资笔记</span>
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
          styles={{
            body: { padding: '20px 24px' },
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Text style={{ color: textSecondary, fontSize: 13, marginBottom: 6, display: 'block' }}>标题</Text>
              <Input
                placeholder="输入笔记标题..."
                value={noteTitle}
                onChange={e => setNoteTitle(e.target.value)}
                maxLength={100}
                showCount
                style={{
                  background: inputBg, border: `1px solid ${cardBorder}`,
                  color: textPrimary, borderRadius: 8, height: 40,
                }}
              />
            </div>
            <div>
              <Text style={{ color: textSecondary, fontSize: 13, marginBottom: 6, display: 'block' }}>分类</Text>
              <Select
                value={noteCategory}
                onChange={v => setNoteCategory(v)}
                style={{ width: '100%' }}
                options={CATEGORIES.map(c => ({
                  value: c.key,
                  label: `${c.icon} ${c.label} - ${c.desc}`,
                }))}
              />
            </div>
            <div>
              <Text style={{ color: textSecondary, fontSize: 13, marginBottom: 6, display: 'block' }}>内容</Text>
              <TextArea
                placeholder="记录你的投资思考、分析、心得...支持 Markdown 格式"
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                rows={8}
                maxLength={10000}
                showCount
                style={{
                  background: inputBg, border: `1px solid ${cardBorder}`,
                  color: textPrimary, borderRadius: 8, resize: 'vertical',
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
