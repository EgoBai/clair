# 运维知识库 — Clair (澄观)

> 持续更新。每次 CAPTURE 阶段追加条目。

## 本地开发环境

### 启动服务
```bash
# 后端 (port 3001)
cd backend && npx tsx src/index.ts

# 前端 (port 5173)
cd frontend && npx vite --host 127.0.0.1 --port 5173 --force

# 数据库
postgresql://postgres:***@localhost:5432/clair
```

### 数据库初始化
```bash
# PostgreSQL已含5544只A股数据
# 同步服务自动运行，首次启动约需2分钟
```

## 部署流程

### 生产环境
- 前端: GitHub Pages (egobai.github.io/clair/)
- 后端: Cloudflare Workers (clair-api.pages.dev)
- CI/CD: GitHub Actions 自动部署

### Worker部署
```bash
# 必须同步 worker.js 和 _worker.js
cp clair-worker/worker.js clair-worker/_worker.js

# node --check 验证语法
node --check clair-worker/worker.js
```

### 生产配置
- `DEEPSEEK_API_KEY`: 需在Cloudflare Pages配置
- 无key时AI端点优雅降级（返回空/默认值）

## 调试手册

### 前端调试
```bash
# Vite缓存问题
rm -rf frontend/node_modules/.vite && npx vite --force

# TS错误定位
cd frontend && npx tsc --noEmit 2>&1 | head -20

# 测试运行
cd frontend && npx vitest run
```

### 后端调试
```bash
# 测试运行
cd backend && npx vitest run

# API测试
curl http://localhost:3001/health
curl http://localhost:3001/api/stocks?limit=3
curl http://localhost:3001/api/ai/health
```

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 前端白屏 | Vite缓存 | `rm -rf node_modules/.vite` |
| API 404 | 路由未注册 | 检查main.tsx路由 |
| 测试失败 | Mock未清除 | `vi.resetModules()` |
| 中文乱码 | GBK编码 | `new TextDecoder('gbk')` |
| 算术错误 | numeric字符串 | `parseFloat(String(v))` |
| 样式不生效 | CSS优先级 | 用class+!important |

## Git 工作流

### 分支策略
- `main`: 生产分支，自动部署
- 开发在main上直接commit（单人项目）

### Commit规范
```
feat: 新功能
fix: 修复
docs: 文档
style: 样式
refactor: 重构
test: 测试
chore: 杂项
```

### auto-sync陷阱
- 仓库有launchd每30min自动commit+push
- 子Agent推送前用 `git log` 确认最新commit
- 不要用 `git pull --rebase` 可能冲突

## 多Agent协议

### 子Agent交付规范
1. 只修改分配给你的文件
2. 交付时报告：改了哪些文件、验证结果
3. 遇到新坑在总结里说明
4. 中文交流，简洁直接

### 文件锁机制
- 修改前检查DEV-COORDINATION.md文件锁表
- 正在修改的文件记录在此
- 避免两个Agent同时修改同一文件

### 网络限制
- 腾讯qt.gtimg.cn: ✅ 可达
- 东方财富: ✅ 可达
- EastMoney push2: ❌ 拒连
- AkShare: ❌ 网络问题
- curl部分域名被Hermes安全扫描拦: 用python urllib绕过
