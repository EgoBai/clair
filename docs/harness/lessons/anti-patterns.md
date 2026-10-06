# 反模式库：假绿与数据伪造

> 本文件记录本项目**已经真实发生过**的错误模式，供后续开发对照检查。
> 每条都给出：症状 → 根因 → 正确做法 → 如何用门禁防止复发。
>
> 维护要求：新增条目必须附**真实案例**（哪个文件、哪次改动、怎么发现的），
> 不接受 hypothetical 的"可能会发生"。

---

## AP-1测试文件自己定义函数再测自己（自己测自己的假测试）

### 症状

测试文件 `tradingCalendar.test.ts` 与 `tradingCalendarEngine.test.ts` 全绿，
但项目里**根本不存在**交易日历实现。CI 绿灯给出「项目已有交易日历」的错觉。

### 根因

两个测试文件都在**文件内部**重新实现了一遍被测逻辑，然后断言这些内联函数：

```ts
// 假测试：isWeekend 是这个文件自己写的，生产代码从未参与
const isWeekend = (dateStr: string): boolean => {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
};
it('周六应返回true', () => { expect(isWeekend('2026-03-21')).toBe(true); });
```

`rg "isWeekend" backend/src/utils/` 返回空 —— 断言的是一个只存在于测试里的函数。
更严重的是，`tradingCalendarEngine.test.ts` 内联的 `HOLIDAYS_2026` **事实错误**：
把春节写成 1/26–2/1（交易所公告为 **2/15–2/23**，差约 3 周），
并断言 `isHalfDay('2026-01-25')`（A 股无半日交易机制，且 2026 除夕是 2/16）。
即「看起来有、实际没有、而且是错的」。

### 正确做法

- 断言必须打在**生产模块**上：`import { isTradingDay } from '../utils/tradingCalendar'`
- 删除测试内的同名内联实现。若测试需要构造数据，用**工厂函数**而非复刻被测逻辑
- 内联实现只允许出现在「纯测试工具」场景，且必须改名以示区分（如`__buildFixture`）

### 如何防止复发

- 变异测试（mutation testing）：故意改坏生产代码，断言必须变红。
  本项目实测：把国庆休市区间改窄 → 8 个用例变红；把 `isFallback` 恒设 `false`
  → 2 个用例变红。**假测试在变异下不会变红**，这是最快的判别手段。
- 审查测试文件时先问一句：**「这个文件 import 了什么生产代码？」**答不上来就是假测试。

---

## AP-2 把「库里有数据」当成「那天开市」（抹布行陷阱）

### 症状

`daily_quotes` 有5544 只股票、371 个日期，看起来是真实行情表。
若直接用 `SELECT DISTINCT trade_date ... ORDER BY trade_date DESC LIMIT 1`
推断「最近交易日」，在 2026-10-06（国庆休市）会得到 `2026-10-06`，
即**在法定休市日告诉用户「这是今天的行情」**。

### 根因：库中混入了「抹布行」

实测证据（2026-09-18~ 10-07，每行 5541 条）：

| trade_date | 星期 | 真实性质 | 日历判定 |
|---|---|---|---|
| 2026-10-07 | 三 | 国庆休市 | 非交易日 |
| 2026-10-06 | 二 | 国庆休市 | 非交易日 |
| 2026-10-05 | 一 | 国庆休市 | 非交易日 |
| 2026-10-04 | 日 | 周末 | 非交易日 |
| 2026-09-25 | 五 | 中秋休市 | 非交易日 |
| **2026-09-30** | 三 | **真实交易日** | **库中 0 行** |

-贵州茅台 `600519.SH` 在 10-04/05/06 三天 OHLCV **完全相同**
  （close 1258.62 / volume 38331）—— 典型「把上一交易日值复制到假期日期」的抹布特征
- 反向缺失：真实交易日 09-28/29/30 各 **0 行**

