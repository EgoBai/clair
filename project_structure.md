# A股行情分析网站 - 项目结构

## 🎯 项目目标
实时A股行情分析平台，提供行情展示、技术分析、选股策略等功能。

## 📁 项目结构
```
a-stock-website/
├── frontend/                    # 前端应用
│   ├── src/
│   │   ├── components/         # 组件
│   │   │   ├── Market/        # 行情组件
│   │   │   ├── Analysis/      # 分析组件
│   │   │   └── Common/        # 通用组件
│   │   ├── pages/             # 页面
│   │   │   ├── Home/          # 首页
│   │   │   ├── Market/        # 行情页
│   │   │   └── Analysis/      # 分析页
│   │   ├── services/          # 服务层
│   │   │   ├── api.js         # API调用
│   │   │   └── websocket.js   # WebSocket
│   │   └── utils/             # 工具函数
│   ├── public/                # 静态资源
│   └── package.json           # 依赖配置
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── controllers/       # 控制器
│   │   ├── services/         # 业务逻辑
│   │   ├── models/           # 数据模型
│   │   ├── routes/           # 路由
│   │   └── utils/            # 工具函数
│   ├── db/                   # 数据库
│   │   ├── migrations/       # 迁移文件
│   │   └── seeds/           # 种子数据
│   └── package.json          # 依赖配置
├── data-collector/            # 数据采集服务
│   ├── collectors/           # 数据采集器
│   ├── processors/           # 数据处理器
│   └── package.json          # 依赖配置
├── docker-compose.yml         # 容器编排
└── README.md                  # 项目说明
```

## 🔧 技术栈
- **前端**: React 18 + TypeScript + Ant Design
- **后端**: Node.js + Express + TypeScript
- **数据库**: PostgreSQL + Redis
- **消息队列**: RabbitMQ
- **数据源**: 腾讯/新浪/东方财富API
- **监控**: Grafana + Prometheus

## 📅 开发阶段

### 阶段1: 基础架构搭建 (当前)
- [ ] 前后端项目初始化
- [ ] 数据库设计
- [ ] 基础API开发
- [ ] 数据采集模块

### 阶段2: 核心功能开发
- [ ] 实时行情展示
- [ ] 技术分析工具
- [ ] 选股筛选器
- [ ] 用户系统

### 阶段3: 高级功能
- [ ] 量化策略回测
- [ ] 投资组合管理
- [ ] 预警系统
- [ ] 数据可视化

### 阶段4: 生产部署
- [ ] 性能优化
- [ ] 安全加固
- [ ] 监控告警
- [ ] 文档完善

## 📊 数据架构
```
数据流: 数据源 → 数据采集器 → 消息队列 → 数据处理器 → 数据库 → API → 前端
```

## 🚀 快速开始
```bash
# 启动所有服务
docker-compose up -d

# 或分别启动
cd frontend && npm run dev
cd backend && npm run dev
```

## 📈 进度跟踪
- **开始时间**: 2026-03-18
- **当前阶段**: 阶段1 - 基础架构搭建
- **里程碑**: M1 - 基础架构完成
- **预计完成**: 2026-03-22