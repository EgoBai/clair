/**
 * 🔒 载体日（carrier day）保护名单 —— **单一真源（single source of truth）**
 *
 * ## 为什么必须收敛成一个模块
 *
 * 历史上 `PROTECTED_DATES` 在**两个脚本里各抄了一份**：
 *   - `scripts/data/scrub-smeared-daily-quotes.ts`（抹布行清洗）
 *   - `scripts/data/scrub-stale-daily-quotes.ts`（陈旧价伪行清洗）
 *
 * 两份拷贝意味着：**改一处必须记得同步另一处**。这是典型的「靠人记得」，
 * 而 team-lead 的裁决原则恰恰是反过来的：
 *
 * > 「你把白名单放在所有分支合并之后，而不是在三处各加一个 `if`——
 * > 　靠结构保证，而非靠记得加判断。」
 *
 * 事实上这个漏洞**已经真实发生过一次**：`2026-05-30` / `2026-06-06` 移出白名单时，
 * `scrub-smeared` 改了、`scrub-stale` 漏改（后由 commit `0bbb6fb7a` 补上）。
 * 靠抄两份 + 靠记得同步，迟早会再漏一次。
 *
 * ⟹ 本模块把名单**抽成唯一一份**。两个脚本都从这里 import，
 * 于是「成对维护」这个要求从**人的纪律**变成**编译期/运行期的结构保证**：
 * 名单只有一处，改它必然同时改两个脚本。
 *
 * ## 载体日语义（主理人裁决，不可变）
 *
 * 载体日 = 非交易日（周末 / 交易所公告休市日）上出现的行情行。
 * 它们本质是**同一批真实数据被复制到随后的日历日**。
 *
 * ⟹ **休市日的正确语义是「空」，不是「复制上一交易日」。**
 *
 * 但删除前必须先满足一个条件：**该载体日承载的载荷，其真身已被转正**。
 * 若真身（载荷对应的真实交易日）在库中残缺，载体日就是那几天行情的
 * **唯一完整记录**，删掉 = 永久丢失真实数据。
 *
 * ## 台账（CARRIER_DAY_LEDGER）记录全部历史载体日的处置
 *
 * 台账与「当前保护名单」是两回事，刻意分开：
 *   - `PROTECTED_DATES` —— **当前**仍需硬保护的日期（真身尚未补齐）。
 *     硬约束：任何分支（含 `--force-unique`）都不得删它们。
 *   - `CARRIER_DAY_LEDGER` —— 全部载体日的**历史处置记录**（含已退役的），
 *     供下一个维护者查阅「这三天发生过什么、为什么现在不用保护了」。
 *
 * 保留台账的意义：白名单一旦被清空，下一个维护者会误以为
 * 「载体日从来不存在过 / 真身从来没补过」，从而「顺手清理」或误以为数据完整。
 * 台账是**防误操作护栏的一部分**，必须与操作现场同处一地。
 */

/**
 * 一条载体日台账记录。
 *
 * `status` 的取值即处置结论：
 *   - `retired` —— 已整日删除（真身已 100% 覆盖，载体日退化为纯冗余副本）。
 *   - `protected` —— 仍在保护名单中（真身未补齐，载体日是唯一完整记录）。
 */
export interface CarrierDayLedgerEntry {
  /** 载体日日期 */
  date: string;
  /** 载荷真为哪个真实交易日 */
  realDay: string;
  /** 处置状态 */
  status: 'retired' | 'protected';
  /** 整日删除的归档表名（`retired` 时必填） */
  archiveTable?: string;
  /** 整日删除的行数（`retired` 时必填） */
  deletedRows?: number;
  /** 真身覆盖证据（`retired` 时必填）：`已覆盖/总数` */
  coverage?: string;
  /** 处置依据（人话） */
  note: string;
}

