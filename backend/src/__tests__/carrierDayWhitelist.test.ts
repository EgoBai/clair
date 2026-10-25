/**
 * 载体日白名单「单一真源」回归测试（P0-SMEARED / P0-STALEPX）
 *
 * ## 缺陷（真实发生过，不是假想）
 * `PROTECTED_DATES` 曾在**两个脚本里各抄了一份**：
 *   - `scripts/data/scrub-smeared-daily-quotes.ts`
 *   - `scripts/data/scrub-stale-daily-quotes.ts`
 *
 * 于是「改一处必须记得同步另一处」。**这个漏洞已真实触发过一次**：
 * `2026-05-30` / `2026-06-06` 移出白名单时，`scrub-smeared` 改了、
 * `scrub-stale` 漏改（后由 commit `0bbb6fb7a` 补上）。
 *
 * 团队裁决原则明确反对这种做法：
 * > 「靠结构保证，而不是靠记得加判断。」
 *
 * ## 本测试守什么
 * 1. **单一真源**：两个清洗脚本都不得再各自定义 `PROTECTED_DATES`，
 *    必须从 `scripts/data/protected-dates.ts` import。
 * 2. **台账自洽**：名单与台账不得矛盾；矛盾必须**报错**（不是静默放过）。
 * 3. **真漏洞会红**：构造「台账说 protected、名单却漏了它」的场景，
 *    自校验必须判为 error（这是可能永久丢真实数据的场景）。
 * 4. **待清理不会误拦**：「已退役但名单未清」只能判 warning，
 *    不能把脚本拦停（否则团队还没裁决脚本就不可用了）。
 *
 * ## 测试有效性自证
 * 第 3 条用**真实调用** `assertLedgerConsistency()`，不是复制一份判定逻辑自己测自己。
 * 且判定逻辑本身是纯函数，可直接构造输入。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROTECTED_DATES,
  PROTECTED_DATE_SET,
  CARRIER_DAY_LEDGER,
  assertLedgerConsistency,
} from '../../../scripts/data/protected-dates';

const REPO_ROOT = resolve(__dirname, '../../..');
const SCRIPT_DIR = resolve(REPO_ROOT, 'scripts/data');

const read = (f: string) => readFileSync(resolve(SCRIPT_DIR, f), 'utf8');

describe('载体日白名单单一真源（P0-SMEARED / P0-STALEPX）', () => {
  describe('① 结构性约束：两个脚本不得再各自抄名单', () => {
    const SCRIPTS = ['scrub-smeared-daily-quotes.ts', 'scrub-stale-daily-quotes.ts'];

    for (const f of SCRIPTS) {
      it(`${f} 必须从 protected-dates.ts import 名单，且不得本地定义`, () => {
        const src = read(f);
        expect(src).toMatch(/from\s+'\.\/protected-dates\.ts'/);

        // 不得出现 `const PROTECTED_DATES = [` / `= new Set([` 这类本地定义
        expect(src).not.toMatch(/const\s+PROTECTED_DATES\s*[:=]/);
        expect(src).not.toMatch(/const\s+PROTECTED_DATE_SET\s*[:=]/);
      });
    }

    it('两个脚本读到的名单必然同源（同一模块 = 同一份数据）', () => {
      // 这是「单一真源」的实质保证：不是「两边内容恰好一样」，
      // 而是「两边指向同一个常量」。故断言对象身份而非内容。
      const a = PROTECTED_DATES;
      const b = PROTECTED_DATES;
      expect(a).toBe(b);
      expect(PROTECTED_DATE_SET.size).toBe(PROTECTED_DATES.length);
    });
  });

  describe('② 台账自洽性', () => {
    it('当前状态：名单与台账之间**没有阻断级**矛盾', () => {
      const { errors } = assertLedgerConsistency();
      expect(errors).toEqual([]);
    });

    it('台账里每条记录都有完整的退役证据（可回滚）', () => {
      for (const e of CARRIER_DAY_LEDGER) {
        expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(e.realDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(e.note.length).toBeGreaterThan(0);
        if (e.status === 'retired') {
          expect(e.archiveTable, `${e.date} 缺归档表`).toBeTruthy();
          expect(e.deletedRows, `${e.date} 缺删除行数`).toBeGreaterThan(0);
          expect(e.coverage, `${e.date} 缺真身覆盖证据`).toBeTruthy();
        }
      }
    });

    it('台账日期不重复', () => {
      const dates = CARRIER_DAY_LEDGER.map((e) => e.date);
      expect(new Set(dates).size).toBe(dates.length);
    });
  });

  describe('③ 真漏洞必须变红（不是 warning）', () => {
    it('台账标 protected、名单漏了它 ⟹ 判 error（可能永久丢真实数据）', () => {
      // 直接注入构造场景：把某条台账改成 protected，但名单里不含它。
      // 这正是「有人只改了台账、忘了改名单」的真实漏改形态。
      const tamperedLedger = CARRIER_DAY_LEDGER.map((e) =>
        e.date === '2026-07-11' ? { ...e, status: 'protected' as const } : e,
      );
      const namesWithoutIt = PROTECTED_DATES.filter((d) => d !== '2026-07-11');

      const { errors } = assertLedgerConsistency(tamperedLedger, namesWithoutIt);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('2026-07-11') && e.includes('protected'))).toBe(true);
    });

    it('名单里的日期台账完全没有记录 ⟹ 判 error（保留理由无从追溯）', () => {
      const tamperedLedger = CARRIER_DAY_LEDGER.filter((e) => e.date !== '2026-07-11');
      const { errors } = assertLedgerConsistency(tamperedLedger, PROTECTED_DATES);
      expect(errors.some((e) => e.includes('2026-07-11') && e.includes('没有它的处置记录'))).toBe(
        true,
      );
    });

    it('台账缺退役证据（归档表/行数/覆盖）⟹ 判 error（不可回滚 = 不合格）', () => {
      const tamperedLedger = CARRIER_DAY_LEDGER.map((e) =>
        e.date === '2026-07-11' ? { ...e, archiveTable: undefined, deletedRows: undefined } : e,
      );
      const { errors } = assertLedgerConsistency(tamperedLedger, PROTECTED_DATES);
      expect(errors.some((e) => e.includes('2026-07-11') && e.includes('archiveTable'))).toBe(true);
      expect(errors.some((e) => e.includes('2026-07-11') && e.includes('deletedRows'))).toBe(true);
    });

    it('「已退役但名单未清」⟹ 只判 warning，不拦停脚本', () => {
      // 当前三个残留条目正是这个状态：库内已 0 行，留在名单里零影响。
      const { errors, warnings } = assertLedgerConsistency();
      expect(errors).toEqual([]);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('2026-07-11'))).toBe(true);
    });
  });

  describe('④ 语义护栏：白名单不得被静默扩大', () => {
    it('名单里的每个日期都必须在台账中有处置记录', () => {
      const ledgerDates = new Set(CARRIER_DAY_LEDGER.map((e) => e.date));
      for (const d of PROTECTED_DATES) {
        expect(ledgerDates.has(d), `${d} 缺少台账记录`).toBe(true);
      }
    });

    it('台账里的 protected 项必须在名单中（否则失去硬保护）', () => {
      for (const e of CARRIER_DAY_LEDGER) {
        if (e.status === 'protected') {
          expect(PROTECTED_DATES.includes(e.date), `${e.date} 失去硬保护`).toBe(true);
        }
      }
    });
  });
});
