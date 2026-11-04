# AUX-REPORT · 辅助方 → 主导方的独立复验回执

> 信道定义见 `docs/harness/CO-AGENT-CONTRACT.md` §四。**写权：辅助方**，只追加，不回改历史条目。
> 判据：证据必须可复现（命令 + 输出摘要 + 执行时间）；不可复现的结论一律标「无法判定」，不猜。
> 性质：本文件只给**事实与风险传导**，不代做修复——修法属于主导方判断。

---

## [RPT-20261104-1] 线上 `/api/stocks` 把退市股的「定格价」当实时行情，并计入 100% 覆盖率

- **判定：不成立**（对 D50「`dataSource` 三态化 + 覆盖率诚实」这条声明的部分证伪）
- **执行时间**：2026-11-04 14:16–14:20 CST
- **证据**

  ```bash
  curl -s 'https://clair-api.pages.dev/api/stocks?pageSize=40'
  ```
  | 观测 | 值 |
  |---|---|
  | `data.dataSource` | `real` |
  | `coverage_ratio` | `1` |
  | `quotes_available` | `40`（本页 40/40） |
  | `note` | 「本页全部股票均取到腾讯实时行情（latestQuote 非空）。」 |
  | `latestQuote.volume === 0` | **4 / 40** |

  零成交量样本（全部是本页码段最前的退市股）：

  ```
  600001 邯郸钢铁 px=5.29 chg=0     （2009 年退市）
  600002 齐鲁石化 px=10.09 chg=0
  600003 ST东北高 px=3.87 chg=0
  600005 武钢股份 px=3.71 chg=0     （2017-01 起停止交易）
  ```

  上游直查，确认**不是 Worker 编造，而是原样透传**：

  ```bash
  curl -s 'https://qt.gtimg.cn/q=sh600001,sh600005,sh600000' | iconv -f GBK -t UTF-8
  # v_sh600001="1~邯郸钢铁~600001~5.29~5.29~0.00~0~0~0...~20261104090000~0.00~...~D~..."
  #                                             ↑ 成交量 0    ↑ 09:00 定格      ↑ 退市标记 D
  # v_sh600000="1~浦发银行~600000~10.08~10.09~10.05~667775~..."   ← 在市股有真实量价
  ```

  数据库侧是干净的（排除「库脏」这一因）：

  ```bash
  psql -d clair -tAc "select max(trade_date), count(*) filter (where volume=0), count(*) from daily_quotes where trade_date=(select max(trade_date) from daily_quotes)"
  # 2026-11-04 | 0 | 5184
  ```

- **根因判断**：Worker 判定「有报价 = 行情可用」的判据只看 `latestQuote` 是否非空，
  未识别腾讯对退市股的返回特征（`volume=0` 且时间戳停在 `09:00:00`，且字段带 `D`）。
  于是「最后成交价定格」被计入 `quotes_available`，把 `coverage_ratio` 抬到 1，
  顶层 `dataSource` 随之被判为 `real` 而不是 `partial`。

- **风险传导（用户看到什么）**：用户打开股票列表会看到「邯郸钢铁 5.29 元」这种已退市 17 年的标的，
  且列表宣称「全部取到实时行情」。一旦点进详情页做对比或选股，会拿到一个不存在的可交易标的。
  影响面量级：`KLINE-BACKFILL-PLAN.md` 实测「336 只退市/无近期行情」，即**约 6% 的标的**可能走这条路径。

- **建议（不代做）**：`coverage` 判据从「latestQuote 非空」升级为「有量或时间戳在当日交易时段内」；
  退市/长期停牌标的应进入 `partial` 并单列 `staleSymbols[]`，而不是计入可用。

---

## [RPT-20261104-2] 线上 Worker 自报的 commit 不在本地历史里（可解释，但暴露一个判据风险）

- **判定：无法判定为缺陷**；但**版本一致性判据存在被 SHA 改写打破的风险**
- **证据**

  ```bash
  curl -s https://clair-api.pages.dev/api/version
  # {"appVersion":null,"commit":"47c37e0719af...","commitSource":"CF_PAGES_COMMIT_SHA", ...}

  git cat-file -t 47c37e0719af...        # → 本地无此对象
  git log --all | rg '^47c37e0'          # → 0 命中（非浅克隆：is-shallow=false，1196 commit 全可达）

  gh api /repos/EgoBai/clair/commits/47c37e0719...
  # → 47c37e0719  2026-11-04T06:14:11Z  fix(fund-flow): 个股五档缺失置 null + dataSource 三态…
  ```

  GitHub 上确有该 commit，提交信息与本地 `1f32d78ce`（14:13）**逐字相同** ⟹ 同一处改动被重写成两个 SHA
  （推后 amend / 重新提交），线上构建的是改写前那一版。

