/**
 * 社交功能 API
 * 股票讨论区、评论点赞、大V关注、用户主页
 * 参考雪球社区设计
 */

import { Router, Request, Response } from 'express';
import { validateBody, validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';

const router = Router();

// ==================== 内存存储（生产环境应用数据库） ====================

interface Comment {
  id: number;
  stockSymbol: string;
  userId: number;
  username: string;
  avatarUrl: string;
  content: string;
  parentId: number | null;  // 回复的评论ID
  likes: number;
  likedBy: number[];
  replies: number;
  createdAt: string;
  updatedAt: string;
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
  joinedAt: string;
  badges: string[];
  isVerified: boolean;
}

interface FollowRelation {
  followerId: number;
  followeeId: number;
  createdAt: string;
}

let commentIdCounter = 1;
const comments: Comment[] = [];
const followRelations: FollowRelation[] = [];

// 模拟用户数据
const users: UserProfile[] = [
  {
    id: 1, username: 'admin', displayName: '管理员', avatarUrl: '',
    bio: 'A股行情分析平台管理员', role: 'admin',
    followers: 1280, following: 42, totalPosts: 156, totalLikes: 3420,
    joinedAt: '2024-01-01T00:00:00Z', badges: ['官方', '认证分析师'], isVerified: true,
  },
  {
    id: 2, username: 'market_wizard', displayName: '市场达人', avatarUrl: '',
    bio: '10年A股老兵，专注价值投资', role: 'analyst',
    followers: 5600, following: 128, totalPosts: 423, totalLikes: 12800,
    joinedAt: '2024-02-15T00:00:00Z', badges: ['认证分析师', '年度达人'], isVerified: true,
  },
  {
    id: 3, username: 'tech_trader', displayName: '技术派', avatarUrl: '',
    bio: '量化交易 | 技术分析', role: 'vip',
    followers: 3200, following: 95, totalPosts: 287, totalLikes: 8500,
    joinedAt: '2024-03-01T00:00:00Z', badges: ['VIP', '高频贡献者'], isVerified: false,
  },
  {
    id: 4, username: 'value_seeker', displayName: '价值猎手', avatarUrl: '',
    bio: '巴菲特信徒，寻找被低估的好公司', role: 'user',
    followers: 890, following: 203, totalPosts: 67, totalLikes: 1560,
    joinedAt: '2024-06-01T00:00:00Z', badges: [], isVerified: false,
  },
];

// 模拟初始评论
const mockComments: Omit<Comment, 'id'>[] = [
  {
    stockSymbol: '600519.SH', userId: 2, username: '市场达人', avatarUrl: '',
    content: '茅台基本面依然强劲，Q3营收超预期，白酒龙头地位稳固。长期看好消费复苏逻辑。',
    parentId: null, likes: 45, likedBy: [], replies: 3,
    createdAt: '2026-03-24T08:30:00Z', updatedAt: '2026-03-24T08:30:00Z',
    isEdited: false, isPinned: true,
  },
  {
    stockSymbol: '600519.SH', userId: 3, username: '技术派', avatarUrl: '',
    content: '从技术面看，日线MACD金叉，量能配合良好，短期目标位2200元。止损放在1850。',
    parentId: null, likes: 28, likedBy: [], replies: 5,
    createdAt: '2026-03-24T09:15:00Z', updatedAt: '2026-03-24T09:15:00Z',
    isEdited: false, isPinned: false,
  },
  {
    stockSymbol: '000858.SZ', userId: 4, username: '价值猎手', avatarUrl: '',
    content: '五粮液估值合理，PE不到25倍，分红率高。适合稳健投资者配置。',
    parentId: null, likes: 12, likedBy: [], replies: 1,
    createdAt: '2026-03-24T10:00:00Z', updatedAt: '2026-03-24T10:00:00Z',
    isEdited: false, isPinned: false,
  },
];

mockComments.forEach(c => {
  comments.push({ ...c, id: commentIdCounter++ });
});

// ==================== 路由引用使用 validation.ts 中的 schemas ====================

// ==================== 评论 API ====================

/**
 * GET /api/social/comments
 * 获取评论列表
 */
router.get('/social/comments', validateQuery(schemas.commentQuery), (req: Request, res: Response) => {
  const { stockSymbol, userId, sortBy, page, pageSize } = req.query as any;

  let filtered = [...comments];

  if (stockSymbol) {
    filtered = filtered.filter(c => c.stockSymbol === stockSymbol);
  }
  if (userId) {
    filtered = filtered.filter(c => c.userId === Number(userId));
  }

  // 排序
  switch (sortBy) {
    case 'oldest':
      filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      break;
    case 'popular':
      filtered.sort((a, b) => b.likes - a.likes);
      break;
    default: // newest
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // 置顶评论优先
  const pinned = filtered.filter(c => c.isPinned);
  const unpinned = filtered.filter(c => !c.isPinned);
  const sorted = [...pinned, ...unpinned];

  // 只返回顶级评论（不含回复）
  const topLevel = sorted.filter(c => c.parentId === null);

  const start = (page - 1) * pageSize;
  const paged = topLevel.slice(start, start + pageSize);

  // 添加回复数统计
  const enriched = paged.map(c => ({
    ...c,
    replyCount: comments.filter(r => r.parentId === c.id).length,
  }));

  res.json({
    success: true,
    data: {
      comments: enriched,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        totalCount: topLevel.length,
        totalPages: Math.ceil(topLevel.length / pageSize),
      },
    },
  });
});

/**
 * GET /api/social/comments/:id/replies
 * 获取评论的回复
 */
router.get('/social/comments/:id/replies', (req: Request, res: Response) => {
  const commentId = parseInt(req.params.id);
  const replies = comments
    .filter(c => c.parentId === commentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  res.json({
    success: true,
    data: { replies },
  });
});

/**
 * POST /api/social/comments
 * 发表评论
 */
router.post('/social/comments', validateBody(schemas.commentCreate), (req: Request, res: Response) => {
  const { stockSymbol, content, parentId, userId } = req.body;

  // 查找用户
  const user = users.find(u => u.id === userId) || users[0];

  // XSS 防护：简单 HTML 转义
  const safeContent = content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const comment: Comment = {
    id: commentIdCounter++,
    stockSymbol,
    userId: user.id,
    username: user.displayName,
    avatarUrl: user.avatarUrl,
    content: safeContent,
    parentId: parentId || null,
    likes: 0,
    likedBy: [],
    replies: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isEdited: false,
    isPinned: false,
  };

  comments.push(comment);

  // 更新父评论回复数
  if (parentId) {
    const parent = comments.find(c => c.id === parentId);
    if (parent) parent.replies++;
  }

  res.status(201).json({
    success: true,
    data: comment,
  });
});

/**
 * POST /api/social/comments/:id/like
 * 点赞/取消点赞评论
 */
router.post('/social/comments/:id/like', (req: Request, res: Response) => {
  const commentId = parseInt(req.params.id);
  const userId = req.body.userId || 1;

  const comment = comments.find(c => c.id === commentId);
  if (!comment) {
    return res.status(404).json({ success: false, error: '评论不存在' });
  }

  const likedIdx = comment.likedBy.indexOf(userId);
  if (likedIdx >= 0) {
    // 取消点赞
    comment.likedBy.splice(likedIdx, 1);
    comment.likes--;
  } else {
    // 点赞
    comment.likedBy.push(userId);
    comment.likes++;
  }

  res.json({
    success: true,
    data: {
      likes: comment.likes,
      isLiked: comment.likedBy.includes(userId),
    },
  });
});

/**
 * DELETE /api/social/comments/:id
 * 删除评论
 */
router.delete('/social/comments/:id', (req: Request, res: Response) => {
  const commentId = parseInt(req.params.id);
  const userId = parseInt(req.query.userId as string) || 1;

  const idx = comments.findIndex(c => c.id === commentId);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: '评论不存在' });
  }

  const comment = comments[idx];
  if (comment.userId !== userId) {
    return res.status(403).json({ success: false, error: '无权删除此评论' });
  }

  // 同时删除所有子回复
  const childIds = comments.filter(c => c.parentId === commentId).map(c => c.id);
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].id === commentId || childIds.includes(comments[i].id)) {
      comments.splice(i, 1);
    }
  }

  res.json({ success: true, message: '评论已删除' });
});

