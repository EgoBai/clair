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
| **供数路径** | 路径含 `backend/src/api/` 或 `backend/src/services/` 或 `backend/src/db/` | **RED** |
| 其它 | 其余（前端 utils 引擎、组件等） | YELLOW |

输出每条例：`相对路径:行号` + 该行内容（截断 120 字符）。

**分域理由**：`api/`、`services/`、`db/` 是**对外供数的最近层**，此处的随机数几乎必然表现为「编造的业务数值」，是红线；而前端 `utils/` 下的引擎即便用了随机，也多为算法本体（如蒙特卡洛路径模拟），属**改进项（应可播种）而非红线**，故降为 YELLOW 待评估。

> `backend/src/db/` 于 R0′-1 A.1 依主理人裁决升为 RED：`InMemoryDatabase` 在 PG 不可用时（`dbFactory` 默认 `memory`）会为 5000+ 只股票生成**伪 K 线 + 伪估值**，且 `isMemoryMode()` 从不用于设置 `dataSource` —— 与 IP-12 同类且影响面更大。

**非代码提及感知（本实现的一个明确取舍）**：位于**注释内**或**字符串文本内**的 `Math.random` 提及（如 `* 红线：原实现全量 Math.random 伪数据，已移除`、`console.warn('...Math.random 伪造...')`）不产生任何运行期伪数据，若判为红线即为假阳性、会击穿门禁可信度。脚本用一个小状态机（`honesty-scan.mjs` 的 `computeNonCodeMask`）为每字符打掩码（0=代码 / 1=注释 / 2=字符串文本），把「非代码提及」单列一表、**不计入 RED/YELLOW 违规数**，但仍透明列出。这也是 `lockup-shares.ts:4` 归入提及表而非 RED 表的原因。

> 该掩码正确处理 **模板字符串 `${}` 插值按代码计**（否则 `` `user_${Math.random()}` `` 这类真实调用会漏报），并识别**正则字面量**（否则 `.replace(/"/g, ...)` 会让状态机失步、把后续真实调用误判为字符串文本而漏报）。

### 规则 B —— `dataSource` 契约缺失扫描

- 扫描范围：`backend/src/api/*.ts`（**仅该目录一层**）。
- 对每个文件统计：`router.(get|post|put|delete)(` 出现次数 **N**（正则），`dataSource` 出现次数 **M**。
- 判据：`N > 0 && M === 0` → 标记 **`CONTRACT-MISSING`**（列文件 + N + 说明「该文件有 N 个路由但全文无 `dataSource` 字样，疑似未遵守诚实降级契约」）。

**这条规则必有误报** —— 纯鉴权 / 健康检查 / meta / docs 端点本就不供数（如 `health.ts`）。因此第一版**只列出、不判死**，供主理人建白名单。

## 3. 为什么默认是 NON-BLOCKING（非阻断）

RED/YELLOW 的命中里混有大量**合法随机**（`requestId` 生成、`auditId` 生成等），规则 B 的 31 个命中里也难免混有非供数端点。**在白名单定稿之前直接判死，只会制造噪声、逼迫开发者用 `// eslint-disable` 式的方式绕过门禁**，反而降低真实性。因此默认**产证据**：把全部命中如实落盘到基线报告，退出码恒为 **0**；阻断行为由 `--strict` 显式开启。

## 4. allowlist 机制（已落地）

### 4.1 文件与 schema

`scripts/guard/allowlist.json`：

```json
{
  "version": 1,
  "updatedAt": "2026-09-21",
  "entries": [
    {
      "id": "AL-001",
      "path": "backend/src/api/user.ts",
      "match": "user_${Date.now()}_",
      "category": "id-generation",
      "reason": "请求追踪/实体 ID 生成，非供数数值",
      "clearingTicket": null,
      "expiresAt": "2027-03-20"
    }
  ]
}
```

`category` **仅允许**枚举：`id-generation` / `stochastic-algorithm` / `behavioral-random` / `unwired-module` / `acknowledged-debt`。出现枚举外类别时，该条**判为未豁免**并计入失败。

### 4.2 匹配策略（防门禁脆断）

以 **`path` + `match`（源行片段）** 为主判据，**行号只作提示、不作判据**。理由：行号随代码移动必然漂移，若按行号严格匹配，每次无关编辑都会把门禁打红，后人只会绕过它。

### 4.3 到期机制（防白名单腐烂，本机制的核心价值）

每条豁免**必须**有 `expiresAt`；**到期未清偿则该条自动转计为 RED 违规**，并在报告中单列「过期豁免」。

- `id-generation` / `stochastic-algorithm` / `behavioral-random` / `unwired-module`：给远期到期。
- `acknowledged-debt`：给 **14 天后**到期（承认欠账 + 挂倒计时，到期自动翻红逼清偿）。

### 4.4 转阻断

```bash
node scripts/guard/honesty-scan.mjs --strict   # 存在未豁免 RED 或过期豁免 → exit 1
```

默认（无参）维持 exit 0 非阻断。CI 的 `honesty-guard` job **已挂 `--strict`**，但 job 级 `continue-on-error: true` 使其对合并非阻断。

> ⚠️ **转硬阻断前必读（已核实的坑）**：`continue-on-error: true` 会让该 job 在分支保护看来**始终是绿勾**——GitHub 认可的通过态只有 `success` / `skipped` / `neutral`，而 `continue-on-error` 正是把失败归入 `success`。因此**把本 job 设为 required check 而不摘掉 `continue-on-error`，等于零保护**。
> 转阻断必须**同时**做两件事：① 摘掉 `continue-on-error`；② 实测一次「故意失败能否真的挡住 PR」。

## 5. 运行方式

```bash
# 必须从仓库根执行
node scripts/guard/honesty-scan.mjs            # 非阻断，exit 0
node scripts/guard/honesty-scan.mjs --strict   # 未豁免 RED / 过期豁免 → exit 1
# 或
npm run guard:honesty                          # 等价于无参调用
```

- 产物：`scripts/guard/honesty-baseline.md`（**幂等覆盖写，不追加**）。
- 依赖：**零外部依赖**，纯 Node ESM，仅用内置 `node:fs` / `node:path` / `node:url`。

## 6. 与既有门禁的关系

| | 前端静态门禁 `frontend/scripts/ui-guard` | 本门禁 `scripts/guard/honesty-scan.mjs` |
|---|---|---|
| 作用域 | `frontend/`（硬绑） | 跨端：`backend/src` + `frontend/src` |
| 手段 | 静态 AST / 正则 | 分域正则 + 契约计数 |
| 关注点 | 死代码、未声明标识符、路由环、NaN 渲染 | **伪数据（`Math.random` 供数）**、**`dataSource` 契约缺失** |
| 关系 | —— | **互补，不替代**；两者应并行接入 CI |

> 注：仓库根 `scripts/ui-quality-scan.ts` 为**死脚本**（扫描不存在的 `<repo>/src`，且未接入任何 npm script 或 CI），本门禁**未复用、未修改、未删除**它。