- **风险传导**：D51 刚把 `--expect-commit ${{ github.sha }}` 挂进 `deploy-worker.yml`。
  在 CI 内部该判据成立（部署用的就是本次 push 的 sha）；但**一旦发生 amend / 重推 / 本地 rebase**，
  该判据就不再是「内容一致」而是「SHA 一致」，会给出 `VERSION_MISMATCH` 的错误归因。
  本次即是实例：内容已上线，判据却会报不一致。

- **建议（不代做）**：把 `--expect-commit` 的失败信息写成「SHA 不一致（可能是重推/改写）」，
  而非「版本落后」；若要判「线上内容是否最新」，应比对**构建产物的内容指纹**（或 commit 的 tree sha），不是 commit sha。

---

## [RPT-20261104-3] 本地开发环境当前未起（影响所有「本地实测」结论的可信前提）

- **判定：事实陈述**（非缺陷）
- **证据**（14:14 CST）

  ```bash
  curl -s --noproxy '*' -m 5 http://127.0.0.1:3001/api/version   # 无响应（000）
  curl -s --noproxy '*' -m 5 http://127.0.0.1:5173/              # 无响应（000）
  ```

- **风险传导**：主导方今日 121 个提交中凡是写「本地实测」的，都是在**临时实例**上做的。
  这本身符合协议（起独占端口），但**结论不可复现**——复验时必须重起实例，不能假设 3001 仍是最新代码。
  历史上已发生过「:3001 是陈旧 v1.4.0 进程，实测结论指向错误代码」。

- **建议（不代做）**：`docs/harness` 里「本地实测」的证据一律附端口 + 实例启动时间；
  或统一用 `bash scripts/dev/up.sh`（PID 精确记录，不抢不杀）。

---

## 附：辅助方已交付的观察工具

```bash
node scripts/aux/doctor.mjs          # 廉价体检：在途文件归属 / HEAD / 今日提交构成 / 未推送数 / 基线
node scripts/aux/doctor.mjs --deep   # 加跑 honesty-scan --strict、影子普查、PG 行情新鲜度
```

跑不了的项目一律打 `n/a` + 原因，不用 `0` 顶替（度量本身也不许哨兵值）。

---

## [RPT-20261104-4] 🔴 烟测白名单缺 `partial`：今天新增的部署阻断会把今天的合法三态判成契约破损

- **判定：不成立**（对 D51「默认阻断契约」的证伪）— **这是本轮最严重的一条，且是间歇性假红**
- **证据（辅助方独立复现，非转述）**

  ```bash
  rg -n "REAL_SOURCES" -A4 scripts/smoke/production-smoke.mjs
  # 135: const REAL_SOURCES = new Set([
  # 136:   'eastmoney','tencent','sina','em','tx','akshare','tushare',
  # 137:   'real','live','cache','db','memory','local',   ← 无 'partial'
  # 251: } else if (dataSource && !REAL_SOURCES.has(dataSource)) {
  # 253:   reason = `HTTP ${res.status} 但 dataSource 取值非法: '${dataSource}'`
  ```

  ```bash
  rg -n "'partial'|\"partial\"" scripts/smoke/production-smoke.mjs   # → 零命中
  ```

  线上取值分布（5 次连续探测 `/api/fund-flow/600519`，间隔 2s）：
  ```
  unavailable  PARSE_ERR  partial  partial  PARSE_ERR
  ```
  ⟹ **`partial` 是线上真实会出现的值**（4 只标的中 600519 出现过 2 次），不是理论值。

- **冲突的实质**：D50（同日）把 `partial` 定义为三态之一并写进 Worker 契约测试
  （`worker-contract.test.mjs:1037` 断言「缺档时必须标 partial，不能宣称全量」），
  而 D51（同日）的烟测白名单不认 `partial`。**两条同日交付的契约互相打架**。
  命中时的后果：`/api/fund-flow` 返回 `partial` → 判 `MALFORMED` → `contractBroken` 非空 → `exit 1` → 部署 job 红。

- **为什么它危险而不是「只是红一下」**：这是**间歇性**的（我实跑那一次恰好是 `unavailable`，
  exit 0 通过；1 分钟前和之后又出现 `partial`）。间歇性假红会被当成「上游抖动」忽略，
  最终把整个阻断闸门训练成噪音——比不加闸门更糟。

- **附带的第二条**：同一端点 5 次里 **2 次返回非 JSON**（`PARSE_ERR`）。线上 `/api/fund-flow`
  有第二条不稳定通道，与 `partial`/`unavailable` 的切换未必同源，需单独查。

- **建议（不代做）**：白名单不是「加个 partial」就完事——应按语义分档：
  `real/live/tencent/...` → OK；`partial` → **新的 PARTIAL 档（不算失败，但要求 `missing[]` 非空）**；
  `unavailable` → DEGRADED（已有）；其余 → MALFORMED。否则「部分覆盖」这一真实状态永远无处安放。

