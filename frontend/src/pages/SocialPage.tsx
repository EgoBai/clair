/**
 * 社区讨论页面
 * 股票讨论区、评论、点赞、关注
 * 参考雪球社区设计
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, List, Avatar, Button, Input, Tag, Space, Divider,
  Tabs, Badge, Empty, message, Popconfirm, Pagination,
} from 'antd';
import {
  LikeOutlined, LikeFilled, MessageOutlined, StarOutlined,
  StarFilled, UserOutlined, PushpinOutlined, FireOutlined,
} from '@ant-design/icons';

const { TextArea } = Input;
const { TabPane } = Tabs;

interface Comment {
  id: number;
  stockSymbol: string;
  userId: number;
  username: string;
  avatarUrl: string;
  content: string;
  parentId: number | null;
  likes: number;
  likedBy: number[];
  replies: number;
  replyCount: number;
  createdAt: string;
  isEdited: boolean;
  isPinned: boolean;
}

interface UserProfile {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  role: 'user' | 'analyst' | 'vip';
  followers: number;
  following: number;
  totalPosts: number;
  totalLikes: number;
  badges: string[];
  isVerified: boolean;
}

const API_BASE = '/api';

const SocialPage: React.FC = () => {
  const { symbol } = useParams<{ symbol?: string }>();
  const navigate = useNavigate();
  const [comments, setComments] = useState<Comment[]>([]);
  const [analysts, setAnalysts] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState(symbol ? 'stock' : 'hot');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [communityStats, setCommunityStats] = useState({
    totalUsers: 0, totalComments: 0, analystCount: 0,
  });

  // 加载评论
  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: '10',
        sortBy,
      });
      if (symbol) params.set('stockSymbol', symbol);

      const res = await fetch(`${API_BASE}/social/comments?${params}`);
      const data = await res.json();
      if (data.success) {
        setComments(data.data.comments);
        setTotal(data.data.pagination.totalCount);
      }
    } catch (e) {
      console.error('加载评论失败:', e);
    }
    setLoading(false);
  }, [currentPage, sortBy, symbol]);

  // 加载分析师
  const loadAnalysts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/social/users?role=analyst&sortBy=followers`);
      const data = await res.json();
      if (data.success) {
        setAnalysts(data.data.users);
      }
    } catch (e) {
      console.error('加载分析师失败:', e);
    }
  }, []);

  // 加载社区统计
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/social/stats`);
      const data = await res.json();
      if (data.success) setCommunityStats(data.data);
    } catch {}
  }, []);

  useEffect(() => {
    loadComments();
    loadAnalysts();
    loadStats();
  }, [loadComments, loadAnalysts, loadStats]);

  // 发表评论
  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/social/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockSymbol: symbol || 'GENERAL',
          content: newComment,
          userId: 1,
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('评论发表成功');
        setNewComment('');
        loadComments();
      }
    } catch {
      message.error('发表失败');
    }
  };

  // 发表回复
  const handlePostReply = async (parentId: number) => {
    if (!replyContent.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/social/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockSymbol: symbol || 'GENERAL',
          content: replyContent,
          parentId,
          userId: 1,
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('回复成功');
        setReplyContent('');
        setReplyingTo(null);
        loadComments();
      }
    } catch {
      message.error('回复失败');
    }
  };

  // 点赞
  const handleLike = async (commentId: number) => {
    try {
      const res = await fetch(`${API_BASE}/social/comments/${commentId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 1 }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => prev.map(c =>
          c.id === commentId
            ? { ...c, likes: data.data.likes, likedBy: data.data.isLiked ? [...c.likedBy, 1] : c.likedBy.filter(id => id !== 1) }
            : c
        ));
      }
    } catch {}
  };

  // 关注
  const handleFollow = async (userId: number) => {
    try {
      const res = await fetch(`${API_BASE}/social/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerId: 1, followeeId: userId }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.data.isFollowing ? '关注成功' : '已取消关注');
      }
    } catch {}
  };

  const getRoleTag = (role: string) => {
    switch (role) {
      case 'analyst': return <Tag color="gold">认证分析师</Tag>;
      case 'vip': return <Tag color="purple">VIP</Tag>;
      case 'admin': return <Tag color="red">管理员</Tag>;
      default: return null;
    }
  };

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  const roleIcons: Record<string, string> = {
    user: '👤', analyst: '📊', vip: '👑', admin: '🛡️',
  };

  return (
    <div style={{ padding: '0 4px' }}>
      {/* 头部统计 */}
      <Card
        size="small"
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.1))',
          border: '1px solid rgba(59,130,246,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>
              {communityStats.totalUsers}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>社区用户</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#8b5cf6' }}>
              {communityStats.totalComments}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>讨论帖</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>
              {communityStats.analystCount}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>认证分析师</div>
          </div>
        </div>
      </Card>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* 热门讨论 */}
        <TabPane tab={<><FireOutlined /> 热门讨论</>} key="hot">
          {/* 发表评论 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <TextArea
              rows={3}
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder={symbol ? `讨论 ${symbol} ...` : '发表你的观点...'}
              maxLength={2000}
              showCount
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="primary" onClick={handlePostComment} disabled={!newComment.trim()}>
                发表评论
              </Button>
            </div>
          </Card>

          {/* 排序切换 */}
          <div style={{ marginBottom: 12 }}>
            <Space>
              {[
                { key: 'newest', label: '最新' },
                { key: 'popular', label: '最热' },
                { key: 'oldest', label: '最早' },
              ].map(s => (
                <Button
                  key={s.key}
                  size="small"
                  type={sortBy === s.key ? 'primary' : 'default'}
                  onClick={() => { setSortBy(s.key); setCurrentPage(1); }}
                >
                  {s.label}
                </Button>
              ))}
            </Space>
          </div>

          {/* 评论列表 */}
          <List
            loading={loading}
            dataSource={comments}
            locale={{ emptyText: <Empty description="暂无讨论" /> }}
            renderItem={(comment) => (
              <Card
                size="small"
                style={{
                  marginBottom: 8,
                  borderLeft: comment.isPinned ? '3px solid #f59e0b' : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: 12 }}>
                  <Avatar icon={<UserOutlined />} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: '#e5e7eb' }}>
                        {roleIcons[analysts.find(a => a.id === comment.userId)?.role || 'user']}{' '}
                        {comment.username}
                      </span>
                      {comment.isPinned && <Tag color="orange">📌 置顶</Tag>}
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {formatTime(comment.createdAt)}
                      </span>
                    </div>
                    <div style={{ color: '#d1d5db', lineHeight: 1.6, marginBottom: 8 }}>
                      {comment.content}
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <Button
                        type="text"
                        size="small"
                        icon={comment.likedBy.includes(1) ? <LikeFilled style={{ color: '#ef4444' }} /> : <LikeOutlined />}
                        onClick={() => handleLike(comment.id)}
                      >
                        {comment.likes}
                      </Button>
                      <Button
                        type="text"
                        size="small"
                        icon={<MessageOutlined />}
                        onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                      >
                        {comment.replyCount || comment.replies}
                      </Button>
                    </div>

                    {/* 回复输入框 */}
                    {replyingTo === comment.id && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        <TextArea
                          rows={2}
                          value={replyContent}
                          onChange={e => setReplyContent(e.target.value)}
                          placeholder={`回复 @${comment.username}...`}
                          maxLength={500}
                        />
                        <Button
                          type="primary"
                          size="small"
                          onClick={() => handlePostReply(comment.id)}
                          disabled={!replyContent.trim()}
                        >
                          回复
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}
          />

          {total > 10 && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Pagination
                current={currentPage}
                total={total}
                pageSize={10}
                onChange={setCurrentPage}
                size="small"
              />
            </div>
          )}
        </TabPane>

        {/* 分析师 */}
        <TabPane tab={<><StarOutlined /> 分析师</>} key="analysts">
          <List
            dataSource={analysts}
            renderItem={(analyst) => (
              <Card size="small" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Avatar icon={<UserOutlined />} size={48} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, color: '#e5e7eb', fontSize: 15 }}>
                          {analyst.displayName}
                        </span>
                        {getRoleTag(analyst.role)}
                        {analyst.isVerified && <Tag color="blue">已认证</Tag>}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                        {analyst.bio}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        粉丝 {analyst.followers} · 帖子 {analyst.totalPosts} · 获赞 {analyst.totalLikes}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="small"
                    icon={<StarOutlined />}
                    onClick={() => handleFollow(analyst.id)}
                  >
                    关注
                  </Button>
                </div>
              </Card>
            )}
          />
        </TabPane>

        {/* 个股讨论 */}
        {symbol && (
          <TabPane tab={`💬 ${symbol} 讨论`} key="stock">
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>
              已筛选: {symbol} 相关讨论
            </div>
          </TabPane>
        )}
      </Tabs>
    </div>
  );
};

export default SocialPage;
