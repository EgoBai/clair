# 自选股系统设计

## 架构
- **分组管理**：默认分组 + 自定义分组（可创建/删除）
- **排序**：sortIndex 字段，支持拖拽/上下移动
- **关联**：user_id → stock_id，通过 group_id 分组

## 数据库设计
```sql
CREATE TABLE user_watchlist (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  stock_id INT NOT NULL REFERENCES stocks(id),
  group_id VARCHAR(50) DEFAULT 'default',
  sort_index INT DEFAULT 0,
  notes TEXT,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, stock_id)
);

CREATE TABLE watchlist_groups (
  id VARCHAR(50) PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  sort_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API 设计
- `GET /api/watchlist` - 获取自选股（支持 groupId 过滤）
- `POST /api/watchlist` - 添加（支持 groupId）
- `DELETE /api/watchlist/:symbol` - 删除
- `PATCH /api/watchlist/:symbol` - 更新（排序/分组/备注）
- `PUT /api/watchlist/reorder` - 批量排序
- `POST /api/watchlist/groups` - 创建分组
- `DELETE /api/watchlist/groups/:id` - 删除分组

## 前端交互
- Tab 式分组切换
- 搜索过滤（代码/名称）
- 上下移动排序（简化拖拽）
- 添加弹窗集成搜索 API
- 实时行情 WebSocket 推送

## 参考
- 同花顺自选股
- 雪球自选股
- 富途自选股分组