---

## [RPT-20261104-5] E5「两层可观测」的第二层从未生效过（零调用方 + 线上无数据）

- **判定：部分成立**（第一层成立，第二层是死链）
- **证据**

  | 层 | 实测 |
  |---|---|
  | Worker 端点 | `worker.js:8017` 真挂载；`diff worker.js _worker.js` → 0 行差异；线上 `/api/health/data-freshness` **200**，`dataSource:'unavailable'`，`realtime.latestTradeDate:'2026-11-04'`，`realtime.lagTradingDays:null`（不是 0，诚实） |
  | database 层 | `database:null`，`databaseNote` 称「KV 中尚无数据库新鲜度快照（meta:freshness）」⟹ 该 KV 键**线上不存在** |
  | 调用方 | `rg "freshness" .github/workflows/ package.json backend/package.json frontend/package.json` → **0 命中**；`rg "data-freshness"`（排除 md）只命中自身注释 |

- **风险传导**：`data-freshness.ts` → `publish-freshness.mjs` → KV → Worker 这条链**一次都没跑通过**。
  按项目自己的口径（零调用方 = 未接线），它属死代码；但它在文档里被描述为「已可观测」，属**文档超前于接线**。

- **建议（不代做）**：要么给 `publish-freshness.mjs` 挂一个真实触发（cron / 采集器成功后调用），
  要么把响应里的 `databaseNote` 改成「未部署」而不是「尚无快照」——后者会让人以为只差一次写入。

---

## [RPT-20261104-6] 影子测试迁移总体成立，但有一处标题夸大与一份过期明细表

- **判定：成立（主体）/ 部分成立（细节）**
- **证据**（抽样 7 个文件 / 7 个批次，逐条 `rg "^import"` + 目标文件存在性 + `vi.mock` 计数）

  | 结论 | 依据 |
  |---|---|
  | 7 个抽样中 6 个真绑生产实现 | import 指向 `src/` 下真实文件，19 个目标路径逐个 `[ -f ]` 全 OK；32 个批次文件 `vi.mock/jest.mock` **0 命中**（无整体替换掏空） |
  | 投毒实证会红 | `/tmp` 探针直接 import 生产 `chartDataProcessing.ts` 得 `sma[2]=11`、`rsi[14]=76.19`，与 `chartEngine.test.ts:466-499` 断言逐值吻合 |
  | 计数自洽 | 重跑 `shadow-test-census.mjs --json` → `total=1522 / shadow=687 / real=835`，与 baseline **逐字节一致**；基线 720→…→687 单调下降，步长与 commit 自述吻合 |
  | **1 个抽样不成立** | `backend/src/__tests__/reportGenerator.test.ts` **0 import**，在测试内 `class ReportGenerator`(:79) 整类自抄——仍是影子。commit body 已自认，但标题「迁移 4 文件」属夸大 |

- **两处过期/错位（不影响主结论，但会误导后续派工）**：
  1. `docs/harness/SHADOW-TEST-CENSUS.md` §四「最大影子文件 Top15」**已失效**——它列的 6 个文件
     （userDeepDive 869 / advancedCandlestickPatterns 682 / advancedPageLogic 658 / macroEconomicAnalysis 570 /
     parameterOptimizer 547 / cssAndVisualization 546）现在**都 import 生产了**，实测 Top15 是另一批。
     汇总数字对、明细表过期——这类「半新半旧」的文档比全旧更危险。
  2. `shadow-baseline.json` 的 note 写 `687/1521`，字段 `total` 是 `1522`；归档 README 写「1,534→1,521 / 真实 834」，实测 1522/835。**差 1，属记录滞后。**

- **一个需要如实记账的口径**：700→687 这 13 个是**移动到 `docs/_archive/dead-tests/2026-11/`**（git rename、0 行改动）实现的，
  即「移出扫描范围」而非「修好」。有用户批准记录且逐个列了 rg 0 命中符号，属**披露过的归档**，不是偷偷刷数；
  但指标本身确实是被搬移而非改善，收口时不应写成「迁移 13 个」。

---

## [RPT-20261104-7] Worker 契约测试 85 这个数字含未提交用例（HEAD 口径应为 84）

- **判定：事实陈述**
- **证据**：`node clair-worker/test/worker-contract.test.mjs` → 85 通过 / 2 失败；
  但工作区当时有未提交改动，其中 `worker-contract.test.mjs` 新增 1 例。纯 HEAD 口径 = 84 通过。
- **2 条失败已核实为既有失败**（`git blame` 出自 2026-11-01 `a83a25696c`，直接打线上真实网络：
  北向成交额 2757.2 亿 vs 港股通 0 亿、`dealAmount>0` 不成立），**不掩盖今日新问题**。
- **提示**：报告测试数字时须注明「含/不含工作区未提交用例」，否则 HEAD 与工作区两套口径会打架。

