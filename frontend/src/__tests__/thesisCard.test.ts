import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { useThesisStore, type ThesisInput } from '../store/useThesisStore';

const baseInput = (overrides: Partial<ThesisInput> = {}): ThesisInput => ({
  symbol: '600519',
  name: '贵州茅台',
  stance: 'bullish',
  thesis: '高端酒需求稳定，直营占比提升带动利润率。',
  catalysts: '春节动销超预期',
  risks: '批价持续下行',
  invalidation: '单季营收同比转负',
  valuation: { buy: 1200, fair: 1500, sell: 1800 },
  confidence: 'medium',
  evidence: [{ type: 'data', label: '本页行情与财务数据', url: '/stocks/600519' }],
  ...overrides,
});

describe('观点卡 store', () => {
  beforeEach(() => {
    localStorage.clear();
    useThesisStore.setState({ cards: [] });
  });

  it('创建观点卡：一只股票一张，生成创建复盘记录并写入本地存储', () => {
    let createdId = '';
    act(() => {
      const result = useThesisStore.getState().upsert(baseInput());
      createdId = result.card.id;
      expect(result.created).toBe(true);
    });
    const cards = useThesisStore.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toMatch(/^thesis_/);
    expect(cards[0].symbol).toBe('600519');
    expect(cards[0].revisions).toHaveLength(1);
    expect(cards[0].revisions[0].note).toBe('创建观点卡');
    expect(cards[0].createdAt).toBeTruthy();
    expect(useThesisStore.getState().findBySymbol('600519')?.id).toBe(createdId);
    expect(localStorage.getItem('clair-thesis-cards-v1')).toContain('贵州茅台');
  });

  it('更新同一只股票：覆盖原卡，追加本次变化而不是新建第二张', () => {
    act(() => {
      useThesisStore.getState().upsert(baseInput());
    });
    act(() => {
      const result = useThesisStore.getState().upsert(baseInput({
        stance: 'neutral',
        thesis: '估值已反映复苏预期。',
        confidence: 'high',
      }));
      expect(result.created).toBe(false);
    });
    const cards = useThesisStore.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0].stance).toBe('neutral');
    expect(cards[0].confidence).toBe('high');
    expect(cards[0].revisions).toHaveLength(2);
    expect(cards[0].revisions[1].note).toContain('结论');
    expect(cards[0].revisions[1].note).toContain('核心逻辑');
  });

  it('内容未变时不制造虚假复盘记录，也不改更新时间', () => {
    act(() => {
      useThesisStore.getState().upsert(baseInput());
    });
    const firstUpdatedAt = useThesisStore.getState().cards[0].updatedAt;
    act(() => {
      useThesisStore.getState().upsert(baseInput());
    });
    expect(useThesisStore.getState().cards[0].revisions).toHaveLength(1);
    expect(useThesisStore.getState().cards[0].updatedAt).toBe(firstUpdatedAt);
  });

  it('关联研究档案：拒绝重复、不制造复盘、移除后不留残条', () => {
    act(() => {
      useThesisStore.getState().upsert(baseInput());
    });
    const before = useThesisStore.getState().cards[0];
    let first = false;
    let duplicate = true;
    act(() => {
      first = useThesisStore.getState().linkResearch('600519', {
        kind: 'note', id: 'note_1', title: '  白酒批价跟踪  ', meta: ' 学习笔记 · 600519 ',
      });
      duplicate = useThesisStore.getState().linkResearch('600519', {
        kind: 'note', id: 'note_1', title: '重复标题', meta: '重复',
      });
    });
    expect(first).toBe(true);
    expect(duplicate).toBe(false);
    const card = useThesisStore.getState().cards[0];
    expect(card.research).toHaveLength(1);
    expect(card.research[0].title).toBe('白酒批价跟踪');
    expect(card.research[0].meta).toBe('学习笔记 · 600519');
    expect(card.revisions).toHaveLength(before.revisions.length);
    expect(card.updatedAt).toBe(before.updatedAt);

    act(() => {
      useThesisStore.getState().unlinkResearch('600519', 'note', 'note_1');
    });
    expect(useThesisStore.getState().cards[0].research).toEqual([]);
  });

  it('删除来源笔记时跨观点卡清理研究档案，不留死链', () => {
    act(() => {
      useThesisStore.getState().upsert(baseInput());
      useThesisStore.getState().upsert(baseInput({ symbol: '000002', name: '万科A' }));
      useThesisStore.getState().linkResearch('600519', { kind: 'note', id: 'n1', title: '白酒批价', meta: '学习笔记' });
      useThesisStore.getState().linkResearch('000002', { kind: 'note', id: 'n1', title: '白酒批价', meta: '学习笔记' });
      useThesisStore.getState().linkResearch('000002', { kind: 'report', id: 'r1', title: '研报', meta: '国信证券' });
    });
    act(() => {
      useThesisStore.getState().removeResearchSource('note', 'n1');
    });
    const maotai = useThesisStore.getState().findBySymbol('600519');
    const wanke = useThesisStore.getState().findBySymbol('000002');
    expect(maotai?.research).toEqual([]);
    expect(wanke?.research).toHaveLength(1);
    expect(wanke?.research[0].kind).toBe('report');
  });

  it('旧版本地缓存迁移：补齐 research 数组，不丢原观点', async () => {
    const legacy = {
      state: {
        cards: [{
          ...baseInput(),
          id: 'thesis_legacy_1',
          revisions: [{ at: '2026-11-01T00:00:00.000Z', note: '创建观点卡' }],
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
        }],
      },
      version: 1,
    };
    localStorage.setItem('clair-thesis-cards-v1', JSON.stringify(legacy));
    await useThesisStore.persist.rehydrate();
    const card = useThesisStore.getState().cards[0];
    expect(card.id).toBe('thesis_legacy_1');
    expect(card.thesis).toBe('高端酒需求稳定，直营占比提升带动利润率。');
    expect(card.research).toEqual([]);
  });

  it('按代码查找与删除', () => {
    act(() => {
      useThesisStore.getState().upsert(baseInput());
      useThesisStore.getState().upsert(baseInput({
        symbol: '000002', name: '万科A', stance: 'watch',
        thesis: '等待销售数据企稳。',
      }));
    });
    expect(useThesisStore.getState().findBySymbol('000002')?.name).toBe('万科A');
    const target = useThesisStore.getState().findBySymbol('600519');
    act(() => {
      useThesisStore.getState().remove(target!.id);
    });
    expect(useThesisStore.getState().cards).toHaveLength(1);
    expect(useThesisStore.getState().findBySymbol('600519')).toBeUndefined();
  });
});
