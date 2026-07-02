/**
 * 我的知识库 — 个人投资知识积累
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag, Empty, Input, Typography, Space, Button } from 'antd';
import { SearchOutlined, DeleteOutlined, BookOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { getEntries, deleteEntry, getCategoryCounts, searchEntries, CATEGORIES, type KnowledgeEntry, type KnowledgeCategory } from '../utils/knowledgeStore';
import { renderMarkdown } from '../utils/markdown';

const { Title, Text } = Typography;

const KnowledgeBase: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEntries = () => {
    const all = searchQuery ? searchEntries(searchQuery) : getEntries(activeCategory || undefined);
    setEntries(all);
  };

  useEffect(() => { loadEntries(); }, [activeCategory, searchQuery]);

  const counts = useMemo(() => getCategoryCounts(), [entries]);
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const handleDelete = (id: string) => {
    deleteEntry(id);
    loadEntries();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base, #0f172a)', color: 'var(--text-primary)', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} type="text" style={{ color: '#94a3b8' }} />
          <BookOutlined style={{ fontSize: 24, color: '#667eea' }} />
          <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>我的知识库</Title>
          <Tag color="purple" style={{ marginLeft: 8 }}>{totalCount} 条</Tag>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <Tag color={!activeCategory ? 'blue' : 'default'} style={{ cursor: 'pointer', padding: '4px 12px' }}
            onClick={() => setActiveCategory(null)}>
            全部 ({totalCount})
          </Tag>
          {CATEGORIES.map(cat => (
            <Tag key={cat.key} color={activeCategory === cat.key ? 'blue' : 'default'}
              style={{ cursor: 'pointer', padding: '4px 12px' }}
              onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}>
              {cat.icon} {cat.label} ({counts[cat.key]})
            </Tag>
          ))}
        </div>

        {/* Search */}
        <Input prefix={<SearchOutlined />} placeholder="搜索知识库..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ marginBottom: 20, background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }} />

        {/* Entry list */}
        {entries.length === 0 ? (
          <Empty description="知识库为空 — 在AI对话中点击「保存到知识库」开始积累" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {entries.map(entry => (
              <Card key={entry.id} size="small"
                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600 }} ellipsis>
                      {entry.question.length > 60 ? entry.question.slice(0, 60) + '...' : entry.question}
                    </Text>
                    <Space size={4}>
                      <Tag color="purple">{CATEGORIES.find(c => c.key === entry.category)?.icon} {entry.category}</Tag>
                      <DeleteOutlined onClick={e => { e.stopPropagation(); handleDelete(entry.id); }}
                        style={{ color: '#94a3b8', fontSize: 12 }} />
                    </Space>
                  </div>
                }
              >
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                  {new Date(entry.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {entry.symbol && <Tag style={{ marginLeft: 8 }}>{entry.symbol}</Tag>}
                </div>
                <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.7, maxHeight: expandedId === entry.id ? 'none' : 80, overflow: 'hidden' }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.answer) }} />
                {entry.tags.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {entry.tags.map(tag => <Tag key={tag} style={{ fontSize: 11 }}>{tag}</Tag>)}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBase;
