# AStock 部署文档

## 架构概览

```
┌─────────┐    ┌─────────┐    ┌──────────┐
│ Browser │───▶│  Nginx  │───▶│ Frontend │
│  :80/443│    │  :80/443│    │  :3000   │
└─────────┘    └─────────┘    └──────────┘
                     │
                     ▼
               ┌──────────┐    ┌──────────┐
               │  Backend │───▶│ Postgres │
               │  :4000   │    │  :5432   │
               └──────────┘    └──────────┘
                     │              │
                     ▼              ▼
               ┌──────────┐    ┌──────────┐
               │  Redis   │    │ Volumes  │
               │  :6379   │    │ (persist)│
               └──────────┘    └──────────┘
```

**组件:**
- **前端**: React + TypeScript + Vite (nginx serving static SPA)
- **后端**: Express + TypeScript (Node.js API server)
- **数据库**: PostgreSQL 16 (主存储)
- **缓存**: Redis 7 (会话/缓存/速率限制)
- **反向代理**: Nginx (SSL termination, 静态资源缓存, 路由)

## 前置条件

### 本地开发
- Node.js >= 18.0.0
- Docker & Docker Compose >= 2.20
- Git

### 生产服务器
- Linux (Ubuntu 22.04+ / CentOS 8+)
- Docker & Docker Compose
- 至少 2GB RAM, 20GB 磁盘
- 域名 (可选, 需配置 DNS)

## 快速开始 (Docker Compose)

### 1. 克隆仓库

```bash
git clone <repository-url>
cd a-stock-website
```

### 2. 配置环境变量 (可选)

```bash
# 默认密码可直接使用, 生产环境请修改
export POSTGRES_PASSWORD=your_secure_password
```

### 3. 一键启动所有服务

```bash
docker compose up -d --build
```

### 4. 验证服务状态

```bash
# 查看所有容器状态
docker compose ps

# 查看实时日志
docker compose logs -f

# 健康检查
curl http://localhost:4000/health
curl http://localhost:3000/
```

### 5. 停止服务

```bash
docker compose down
# 保留数据卷
docker compose down -v  # 删除数据卷
```

## 手动部署 (无 Docker)

### 后端

```bash
cd backend

# 安装依赖
npm ci

# 构建 TypeScript
npm run build

# 配置环境变量
cat > .env << EOF
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/astock
REDIS_URL=redis://localhost:6379
EOF

# 启动
node dist/app.js
```

### 前端

```bash
cd frontend

# 安装依赖
npm ci

# 构建静态文件
npm run build

# 用任意静态服务器 serve dist/ 目录
# 推荐: nginx
```

## 数据库

### 初始化

```bash
# 连接到 PostgreSQL
psql -h localhost -U postgres -d astock

# 运行初始化 SQL
\i backend/db/init.sql
```

### 迁移 (如果使用 Knex)

```bash
cd backend
npx knex migrate:latest
npx knex seed:run
```

## 环境变量参考

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `4000` | 后端服务端口 |
| `DATABASE_URL` | - | PostgreSQL 连接字符串 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接字符串 |
| `REDIS_PREFIX` | `astock:` | Redis key 前缀 |
| `POSTGRES_PASSWORD` | `astock_secret` | 数据库密码 |
| `TZ` | `Asia/Shanghai` | 时区 |
| `JWT_SECRET` | - | JWT 签名密钥 (生产必填) |
| `JWT_REFRESH_SECRET` | - | JWT 刷新密钥 (生产必填) |

## 生产环境部署建议

### 1. 安全强化

- **修改默认密码**: 修改 `POSTGRES_PASSWORD` 为强密码
- **配置 JWT 密钥**: 设置 `JWT_SECRET` 和 `JWT_REFRESH_SECRET`
- **限制端口暴露**: 仅暴露 80/443 端口, 内部服务使用 Docker network
- **启用 HTTPS**: 在 nginx/ssl/ 下放置 SSL 证书
- **开启速率限制**: 后端已内置速率限制中间件

### 2. 性能优化

- **增加 nginx worker**: 修改 `nginx/nginx.conf` 中的 `worker_processes`
- **调整 PostgreSQL 连接池**: 在环境变量中配置 `PGPOOL_SIZE`
- **优化 Redis 内存**: 配置 `maxmemory` 和 `maxmemory-policy`

### 3. 监控

内置健康检查端点:
- `GET /health` - 完整健康检查
- `GET /health/simple` - 快速健康检查

推荐配合 Prometheus + Grafana 监控:
```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### 4. 日志

- 应用日志: `docker compose logs -f backend`
- Nginx 日志: `docker compose logs -f nginx`
- 持久化日志配置见 `monitoring/` 目录

## CI/CD

GitHub Actions 工作流自动执行:
1. **Lint & Audit** — ESLint, npm audit
2. **Unit Tests** — 含 PostgreSQL + Redis 服务容器
3. **Docker Build** — 验证镜像构建
4. **Push Images** — 推送到 ghcr.io (main 分支)

## 故障排除

### 常见问题

**Q: 数据库连接失败**
```
A: 确保 PostgreSQL 容器健康后再启动后端
   docker compose logs postgres
   检查 DATABASE_URL 格式
```

**Q: 前端 404 错误**
```
A: 前端是 SPA, 确保 nginx 配置了 try_files
   检查 frontend/nginx.conf 中的 location / 块
```

**Q: 容器启动顺序问题**
```
A: 使用 healthcheck 确保依赖服务就绪
   depends_on 已配置 condition: service_healthy
```

**Q: 性能问题**
```
A: 检查 Redis 缓存命中率
   检查 PostgreSQL 慢查询日志
   确保前端静态资源已启用 gzip 压缩
```

### 诊断命令

```bash
# 检查所有服务
docker compose ps

# 查看特定服务日志
docker compose logs backend
docker compose logs frontend

# 进入容器
docker compose exec backend sh
docker compose exec postgres psql -U postgres -d astock

# 测试网络连通性
docker compose exec backend wget -q -O- http://frontend:3000/
```

## 版本历史

参见 CHANGELOG.md
