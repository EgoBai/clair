# 用户系统设计

## 功能模块

### 1. 认证系统
- 邮箱/手机号注册
- 密码登录（SHA-256 + salt 哈希）
- Token 认证（随机32字节 hex）
- 登出清除 Token

### 2. 用户设置
**主题偏好**：light / dark / system
**语言偏好**：zh-CN / en-US
**通知配置**：
- 邮件通知
- 推送通知
- 价格预警
- 新闻推送
- 周报

**显示配置**：
- 默认分页大小
- 图表类型（K线/折线）
- 是否显示成交量
- 默认K线周期

### 3. 操作历史
- 类型：查看股票/搜索/加自选/移自选/设预警/运行回测/更新组合
- 上限：500条/用户
- 支持按类型筛选
- 分页查询

## API 设计

```
POST /api/user/register    # 注册
POST /api/user/login       # 登录
GET  /api/user/profile     # 用户信息
PUT  /api/user/settings    # 更新设置
POST /api/user/history     # 记录操作
GET  /api/user/history     # 查询历史
POST /api/user/logout      # 登出
```

## 中间件
`authMiddleware`: 验证 Bearer Token

## 设计原则
1. 简化认证：暂用内存存储，生产环境迁移至数据库 + JWT
2. 设置持久化：用户偏好存用户对象
3. 操作记录：异步记录，不阻塞主流程
4. 安全脱敏：密码不返回前端
