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

### ⚠️ 它伪装成「慢」——但**别把 0 字节当判据**

后端启动失败时**进程是活着的**（`pgrep` 查得到 `node tsx src/index.ts`），
但端口没绑、**日志文件 0 字节**，连启动 banner 都没有。看起来像「还在慢慢启动」，
实际是子进程已被卡死。

本项目 A/B 实测（同一代码、同一 PG，只差一个变量）：

| 条件 | T+25s 日志 | health |
|---|---|---|
| 保留 shim | **0 字节**（T+70s 仍 0 字节、无监听者） | **000** |
| `env -u NODE_OPTIONS` | **3594 字节**（含启动 banner） | **200** ✅ |

> ❌ **不要把「0 字节」当判据**（本条曾写错过，见下）。
> `honesty-scan.mjs` 的输出是 `process.stdout.write(...)` **末尾一次性写**，
> 所以 0 字节只说明「进程在写输出前就死了」，**不区分死因**——
> shim 拖慢、内存、别的原因都可能是 0 字节。
> 同为 shim 环境，`honesty-scan` 实测出现过 `137/0B` 与 `exit 0/696B` **两种结果**。
>
> ✅ **唯一可靠判据（反证法，可证伪）：去掉 NODE_OPTIONS 后是否变快。**
> 实测 `honesty-scan`：带 shim 137 退出 vs `env -u` 后 **203ms / 188ms 且 exit 0**，
> 差约 1000 倍。去掉就快了 → shim 是原因；**没变快就别往 shim 上归因**，去查别的。
>
> ⚠️ 计时脚本**本身**要先验证：纯 CPU 循环 75s 在无 shim 下能正常跑完（exit 0），
> 说明看门狗**不是**固定 60s 墙，别用「肯定会被杀」去解释任何长耗时。

**推论：沙箱里测出的耗时数字不能直接用来给 CI/生产定优化目标。**

⚠️ 精确机制（实测定位，**不是「整体慢 N倍」**）：惩罚**只落在读文件内容上**。

| 操作 | 无 shim | 带 shim |
|---|---|---|
| 遍历目录 + `stat`3000 个文件 | **9ms** | **7ms**（无差别） |
| `readFileSync` × 50 | **0~2ms** | **22299~24683ms** |

- **目录遍历零成本**，惩罚精确落在 `readFileSync` —— 单次读取约 **250~500ms**
  （无 shim 约 0.12ms）
- ⚠️ **倍率不是常数**：随着调用次数增加，固定成本被摊薄，倍数从数千倍降到数百倍。
  所以**报「多少倍」没有意义**，要说「**每次 fs 调用多贵**」
- 因此用 `node -e 'console.log()'` 这类**完全不碰 fs** 的脚本正常，**不能**推出
  「只有 N 倍开销」——样本撑不起那个结论范围

**CI 不注入 shim，故 CI 真实耗时就是无 shim 基线**（本项目 `honesty-scan --strict`
实测 **0.13~1s**、四方交叉验证一致 ⇒ 性能本身没问题，无需优化）。

⚠️ **输出字节数不能当基线断言**：`honesty-scan` 的输出大小会随语料（HEAD）变化
（实测出现过 696B 与 532B）。同理，**耗时/体积类数字在断言前必须先固定 HEAD 与工作树**，
否则跨 commit 的差异会被误归因到环境。

**报性能数字前，先 `env -u NODE_OPTIONS` 测一次基线**，否则可能在优化一个不存在的问题。

正确的起服姿势（与 vite 的坑不同，别混）：

```bash
cd backend && env -u NODE_OPTIONS PORT=<你的端口> \
  ./node_modules/.bin/tsx src/index.ts > /tmp/be.log 2>&1
```

- 输出**重定向到文件**，**不要接 `| tail`**（否则日志被吞，看不出是否 0 字节）
- 用 harness 的后台托管参数，**不要 `nohup ... &`**
- **循环轮询到 200 为止**，别固定 sleep；轮询仍 000 则 unset 重试一次
- 多worker 并行时，探活**务必带自己的具体端口**：
  `curl --noproxy '*' -m 6 http://127.0.0.1:<端口>/health`
  ——别只看「有 tsx 进程在跑」就以为起来了，那是别人的端口
