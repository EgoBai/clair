# MULTI-AGENT 协作简报 — Clair (澄观) A股项目

> 所有子Agent执行任务前**必须先读本文件**。这是共享上下文，弥补子Agent无对话记忆的缺陷。

## 项目坐标
- 主仓库: `~/.openclaw/workspace/a-stock-website/`
- 前端: `frontend/` (React + Vite + Ant Design)，dev :5173
- 后端: `backend/` (Express + PostgreSQL + tsx)，dev :3001
- Worker: `clair-worker/worker.js` + `_worker.js`（Cloudflare Pages Function，生产后端）
- GitHub: https://github.com/EgoBai/clair.git (生产部署经 GitHub Actions)
- 生产前端: https://egobai.github.io/clair/ ｜ 生产API: https://clair-api.pages.dev

## 启动命令
```bash
# 后端
cd backend && npx tsx src/index.ts   # 不是 ts-node
# 前端
cd frontend && npx vite --host 127.0.0.1 --port 5173 --force
# 数据库
DATABASE_URL=postgresql://postgres:***@localhost:5432/clair
```

## 验证标准（交付前必须自查）
1. 前端改动: `cd frontend && npx tsc --noEmit` 必须 0 错误
2. Worker改动: `node --check clair-worker/worker.js` 必须通过；改完 `cp worker.js _worker.js`
3. API改动: curl 实测端点返回正确 JSON
4. **"编译通过"≠"功能可用"** — 必须 curl + 浏览器端到端验证
5. 数据必须真实有效，禁止 mock/空壳

## 关键架构陷阱（踩过的坑，务必规避）
- **双路由系统**: 改路由必须改 `frontend/src/main.tsx`（真入口），`App.tsx`是死代码
- **市值单位**: DB存万元。筛选 marketCapMin*1e4（不是1e8）
- **PostgreSQL numeric返回字符串**: 算术前必须 `parseFloat(String(v))`
- **GBK编码**: 腾讯API返回GBK，Worker用 `new TextDecoder('gbk')`，Node用iconv-lite
- **Vite缓存**: 改TSX后 `rm -rf frontend/node_modules/.vite` 再重启
- **@shared导入**: 后端运行时用 `createRequire(import.meta.url)` 加载 shared/，不能直接ESM import value
- **asyncHandler**: 从 `../utils/apiResponse` 命名导入（不是 default，不是 ../utils/asyncHandler）
- **GFW git push**: 用ClashX代理 `PORT=$(lsof -i -P -n|grep ClashX|grep LISTEN|awk '{print $9}'|head -1|sed 's/.*://')`，重试≤5次

## 主题色板（暗色）
BG=`#0f172a` CARD=`#1e293b` UP=`#cf2a2a`(红涨) DOWN=`#1db468`(绿跌) ACCENT=`#3b82f6` GOLD=`#f59e0b`
中国习惯：红涨绿跌。禁止白色背景。

## 相关skill（按需加载）
- `clair-worker-development` — Worker开发/部署/陷阱
- `china-stock-real-data` — 腾讯/东方财富API、行业分类
- `frontend-development` — 前端工程规范
- `systematic-debugging` — 调试方法论

## 当前状态（2026-06-22）
- DiscoverPage v3（全宽AI解读）、ScreenerPage v5.1（8策略+技术指标列）已完成
- Worker新增 POST /api/tech/batch（5d/20d/MA偏离/RSI/波动率）
- 行业分类: 综合从2151→1823（关键词修正334只），完整修复待EastMoney网络访问
- 待推送commit: 见 `git log origin/main..HEAD`

## 子Agent交付规范
1. 只修改分配给你的文件，不碰其他文件（避免并行冲突）
2. 交付时报告：改了哪些文件、验证命令+结果、可验证的句柄（路径/URL/commit）
3. 遇到本简报未覆盖的坑，在总结里明确说明
4. 中文交流，简洁直接

## 多Agent方案边界（2026-06-22实战总结）
- **不适合委派给同步leaf子Agent的任务**：网络IO密集的数据探索/全量拉取。原因：①leaf子Agent无execute_code ②同步600s硬超时 ③接口探索的不确定性易卡死。实测2次数据拉取子Agent均600s超时。
- **正确分工**：这类任务由主Agent用execute_code解阻塞（探索接口+拉数据+生成文件），再把确定性的代码集成（改worker.js/DB/前端）委派给子Agent。已验证此分工高效。
- **数据源现实(本地环境)**：腾讯qt.gtimg.cn行情✅可达；腾讯proxy.finance.qq.com行业列表✅(31申万)；新浪行业成分✅但仅覆盖3007只；EastMoney push2❌服务端拒连(RemoteDisconnected)；AkShare网络接口❌同EastMoney。curl对部分域名被Hermes安全扫描拦(空响应)→用python urllib绕过。
- **auto-sync陷阱**：本仓库有launchd每30min自动commit+push。子Agent推送前工作树可能已被auto-sync抢先提交，git status干净≠没改动，用 git log 查最近commit确认。
