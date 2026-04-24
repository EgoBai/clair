/**
 * 新闻与资讯页面
 * 聚合多源新闻、情感分析标注、个股关联
 * 参考东方财富资讯功能
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import logger from '../utils/logger';
import {
  Card, List, Tag, Space, Typography, Select, Input, Row, Col,
  Statistic, Spin, Empty, Badge, Tooltip, Divider, Tabs, Pagination,
} from 'antd';
import {
  ReadOutlined, SearchOutlined, FireOutlined, SmileOutlined,
  FrownOutlined, MinusCircleOutlined, BarChartOutlined,
  GlobalOutlined, BankOutlined, LineChartOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { apiService } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// ==================== 类型 ====================

interface NewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishTime: string;
  category: 'market' | 'company' | 'policy' | 'global' | 'analysis';
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  relatedSymbols: string[];
  tags: string[];
  viewCount: number;
}

interface NewsStats {
  total: number;
  categories: Record<string, number>;
  sentiments: { positive: number; negative: number; neutral: number };
  hotTags: { tag: string; count: number }[];
}

// ==================== 分类配置 ====================

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  all: { label: '全部', icon: <ReadOutlined />, color: '#3B82F6' },
  market: { label: '大盘行情', icon: <BarChartOutlined />, color: '#EF4444' },
  company: { label: '公司动态', icon: <BankOutlined />, color: '#22C55E' },
  policy: { label: '政策法规', icon: <GlobalOutlined />, color: '#F59E0B' },
  global: { label: '国际财经', icon: <GlobalOutlined />, color: '#8B5CF6' },
  analysis: { label: '深度分析', icon: <ExperimentOutlined />, color: '#06B6D4' },
};

// ==================== 情感标签 ====================

function SentimentTag({ sentiment, score }: { sentiment: string; score: number }) {
  const config = {
    positive: { color: 'red', icon: <SmileOutlined />, label: '利好' },
    negative: { color: 'green', icon: <FrownOutlined />, label: '利空' },
    neutral: { color: 'default', icon: <MinusCircleOutlined />, label: '中性' },
  }[sentiment] || { color: 'default', icon: null, label: '未知' };

  return (
    <Tooltip title={`情感分数: ${score.toFixed(2)}`}>
      <Tag color={config.color} icon={config.icon} style={{ fontSize: 11 }}>
        {config.label}
      </Tag>
    </Tooltip>
  );
}

// ==================== 时间格式化 ====================

function formatTimeAgo(timeStr: string): string {
  const now = Date.now();
  const time = new Date(timeStr).getTime();
  const diff = now - time;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return timeStr.slice(0, 10);
}

// ==================== 组件 ====================

function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [stats, setStats] = useState<NewsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [sentiment, setSentiment] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  // 加载新闻
  const loadNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.getNews({
        page,
        pageSize,
        category: category === 'all' ? undefined : category,
        sentiment: sentiment === 'all' ? undefined : sentiment,
        q: searchQuery || undefined,
      });
      if (res.success) {
        const data = res.data as { items: NewsItem[]; pagination: { totalCount: number } };
        setNews(data.items);
        setTotal(data.pagination.totalCount);
      }
    } catch (err) {
      logger.error('加载新闻失败:', err);
    } finally {
      setLoading(false);
    }
  }, [page, category, sentiment, searchQuery]);

  // 加载统计
  useEffect(() => {
    apiService.getNewsStats().then((res) => {
      if (res.success) setStats(res.data as unknown as NewsStats);
    });
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  // 切换分类时重置页码
  const handleCategoryChange = useCallback((val: string) => {
    setCategory(val);
    setPage(1);
  }, []);

  const handleSentimentChange = useCallback((val: string) => {
    setSentiment(val);
    setPage(1);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <ReadOutlined style={{ marginRight: 8 }} />
        财经资讯
      </Title>

      {/* 统计概览 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card size="small">
              <Statistic title="资讯总数" value={stats.total} prefix={<ReadOutlined />} />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="利好资讯"
                value={stats.sentiments.positive}
                valueStyle={{ color: '#EF4444' }}
                prefix={<SmileOutlined />}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="利空资讯"
                value={stats.sentiments.negative}
                valueStyle={{ color: '#22C55E' }}
                prefix={<FrownOutlined />}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="中性资讯"
                value={stats.sentiments.neutral}
                prefix={<MinusCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>热门标签</Text>
                <div style={{ marginTop: 4 }}>
                  {stats.hotTags.slice(0, 5).map((t) => (
                    <Tag key={t.tag} style={{ marginBottom: 2 }}>
                      <FireOutlined style={{ marginRight: 2 }} />
                      {t.tag}
                    </Tag>
                  ))}
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={8}>
            <Space>
              <Text strong>分类:</Text>
              <Select value={category} onChange={handleCategoryChange} style={{ width: 140 }} size="small">
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                  <Option key={key} value={key}>
                    <Space size={4}>{cfg.icon}{cfg.label}</Space>
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>
          <Col span={6}>
            <Space>
              <Text strong>情感:</Text>
              <Select value={sentiment} onChange={handleSentimentChange} style={{ width: 120 }} size="small">
                <Option value="all">全部</Option>
                <Option value="positive"><SmileOutlined /> 利好</Option>
                <Option value="negative"><FrownOutlined /> 利空</Option>
                <Option value="neutral"><MinusCircleOutlined /> 中性</Option>
              </Select>
            </Space>
          </Col>
          <Col span={6}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索新闻..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              allowClear
              size="small"
            />
          </Col>
          <Col span={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              共 {total} 条资讯
            </Text>
          </Col>
        </Row>
      </Card>

      {/* 新闻列表 */}
      <Card>
        <Spin spinning={loading}>
          {news.length === 0 && !loading ? (
            <Empty description="暂无相关新闻" />
          ) : (
            <List
              itemLayout="vertical"
              dataSource={news}
              renderItem={(item) => (
                <List.Item
                  key={item.id}
                  style={{ padding: '12px 0' }}
                  actions={[
                    <Text type="secondary" key="time" style={{ fontSize: 12 }}>
                      {formatTimeAgo(item.publishTime)}
                    </Text>,
                    <Text type="secondary" key="source" style={{ fontSize: 12 }}>
                      来源: {item.source}
                    </Text>,
                    <Text type="secondary" key="views" style={{ fontSize: 12 }}>
                      {item.viewCount.toLocaleString()} 阅读
                    </Text>,
                    <SentimentTag key="sentiment" sentiment={item.sentiment} score={item.sentimentScore} />,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space wrap>
                        <a href={item.url} style={{ fontSize: 15, fontWeight: 600 }}>
                          {item.title}
                        </a>
                        {item.relatedSymbols.length > 0 && (
                          <Space size={2}>
                            {item.relatedSymbols.map((s) => (
                              <Tag key={s} color="blue" style={{ fontSize: 10 }}>{s.replace(/\.(SZ|SH|BJ)$/, '')}</Tag>
                            ))}
                          </Space>
                        )}
                      </Space>
                    }
                    description={
                      <Paragraph ellipsis={{ rows: 2 }} type="secondary" style={{ marginBottom: 0 }}>
                        {item.summary}
                      </Paragraph>
                    }
                  />
                  <div style={{ marginTop: 4 }}>
                    <Tag color={CATEGORY_CONFIG[item.category]?.color || 'default'} style={{ fontSize: 11 }}>
                      {CATEGORY_CONFIG[item.category]?.label || item.category}
                    </Tag>
                    {item.tags.map((tag) => (
                      <Tag key={tag} style={{ fontSize: 11 }}>{tag}</Tag>
                    ))}
                  </div>
                </List.Item>
              )}
            />
          )}

          {total > pageSize && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                onChange={setPage}
                showSizeChanger={false}
                showTotal={(t) => `共 ${t} 条`}
              />
            </div>
          )}
        </Spin>
      </Card>
    </div>
  );
}

export default NewsPage;
