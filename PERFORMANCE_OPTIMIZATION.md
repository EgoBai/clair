# 前端性能优化建议清单
> 分析日期: 2026-07-01 | 项目: a-stock-website

---

## 一、构建产物现状

| 项目 | 大小 | Gzip后 |
|------|------|--------|
| 总dist | 3.0MB | - |
| vendor-echarts | 1.3MB | 439KB |
| vendor-antd | 1.1MB | 344KB |
| vendor-misc | 140KB | 45KB |
| index.js(入口) | 80KB | 25KB |
| CSS(index.css) | 41KB | 9KB |

JS总体积: 2.9MB, Gzip约900KB+

---

## 二、严重问题 🔴

### P0: ECharts全量引入 (1.3MB/439KB gzip)
- 现象: vendor-echarts chunk包含echarts核心+zrender+完整recharts库(77处引用)
- 根因: vite.config.ts中manualChunks的recharts匹配规则失效，recharts被合并到vendor-echarts
- 建议1: ECharts按需引入，改用echarts/core+按需注册组件(LineChart/BarChart/PieChart/CandlestickChart等)，预计减少60-70%体积
- 建议2: 修复recharts分chunk规则

### P1: Ant Design体积过大 (1.1MB/344KB gzip)
- 建议1: 检查@ant-design/icons是否全量打包
- 建议2: 对不常用组件做动态import

---

## 三、中等问题 🟡

### P2: 首屏CSS 41KB
cssCodeSplit已开启但效果有限，检查组件是否存在入口静态import

### P3: 懒加载重复定义
main.tsx和routes/index.tsx都有lazy import，建议统一到routes/index.tsx

### P4: 潜在无用依赖
| 依赖 | 说明 |
|------|------|
| xlsx(~200KB) | 仅bloombergExportEngine.ts使用，建议延迟加载 |
| file-saver | 仅配合xlsx用 |
| reactflow(~200KB) | 仅IndustryMapPage使用，已lazy隔离✅ |
| socket.io-client | 仅websocket.ts，评估是否可用SSE替代 |

---

## 四、API性能 ✅
| API | 响应时间 |
|-----|----------|
| /api/stocks?pageSize=6000 | 130ms |
| /api/market/summary | 139ms |
| /api/sectors/momentum | 7ms |

结论: 后端API响应均良好，无需优化

---

## 五、优化收益评估
| 优化项 | 节省(gzip) | 难度 | 优先级 |
|--------|-----------|------|--------|
| ECharts按需引入 | ~250-300KB | 中 | P0 |
| 修复recharts分chunk | 利于缓存 | 低 | P0 |
| Antd图标tree-shake | ~50KB | 低 | P1 |
| xlsx延迟加载 | ~200KB(该页面) | 低 | P2 |
| CSS进一步分割 | ~15KB | 中 | P3 |

预估: 首屏gzip从~900KB降至~550KB，减少约40%

---

## 六、已做到的优秀实践 ✅
- 所有页面路由React.lazy+Suspense
- Vite分包策略合理
- Terser压缩启用+drop_console+drop_debugger
- sourcemap已关闭/CSS分割已启用
- antd命名导入(tree-shaking友好)
- 静态资源少(仅2个PWA图标23KB)