/**
 * 全部载体日的处置台账。
 *
 * ⚠️ 改动本表时**必须**同步检查 `PROTECTED_DATES`（本文件内唯一真源处）。
 * 两者的对应关系由 `assertLedgerConsistency()` 在运行时校验，不靠人记。
 */
export const CARRIER_DAY_LEDGER: readonly CarrierDayLedgerEntry[] = [
  {
    date: '2026-05-30',
    realDay: '2026-05-29',
    status: 'retired',
    archiveTable: 'archive_carrier_days_216',
    deletedRows: 108,
    coverage: '真身 05-29 已由 backfill-kline 补齐（104/109 在库中不存在 → 已转正）',
    note:
      '周六休市日（isTradingDay=false），载荷=05-29 收盘盖上来。' +
      '真身补齐后载体日完全冗余 ⟹ 整日删除，已移出白名单。',
  },
  {
    date: '2026-06-06',
    realDay: '2026-06-05',
    status: 'retired',
    archiveTable: 'archive_carrier_days_216',
    deletedRows: 108,
    coverage: '真身 06-05 已由 backfill-kline 补齐（108/109 同值 → 已转正）',
    note:
      '周六休市日（isTradingDay=false），载荷=06-05 收盘盖上来。' +
      '真身补齐后载体日完全冗余 ⟹ 整日删除，已移出白名单。',
  },
  {
    date: '2026-07-11',
    realDay: '2026-07-10',
    status: 'retired',
    archiveTable: 'archive_carrier_days_b2_20261020',
    deletedRows: 5188,
    coverage: '5188/5188',
    note:
      'P0-CARRIER-B2：真身 07-10 已 100% 覆盖，未覆盖 0 行，' +
      '删前 OHLCV 逐字段相等 ⟹ 载体日退化为纯冗余副本 ⟹ 整日删除。',
  },
  {
    date: '2026-09-06',
    realDay: '2026-09-04',
    status: 'retired',
    archiveTable: 'archive_carrier_days_b2_20261020',
    deletedRows: 5186,
    coverage: '5186/5186',
    note:
      'P0-CARRIER-B2：真身 09-04 已 100% 覆盖，未覆盖 0 行，' +
      '删前 OHLCV 逐字段相等 ⟹ 载体日退化为纯冗余副本 ⟹ 整日删除。',
  },
  {
    date: '2026-10-04',
    realDay: '2026-09-30',
    status: 'retired',
    archiveTable: 'archive_carrier_days_b2_20261020',
    deletedRows: 5183,
    coverage: '5183/5183',
    note:
      'P0-CARRIER-B2：真身 09-30 已 100% 覆盖，未覆盖 0 行，' +
      '删前 OHLCV 逐字段相等 ⟹ 载体日退化为纯冗余副本 ⟹ 整日删除。',
  },
];

/**
 * 🔒 当前**仍需硬保护**的载体日（真身尚未补齐，载体日是唯一完整记录）。
 *
 * 硬约束（team-lead 裁决，优先级最高）：
 *   - 任何删除分支都不得删它们（含 `--force-unique`）；
 *   - 唯一可以绕过的开关是 `--override-leadership-decision`（显式推翻裁决）。
 *
 * ⚠️ 语义是「**当前**仍需保护」——日期随真身补齐而退役后应从这里移除，
 * 但**必须**在 `CARRIER_DAY_LEDGER` 里留下处置记录（归档表、行数、覆盖证据）。
 *
 * 当前状态（2026-10-20 P0-CARRIER-B2 之后）：全部 5 个载体日真身均已补齐并
 * 整日删除，库内 0 行。下列三个日期是**已退役但尚未从名单移除**的残留条目：
 * 库内已无对应数据，故在当前库状态下**移除与否对删除行为零影响**；
 * 保留它们是为了在主理人裁决前**不擅自改变硬约束名单**。
 * 裁决「移除」时，删掉下面三行即可（两处脚本会同时生效，无需同步两处）。
 */
export const PROTECTED_DATES: readonly string[] = [
  '2026-07-11',
  '2026-09-06',
  '2026-10-04',
];

