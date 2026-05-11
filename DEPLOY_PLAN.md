# AStock 部署上线计划

## 架构决策

```
用户 → Vercel (前端 CDN) → Railway (后端 API)
                ↓
          静态资源 (React SPA)
```

| 组件 | 选择 | 原因 |
|------|------|------|
| 前端托管 | Vercel | 免费层充足(100GB带宽)、自动 HTTPS、Git Push 自动部署 |
| 后端托管 | Railway | 免费层($5 credit)、支持 Node.js、自动 HTTPS、简单部署 |
| 域名 | 待定 | 建议 astock.live / astock.pro |
| CI/CD | Vercel + Git | 推送到 main 自动部署，预览部署到 PR |
| 监控 | Vercel Analytics | 免费层包含核心 Web Vitals |

## 执行步骤

### Phase 1: 就绪检查 (当前)
- [ ] GitHub 仓库创建 + 认证
- [ ] Vercel 账号 + CLI 安装
- [ ] 前端构建验证 (`npm run build`)
- [ ] 后端构建验证

### Phase 2: 前端部署 (预计 2h)
- [ ] vercel.json 配置 (SPA 路由、API 代理)
- [ ] 环境变量配置 (后端 API 地址)
- [ ] Vercel 部署
- [ ] 自定义域名绑定

### Phase 3: 后端部署 (预计 2h)
- [ ] Railway/Render 部署
- [ ] 环境变量 (腾讯 API key、数据同步)
- [ ] 健康检查端点
- [ ] CORS 配置生产环境

### Phase 4: 体验优化 (预计 4h)
- [ ] 移动端响应式适配
- [ ] PWA manifest + Service Worker
- [ ] 首屏加载优化 (lazy loading)
- [ ] 微信 JS-SDK 集成(分享卡片)