共检出 **23 个抹布行**。全库 371 个日期里，混入的非交易日数量相当可观。

### 正确做法

**日历为权威，PG 只做交叉校验，且只做「优选」不做「否定」**：

```ts
// 双重过滤，缺一不可
candidates = calendarTradingDays(limit, { count: 20 })   // 交易日历展开窗口
                .filter(d => quoteDates.has(d));          // 库中须确有该日数据
```

- 只做日历过滤 → 抹布行会被当行情上报
- 只做库过滤 → 休市日会被当数据日
- 用 `GROUP BY trade_date`（= `DISTINCT`）消解抹布行：按行计数会重复、
  单股抽样会放大噪声，**唯有对日期集合去重**才能得到市场实际开市日

### 如何防止复发

- `tradingCalendarHypothesis.node-test.ts` 硬断言：**候选交易日里不得出现任何抹布行**
- 库中最大日期若为非交易日，必须打 `::warning::` 并断言 `latestTradingDay` 不采信它

---

## AP-3 用「日历天数 × 5/7」估算交易日

### 症状

`historicalDataValidator.ts` 的 `checkDateContinuity` / `analyzeGaps`
把每个正常长假都报成「数据缺失」warning：国庆 09-30 → 10-08 间隔 8 天、
春节可跨 9 天，全部命中旧的 `diff > 5` 阈值。
warning 比例随长假数量虚高，**真正该报警的数据缺口反而被淹没**（告警疲劳）。

同时 `Math.floor(diffDays * 5/7)` 的估算本身也不准 —— 它只扣周末，
不扣法定休市，也不处理调休。

### 正确做法

以交易日历为准，用`tradingDaysStrictlyBetween(from, to)` 算出区间内
「本应有却没有」的交易日数；法定休市不算缺失。

⚠️ 必须用**开区间**：相邻两条记录中，`from` 本身就是一条存在的记录，
若用闭区间统计会把它重复计入「本应有」，凭空造出一个缺口。
（这个 off-by-one 是本项目真实踩过的坑。）

### 如何防止复发

- 任何「间隔/缺失/连续性」判断，一律调用 `utils/tradingCalendar`，禁止自行估算
- 判定库内日期时必须 `DISTINCT trade_date` 消解抹布行（见 AP-2）

---

## AP-4 UTC 日历日冒充交易日历日

### 症状

```ts
new Date().toISOString().slice(0, 10)   // 在CST 凌晨 0~8 点返回「昨天」
new Date('2026-10-06').toISOString()     // CST 下因 UTC 偏移退化成 2026-10-05
```

服务器时区为 `Asia/Shanghai`，凌晨时段这些写法会产出**错误日期**，
且错误方向固定（总是偏早一天），会让「今天」的数据错位到昨天。

### 正确做法

- 取今天：`dateInMarketTz()`（用 `Intl.DateTimeFormat` + `timeZone: 'Asia/Shanghai'`）
- 解析字符串日期：`toDateString()`，按日历日解析**不做时区换算**
- 统一入口一律走 `resolveQueryDate()`

---

## AP-5 把「不确定性」当成「错误」，或反过来

### 症状与正确做法

两类都会破坏诚实约束，必须区分：

1. **不确定性要如实声明，不能静默假装精确**。
   内置日历表覆盖 2025/2026（交易所公告原文，`precision: 'official'`）
   与 2027（**交易所公告尚未发布**，按法定节假日推导，`precision: 'provisional'`）。
   查询 2027 时 `resolveQueryDate` 的 note 会显式说明「尚未发布…近似」，
   查询未覆盖年份则声明「精度较低」。**不因为标注了不确定性就假装全年精确。**

2. **但「精度声明」不是构建失败**。
   `tradingCalendarHypothesis` 中交易日总数与基线不符只发 `::warning::` 不 fail——
   因为 2027 的 239 vs 238 差异源于调休安排未定，属诚实标注而非错误。
   反之，**抹布行出现在候选交易日里是硬失败**，那属于把伪造数据当行情上报。