/** `PROTECTED_DATES` 的 Set 形态（供 `Set.has` 式判定） */
export const PROTECTED_DATE_SET: ReadonlySet<string> = new Set(PROTECTED_DATES);

/**
 * 运行时自校验：台账与保护名单必须自洽。
 *
 * 存在理由：台账与名单是**同一个语义的两个投影**（当前需保护的 ⟺ 台账里 status=protected）。
 * 两份投影若不一致，说明有人只改了一处 —— 这正是本模块要消灭的那类漏洞，
 * 所以把它变成**会报错的检查**，而不是「靠记得」。
 *
 * ## 错误分级（关键：不能把「待清理」和「真漏洞」混为一谈）
 *
 * **阻断级（errors）** —— 真的可能删错数据，必须停：
 *   - 名单里的日期在台账里**完全缺失** → 该日期的保留理由与处置过程无从追溯；
 *   - 台账里 `status=protected`（真身未补齐）却**不在名单** → 真身未补齐却失去保护，
 *     这是最危险的一种不一致：载体日可能被当成纯复制行删掉 ⟹ 永久丢真实数据。
 *
 * **提示级（warnings）** —— 不影响删除正确性，只提示该清理了：
 *   - 名单里的日期台账标 `retired`（已退役）→ 该日期库内已 0 行，
 *     留在名单里**对删除行为零影响**（没有行可删），只是会让下一个维护者
 *     误以为「这三天真身尚未补齐」。主理人裁决后清掉即可。
 *
 * @param ledger  台账（默认用模块内真源；注入参数用于测试构造场景）
 * @param dates   保护名单（默认用模块内真源；注入参数用于测试构造场景）
 * @returns `{ errors, warnings }`：`errors` 非空 ⟹ 调用方必须中止执行
 */
export function assertLedgerConsistency(
  ledger: readonly CarrierDayLedgerEntry[] = CARRIER_DAY_LEDGER,
  dates: readonly string[] = PROTECTED_DATES,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const protectedInLedger = ledger.filter((e) => e.status === 'protected').map((e) => e.date);
  const ledgerDates = new Set(ledger.map((e) => e.date));

  for (const d of dates) {
    if (!ledgerDates.has(d)) {
      errors.push(
        `PROTECTED_DATES 含 "${d}"，但 CARRIER_DAY_LEDGER 没有它的处置记录。` +
          `保护名单里的每个日期都必须在台账里有条目（哪怕已退役）。`,
      );
    } else if (!protectedInLedger.includes(d)) {
      warnings.push(
        `PROTECTED_DATES 含 "${d}"，但台账中它已退役（status=retired）。` +
          `该日期库内已 0 行，留在名单里对删除行为零影响；` +
          `建议在主理人裁决后从 PROTECTED_DATES 移除（只改本文件一处即可）。`,
      );
    }
  }

  for (const e of ledger) {
    if (e.status === 'protected' && !dates.includes(e.date)) {
      errors.push(
        `台账中 "${e.date}" 的 status 是 "protected"（真身 ${e.realDay} 未补齐），` +
          `但它不在 PROTECTED_DATES 里 ⟹ 失去了硬保护，可能被当纯复制行删掉。`,
      );
    }
    if (e.status === 'retired') {
      if (!e.archiveTable) errors.push(`台账 "${e.date}" 已退役但缺 archiveTable（必须可回滚）。`);
      if (e.deletedRows === undefined) errors.push(`台账 "${e.date}" 已退役但缺 deletedRows。`);
      if (!e.coverage) errors.push(`台账 "${e.date}" 已退役但缺 coverage（真身覆盖证据）。`);
    }
  }

  const dupes = ledger.map((e) => e.date).filter((d, i, a) => a.indexOf(d) !== i);
  for (const d of dupes) errors.push(`台账中日期 "${d}" 重复出现。`);

  return { errors, warnings };
}
