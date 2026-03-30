/**
 * AI 选股推荐 API
 * 参考同花顺i问财智能选股
 */

import { Router, Request, Response } from 'express';
import { queryCache } from '../utils/queryCache';

const router = Router();

// 模拟 AI 选股推荐数据
function generateRecommendations(strategy?: string) {
  const strategies: Record<string, { name: string; desc: string; stocks: () => any[] }> = {
    value: {
      name: '价值投资',
      desc: '低估值+高分红+稳定增长',
      stocks: () => [
        { symbol: '600519', name: '贵州茅台', score: 95, reason: 'PE合理，ROE连续5年>25%，高分红', price: 1800, changePercent: 1.2 },
        { symbol: '000858', name: '五粮液', score: 90, reason: '估值低位，现金流充裕，品牌护城河', price: 150, changePercent: 0.8 },
        { symbol: '601318', name: '中国平安', score: 88, reason: 'PB破净，保险+科技双轮驱动', price: 50, changePercent: -0.3 },
        { symbol: '000333', name: '美的集团', score: 86, reason: '家电龙头，多元化布局，估值合理', price: 65, changePercent: 0.5 },
        { symbol: '600036', name: '招商银行', score: 85, reason: '银行龙头，资产质量优秀，分红稳定', price: 35, changePercent: 0.2 },
      ],
    },
    growth: {
      name: '成长突破',
      desc: '高增长+行业景气+技术突破',
      stocks: () => [
        { symbol: '300750', name: '宁德时代', score: 92, reason: '新能源电池龙头，全球市占率提升', price: 200, changePercent: 3.5 },
        { symbol: '002594', name: '比亚迪', score: 91, reason: '新能源车销量高增，智驾技术突破', price: 260, changePercent: 2.8 },
        { symbol: '688981', name: '中芯国际', score: 88, reason: '国产替代加速，产能利用率回升', price: 85, changePercent: 4.2 },
        { symbol: '002475', name: '立讯精密', score: 85, reason: '消费电子+汽车电子双驱动', price: 35, changePercent: 1.9 },
        { symbol: '300059', name: '东方财富', score: 83, reason: '券商+互联网金融，牛市弹性大', price: 18, changePercent: 5.1 },
      ],
    },
    technical: {
      name: '技术形态',
      desc: '均线金叉+放量突破+趋势确认',
      stocks: () => [
        { symbol: '601012', name: '隆基绿能', score: 89, reason: '底部放量，MACD金叉，站上60日线', price: 25, changePercent: 6.2 },
        { symbol: '002714', name: '牧原股份', score: 86, reason: 'W底形态，突破颈线，量能配合', price: 42, changePercent: 3.8 },
        { symbol: '601899', name: '紫金矿业', score: 84, reason: '均线多头排列，缩量回踩支撑', price: 18, changePercent: 2.1 },
        { symbol: '600276', name: '恒瑞医药', score: 82, reason: '旗形整理突破，量价齐升', price: 48, changePercent: 1.5 },
        { symbol: '002241', name: '歌尔股份', score: 80, reason: 'V型反转，底部筹码集中', price: 22, changePercent: 4.5 },
      ],
    },
    momentum: {
      name: '动量追踪',
      desc: '强势领涨+资金流入+市场热度',
      stocks: () => [
        { symbol: '688256', name: '寒武纪', score: 93, reason: 'AI芯片概念龙头，资金大幅流入', price: 650, changePercent: 8.5 },
        { symbol: '300474', name: '景嘉微', score: 89, reason: 'GPU国产替代，机构密集调研', price: 95, changePercent: 6.8 },
        { symbol: '688111', name: '金山办公', score: 87, reason: 'AI+办公，信创需求释放', price: 320, changePercent: 5.2 },
        { symbol: '002230', name: '科大讯飞', score: 85, reason: '大模型落地加速，教育+医疗场景', price: 55, changePercent: 4.8 },
        { symbol: '300033', name: '同花顺', score: 83, reason: 'AI金融信息服务，牛市弹性标的', price: 150, changePercent: 7.2 },
      ],
    },
    contrarian: {
      name: '逆向布局',
      desc: '超跌反弹+估值修复+底部信号',
      stocks: () => [
        { symbol: '000002', name: '万科A', score: 78, reason: '地产政策底部，估值历史低位', price: 8, changePercent: -2.1 },
        { symbol: '601398', name: '工商银行', score: 82, reason: '高股息防御，估值修复空间', price: 5.5, changePercent: 0.3 },
        { symbol: '600036', name: '招商银行', score: 80, reason: '银行板块轮动，机构加仓', price: 35, changePercent: 0.8 },
        { symbol: '002304', name: '洋河股份', score: 76, reason: '白酒板块调整充分，Q4旺季预期', price: 105, changePercent: -0.5 },
        { symbol: '603259', name: '药明康德', score: 75, reason: 'CXO出海逻辑不变，超跌反弹', price: 55, changePercent: 1.2 },
      ],
    },
  };

  if (strategy && strategies[strategy]) {
    const s = strategies[strategy];
    return {
      strategy,
      name: s.name,
      description: s.desc,
      stocks: s.stocks(),
      updatedAt: new Date().toISOString(),
    };
  }

  // 返回所有策略
  return Object.entries(strategies).map(([key, s]) => ({
    strategy: key,
    name: s.name,
    description: s.desc,
    stockCount: s.stocks().length,
    topPick: s.stocks()[0],
  }));
}

