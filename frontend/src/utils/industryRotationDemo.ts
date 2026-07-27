/**
 * 行业对比矩阵 / 行业轮动信号 —— 确定性演示数据兜底
 *
 * 历史背景：本项目后端 API 多缺失，激活页统一用「确定性演示数据兜底」
 * （LCG 线性同余种子，如 seed=20260725），保证每次渲染稳定可复现。
 * 这里沿用同一模式：以固定基种子 + 行业名 hash 作为种子，
 * 用 LCG 生成每个行业的合理区间指标，确保数值稳定且可复现。
 *
 * 颜色约定：涨红跌绿（中国习惯），页面统一使用主题的
 * var(--color-up) / var(--color-down) 以适配深色/浅色主题。
 */

/** 申万一级行业（取主要 14 个，覆盖金融/消费/成长/周期/防御） */
export const SW_INDUSTRIES: string[] = [
  '银行',
  '食品饮料',
  '电子',
  '医药生物',
  '电力设备',
  '计算机',
  '汽车',
  '有色金属',
  '机械设备',
  '非银金融',
  '房地产',
  '建筑材料',
  '农林牧渔',
  '国防军工',
];

/** 确定性数据基种子（沿用项目约定的演示种子） */
const BASE_SEED = 20260725;

/** 字符串 → 32 位整数 hash（BKDR 风格） */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 线性同余发生器（LCG）：给定种子返回 [0,1) 的确定性序列 */
function createLCG(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // Numerical Recipes LCG 参数
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** 将 [0,1) 映射到 [min,max] */
function mapRange(r: number, min: number, max: number): number {
  return min + r * (max - min);
}

/** 轮动分组 */
export type RotationGroup = 'lead' | 'weak';

/** 单个行业的指标 + 轮动合成结果 */
export interface IndustryRotationRow {
  name: string;
  /** 近 1 月涨跌幅 % */
  change1m: number;
  /** 近 3 月涨跌幅 % */
  change3m: number;
  /** 市盈率 TTM */
  pe: number;
  /** 市净率 */
  pb: number;
  /** 净资产收益率 % */
  roe: number;
  /** 净利润增速 YoY % */
  profitGrowthYoY: number;
  /** 热度/拥挤度评分 0-100 */
  heatScore: number;
  /** 资金净流入强度（占成交比 %，可正可负） */
  fundFlow: number;
  /** 轮动动量分 = 近1月涨幅*0.6 + 资金净流入强度*0.4 */
  momentum: number;
  /** 分组：领涨/流入 或 走弱/流出 */
  group: RotationGroup;
}

export interface IndustryRotationDemo {
  rows: IndustryRotationRow[];
  /** 轮动概览结论文字（基于计算结果动态生成） */
  overview: string;
  /** 领涨/流入组行业名（按动量降序） */
  leadIndustries: string[];
  /** 走弱/流出组行业名（按动量升序） */
  weakIndustries: string[];
}

/**
 * 生成全行业对比 + 轮动信号确定性演示数据。
 * 纯函数：相同输入永远得到相同输出。
 */
export function getIndustryRotationDemo(): IndustryRotationDemo {
  const rows: IndustryRotationRow[] = SW_INDUSTRIES.map((name) => {
    const rng = createLCG((BASE_SEED + hashString(name)) >>> 0);

    const change1m = Number(mapRange(rng(), -12, 15).toFixed(2));
    const change3m = Number(mapRange(rng(), -20, 30).toFixed(2));
    const pe = Number(mapRange(rng(), 5, 60).toFixed(1));
    const pb = Number(mapRange(rng(), 0.8, 8).toFixed(2));
    const roe = Number(mapRange(rng(), -5, 25).toFixed(1));
    const profitGrowthYoY = Number(mapRange(rng(), -30, 80).toFixed(1));
    const heatScore = Number(mapRange(rng(), 15, 95).toFixed(0));
    // 资金净流入强度：占成交比，范围约 -8% ~ +10%
    const fundFlow = Number(mapRange(rng(), -8, 10).toFixed(2));

    // 轮动动量分（确定性合成分）
    const momentum = Number((change1m * 0.6 + fundFlow * 0.4).toFixed(2));
    const group: RotationGroup = momentum >= 0 ? 'lead' : 'weak';

    return {
      name,
      change1m,
      change3m,
      pe,
      pb,
      roe,
      profitGrowthYoY,
      heatScore,
      fundFlow,
      momentum,
      group,
    };
  });

  // 按动量降序排序
  const sorted = [...rows].sort((a, b) => b.momentum - a.momentum);
  const leadIndustries = sorted.filter((r) => r.group === 'lead').map((r) => r.name);
  const weakIndustries = [...sorted]
    .filter((r) => r.group === 'weak')
    .sort((a, b) => a.momentum - b.momentum)
    .map((r) => r.name);

  const leadTop = leadIndustries.slice(0, 2);
  const weakTop = weakIndustries.slice(0, 2);

  let overview: string;
  if (leadTop.length > 0 && weakTop.length > 0) {
    overview = `当前资金向 ${leadTop.join('/')} 板块集中（领涨/净流入），防御性板块 ${weakTop.join('/')} 走弱（流出），行业轮动呈现明显的结构性分化。`;
  } else if (leadTop.length > 0) {
    overview = `当前多数行业呈净流入态势，${leadTop.join('/')} 领涨，市场风格偏向成长与进攻。`;
  } else if (weakTop.length > 0) {
    overview = `当前多数行业资金流出，${weakTop.join('/')} 走弱，市场整体偏防御与避险。`;
  } else {
    overview = '当前行业轮动信号中性，无明显领涨或走弱方向。';
  }

  return {
    rows: sorted,
    overview,
    leadIndustries,
    weakIndustries,
  };
}
