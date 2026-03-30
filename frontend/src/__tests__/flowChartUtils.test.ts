import { describe, it, expect } from 'vitest';
import {
  generateFundFlowSankey,
  generateSectorRotationSankey,
  generateChordFromMatrix,
  generateChordFromCorrelations,
  calculateSankeyDepths,
  filterSankeyData,
  calculateChordStats,
} from '../utils/flowChartUtils';

describe('流向图工具', () => {
  describe('generateFundFlowSankey', () => {
    const flows = [
      { from: '北向资金', to: '科技板块', amount: 50000, fromCategory: '北向', toCategory: '板块' },
      { from: '北向资金', to: '消费板块', amount: 30000, fromCategory: '北向', toCategory: '板块' },
      { from: '机构资金', to: '科技板块', amount: 40000, fromCategory: '机构', toCategory: '板块' },
    ];

    it('应生成节点和链接', () => {
      const result = generateFundFlowSankey(flows);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.links.length).toBeGreaterThan(0);
    });

    it('节点应包含名称', () => {
      const result = generateFundFlowSankey(flows);
      const names = result.nodes.map(n => n.name);
      expect(names).toContain('北向资金');
      expect(names).toContain('科技板块');
    });

    it('链接值应累加', () => {
      const result = generateFundFlowSankey(flows);
      const techLink = result.links.find(
        l => l.source === '北向资金' && l.target === '科技板块'
      );
      expect(techLink?.value).toBe(50000);
    });

    it('应处理重复流向', () => {
      const duplicateFlows = [
        { from: 'A', to: 'B', amount: 100 },
        { from: 'A', to: 'B', amount: 200 },
      ];
      const result = generateFundFlowSankey(duplicateFlows);
      const link = result.links.find(l => l.source === 'A' && l.target === 'B');
      expect(link?.value).toBe(300);
    });

    it('空数据应返回空结构', () => {
      const result = generateFundFlowSankey([]);
      expect(result.nodes.length).toBe(0);
      expect(result.links.length).toBe(0);
    });
  });

  describe('generateSectorRotationSankey', () => {
    it('应按时段创建节点', () => {
      const result = generateSectorRotationSankey(
        ['Q1', 'Q2'],
        [
          { from: '科技', to: '消费', period: 0, amount: 100 },
        ]
      );
      expect(result.nodes.length).toBe(2);
      expect(result.nodes[0].name).toContain('Q1');
    });

    it('应创建阶段间链接', () => {
      const result = generateSectorRotationSankey(
        ['Q1', 'Q2', 'Q3'],
        [
          { from: '科技', to: '消费', period: 0, amount: 100 },
          { from: '消费', to: '医药', period: 1, amount: 50 },
        ]
      );
      expect(result.links.length).toBe(2);
    });
  });

  describe('generateChordFromMatrix', () => {
    const labels = ['科技', '消费', '金融'];
    const matrix = [
      [0, 100, 50],
      [80, 0, 30],
      [60, 40, 0],
    ];

    it('应从矩阵生成节点', () => {
      const result = generateChordFromMatrix(labels, matrix);
      expect(result.nodes.length).toBe(3);
    });

    it('应从矩阵生成链接', () => {
      const result = generateChordFromMatrix(labels, matrix);
      expect(result.links.length).toBeGreaterThan(0);
    });

    it('零值不应产生链接', () => {
      const result = generateChordFromMatrix(labels, matrix);
      result.links.forEach(l => {
        expect(l.value).toBeGreaterThan(0);
      });
    });

    it('应保留矩阵数据', () => {
      const result = generateChordFromMatrix(labels, matrix);
      expect(result.matrix).toEqual(matrix);
    });
  });

  describe('generateChordFromCorrelations', () => {
    const items = [
      { id: 'a', name: '股票A' },
      { id: 'b', name: '股票B' },
    ];
    const correlations = [
      { source: 'a', target: 'b', strength: 0.8 },
    ];

    it('应生成弦图数据', () => {
      const result = generateChordFromCorrelations(items, correlations);
      expect(result.nodes.length).toBe(2);
      expect(result.links.length).toBe(1);
    });

    it('应过滤零相关性', () => {
      const corrs = [
        { source: 'a', target: 'b', strength: 0.8 },
        { source: 'a', target: 'b', strength: 0 },
      ];
      const result = generateChordFromCorrelations(items, corrs);
      expect(result.links.length).toBe(1);
    });
  });

  describe('calculateSankeyDepths', () => {
    it('应为源节点分配深度0', () => {
      const data = {
        nodes: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
        ],
        links: [
          { source: 'a', target: 'b', value: 100 },
          { source: 'b', target: 'c', value: 50 },
        ],
      };
      const depths = calculateSankeyDepths(data);
      expect(depths.get('a')).toBe(0);
      expect(depths.get('b')).toBe(1);
      expect(depths.get('c')).toBe(2);
    });
  });

  describe('filterSankeyData', () => {
    const data = {
      nodes: [
        { id: 'a', name: 'A' }, { id: 'b', name: 'B' },
        { id: 'c', name: 'C' }, { id: 'd', name: 'D' },
      ],
      links: [
        { source: 'a', target: 'b', value: 100 },
        { source: 'a', target: 'c', value: 50 },
        { source: 'b', target: 'd', value: 10 },
      ],
    };

    it('应保留top N链接', () => {
      const result = filterSankeyData(data, 2);
      expect(result.links.length).toBe(2);
    });

    it('应过滤最小值', () => {
      const result = filterSankeyData(data, 100, 20);
      result.links.forEach(l => {
        expect(l.value).toBeGreaterThanOrEqual(20);
      });
    });

    it('应保留相关节点', () => {
      const result = filterSankeyData(data, 1);
      const nodeIds = result.nodes.map(n => n.id);
      result.links.forEach(l => {
        expect(nodeIds).toContain(l.source);
        expect(nodeIds).toContain(l.target);
      });
    });
  });

  describe('calculateChordStats', () => {
    const data = {
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      links: [
        { source: 'a', target: 'b', value: 100 },
        { source: 'b', target: 'c', value: 50 },
        { source: 'c', target: 'a', value: 30 },
      ],
    };

    it('应计算总流量', () => {
      const stats = calculateChordStats(data);
      expect(stats.totalFlow).toBe(180);
    });

    it('应找到最大流量', () => {
      const stats = calculateChordStats(data);
      expect(stats.maxFlow.value).toBe(100);
      expect(stats.maxFlow.source).toBe('a');
    });

    it('应计算节点流量', () => {
      const stats = calculateChordStats(data);
      const aStrength = stats.nodeStrengths.get('a');
      expect(aStrength?.outFlow).toBe(100);
      expect(aStrength?.inFlow).toBe(30);
      expect(aStrength?.total).toBe(130);
    });
  });
});
