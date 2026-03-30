# Changelog

All notable changes to the A股行情分析网站 project.

## [3.0.0] - 2026-03-30 (Round 104 - 用户系统增强)

### 新增
- **用户认证系统增强** (`utils/userEnhanced.ts` + `components/User/`)
  - 密码重置流程（邮箱验证、30分钟有效期、频率限制、防枚举）
  - 邮箱验证系统（24小时有效期、60秒冷却重发、功能限制提示）
  - Session管理（最多5设备、7天有效期、远程登出、批量登出）
  - 登录安全（5次/15分钟锁定、IP异常检测、登录日志）
- **前端用户UI组件** (`components/User/`)
  - LoginPage: 邮箱验证、记住我、加载状态、Enter键提交
  - RegisterPage: 密码强度指示器、昵称验证、确认密码校验
  - PasswordResetPage: 四步重置流程（输入邮箱→邮件已发送→重置密码→成功）
  - SessionManager: 设备列表、当前设备标记、远程登出确认
- **认证服务** (`services/auth.ts`)
  - Token自动管理（localStorage、自动刷新、过期检测）
  - authFetch: 带认证的请求封装
  - 状态订阅机制：登录状态变化通知
  - rememberMe支持（30天 vs 1小时）

### 测试
- 新增 87 个测试（后端49 + 前端38）
- 总测试数: 18037

## [2.1.0] - 2026-03-24 (第17轮迭代)

### 新增
- **大宗交易数据** (`api/block-trades.ts` + `BlockTradesPage.tsx`)
  - 大宗交易列表（日期/股票筛选、分页）
  - 概览统计（笔数/金额/折溢价分布）
  - 个股大宗交易历史
  - 溢价/折价分布可视化
- **股东增减持数据** (`api/shareholder-changes.ts` + `ShareholderChangesPage.tsx`)
  - 增/减/新/退 4种变动类型
  - 机构/个人股东类型区分
  - 概览排名
  - 四色统计卡片
- **限售股解禁日历** (`api/lockup-shares.ts` + `LockupCalendarPage.tsx`)
  - 日历组件标注解禁事件
  - 解禁市值排行
  - 4种解禁类型
  - 高占比红色警示
- **AI智能选股** (`api/ai-stock-selection.ts` + `AIStockSelectionPage.tsx`)
  - 5种策略：价值/成长/技术/动量/逆向
  - 个股AI诊断（5维度评分+四档评级）
  - 行业轮动分析（10行业+四阶段模型）
  - 智能预警建议
- **渲染性能优化工具** (`utils/renderOptimize.ts`)
  - 虚拟滚动、批量更新、节流渲染、稳定引用
  - RenderProfiler 性能分析器
  - DataCache 前端数据缓存
  - 分块渲染（不让主线程阻塞）

### 改进
- 后端新增 4 个 API 路由（9个端点）
- 前端新增 4 个页面 + 4 个路由
- 侧边栏新增 4 个菜单项
- API 层新增 14 个函数
- 共享类型扩展 7 个接口
- 新增 61 个测试用例（后端37 + 前端24）
- 新增 4 篇设计文档
- 版本升级至 v1.6.0

### 文件清单（21个文件）
| 文件 | 操作 |
|------|------|
| `backend/src/api/block-trades.ts` | 新建 |
| `backend/src/api/shareholder-changes.ts` | 新建 |
| `backend/src/api/lockup-shares.ts` | 新建 |
| `backend/src/api/ai-stock-selection.ts` | 新建 |
| `frontend/src/pages/BlockTradesPage.tsx` | 新建 |
| `frontend/src/pages/ShareholderChangesPage.tsx` | 新建 |
| `frontend/src/pages/LockupCalendarPage.tsx` | 新建 |
| `frontend/src/pages/AIStockSelectionPage.tsx` | 新建 |
| `frontend/src/utils/renderOptimize.ts` | 新建 |
| `backend/src/__tests__/blockTradesAndAI.test.ts` | 新建 |
| `frontend/src/__tests__/renderOptimize.test.ts` | 新建 |
| `knowledge-base/design/BLOCK-TRADES-DESIGN.md` | 新建 |
| `knowledge-base/design/SHAREHOLDER-AND-LOCKUP-DESIGN.md` | 新建 |
| `knowledge-base/design/AI-STOCK-SELECTION-DESIGN.md` | 新建 |
| `knowledge-base/design/RENDER-PERFORMANCE.md` | 新建 |
| `backend/src/app.ts` | 更新 |
| `frontend/src/main.tsx` | 更新 |
| `frontend/src/components/Layout/AppLayout.tsx` | 更新 |
| `frontend/src/services/api.ts` | 更新 |
| `frontend/src/utils/index.ts` | 更新 |
| `shared/types.ts` | 更新 |

