/**
 * 社交功能 API
 * 股票讨论区、评论点赞、大V关注、用户主页
 * 参考雪球社区设计
 */

import { Router, Request, Response } from 'express';
import { validateBody, validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）：顶层 dataSource 与 data 内同源。
 *
 * 关键：**保持 `data` 的原有形状**（对象仍是对象、数组仍是数组），
 * 只在顶层补 dataSource、在对象型载荷内部补同名行级字段 —— 不破坏既有前端契约。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: unknown,
  statusCode = 200,
  extra?: Record<string, unknown>,
): void {
  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>), dataSource }
      : data;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json({
    success: true,
    dataSource,
    data: payload,
    timestamp: new Date().toISOString(),
    ...(extra ?? {}),
  });
}

/**
 * 失败响应统一出口：**保留原 HTTP 语义**（400/401/404/409/500 不变），
 * 只补顶层 dataSource，避免调用方在失败路径上无从判定诚实级别。
 */
function sendUnavailable(
  res: Response,
  statusCode: number,
  error: string,
  message?: string,
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json({
    success: false,
    dataSource: 'unavailable',
    error,
    ...(message !== undefined ? { message } : {}),
    timestamp: new Date().toISOString(),
  });
}

/**
 * 本模块的诚实口径：**固定 unavailable**。
 *
 * 2026-10-29（工单 R4 顺手项）：此前 users（4 个）与 mockComments（3 条）是
 * 代码内硬编码的模拟数据 —— 关注数 1280/5600/3200/890、点赞 45/28/12、带具体
 * 目标价与止损位的「股评」全是写死的常量，却随 success:true 一起返回，构成
 * 「success=true 但内容是假」的误用面。现**彻底移除全部内置模拟数据**：
 *   - users / comments 初始为空，接口如实返回空列表；
 *   - 社区后端（真实用户体系/评论存储）未接入，前端零消费点（孤儿模块）；
 *   - 本会话内用户经 POST 创建的评论仅存内存（不持久化），仍标 unavailable。
 */
const MOCK_MODULE_NOTE =
  '社区功能未接入真实用户与评论数据源，暂无真实数据；列表为空不是故障，是诚实空态';

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
  role: 'user' | 'analyst' | 'vip' | 'admin';
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

// 用户体系未接入：无内置用户，接口如实返回空列表（诚实红线：不内置模拟用户冒充真实社区）
const users: UserProfile[] = [];

// ==================== 路由引用使用 validation.ts 中的 schemas ====================

// ==================== 评论 API ====================

/**
 * GET /api/social/comments
 * 获取评论列表
 */
router.get('/social/comments', validateQuery(schemas.commentQuery), (req: Request, res: Response) => {
  const { stockSymbol, userId, sortBy } = req.query as Record<string, string | undefined>;
  const page = parseInt((req.query.page as string) || '1', 10);
  const pageSize = parseInt((req.query.pageSize as string) || '20', 10);

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

  sendHonest(
    res,
    'unavailable',
    {
      comments: enriched,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        totalCount: topLevel.length,
        totalPages: Math.ceil(topLevel.length / pageSize),
      },
    },
    200,
    { message: MOCK_MODULE_NOTE },
  );
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

  sendHonest(res, 'unavailable', { replies }, 200, { message: MOCK_MODULE_NOTE });
});

/**
 * POST /api/social/comments
 * 发表评论
 */
router.post('/social/comments', validateBody(schemas.commentCreate), (req: Request, res: Response) => {
  const { stockSymbol, content, parentId, userId } = req.body;

  // 用户体系未接入：无真实用户目录时以匿名身份落评论（不冒充任何内置用户）
  const user = users.find(u => u.id === userId) ?? {
    id: 0,
    username: 'anonymous',
    displayName: '匿名用户',
    avatarUrl: '',
  };

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

  sendHonest(res, 'unavailable', comment, 201, { message: MOCK_MODULE_NOTE });
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
    return sendUnavailable(res, 404, '评论不存在');
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

  sendHonest(
    res,
    'unavailable',
    {
      likes: comment.likes,
      isLiked: comment.likedBy.includes(userId),
    },
    200,
    { message: MOCK_MODULE_NOTE },
  );
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
    return sendUnavailable(res, 404, '评论不存在');
  }

  const comment = comments[idx];
  if (comment.userId !== userId) {
    return sendUnavailable(res, 403, '无权删除此评论');
  }

  // 同时删除所有子回复
  const childIds = comments.filter(c => c.parentId === commentId).map(c => c.id);
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].id === commentId || childIds.includes(comments[i].id)) {
      comments.splice(i, 1);
    }
  }

  sendHonest(res, 'unavailable', { message: '评论已删除' }, 200, {
    message: '评论已删除',
    note: MOCK_MODULE_NOTE,
  });
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

  sendHonest(res, 'unavailable', { users: filtered }, 200, { message: MOCK_MODULE_NOTE });
});

/**
 * GET /api/social/users/:username
 * 获取用户主页
 */
router.get('/social/users/:username', validateParams(schemas.userProfile), (req: Request, res: Response) => {
  const { username } = req.params;
  const user = users.find(u => u.username === username);

  if (!user) {
    return sendUnavailable(res, 404, '用户不存在');
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

  sendHonest(
    res,
    'unavailable',
    {
      profile: user,
      recentComments,
      followerIds,
    },
    200,
    { message: MOCK_MODULE_NOTE },
  );
});

// ==================== 关注 API ====================

/**
 * POST /api/social/follow
 * 关注/取消关注用户
 */
router.post('/social/follow', validateBody(schemas.follow), (req: Request, res: Response) => {
  const { followerId, followeeId } = req.body;

  if (followerId === followeeId) {
    return sendUnavailable(res, 400, '不能关注自己');
  }

  const followee = users.find(u => u.id === followeeId);
  if (!followee) {
    return sendUnavailable(res, 404, '用户不存在');
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

    sendHonest(
      res,
      'unavailable',
      { isFollowing: false, followers: followee.followers },
      200,
      { message: MOCK_MODULE_NOTE },
    );
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

    sendHonest(
      res,
      'unavailable',
      { isFollowing: true, followers: followee.followers },
      200,
      { message: MOCK_MODULE_NOTE },
    );
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
    return sendUnavailable(res, 400, '缺少 followeeId 参数');
  }

  const isFollowing = followRelations.some(
    f => f.followerId === followerId && f.followeeId === followeeId
  );

  sendHonest(res, 'unavailable', { isFollowing }, 200, { message: MOCK_MODULE_NOTE });
});

/**
 * GET /api/social/stats
 * 社区统计
 */
router.get('/social/stats', (_req: Request, res: Response) => {
  const analystCount = users.filter(u => u.role === 'analyst' || u.role === 'vip').length;

  sendHonest(
    res,
    'unavailable',
    {
      totalUsers: users.length,
      analystCount,
      totalComments: comments.length,
      totalFollows: followRelations.length,
      todayComments: comments.filter(c => {
        const today = new Date().toISOString().split('T')[0];
        return c.createdAt.startsWith(today);
      }).length,
    },
    200,
    { message: MOCK_MODULE_NOTE },
  );
});

export default router;
