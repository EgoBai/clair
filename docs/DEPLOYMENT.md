# 部署指南

## 系统要求

- **Node.js**: >= 18.0.0
- **PostgreSQL**: >= 14.0
- **npm**: >= 9.0.0

## 环境变量配置

### 后端 (backend/src/.env)

```bash
# 服务配置
PORT=3001
NODE_ENV=production

# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/a_stock_db

# Redis (可选, 用于缓存)
REDIS_URL=redis://localhost:6379

# 日志级别
LOG_LEVEL=info

# CORS
CORS_ORIGIN=https://your-domain.com
```

### 前端 (frontend/.env)

```bash
VITE_API_URL=https://api.your-domain.com
VITE_WS_URL=wss://api.your-domain.com
```

## Docker 部署 (推荐)

### 1. 使用 docker-compose

```bash
# 克隆项目
git clone <repo-url>
cd a-stock-website

# 配置环境变量
cp backend/src/.env.example backend/src/.env
cp frontend/.env.example frontend/.env

# 修改 .env 文件

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 2. docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: a_stock_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://postgres:your_password@postgres:5432/a_stock_db
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend

volumes:
  pgdata:
  redisdata:
```

## 手动部署

### 1. 安装依赖

```bash
# 后端
cd backend/src
npm install

# 前端
cd frontend
npm install
```

### 2. 初始化数据库

```bash
cd backend/src
npm run db:init
npm run db:seed  # 导入示例数据
```

### 3. 构建前端

```bash
cd frontend
npm run build
```

### 4. 启动服务

```bash
# 后端 (生产环境)
cd backend/src
npm run start:prod

# 或使用 PM2
pm2 start npm --name "a-stock-api" -- run start:prod
```

### 5. Nginx 配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1024;
}
```

## CI/CD (GitHub Actions)

项目已配置 GitHub Actions CI/CD 管线，见 `.github/workflows/ci.yml`:

- **Lint & Type Check**: 推送到任何分支时触发
- **Unit Tests**: 使用 PostgreSQL service 运行测试
- **Build**: 构建前端产物
- **Deploy Staging**: develop 分支自动部署到 staging
- **Deploy Production**: main 分支需要审批后部署

## 监控

### 健康检查端点

```bash
curl https://api.your-domain.com/api/health
```

返回:
```json
{
  "status": "ok",
  "timestamp": "2026-03-24T01:30:00.000Z",
  "uptime": 86400,
  "database": { "status": "healthy", "poolSize": 10 },
  "cache": { "hitRate": 85.5, "totalRequests": 15000 }
}
```

### 缓存统计

```bash
curl https://api.your-domain.com/api/stats/cache
```

## 性能优化建议

1. **CDN**: 使用 CDN 分发前端静态资源
2. **数据库索引**: 确保 `stocks.symbol`, `daily_quotes.trade_date` 等字段有索引
3. **Redis 缓存**: 启用 Redis 缓存热点数据
4. **连接池**: 设置合理的数据库连接池大小 (10-20)
5. **Gzip**: 启用 Nginx Gzip 压缩
6. **HTTP/2**: Nginx 配置 HTTP/2

## 安全建议

1. **HTTPS**: 生产环境强制 HTTPS
2. **环境变量**: 不要将 `.env` 文件提交到 Git
3. **CORS**: 限制允许的来源域名
4. **Rate Limiting**: 后端已内置限流 (120次/分钟)
5. **安全头**: 已配置 Helmet 安全头
6. **输入验证**: 所有 API 已验证输入参数
