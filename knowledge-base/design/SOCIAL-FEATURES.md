# 社交功能设计

## 设计理念
参考雪球社区设计，构建以股票为核心的讨论社区。

## 核心功能

### 1. 评论系统
- **顶级评论**：按股票代码关联，支持置顶
- **回复系统**：二级回复，支持嵌套
- **排序**：最新/最热/最早三种排序
- **分页**：服务端分页，避免大数据量问题

### 2. 点赞系统
- Toggle 模式：点击点赞，再点取消
- 使用数组存储点赞用户ID，支持快速查找
- 点赞数实时更新，乐观UI更新

### 3. 关注系统
- 用户间关注关系（follow/unfollow）
- 互相关注检测
- 关注数/粉丝数实时计算
- 防止自关注

### 4. 用户角色
- **user**：普通用户
- **analyst**：认证分析师（需要审核）
- **vip**：VIP用户
- **admin**：管理员

## 安全措施
- XSS 防护：评论内容 HTML 实体转义
- 输入验证：Joi schema 验证
- 内容长度限制：评论2000字，回复500字

## 数据结构
```typescript
interface Comment {
  id: number;
  stockSymbol: string;
  userId: number;
  content: string;
  parentId: number | null;  // null = 顶级评论
  likes: number;
  likedBy: number[];        // 点赞用户ID
  isPinned: boolean;
}
```

## API 设计
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/social/comments | 获取评论列表 |
| POST | /api/social/comments | 发表评论 |
| POST | /api/social/comments/:id/like | 点赞/取消 |
| GET | /api/social/users | 用户列表 |
| POST | /api/social/follow | 关注/取消关注 |
| GET | /api/social/stats | 社区统计 |

## 未来扩展
- 实时评论推送（WebSocket）
- @提及功能
- 评论举报机制
- 分析师认证流程