- `curl` 打本地**必须**加 `--noproxy '*'`，否则代理返回的 000/502 会被误判成「服务没起来」
- 清理进程**必须**用 `lsof -nP -iTCP:<port> -sTCP:LISTEN -t`（见 AP-8），
  先 `lsof -p<pid>` 确认身份再 kill

### 与 vite 的坑**区分**开（别混归因）

vite dev 绑不上端口**与 NODE_OPTIONS 无关** —— 实测保留 shim 时 vite 照样 bind 成功。
真因通常是命令写法（`nohup ... &` 被回收，或 `| tail` 吞掉日志）。
若误以为 unset 能解决 vite，会白找原因。

### 如何防止复发

- 遇到 **exit 137 / worker 超时 / 端口不绑**，**先 `unset NODE_OPTIONS` 重测一次**
  （用「是否变快」判定，见上文反证法），再判断是否为真实内存问题
- 别用「加内存参数」当万能药—— 它可能只是覆盖掉了真正的原因
- 同理，沙箱内 `ps` / `pgrep` 受限（`operation not permitted`），
  「查不到进程」不等于「没进程在跑」

### 元教训（这一类错误我在同一条线上犯过四次）

1. 拿**单次观察**当因果（`137/0B` 就归因 shim，而同环境下也可能是 `exit 0/696B`）
2. 拿**被污染的测量值**（53s）给别人定优化目标 —— 真实基线约 0.2s
3. **计时脚本本身写错**还拿它下结论（`EXIT==0s` 畸形输出）
4. 由「极简脚本正常」错误外推出「只有 N 倍开销」——
   那脚本**一次 fs 都没调**，样本撑不起那个结论范围
5. **方法失败 ≠ 目标不可行**：只试了 `ps` 读不到归属，就宣布「只能放弃清理」——
   换 `lsof` 读 cwd 立刻可得（见 AP-8）
6. ⚠️ **「方法可用」被当成「目标达成」**：`lsof` 能读 cwd 解决的是「读取进程信息」，
   却被当成了「判定归属」——**本项目最危险的一次错误建议，会导致误杀他人进程**

> **下结论往外发之前，先自问四件事：
> ① 我的测量工具本身对不对？（跑一个已知值验证它）
> ② 我的测量前提干不干净？（shim 在不在、进程是我起的吗）
> ③ 我的样本能支撑我要下的结论范围吗？（样本覆盖了我要断言的那个维度吗）
> ④ 我要解决的是「目标」还是只是「手段可用」？（**别把手段可行当成目标达成**）
> 少任何一步，结论就不可信，而且会连累别人按错误前提做决策。**
>
> 这六次**全是被别人逼着重测/拿反例才纠正的** —— 单靠自己很难发现，
> 因为错误结论本身「读起来很有说服力」。
> 前 5 次是判断错误，第 6 次**给出了会导致破坏的建议**，危害更大——
> 所以「不确定时给出可执行的破坏性建议」比「什么都不说」更糟。

### 多人并行时的额外纪律

多方同时验证会让 `pgrep -f <script>` 命中**大量他人进程**
（实测某次 `pgrep -f honesty-scan` 有 **11 个**在跑）。
此时 `pkill -f` 会打断别人，且**归属查不出来**（`ps eww` 读不到别的 session env）。
**用任务级停止（按 task_id），不要用 pattern 杀**（见 AP-8）。

---

## AP-8 按端口清理进程：`lsof -ti` 会杀掉无关进程（含本机桌面端）

### 症状与背景

多worker 并行排查时，常需「杀掉我起的那个后端进程」。
直觉写法 `lsof -ti tcp:<port> | xargs kill` **有严重缺陷**。

### 根因

`lsof -ti tcp:<port>` **不区分「监听者」与「连接方」**。
不带 `-sTCP:LISTEN` 时，它会把**所有连到该端口的客户端进程**一并列出。
在多 worker 环境里该端口上几乎总有别人的客户端连接，因此「有 pid」几乎必然成立，
**完全不能作为「有人在跑服务」的证据**。

### 真实事故（差点发生）

