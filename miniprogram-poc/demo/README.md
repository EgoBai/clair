# 澄观 Clair 小程序 POC · 最小可跑 Demo（阶段 0）

> Taro 4.x (React) + NutUI React Taro + echarts（canvas 2d 直连）+ Zustand(Taro.storage) + Taro.request。
> 范围：**行情简化页 + AI 流式页 + 我的（最小版）**。数据全部来自真实后端接口，无假数据。

## 目录结构

```
demo/
├── config/index.js             Taro 4 编译配置（375 设计宽 / webpack5）
├── project.config.json         微信开发者工具工程配置（appid 占位 touristappid）
├── src/
│   ├── app.tsx / app.config.ts / app.scss / index.html
│   ├── theme/tokens.ts         深色令牌（映射 frontend/src/styles/theme.ts）
│   ├── services/
│   │   ├── request.ts          Taro.request 封装（BaseURL / Bearer 注入 / 401 刷新重放）
│   │   ├── api.ts              真实接口调用（market/realtime、market/kline、notifications、user/login）
│   │   └── sse.ts              AI SSE 消费（enableChunked + onChunkReceived + 手动解析）
│   ├── store/useMarketStore.ts Zustand + Taro.storage persist（复用 Web Store 逻辑）
│   ├── components/EcChart/     echarts canvas 2d 封装（按需引入，控制主包体积）
│   └── pages/
│       ├── market/             行情简化页（指数卡 + 涨跌分布 + 1 张 K 线图）
│       ├── ai-chat/            AI 流式对话页（逐字输出）
│       └── profile/            我的页（登录态 + 通知中心入口）
```

## 运行前提（重要 · 诚实说明）

**本骨架在交付沙箱中无法实际编译/运行**，原因与补齐方式如下：

| 前提 | 沙箱状态 | 补齐方式 |
|---|---|---|
| 微信开发者工具 | ❌ 未安装 | 本地安装后导入本目录 |
| npm 外网 | ❌ 受限 | 真实网络环境执行 `npm install` |
| Taro 编译产物 | ❌ 未生成 `dist/` | 执行 `npm run build:weapp` |
| 后端服务 | ⚠️ 需自行启动 | 仓库根目录 `backend` `npm run dev`（端口 3001） |
| 真机 SSE 验证 | ❌ 无真机 | 见 `docs/03-integration-checklist.md` A 项 |

> 因此：**代码以源码交付，未经编译验证**，不保证零报错；运行时如遇 Taro/依赖版本细节差异，
> 以 `npm install` 实际解析的版本为准微调（版本号用 `^` 区间，已尽量对齐 Taro 4 + React 18）。

## 运行步骤

```bash
# 1. 安装依赖（需外网）
cd miniprogram-poc/demo
npm install

# 2. 配置后端地址
#    编辑 src/services/request.ts 的 BASE_URL：
#    真机调试改为局域网 IP，如 http://192.168.x.x:3001
#    （开发者工具需勾选「详情 → 本地设置 → 不校验合法域名」）

# 3. 编译为微信小程序
npm run build:weapp        # 一次性构建，产物在 dist/
# 或监听模式
npm run dev:weapp

# 4. 导入微信开发者工具
#    打开开发者工具 → 导入项目 → 选择 miniprogram-poc/demo 目录
#    （project.config.json 已指向 dist/，appid 用测试号即可）
```

## 三个技术未知的验证点

1. **React18 + Zustand 跑通**：`src/app.tsx` + `src/store/useMarketStore.ts`（persist 换成 Taro.storage）。
2. **AI SSE 零后端改造**：`src/services/sse.ts` 用 `wx.request({enableChunked:true})` + `onChunkReceived`
   累积解析 `data: {json}\n\n` → 逐字输出；结束帧 `data: [DONE]`。
   - ⚠️ `enableChunked` 跨端（iOS/Android/开发者工具）有差异，**必须真机验证**（联调清单 A 项）。
3. **echarts 1 张图**：`src/components/EcChart` 用 canvas 2d 直连 + echarts/core 按需引入，
   K 线 option 由 `/api/market/kline` 真实数组构建（`candlestick` + `bar` 成交量）。

## 诚实降级（红线）

- 所有数据取自真实接口；接口不可达 / `dataSource === 'unavailable'` 时，页面展示**诚实空态**（灰字文案），**绝不回填演示数据**。
- 行情简化页：`/api/market/realtime` + `/api/market/kline` 均失败 → 指数卡/K 线区显示「暂不可达」空态。
- AI 流式页：后端错误帧 `{"content":"\n\n⚠️ AI服务暂时不可用"}` 原样渲染，不伪造内容。

## 已知待补（POC 阶段 0 不实现）

- TabBar 图标资源（`app.config.ts` 中 `iconPath` 留空，需补 3 组 tab 图标）。
- 通知列表页（阶段 0 仅「我的」页未读角标入口，列表进阶段 1）。
- 自选 / 个股详情（阶段 1）。
