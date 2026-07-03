## 📋 S4 任务拆解: vendor-antd 1.1MB → <1MB

### 根因
antd全量打包, 包含DatePicker/Table/Form/Select等重型组件,
即使某个页面不用也打包进vendor-antd。

### 策略
分3步, 每步独立可验证:

### 子任务A: antd CSS单独提取 (预估节省 30KB)
- 在vite.config.ts的manualChunks中, 识别antd CSS并单独分包
- 当前CSS 41KB和antd JS混在一起
- 验收: dist/assets/css/出现vendor-antd CSS文件

### 子任务B: DatePicker/TimePicker延迟加载 (预估节省 80KB)
- 搜索所有使用DatePicker的文件
- 如果DatePicker只在BacktestPage使用, 改为动态import
- 验收: vendor-antd chunk缩小

### 子任务C: 图标按需进一步优化 (预估节省 30KB)
- 检查@ant-design/icons是否已tree-shake
- 确认没有 import * from '@ant-design/icons'
- 验收: 构建后无警告

### 预期
- vendor-antd: 1.1MB → ~950KB (-150KB)
- 总 dist: 3.1MB → ~2.95MB

### Agent 分派计划
| Agent | 子任务 | 工具集 | 预计耗时 |
|-------|--------|--------|----------|
| A | 子任务A: CSS分离 | terminal | 3min |
| B | 子任务B: DatePicker延迟加载 | terminal | 3min |
| C | 子任务C: 图标检查 | terminal | 2min |