---

## AP-6 让非 vitest 的文件落进 vitest 的 include 范围

### 症状

`tradingCalendarHypothesis.test.ts` 用的是 `node:test`（需 `::warning::` 供CI 读取）。
但 `vitest.config.ts` 的 include 是 `src/__tests__/**/*.test.ts`，
于是 vitest 收集到它后报 `No test suite found in file`，
**让整条 vitest 流水线变红**。

### 正确做法

跨框架文件不要用 `.test.ts` 后缀。本项目改为 `*.node-test.ts`：
既不被 vitest 收集，又能被 `node --test` 直接运行。

```bash
cd backend && node --import tsx --test src/__tests__/tradingCalendarHypothesis.node-test.ts
```

⚠️ 注意 `node --test` 下ESM 解析要求**显式扩展名**（`../utils/tradingCalendar.ts`），
且必须显式关闭 knex 连接池（`dbFactory` 池 `min=2` 且 keepAlive，
不销毁会让 `node --test` 一直等事件循环排空而挂住，表现为「测试无输出」）。

---

## AP-7沙箱注入的 `NODE_OPTIONS` 让子进程卡死（vitest / honesty-scan / 后端起不来）

### 症状

```
Failed to start forks worker / Timeout waiting for worker to respond (60s)
```

或进程直接 `exit 137`（SIGTERM / OOM kill），**且代码本身毫无问题**：
同仓库既有测试（如 `StatCard.test.tsx`）会同时失败，`--pool=threads`、
`--no-file-parallelism --maxWorkers=1` 等常规手段全部无效。

### 根因

沙箱注入了 `NODE_OPTIONS=--require=.../node-language-shim.cjs`，
该 shim 让 vitest fork 出的 worker 卡在启动阶段。

⚠️ **容易误判的地方**：若用 `NODE_OPTIONS="--max-old-space-size=2048"` 去「治OOM」，
因为是**整体覆盖**原值，恰好把 `--require` 冲掉了，于是「看起来是治好了 OOM」，
实则是顺手绕过了 shim —— 换台机器或换个注入策略就会复现，且根因被掩盖。

### 正确做法

unset 掉，而非覆盖。**最小充分条件是只 unset `NODE_OPTIONS`**：

```bash
cd backend && env -u NODE_OPTIONS ./node_modules/.bin/vitest run <测试文件>
```

实测（本仓库）：`PYTHONPATH` 也指向同一个 shim 目录
（`.../cli/vendor/shim`），但**保留它不影响**——
`env -u NODE_OPTIONS` 单独使用即可让worker 3.5s 正常启动、94/94 通过。
`CODEBUDDY_SANDBOX_PROGRAM_POLICY_COMMAND` 同样与本问题无关。

> 教训：看到别人广播里的命令有三个 `env -u`，别默认「少一个就不生效」——
> 那会让人以为已unset 干净却仍失败，从而错误地去怀疑自己的代码。
> 反过来，也别照抄未验证的变量。**以实测的最小充分条件为准。**

等价的更省事写法（利用「整体替换而非追加」这一语义）：

```bash
NODE_OPTIONS=--max-old-space-size=4096<你的命令>
```

不必 `env -u`，直接赋值即可让 shim 自然消失。但**推荐 `env -u`** ——
它意图明确，不会让人误以为「加内存参数」是本问题的正解（见上文「容易误判的地方」）。

### 影响面：不只是 vitest，而是**一切走 `node --require` 的子进程**

本项目已实测确认的三个症状，**根因全是这个 shim**：