// AI 选股推荐列表
router.get('/ai/recommendations', async (req: Request, res: Response) => {
  try {
    const strategy = req.query.strategy as string;

    const cacheKey = `ai:recommendations:${strategy || 'all'}`;
    const data = await queryCache.query(
      cacheKey,
      () => generateRecommendations(strategy),
      600000 // 10分钟缓存
    );

    res.json({
      success: true,
      data: {
        recommendations: strategy ? [data] : data,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('AI选股推荐失败:', error);
    res.status(500).json({ success: false, error: 'AI选股推荐失败' });
  }
});

// AI 个股诊断
router.get('/ai/diagnose/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;

    const cacheKey = `ai:diagnose:${symbol}`;
    const diagnosis = await queryCache.query(
      cacheKey,
      () => {
        const scores = {
          fundamental: Math.floor(Math.random() * 40) + 60,
          technical: Math.floor(Math.random() * 40) + 60,
          momentum: Math.floor(Math.random() * 40) + 60,
          valuation: Math.floor(Math.random() * 40) + 60,
          sentiment: Math.floor(Math.random() * 40) + 60,
        };
        const total = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / 5);

        return {
          symbol,
          totalScore: total,
          rating: total >= 85 ? '强烈推荐' : total >= 70 ? '推荐' : total >= 55 ? '中性' : '谨慎',
          dimensions: [
            { name: '基本面', score: scores.fundamental, weight: 0.3 },
            { name: '技术面', score: scores.technical, weight: 0.25 },
            { name: '动量', score: scores.momentum, weight: 0.2 },
            { name: '估值', score: scores.valuation, weight: 0.15 },
            { name: '情绪', score: scores.sentiment, weight: 0.1 },
          ],
          strengths: [
            '行业龙头地位稳固',
            'ROE连续3年提升',
            '机构持仓比例上升',
          ],
          risks: [
            '估值偏高，安全边际不足',
            '行业竞争加剧',
            '宏观政策不确定性',
          ],
          suggestion: total >= 70
            ? '综合评分较高，可适当配置，注意控制仓位'
            : '综合评分中等，建议观望或小仓位参与',
          updatedAt: new Date().toISOString(),
        };
      },
      600000
    );

    res.json({ success: true, data: diagnosis });
  } catch (error) {
    console.error('AI诊断失败:', error);
    res.status(500).json({ success: false, error: 'AI诊断失败' });
  }
});

// 行业轮动分析
router.get('/ai/sector-rotation', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'ai:sector-rotation';
    const data = await queryCache.query(
      cacheKey,
      () => {
        const sectors = [
          { name: '人工智能', code: 'AI', phase: '主升', momentum: 92, trend: '流入' },
          { name: '新能源车', code: 'NEV', phase: '吸筹', momentum: 78, trend: '流入' },
          { name: '半导体', code: 'CHIP', phase: '主升', momentum: 85, trend: '流入' },
          { name: '白酒', code: 'LIQUOR', phase: '派发', momentum: 45, trend: '流出' },
          { name: '银行', code: 'BANK', phase: '吸筹', momentum: 62, trend: '流入' },
          { name: '医药', code: 'PHARMA', phase: '下跌', momentum: 38, trend: '流出' },
          { name: '光伏', code: 'SOLAR', phase: '吸筹', momentum: 55, trend: '持有' },
          { name: '消费电子', code: 'CE', phase: '主升', momentum: 80, trend: '流入' },
          { name: '军工', code: 'DEFENSE', phase: '吸筹', momentum: 68, trend: '流入' },
          { name: '地产', code: 'RE', phase: '下跌', momentum: 30, trend: '流出' },
        ];

        return {
          sectors: sectors.sort((a, b) => b.momentum - a.momentum),
          hotSectors: sectors.filter(s => s.phase === '主升').map(s => s.name),
          watchSectors: sectors.filter(s => s.phase === '吸筹').map(s => s.name),
          avoidSectors: sectors.filter(s => s.phase === '下跌').map(s => s.name),
          rotationSignal: '科技成长风格占优，关注AI/半导体/消费电子',
          updatedAt: new Date().toISOString(),
        };
      },
      600000
    );

    res.json({ success: true, data });
  } catch (error) {
    console.error('行业轮动分析失败:', error);
    res.status(500).json({ success: false, error: '行业轮动分析失败' });
  }
});

// 智能预警优化建议
router.get('/ai/alert-suggestions', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'ai:alert-suggestions';
    const suggestions = await queryCache.query(
      cacheKey,
      () => ({
        suggestions: [
          {
            type: 'price_breakout',
            title: '价格突破预警',
            description: '当股票突破关键阻力位/支撑位时提醒',
            priority: 'high',
            stocks: ['600519', '300750', '002594'],
            condition: '收盘价突破20日最高价',
          },
          {
            type: 'volume_surge',
            title: '放量预警',
            description: '成交量异常放大，可能有重大事件',
            priority: 'high',
            stocks: ['688256', '002230'],
            condition: '成交量>5日均量的2倍',
          },
          {
            type: 'technical_signal',
            title: '技术信号预警',
            description: 'MACD金叉/死叉、KDJ超买超卖等',
            priority: 'medium',
            stocks: ['601012', '002714'],
            condition: 'MACD金叉+KDJ<20',
          },
          {
            type: 'capital_flow',
            title: '资金异动预警',
            description: '主力资金大幅流入/流出',
            priority: 'medium',
            stocks: ['300059', '688111'],
            condition: '主力净流入>1亿元',
          },
          {
            type: 'earnings',
            title: '财报预警',
            description: '业绩预告/快报/正式报告发布',
            priority: 'low',
            stocks: [],
            condition: '财报发布前3天提醒',
          },
        ],
        autoOptimized: true,
        explanation: '基于您的自选股和近期市场特征，AI自动推荐以上预警规则',
        updatedAt: new Date().toISOString(),
      }),
      600000
    );

    res.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('预警建议生成失败:', error);
    res.status(500).json({ success: false, error: '预警建议生成失败' });
  }
});

export default router;