实测某次：端口 3001 上
```
$ lsof -ti tcp:3001                 → 38951                ← 据此误判「有 pid 但不服务」
$ lsof -nP -iTCP:3001 -sTCP:LISTEN -t → （空）              ← 没有任何进程监听
$ lsof -p 38951 | head -3            → COMMAND=Electron
$ lsof -nP -iTCP:3001                → ... TCP 192.168.31.58:51598->121.5.179.215:3001 (ESTABLISHED)
```
**38951 是 WorkBuddy 桌面端（Electron），且是连向远端 3001 的客户端连接。**
若执行 `kill $(lsof -ti tcp:3001)`，**会连桌面端一起杀掉**。

**我本人也照做过该写法**（在另一对冷门端口 3491/3492 上）。
当时未造成损害，但**唯一的侥幸原因是端口冷门、只有我自己的 tsx 在监听**——
**属于运气，不属于判断**。若当时用了 3001 这类共享端口，就会造成实际事故。

### 正确写法

```bash
# ✅ 只取真正的监听者
lsof -nP -iTCP:<port> -sTCP:LISTEN -t
# 拿到 pid 后先验身份，再决定是否 kill
lsof -p <pid> | head -3
kill <pid>
```

### 判据优先级（可靠性从高到低）

1. `curl --noproxy '*' -m 3 http://127.0.0.1:<port>/health` ← **唯一能证明「服务可用」**
2. `lsof -nP -iTCP:<port> -sTCP:LISTEN` ← 能证明「有人在监听」
3. `lsof -ti tcp:<port>` ← ❌ 最不可靠，会混入客户端连接

⚠️ 拿到 pid 后**也别默认「有人在用、别动」** —— 必须 curl 探活确认它是否真在服务。
（本项目就曾因此误判出「僵尸进程」。）

### 同类雷区

- `pkill -f "tsx src/index.ts"`：模式命中但身份未验证，**进程数 ≠ 1 时直接放弃**。
  实测多方并行时 `pgrep -f honesty-scan` 命中 **11 个他人进程**
- 多 worker 并行时，**探活务必带自己的具体端口** ——
  别看到「有 tsx 进程在跑」就以为起来了，那是别人的端口

### ❌ 归属怎么判：**只能用 task_id，其余一律不动**

⚠️ **本节曾写过一条危险建议，现撤回。** 曾写「`lsof` 读 cwd 指向仓库子目录
→ 大概率是自己起的 → 可安全 stop」。**这条会造成误杀，已作废。**

**实测反例（多agent 共享同一仓库 cwd，该信号零区分度）：**
```
我的会话 cwd   = /Users/ego_bai/WorkBuddy/2026-07-29-16-31-33   ← 不在仓库内
在跑的进程 cwd = .../a-stock-website                            ← 4 个都不是我起的
```
- 我的 cwd **根本不在仓库里** → 「cwd 在仓库」**不代表是我的**
- 反过来「cwd 不在仓库」也**不代表不是我的**
（我自己也观察到：他人跑的进程 cwd 竟等于我的会话 cwd。）

根因：**多 agent 共享同一仓库 cwd，「进程与某目录相关」≠「进程归我所有」**——
这是两个不同性质的判断，不可混用。

### ✅ 唯一可普遍执行的安全做法

| 手段 | 结论 |
|---|---|
| **按 `task_id` 停止** | ✅ **首选**。task_id 天然带归属，**物理上不可能误伤** |
| `lsof` 读 cwd | ⚠️ 只能确认「进程与某目录相关」，**不能判归属** |
| `CODEBUDDY_SESSION_ID` 比对 | ⚠️ 非通用（实测 `pgrep -lf` / `ps -ww` / `pgrep -laf` 三种读法在某些机器读不到） |
| `pkill -f <pattern>` | ❌ **进程数 ≠ 1 时禁用** |

> **原则：归属证据多数情况下拿不到，拿不到就不动。**
> 「不知道是谁的」不是「可以清理」的理由——**不动是唯一不会误伤的默认**。

> 方法可用 ≠ 目标达成：`lsof` 能读到 cwd解决的是「读取进程信息」，
> 我却把它当成了「判定归属」。**这两件事被合并了**（见元教训第 5 类）。

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