| 症状 | 实测验证 |
|---|---|
| **vitest** fork worker 超时 / exit 137 | `env -u NODE_OPTIONS` → 正常启动 |
| **`scripts/guard/honesty-scan.mjs`** exit 137 | 带 shim `EXIT=137`；`env -u` → `EXIT=0` |
| **后端 `tsx src/index.ts`** 端口 bind 不上 | 带 shim：T+75s 日志仍 **0 字节**、health 000；`env -u`：T+30s 日志 3594 字节、health **200** |

⚠️ `honesty-scan` 是 CI **真阻断** job，137 极易被误读成脚本自身 OOM/性能问题
（fix-schema-gap 就因此向 team-lead 报过「脚本自身内存占用问题」的**误判**）。
**建议在脚本入口自检**（检测 `process.env.NODE_OPTIONS?.includes('--require')` 即告警）——
踩坑的人一般不会先读文档。

### ⚠️ 它伪装成「慢」——这是最坑的地方

后端启动失败时**进程是活着的**（`pgrep` 查得到 `node tsx src/index.ts`），
但端口没绑、**日志文件 0 字节**，连启动 banner 都没有。
看起来像「还在慢慢启动」，实际是子进程已被卡死 —— 实测 **75 秒仍未起**，
而无界等待永远不会成功。

> **判据：日志文件是 0 字节 → 不是「启动中」，是 shim 卡死了。立刻 unset 重试，别再等。**

正确的起服姿势（与 vite 的坑不同，别混）：

```bash
cd backend && env -u NODE_OPTIONS PORT=<你的端口> \
  ./node_modules/.bin/tsx src/index.ts > /tmp/be.log 2>&1
```

- 输出**重定向到文件**，**不要接 `| tail`**（否则日志被吞，0 字节也看不出来）
- 用 harness 的后台托管参数，**不要 `nohup ... &`**
- **循环轮询到 200 为止**，别固定 sleep
- 多worker 并行时，探活**务必带自己的具体端口**：
  `curl --noproxy '*' -m 6 http://127.0.0.1:<端口>/health`
  ——别只看「有 tsx 进程在跑」就以为起来了，那是别人的端口
- `curl` 打本地**必须**加 `--noproxy '*'`，否则代理返回的 000/502 会被误判成「服务没起来」

### 与 vite 的坑**区分**开（别混归因）

vite dev 绑不上端口**与 NODE_OPTIONS 无关** —— 实测保留 shim 时 vite 照样 bind 成功。
真因通常是命令写法（`nohup ... &` 被回收，或 `| tail` 吞掉日志）。
若误以为 unset 能解决 vite，会白找原因。

### 如何防止复发

- 遇到 **exit 137 / worker 超时 / 端口不绑 / 日志 0 字节**，**先 `unset NODE_OPTIONS`**，
  再判断是否为真实内存问题
- 别用「加内存参数」当万能药 —— 它可能只是覆盖掉了真正的原因
- 同理，沙箱内 `ps` / `pgrep` 受限（`operation not permitted`），
  「查不到进程」不等于「没进程在跑」

---

## 附：判定「假绿」的三个快速问题

写完/审查任何测试时问：

1. **它 import 了哪个生产模块？** 答不上来 → 假测试（AP-1）
2. **把生产代码改坏，它会变红吗？** 不会 → 断言无效
3. **它断言的是「真实数据」还是「我造的数据」？** 后者需确认造的数据形状符合现实
   （例：AP-3 的测试夹具用 `setDate(i)` 生成**连续日历日含周末**，
   这与真实 K 线「只含交易日」不符，会让正确的日历判定反而报错）

---

## 参考

- 门禁：`node scripts/guard/honesty-scan.mjs --strict`（扫 `Math.random` 等伪造供数路径）
- 交易日历实现：`backend/src/utils/tradingCalendar.ts`
- 跨年双源校验：`backend/src/__tests__/tradingCalendarHypothesis.node-test.ts`
- 内置日历数据来源：沪深北交易所年度休市安排公告
  （2025 年：2024-12-23 发布；2026 年：2025-12-22 发布；2027 年：**尚未发布**）