// ==================== 用户/分析师 API ====================

/**
 * GET /api/social/users
 * 获取用户列表（分析师排行）
 */
router.get('/social/users', (req: Request, res: Response) => {
  const role = req.query.role as string;
  const sortBy = (req.query.sortBy as string) || 'followers';

  let filtered = [...users];
  if (role) {
    filtered = filtered.filter(u => u.role === role);
  }

  switch (sortBy) {
    case 'totalPosts':
      filtered.sort((a, b) => b.totalPosts - a.totalPosts);
      break;
    case 'totalLikes':
      filtered.sort((a, b) => b.totalLikes - a.totalLikes);
      break;
    default:
      filtered.sort((a, b) => b.followers - a.followers);
  }

  res.json({
    success: true,
    data: { users: filtered },
  });
});

/**
 * GET /api/social/users/:username
 * 获取用户主页
 */
router.get('/social/users/:username', validateParams(schemas.userProfile), (req: Request, res: Response) => {
  const { username } = req.params;
  const user = users.find(u => u.username === username);

  if (!user) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }

  // 获取用户最近评论
  const recentComments = comments
    .filter(c => c.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // 获取关注状态
  const followerIds = followRelations
    .filter(f => f.followeeId === user.id)
    .map(f => f.followerId);

  res.json({
    success: true,
    data: {
      profile: user,
      recentComments,
      followerIds,
    },
  });
});

