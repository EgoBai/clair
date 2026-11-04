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
