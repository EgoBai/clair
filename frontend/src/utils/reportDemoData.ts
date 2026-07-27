/**
 * 研报 AI 摘要中心 — 确定性演示数据兜底
 *
 * 背景：本项目后端 API 多缺失（技术债 T6），激活页统一用「确定性演示数据兜底」。
 * 这里沿用 industryRotationDemo / financialInsightDemo 的模式：以固定基种子
 * （20260725）+ LCG 线性同余生成 ~45 条 ResearchReport（覆盖 9 只 A 股）+
 * ~20 条 NewsEvent，保证每次渲染数值稳定、可复现。
 *
 * 颜色约定：涨红跌绿（中国习惯），页面统一用主题 var(--color-up)/var(--color-down)。
 */
import type { ResearchReport } from './researchReportEngine';
import type { NewsEvent } from './newsEventEngine';

const BASE_SEED = 20260725;

/** 线性同余发生器（LCG）：给定种子返回 [0,1) 的确定性序列 */
function createLCG(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** 将 [0,1) 映射到 [min,max] */
function mapRange(r: number, min: number, max: number): number {
  return min + r * (max - min);
}
const round2 = (x: number): number => Number(x.toFixed(2));

interface StockDef {
  ticker: string;
  name: string;
  price: number;
  /** 评级倾向：-1 偏空 ~ +1 偏多 */
  bias: number;
  /** 近期评级走向：1 上修 / -1 下修 / 0 混合 */
  trend: 1 | -1 | 0;
  /** 是否人为制造分歧（买+卖并存） */
  divided?: boolean;
}

const STOCKS: StockDef[] = [
  { ticker: '600519', name: '贵州茅台', price: 1685, bias: 1.0, trend: 1 },
  { ticker: '300750', name: '宁德时代', price: 226, bias: 0.6, trend: 1 },
  { ticker: '600036', name: '招商银行', price: 38.5, bias: 0.3, trend: 0 },
  { ticker: '688981', name: '中芯国际', price: 78, bias: 0.0, trend: 0 },
  { ticker: '002594', name: '比亚迪', price: 245, bias: 0.5, trend: 1 },
  { ticker: '000858', name: '五粮液', price: 142, bias: 0.2, trend: -1 },
  { ticker: '601318', name: '中国平安', price: 52, bias: 0.4, trend: 0 },
  { ticker: '600276', name: '恒瑞医药', price: 48, bias: 0.1, trend: -1 },
  { ticker: '300059', name: '东方财富', price: 16, bias: -0.2, trend: 0, divided: true },
];

const BROKERS = ['中信证券', '华泰证券', '国泰君安', '招商证券', '中金公司', '广发证券', '兴业证券', '天风证券'];
const ANALYSTS = ['张伟', '李娜', '王强', '刘洋', '陈静', '赵磊', '孙倩', '周涛', '吴敏', '郑昊'];

type Rating = ResearchReport['rating'];
const RATING_ORDER: Rating[] = ['sell', 'underweight', 'hold', 'overweight', 'buy'];

/** 依据 bias + 噪声选一个评级下标 */
function pickRatingIndex(rng: () => number, bias: number, noise: number): number {
  const center = 2 + bias + (rng() - 0.5) * noise;
  return Math.max(0, Math.min(4, Math.round(center)));
}

/** 沿方向平移评级，返回与 from 不同（且确为变动）的评级 */
function differentRating(from: Rating, dir: 1 | -1): Rating {
  const up = RATING_ORDER[Math.min(4, RATING_ORDER.indexOf(from) + 1)];
  const down = RATING_ORDER[Math.max(0, RATING_ORDER.indexOf(from) - 1)];
  if (dir === 1 && up !== from) return up;
  if (dir === -1 && down !== from) return down;
  // 已到顶/底，反向移动以产生变动
  const other = dir === 1 ? down : up;
  return other !== from ? other : from;
}

function dateStr(base: Date, daysAgo: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function titleFor(rating: Rating, rng: () => number): string {
  const POS = ['业绩超预期，维持高增长', '龙头份额提升，看好长期价值', '新产品放量，上调盈利预测', '提价催化，盈利弹性释放', '低估价值凸显，安全边际充足'];
  const NEG = ['需求疲软，短期承压', '竞争加剧，盈利预期下修', '成本上升挤压毛利', '监管风险犹存，估值偏高', '减值风险上升，下调评级'];
  const NEU = ['业绩符合预期，维持中性', '行业景气平稳，等待催化'];
  if (rating === 'buy' || rating === 'overweight') return POS[Math.floor(rng() * POS.length)];
  if (rating === 'sell' || rating === 'underweight') return NEG[Math.floor(rng() * NEG.length)];
  return NEU[Math.floor(rng() * NEU.length)];
}

function bodyFor(rating: Rating): { summary: string; keyPoints: string[] } {
  if (rating === 'buy' || rating === 'overweight') {
    return {
      summary: '公司营收增长超预期，业绩改善明显，拐点已现；产能扩张与新产品放量驱动需求旺盛，安全边际充足，维持看好。',
      keyPoints: ['业绩超预期', '增长', '看好', '扩产', '需求旺盛'],
    };
  }
  if (rating === 'sell' || rating === 'underweight') {
    return {
      summary: '行业竞争加剧，需求疲软，成本上升挤压毛利；监管风险犹存，估值偏高，减值风险上升，建议回避。',
      keyPoints: ['竞争加剧', '需求疲软', '监管风险', '成本上升'],
    };
  }
  return {
    summary: '公司业绩符合预期，行业景气平稳，等待进一步催化；维持中性观点。',
    keyPoints: ['符合预期', '平稳'],
  };
}

const POS_NEWS = [
  'XX股份业绩增长超预期，龙头份额持续提升',
  '行业创新高，政策利好驱动需求旺盛',
  '公司强势突破，回购增持彰显发展信心',
  '新产品量产，盈利能力大增获机构看好',
];
const NEG_NEWS = [
  'XX股份业绩下滑预警，竞争加剧引发担忧',
  '监管立案调查，相关公司暴雷风险上升',
  '大股东减持压力大，盈利预期下修',
  '行业诉讼纠纷发酵，短期承压明显',
];
const NEWS_SOURCE = ['证券时报', '上海证券报', '中国证券报', 'XX财经'];

export interface ReportDemoData {
  reports: ResearchReport[];
  news: NewsEvent[];
  currentPrices: Record<string, number>;
  stockNameMap: Record<string, string>;
}

/**
 * 生成研报 + 新闻确定性演示数据。纯函数：相同输入永远得到相同输出。
 */
export function getReportDemoData(): ReportDemoData {
  const rng = createLCG(BASE_SEED);
  const today = new Date();
  const reports: ResearchReport[] = [];
  const currentPrices: Record<string, number> = {};
  const stockNameMap: Record<string, string> = {};

  STOCKS.forEach((stock, si) => {
    currentPrices[stock.ticker] = stock.price;
    stockNameMap[stock.ticker] = stock.name;

    const start = si % (BROKERS.length - 2);
    const brokers = [BROKERS[start], BROKERS[start + 1], BROKERS[start + 2]];

    brokers.forEach((broker, bi) => {
      const analyst = ANALYSTS[(si * 3 + bi) % ANALYSTS.length];
      const r1Idx = pickRatingIndex(rng, stock.bias, stock.divided ? 2.2 : 1.4);
      const r1Rating = RATING_ORDER[r1Idx];
      const r1Date = dateStr(today, 50 + Math.floor(rng() * 60));
      const r1Target = round2(stock.price * mapRange(rng(), 1.05, 1.35));
      const body1 = bodyFor(r1Rating);
      reports.push({
        id: `${stock.ticker}-${bi}-1`,
        ticker: stock.ticker,
        broker,
        analyst,
        date: r1Date,
        type: 'initial',
        rating: r1Rating,
        targetPrice: r1Target,
        currentPrice: stock.price,
        title: titleFor(r1Rating, rng),
        summary: body1.summary,
        keyPoints: body1.keyPoints,
      });

      // 同一机构后续覆盖更新（产生评级变动追踪记录）
      if (bi < 2) {
        const dir: 1 | -1 = stock.trend === 1 ? 1 : stock.trend === -1 ? -1 : rng() > 0.5 ? 1 : -1;
        const r2Rating = differentRating(r1Rating, dir);
        const r2Date = dateStr(today, 2 + Math.floor(rng() * 40));
        const r2Target = round2(stock.price * mapRange(rng(), 1.08, 1.42));
        const body2 = bodyFor(r2Rating);
        reports.push({
          id: `${stock.ticker}-${bi}-2`,
          ticker: stock.ticker,
          broker,
          analyst,
          date: r2Date,
          type: 'update',
          rating: r2Rating,
          prevRating: r1Rating,
          targetPrice: r2Target,
          prevTargetPrice: r1Target,
          currentPrice: stock.price,
          title: titleFor(r2Rating, rng),
          summary: body2.summary,
          keyPoints: body2.keyPoints,
        });
      }
    });
  });

  // 强制分歧股（东方财富）同时存在买/卖评级，确保 findMostDivided 可高亮
  const divTicker = STOCKS.find((s) => s.divided)?.ticker ?? '';
  const divReports = reports.filter((r) => r.ticker === divTicker);
  const hasSell = divReports.some((r) => r.rating === 'sell' || r.rating === 'underweight');
  const hasBuy = divReports.some((r) => r.rating === 'buy' || r.rating === 'overweight');
  if (divTicker) {
    if (!hasSell && divReports[0]) {
      divReports[0].rating = 'sell';
      divReports[0].summary = '行业竞争加剧，需求疲软，成本上升；监管风险犹存，估值偏高，建议回避。';
      divReports[0].keyPoints = ['竞争加剧', '需求疲软', '监管风险'];
      divReports[0].title = '需求疲软，短期承压';
    }
    if (!hasBuy && divReports[divReports.length - 1]) {
      const r = divReports[divReports.length - 1];
      r.rating = 'buy';
      r.summary = '公司营收增长超预期，业绩改善明显，拐点已现，扩产与新产品驱动需求旺盛，安全边际充足。';
      r.keyPoints = ['业绩超预期', '增长', '看好'];
      r.title = '业绩超预期，维持高增长';
    }
  }

  // ── 新闻事件（约 20 条）──
  const news: NewsEvent[] = [];
  const newsCount = 20;
  for (let i = 0; i < newsCount; i++) {
    const stock = STOCKS[Math.floor(rng() * STOCKS.length)];
    const related = [stock.ticker];
    if (rng() > 0.6) {
      const other = STOCKS[Math.floor(rng() * STOCKS.length)];
      if (other.ticker !== stock.ticker) related.push(other.ticker);
    }
    const positive = rng() > 0.45;
    const title = positive
      ? POS_NEWS[Math.floor(rng() * POS_NEWS.length)]
      : NEG_NEWS[Math.floor(rng() * NEG_NEWS.length)];
    const content = positive
      ? `${title}。公司业绩增长超预期，机构看好长期价值，需求旺盛带动盈利改善。`
      : `${title}。行业竞争加剧、需求疲软，监管风险与减值压力上升，短期承压。`;
    const pub = `${dateStr(today, Math.floor(rng() * 30))} ${String(9 + Math.floor(rng() * 8)).padStart(2, '0')}:30`;
    news.push({
      id: `news-${i}`,
      title: title.replace('XX', stock.name),
      content: content.replace('XX', stock.name),
      publishTime: pub,
      source: NEWS_SOURCE[Math.floor(rng() * NEWS_SOURCE.length)],
      relatedStocks: related,
    });
  }

  return { reports, news, currentPrices, stockNameMap };
}