// ==================== 关注 API ====================

/**
 * POST /api/social/follow
 * 关注/取消关注用户
 */
router.post('/social/follow', validateBody(schemas.follow), (req: Request, res: Response) => {
  const { followerId, followeeId } = req.body;

  if (followerId === followeeId) {
    return res.status(400).json({ success: false, error: '不能关注自己' });
  }

  const followee = users.find(u => u.id === followeeId);
  if (!followee) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }

  const existingIdx = followRelations.findIndex(
    f => f.followerId === followerId && f.followeeId === followeeId
  );

  if (existingIdx >= 0) {
    // 取消关注
    followRelations.splice(existingIdx, 1);
    followee.followers = Math.max(0, followee.followers - 1);

    const follower = users.find(u => u.id === followerId);
    if (follower) follower.following = Math.max(0, follower.following - 1);

    res.json({
      success: true,
      data: { isFollowing: false, followers: followee.followers },
    });
  } else {
    // 关注
    followRelations.push({
      followerId,
      followeeId,
      createdAt: new Date().toISOString(),
    });
    followee.followers++;

    const follower = users.find(u => u.id === followerId);
    if (follower) follower.following++;

    res.json({
      success: true,
      data: { isFollowing: true, followers: followee.followers },
    });
  }
});

/**
 * GET /api/social/follow/status
 * 检查关注状态
 */
router.get('/social/follow/status', validateQuery(schemas.followStatusQuery), (req: Request, res: Response) => {
  const followerId = parseInt(req.query.followerId as string) || 1;
  const followeeId = parseInt(req.query.followeeId as string);

  if (!followeeId) {
    return res.status(400).json({ success: false, error: '缺少 followeeId 参数' });
  }

  const isFollowing = followRelations.some(
    f => f.followerId === followerId && f.followeeId === followeeId
  );

  res.json({
    success: true,
    data: { isFollowing },
  });
});

/**
 * GET /api/social/stats
 * 社区统计
 */
router.get('/social/stats', (_req: Request, res: Response) => {
  const analystCount = users.filter(u => u.role === 'analyst' || u.role === 'vip').length;

  res.json({
    success: true,
    data: {
      totalUsers: users.length,
      analystCount,
      totalComments: comments.length,
      totalFollows: followRelations.length,
      todayComments: comments.filter(c => {
        const today = new Date().toISOString().split('T')[0];
        return c.createdAt.startsWith(today);
      }).length,
    },
  });
});

export default router;
