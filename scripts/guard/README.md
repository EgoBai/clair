# scripts/guard —— 跨端「诚实红线」门禁

> 本目录承载**后端供数路径的伪数据门禁**，与前端静态门禁 `frontend/scripts/ui-guard/**` 互补，不替代。

## 1. 这门禁要解决什么问题（背景）

项目此前只有前端静态门禁 `frontend/scripts/ui-guard/{ast-scan.mts,baseline-scan.mts}`。核验其 `lib.mts` 可知：`ROOT = frontend/`、`TSCONFIG = frontend/tsconfig.json`，**作用域硬绑在 `frontend/`**，只扫 `frontend/src` 的静态 AST / 正则（死 `useState`、未声明标识符、路由环路、NaN 渲染、维度键数量）。

它**覆盖不到**两类真实缺陷：

1. **后端供数路径的伪数据** —— 典型是 `backend/src/api/lockup-shares.ts` 曾用 `Math.random` 编造解禁日期 / 股数 / 市值 / 比例 / 股东，并经 `/lockup/calendar`、`/lockup/rank` 直接对外供数（登记为 **IP-12，P0**）。接口能通、返回结构也对，**但数值是编的** —— 前端静态门禁对此完全无感。
2. **`dataSource` 诚实降级契约缺失** —— 项目既有范式：供数端点响应必须含 `dataSource`；非 `real` 时必须带 `notes` 显性标注降级原因（参考实现 `backend/src/api/margin.ts`、`backend/src/api/screener.ts`）。缺失该契约的端点无法被机器识别为「诚实降级」，容易演化成「悄悄造假」。

本门禁就是为捕获「**接口通、数据假**」这类缺陷而装上的机器闸门。

## 2. 两条规则的判据

### 规则 A —— 分域伪数据扫描（`Math.random`）

- 扫描范围：`backend/src/**` 与 `frontend/src/**` 下的 `*.ts` / `*.tsx`。
- 检测模式：`Math.random`。
- **按路径分域**（关键：这不是"零容忍全局禁止" —— 蒙特卡洛 / 相关性 / 风险预算等计算引擎**本体就需要随机**，只是应可播种）：

| 域 | 路径判据 | 等级 |
|---|---|---|
| 豁免域 | 路径含 `_archived` / `.dead-code` / `.bak` / `.test.` / `.spec.` / `__tests__` / `seeds/` | 不报（仅计数） |
| **供数路径** | 路径含 `backend/src/api/` 或 `backend/src/services/` | **RED** |
| 其它 | 其余（前端 utils 引擎、组件等） | YELLOW |

输出每条例：`相对路径:行号` + 该行内容（截断 120 字符）。

**分域理由**：`api/` 与 `services/` 是**对外供数的最近层**，此处的随机数几乎必然表现为「编造的业务数值」，是红线；而前端 `utils/` 下的引擎即便用了随机，也多为算法本体（如蒙特卡洛路径模拟），属**改进项（应可播种）而非红线**，故降为 YELLOW 待评估。

**注释感知（本实现的一个明确取舍）**：位于**注释内**的 `Math.random` 提及（如 `* 红线：原实现全量 Math.random 伪数据，已移除`）不产生任何运行期伪数据，若判为红线即为假阳性、会击穿门禁可信度。脚本用一个小状态机（`scripts/guard/honesty-scan.mjs:89` `computeCommentMask`）为每字符打注释掩码，把「注释提及」单列一表、**不计入 RED/YELLOW 违规数**，但仍透明列出。这也是 `lockup-shares.ts:4` 归入注释表而非 RED 表的原因。

### 规则 B —— `dataSource` 契约缺失扫描

- 扫描范围：`backend/src/api/*.ts`（**仅该目录一层**）。
- 对每个文件统计：`router.(get|post|put|delete)(` 出现次数 **N**（正则），`dataSource` 出现次数 **M**。
- 判据：`N > 0 && M === 0` → 标记 **`CONTRACT-MISSING`**（列文件 + N + 说明「该文件有 N 个路由但全文无 `dataSource` 字样，疑似未遵守诚实降级契约」）。

**这条规则必有误报** —— 纯鉴权 / 健康检查 / meta / docs 端点本就不供数（如 `health.ts`）。因此第一版**只列出、不判死**，供主理人建白名单。

## 3. 为什么第一版是 NON-BLOCKING（非阻断）

RED/YELLOW 的命中里混有大量**合法随机**（`requestId` 生成、`auditId` 生成等），规则 B 的 31 个命中里也难免混有非供数端点。**在白名单定稿之前直接判死，只会制造噪声、逼迫开发者用 `// eslint-disable` 式的方式绕过门禁**，反而降低真实性。因此第一版先**产证据**：把全部命中如实落盘到基线报告，退出码恒为 **0**。

## 4. 后续如何转阻断（allowlist 机制）

1. 主理人评审 `scripts/guard/honesty-baseline.md`，逐条裁决；合法命中写入 `scripts/guard/allowlist.json`（**本 Ticket 先不创建**，仅预留约定）。
2. 预期 `allowlist.json` 形态（示意，**尚未生效**）：
   ```json
   {
     "version": 1,
     "rules": {
       "A": { "entries": [{ "file": "backend/src/services/logger.ts", "line": 242, "reason": "requestId 生成" }] },
       "B": { "files": ["backend/src/api/health.ts"] }
     }
   }
   ```
3. 脚本读取 allowlist 并对未豁免命中 `process.exit(1)`，即从"非阻断"切为"阻断级"。
4. 升级时同步更新基线报告中**固定那一行状态声明**：由 `NON-BLOCKING` 改为 `BLOCKING`。

## 5. 运行方式

```bash
# 必须从仓库根执行
node scripts/guard/honesty-scan.mjs
# 或
npm run guard:honesty
```

- 产物：`scripts/guard/honesty-baseline.md`（**幂等覆盖写，不追加**）。
- 退出码：当前恒为 `0`（NON-BLOCKING）。
- 依赖：**零外部依赖**，纯 Node ESM，仅用内置 `node:fs` / `node:path` / `node:url`。

## 6. 与既有门禁的关系

| | 前端静态门禁 `frontend/scripts/ui-guard` | 本门禁 `scripts/guard/honesty-scan.mjs` |
|---|---|---|
| 作用域 | `frontend/`（硬绑） | 跨端：`backend/src` + `frontend/src` |
| 手段 | 静态 AST / 正则 | 分域正则 + 契约计数 |
| 关注点 | 死代码、未声明标识符、路由环、NaN 渲染 | **伪数据（`Math.random` 供数）**、**`dataSource` 契约缺失** |
| 关系 | —— | **互补，不替代**；两者应并行接入 CI |

> 注：仓库根 `scripts/ui-quality-scan.ts` 为**死脚本**（扫描不存在的 `<repo>/src`，且未接入任何 npm script 或 CI），本门禁**未复用、未修改、未删除**它。
