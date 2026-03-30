import { describe, it, expect } from 'vitest';
import {
  pipeline,
  createDebouncedStream,
  slidingWindowAggregate,
  sampleData,
  binData,
  zScoreNormalize,
  minMaxNormalize,
} from '../utils/dataFlowEngine';

describe('pipeline', () => {
  it('map应变换数据', () => {
    const result = pipeline([1, 2, 3]).map(x => x * 2).toArray();
    expect(result).toEqual([2, 4, 6]);
  });

  it('filter应过滤数据', () => {
    const result = pipeline([1, 2, 3, 4, 5]).filter(x => x > 3).toArray();
    expect(result).toEqual([4, 5]);
  });

  it('链式操作应正常工作', () => {
    const result = pipeline([1, 2, 3, 4, 5])
      .filter(x => x % 2 === 0)
      .map(x => x * 10)
      .toArray();
    expect(result).toEqual([20, 40]);
  });

  it('reduce应聚合', () => {
    const sum = pipeline([1, 2, 3]).reduce((acc, x) => acc + x, 0);
    expect(sum).toBe(6);
  });

  it('take应取前N个', () => {
    const result = pipeline([1, 2, 3, 4, 5]).take(3).toArray();
    expect(result).toEqual([1, 2, 3]);
  });

  it('skip应跳过N个', () => {
    const result = pipeline([1, 2, 3, 4, 5]).skip(2).toArray();
    expect(result).toEqual([3, 4, 5]);
  });

  it('distinct应去重', () => {
    const result = pipeline([1, 2, 2, 3, 3, 3]).distinct().toArray();
    expect(result).toEqual([1, 2, 3]);
  });

  it('distinct带keyFn应正确', () => {
    const data = [{ id: 1, name: 'a' }, { id: 1, name: 'b' }, { id: 2, name: 'c' }];
    const result = pipeline(data).distinct(x => x.id).toArray();
    expect(result.length).toBe(2);
  });

  it('sort应排序', () => {
    const result = pipeline([3, 1, 2]).sort((a, b) => a - b).toArray();
    expect(result).toEqual([1, 2, 3]);
  });

  it('groupBy应分组', () => {
    const data = [
      { type: 'A', val: 1 }, { type: 'B', val: 2 },
      { type: 'A', val: 3 }, { type: 'B', val: 4 },
    ];
    const groups = pipeline(data).groupBy(x => x.type);
    expect(groups.get('A')?.length).toBe(2);
    expect(groups.get('B')?.length).toBe(2);
  });

  it('window应创建滑动窗口', () => {
    const result = pipeline([1, 2, 3, 4, 5]).window({ size: 3, slide: 1 }).toArray();
    expect(result.length).toBe(3);
    expect(result[0]).toEqual([1, 2, 3]);
    expect(result[1]).toEqual([2, 3, 4]);
  });

  it('batch应分批', () => {
    const result = pipeline([1, 2, 3, 4, 5]).batch(2).toArray();
    expect(result.length).toBe(3);
    expect(result[0]).toEqual([1, 2]);
    expect(result[2]).toEqual([5]);
  });

  it('first应返回第一个', () => {
    expect(pipeline([1, 2, 3]).first()).toBe(1);
    expect(pipeline([]).first()).toBeUndefined();
  });

  it('last应返回最后一个', () => {
    expect(pipeline([1, 2, 3]).last()).toBe(3);
  });

  it('count应返回数量', () => {
    expect(pipeline([1, 2, 3]).count()).toBe(3);
  });

  it('sum应求和', () => {
    expect(pipeline([1, 2, 3]).sum(x => x)).toBe(6);
  });

  it('avg应求平均', () => {
    expect(pipeline([2, 4, 6]).avg(x => x)).toBe(4);
  });

  it('min应找最小', () => {
    const result = pipeline([{ v: 3 }, { v: 1 }, { v: 2 }]).min(x => x.v);
    expect(result?.v).toBe(1);
  });

  it('max应找最大', () => {
    const result = pipeline([{ v: 3 }, { v: 1 }, { v: 2 }]).max(x => x.v);
    expect(result?.v).toBe(3);
  });
});

describe('slidingWindowAggregate', () => {
  it('应计算滑动窗口', () => {
    const result = slidingWindowAggregate([1, 2, 3, 4, 5], 3, 1, w => w.reduce((a, b) => a + b, 0));
    expect(result).toEqual([6, 9, 12]);
  });

  it('步长>1应跳过', () => {
    const result = slidingWindowAggregate([1, 2, 3, 4, 5, 6], 3, 3, w => w.reduce((a, b) => a + b, 0));
    expect(result).toEqual([6, 15]);
  });
});

describe('sampleData', () => {
  it('uniform应均匀采样', () => {
    const result = sampleData([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5, 'uniform');
    expect(result.length).toBe(5);
  });

  it('first应取前N个', () => {
    const result = sampleData([1, 2, 3, 4, 5], 0.6, 'first');
    expect(result).toEqual([1, 2, 3]);
  });

  it('last应取后N个', () => {
    const result = sampleData([1, 2, 3, 4, 5], 0.6, 'last');
    expect(result).toEqual([3, 4, 5]);
  });

  it('rate>=1应返回全部', () => {
    const data = [1, 2, 3];
    expect(sampleData(data, 1, 'uniform')).toEqual(data);
  });
});

describe('binData', () => {
  it('应创建数据箱', () => {
    const bins = binData([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins.length).toBe(5);
    const total = bins.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(10);
  });

  it('空数据应返回空', () => {
    expect(binData([], 5)).toEqual([]);
  });
});

describe('zScoreNormalize', () => {
  it('应标准化数据', () => {
    const result = zScoreNormalize([1, 2, 3, 4, 5]);
    const mean = result.reduce((a, b) => a + b, 0) / result.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
  });

  it('相同值应全为0', () => {
    const result = zScoreNormalize([5, 5, 5]);
    expect(result.every(v => v === 0)).toBe(true);
  });

  it('空数据应返回空', () => {
    expect(zScoreNormalize([])).toEqual([]);
  });
});

describe('minMaxNormalize', () => {
  it('应标准化到0-1', () => {
    const result = minMaxNormalize([1, 2, 3, 4, 5]);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(1);
  });

  it('相同值应全为0', () => {
    const result = minMaxNormalize([5, 5, 5]);
    expect(result.every(v => v === 0)).toBe(true);
  });
});

describe('createDebouncedStream', () => {
  it('应缓冲并刷新', () => {
    const items: number[] = [];
    const stream = createDebouncedStream<number>(100, (batch) => items.push(...batch));

    stream.push(1);
    stream.push(2);
    stream.push(3);
    expect(stream.size).toBe(3);
    expect(items.length).toBe(0);

    stream.flush();
    expect(items).toEqual([1, 2, 3]);
    expect(stream.size).toBe(0);
  });
});
