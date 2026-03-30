# 贡献指南

## 开发环境搭建

### 前置要求

- Node.js >= 18
- PostgreSQL >= 14
- npm >= 9

### 安装

```bash
# 克隆仓库
git clone <repo-url>
cd a-stock-website

# 安装后端依赖
cd backend/src && npm install

# 安装前端依赖
cd frontend && npm install

# 安装根目录工具
cd .. && npm install
```

### 启动开发环境

```bash
# 启动数据库 (需提前创建数据库)
psql -U postgres -c "CREATE DATABASE a_stock_db;"

# 初始化数据库表
cd backend/src && npm run db:init

# 启动后端 (端口 3001)
cd backend/src && npm run dev

# 启动前端 (端口 5173)
cd frontend && npm run dev
```

## 项目结构

```
a-stock-website/
├── backend/src/           # 后端 Express + TypeScript
│   ├── api/               # API 路由
│   ├── middleware/         # 中间件 (验证、限流、安全)
│   ├── utils/             # 工具类 (搜索引擎、缓存、AI分析)
│   ├── db/                # 数据库
│   ├── __tests__/         # 后端测试
│   └── websocket/         # WebSocket 服务
├── frontend/              # 前端 React + TypeScript + Vite
│   ├── src/
│   │   ├── components/    # 组件
│   │   ├── pages/         # 页面
│   │   ├── hooks/         # 自定义 Hooks
│   │   ├── services/      # API 服务
│   │   ├── store/         # 状态管理 (Zustand)
│   │   ├── utils/         # 工具函数
│   │   └── __tests__/     # 前端测试
│   └── e2e/               # E2E 测试
├── shared/                # 前后端共享类型和工具
├── knowledge-base/        # 设计文档和知识库
└── docs/                  # 项目文档
```

## 开发规范

### 代码风格

- **TypeScript 严格模式**: 避免使用 `any`，优先使用具体类型
- **ESLint + Prettier**: 提交前自动格式化
- **命名规范**:
  - 组件: PascalCase (`HomePage.tsx`)
  - 函数/hooks: camelCase (`useWebSocket.ts`)
  - 类型: PascalCase (`interface StockQuote`)
  - 常量: UPPER_SNAKE_CASE (`MAX_RETRIES`)

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Type 类型:**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式 (不影响功能)
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试
- `chore`: 构建/工具变更

**示例:**
```
feat(charts): 添加分时图组件
fix(api): 修复搜索结果排序问题
docs(readme): 更新安装说明
```

### 分支策略

- `main` - 生产分支，只接受 PR merge
- `develop` - 开发主分支
- `feature/*` - 功能分支
- `fix/*` - 修复分支
- `hotfix/*` - 紧急修复

### 测试

```bash
# 运行后端测试
cd backend/src && npm test

# 运行前端测试
cd frontend && npm test

# 运行 E2E 测试
cd frontend && npx playwright test

# 测试覆盖率
cd backend/src && npm test -- --coverage
```

**测试覆盖率目标**: 80%+

### PR 规范

1. **标题**: 使用 Conventional Commits 格式
2. **描述**: 说明变更内容、原因和影响
3. **检查清单**:
   - [ ] 代码通过 lint 检查
   - [ ] 所有测试通过
   - [ ] 新增代码有测试覆盖
   - [ ] 类型定义完整 (无 `any`)
   - [ ] 文档已更新 (如需要)
4. **Review**: 至少 1 人 approve 后合并

## 常见任务

### 添加新 API

1. 在 `backend/src/api/` 创建路由文件
2. 在 `backend/src/app.ts` 注册路由
3. 在 `shared/types.ts` 添加相关类型
4. 在 `frontend/src/services/api.ts` 添加前端调用
5. 编写测试 `backend/src/__tests__/`

### 添加新页面

1. 在 `frontend/src/pages/` 创建页面组件
2. 在 `frontend/src/main.tsx` 添加路由
3. 在 `frontend/src/components/Layout/AppLayout.tsx` 添加导航
4. 在 `frontend/src/i18n/index.tsx` 添加翻译

### 添加新图表组件

1. 在 `frontend/src/components/Charts/` 创建组件
2. 使用 Recharts 或 ECharts
3. 遵循现有的图表样式规范
4. 添加 loading 和 empty 状态

## 性能注意事项

- 避免不必要的 re-render (使用 `React.memo`, `useMemo`, `useCallback`)
- 大列表使用虚拟滚动
- API 响应使用缓存
- 图片使用懒加载
- 代码分割 (已配置 Vite 分包)

## 安全注意事项

- 不要在前端暴露敏感数据
- 所有用户输入必须验证
- SQL 查询使用参数化
- 保持依赖更新 (定期运行 `npm audit`)