## [2.0.0] - 2026-03-24

### 🎉 终极打磨版 - 第10批迭代

#### 新增
- **图表主题系统** (`utils/chartTheme.ts`)
  - 支持浅色/暗色两套完整主题
  - 红涨绿跌标准配色（A股规范）
  - K线、均线、MACD/KDJ/RSI/BOLL 独立配色
  - 自动检测系统暗色偏好
  - 主题变更订阅机制
- **图表性能优化** (`utils/chartPerformance.ts`)
  - LTTB 采样算法（保留视觉特征的降采样）
  - 均匀采样 + 自适应采样（波动率驱动密度）
  - 大数据分块处理（不阻塞主线程）
  - 虚拟列表计算工具
  - 渲染性能分析器（慢帧检测）
- **增强型错误边界** (`EnhancedErrorBoundary.tsx`)
  - 自动重试机制（最多3次）
  - 错误上报与收集
  - HOC 包裹工具 `withErrorBoundary`
  - 开发模式详细错误栈
  - 支持 `resetKeys` 自动重置
- **空状态组件扩展**
  - `EmptyBacktest` - 回测空状态
  - `EmptyPortfolio` - 投资组合空状态
  - `EmptyNews` - 新闻空状态
  - `EmptyScreenerResult` - 选股器无结果
  - `EmptySocial` - 社交讨论空状态
  - `LoadingState` - 统一加载状态
  - `PermissionDeniedState` - 权限不足状态
- **模块 Barrel Exports**
  - `components/Charts/index.ts`
  - `components/Common/index.ts`
  - `hooks/index.ts`
  - `utils/index.ts`
- **测试覆盖**
  - `chartSystem.test.ts` - 图表主题+性能测试 (25+ 用例)
  - `emptyStates.test.tsx` - 空状态+错误边界测试 (30+ 用例)

#### 改进
- **EmptyStates 组件** 新增 7 个预设空状态
- **导入路径规范化** 通过 barrel exports 统一模块导出
- **错误边界** 升级为支持自动重试和错误收集
- **README** 全面更新，反映项目最新状态

#### 文件清单

| 文件 | 操作 | 描述 |
|------|------|------|
| `utils/chartTheme.ts` | 新建 | 图表主题系统 |
| `utils/chartPerformance.ts` | 新建 | 图表性能优化 |
| `components/Common/EnhancedErrorBoundary.tsx` | 新建 | 增强错误边界 |
| `components/Common/EmptyStates.tsx` | 更新 | 新增 7 个空状态 |
| `components/Charts/index.ts` | 新建 | Charts barrel export |
| `components/Common/index.ts` | 新建 | Common barrel export |
| `hooks/index.ts` | 新建 | Hooks barrel export |
| `utils/index.ts` | 新建 | Utils barrel export |
| `__tests__/chartSystem.test.ts` | 新建 | 图表系统测试 |
| `__tests__/emptyStates.test.tsx` | 新建 | 空状态+错误边界测试 |

---

## [1.0.0] - 2026-03-24

### 🏗️ 初始版本 - 9批迭代（12轮）

#### 核心功能
- **实时行情系统** - WebSocket 实时推送、分时图、K线图
- **技术指标引擎** - MACD/KDJ/RSI/BOLL/EMA 计算
- **股票搜索** - 8级智能匹配 + 拼音首字母
- **自选股系统** - 分组管理、拖拽排序
- **选股器** - 多条件组合筛选 + 高级筛选
- **预警系统** - 价格/涨跌幅/成交量预警
- **回测引擎** - 均线交叉/RSI/MACD 三种策略
- **投资组合** - 持仓管理、资产配置饼图
- **新闻资讯** - 分类筛选、情感标签
- **AI 分析** - 行情解读、止盈止损、板块轮动
- **复权引擎** - 前复权/后复权/不复权
- **社交功能** - 投资观点分享
- **国际化** - 中英文双语

#### 工程化
- **安全加固** - OWASP Top 10 全覆盖、SQL注入/XSS检测
- **性能监控** - Web Vitals 6项核心指标
- **PWA 支持** - Service Worker、离线缓存
- **暗色主题** - CSS 变量系统、自动检测
- **响应式设计** - PC/平板/手机全适配
- **无障碍** - WCAG 2.1 AA 标准
- **CI/CD** - GitHub Actions (lint→test→build→deploy)
- **E2E 测试** - Playwright 覆盖核心流程

#### 测试
- 后端：14 个测试文件，150+ 用例
- 前端：11 个测试文件，120+ 用例
- 覆盖：指标计算、搜索、缓存、复权、回测、新闻、安全

#### 文档
- API 文档 (OpenAPI 3.0)
- 部署指南
- 贡献指南
- 用户手册
- 组件 API 文档
- 9 篇设计文档（知识库）
