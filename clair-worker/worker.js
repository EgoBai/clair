/**
 * Clair Worker — Cloudflare Workers 后端
 * 替代 Railway 后端，提供 A 股行情 API
 * 直接调用腾讯股票 API，无中间数据库层
 */

// ==================== 股票与指数定义 ====================

const INDEX_SYMBOLS = [
  { name: '上证指数', symbol: 'sh000001', tencent: 'sh000001' },
  { name: '深证成指', symbol: 'sz399001', tencent: 'sz399001' },
  { name: '创业板指', symbol: 'sz399006', tencent: 'sz399006' },
  { name: '科创50',   symbol: 'sh000688', tencent: 'sh000688' },
  { name: '沪深300',  symbol: 'sh000300', tencent: 'sh000300' },
  { name: '中证500',  symbol: 'sh000905', tencent: 'sh000905' },
  { name: '上证50',   symbol: 'sh000016', tencent: 'sh000016' },
  { name: '中证1000', symbol: 'sh000852', tencent: 'sh000852' },
  { name: '北证50',   symbol: 'bj899050', tencent: 'bj899050' },
];

const STOCKS = [
  { symbol: '000001', name: '平安银行', market: 'SZ', industry: '银行' },
  { symbol: '000002', name: '万科A',   market: 'SZ', industry: '房地产' },
  { symbol: '000858', name: '五粮液',  market: 'SZ', industry: '白酒' },
  { symbol: '002594', name: '比亚迪',  market: 'SZ', industry: '新能源汽车' },
  { symbol: '600036', name: '招商银行', market: 'SH', industry: '银行' },
  { symbol: '600519', name: '贵州茅台', market: 'SH', industry: '白酒' },
  { symbol: '601318', name: '中国平安', market: 'SH', industry: '保险' },
  { symbol: '601012', name: '隆基绿能', market: 'SH', industry: '光伏' },
  { symbol: '300750', name: '宁德时代', market: 'SZ', industry: '新能源电池' },
  { symbol: '300059', name: '东方财富', market: 'SZ', industry: '证券' },
  { symbol: '002475', name: '立讯精密', market: 'SZ', industry: '消费电子' },
  { symbol: '600900', name: '长江电力', market: 'SH', industry: '电力' },
  { symbol: '601888', name: '中国中免', market: 'SH', industry: '零售' },
  { symbol: '000333', name: '美的集团', market: 'SZ', industry: '家电' },
  { symbol: '600276', name: '恒瑞医药', market: 'SH', industry: '医药' },
  { symbol: '002415', name: '海康威视', market: 'SZ', industry: '安防' },
  { symbol: '601166', name: '兴业银行', market: 'SH', industry: '银行' },
  { symbol: '002714', name: '牧原股份', market: 'SZ', industry: '养殖' },
  { symbol: '600309', name: '万华化学', market: 'SH', industry: '化工' },
  { symbol: '002352', name: '顺丰控股', market: 'SZ', industry: '物流' },
  { symbol: '601899', name: '紫金矿业', market: 'SH', industry: '有色金属' },
  { symbol: '000568', name: '泸州老窖', market: 'SZ', industry: '白酒' },
  { symbol: '002230', name: '科大讯飞', market: 'SZ', industry: '人工智能' },
  { symbol: '688981', name: '中芯国际', market: 'SH', industry: '半导体' },
  { symbol: '300124', name: '汇川技术', market: 'SZ', industry: '工业自动化' },
  { symbol: '601857', name: '中国石油', market: 'SH', industry: '石油' },
  { symbol: '600030', name: '中信证券', market: 'SH', industry: '证券' },
  { symbol: '000725', name: '京东方A',  market: 'SZ', industry: '面板' },
  { symbol: '002049', name: '紫光国微', market: 'SZ', industry: '半导体' },
  { symbol: '300274', name: '阳光电源', market: 'SZ', industry: '光伏' },
  { symbol: '601138', name: '工业富联', market: 'SH', industry: '消费电子' },
  { symbol: '601398', name: '工商银行', market: 'SH', industry: '银行' },
  { symbol: '600809', name: '山西汾酒', market: 'SH', industry: '白酒' },
  { symbol: '002371', name: '北方华创', market: 'SZ', industry: '半导体' },
  { symbol: '603259', name: '药明康德', market: 'SH', industry: '医药' },
  { symbol: '300308', name: '中际旭创', market: 'SZ', industry: '光通信' },
  { symbol: '601728', name: '中国电信', market: 'SH', industry: '电信' },
  { symbol: '000063', name: '中兴通讯', market: 'SZ', industry: '通信设备' },
  { symbol: '600941', name: '中国移动', market: 'SH', industry: '电信' },
  { symbol: '688041', name: '海光信息', market: 'SH', industry: '半导体' },
  { symbol: '601127', name: '赛力斯',   market: 'SH', industry: '新能源汽车' },
  { symbol: '600690', name: '海尔智家', market: 'SH', industry: '家电' },
  { symbol: '000651', name: '格力电器', market: 'SZ', industry: '家电' },
  { symbol: '600887', name: '伊利股份', market: 'SH', industry: '食品饮料' },
  { symbol: '601088', name: '中国神华', market: 'SH', industry: '煤炭' },
  { symbol: '300760', name: '迈瑞医疗', market: 'SZ', industry: '医疗器械' },
  { symbol: '688012', name: '中微公司', market: 'SH', industry: '半导体' },
  { symbol: '002459', name: '晶澳科技', market: 'SZ', industry: '光伏' },
  { symbol: '601985', name: '中国核电', market: 'SH', industry: '电力' },
  { symbol: '300033', name: '同花顺',   market: 'SZ', industry: '金融科技' },
  { symbol: '688256', name: '寒武纪',   market: 'SH', industry: '人工智能' },
  { symbol: '600028', name: '中国石化', market: 'SH', industry: '石油' },
  { symbol: '300014', name: '亿纬锂能', market: 'SZ', industry: '新能源电池' },
  { symbol: '002920', name: '德赛西威', market: 'SZ', industry: '智能驾驶' },
];

// ==================== 腾讯 API 解析 ====================

/**
 * 腾讯行情 API 返回 GBK 编码的文本
 * 格式: v_sh600519="1~贵州茅台~600519~1850.00~..."
 * 字段索引: 1=name, 2=symbol, 3=price, 4=prevClose, 5=open, 6=volume,
 *   32=changePercent, 33=high, 34=low, 37=turnover, 38=turnoverRate, 39=peRatio
 */
async function fetchTencentQuotes(tencentSymbols) {
  const url = `https://qt.gtimg.cn/q=${tencentSymbols.join(',')}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://finance.qq.com',
    },
  });

  const buffer = await resp.arrayBuffer();
  // GBK → UTF-8 解码
  const decoder = new TextDecoder('gbk');
  const text = decoder.decode(buffer);

  const results = [];
  const lines = text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const m = line.match(/v_(\w+)="(.+)"/);
    if (!m) continue;
    const parts = m[2].split('~');
    if (parts.length < 40) continue;
    const v = (i) => { const n = parseFloat(parts[i]); return isFinite(n) ? n : 0; };
    results.push({
      symbol: parts[2],
      name: parts[1],
      price: v(3),
      prevClose: v(4),
      open: v(5),
      volume: v(6),
      changePercent: v(32),
      high: v(33),
      low: v(34),
      turnover: v(37),
      turnoverRate: v(38),
      peRatio: (() => { const n = parseFloat(parts[39]); return isFinite(n) && n > 0 ? n : undefined; })(),
    });
  }
  return results;
}

// ==================== 缓存层 ====================

let cacheData = null;
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30 秒缓存

async function getAllQuotes() {
  const now = Date.now();
  if (cacheData && (now - cacheTime) < CACHE_TTL) return cacheData;

  // 腾讯 API 格式: sh600519,sz000858 (收盘后 index 前缀变 sz 或 sh)
  const allSymbols = [
    ...INDEX_SYMBOLS.map(i => i.tencent),
    ...STOCKS.map(s => `${s.market === 'SH' ? 'sh' : 'sz'}${s.symbol}`),
  ];

  // 分批请求（腾讯 API 建议每批不超过 50 个）
  const batchSize = 50;
  const batches = [];
  for (let i = 0; i < allSymbols.length; i += batchSize) {
    batches.push(allSymbols.slice(i, i + batchSize));
  }

  const allResults = [];
  for (const batch of batches) {
    const results = await fetchTencentQuotes(batch);
    allResults.push(...results);
  }

  // 建立 symbol → quote 映射
  const quoteMap = {};
  for (const q of allResults) {
    quoteMap[q.symbol] = q;
  }

  cacheData = { quotes: allResults, quoteMap, allSymbols };
  cacheTime = now;
  return cacheData;
}

// ==================== 路由处理 ====================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=15',
    },
  });
}

function error(msg, status = 500) {
  return json({ success: false, error: msg }, status);
}

async function handleMarketIndices() {
  try {
    const { quoteMap } = await getAllQuotes();

    // 腾讯 index 符号匹配：指数用 sz000001 格式
    const indices = INDEX_SYMBOLS.map(idx => {
      const q = quoteMap[idx.tencent] || quoteMap[idx.symbol];
      if (!q) return {
        symbol: idx.symbol,
        name: idx.name,
        closePrice: 0,
        changePercent: 0,
        volume: 0,
        category: 'index',
      };
      return {
        symbol: idx.symbol,
        name: idx.name,
        closePrice: q.price,
        changePercent: q.changePercent,
        volume: q.volume,
        category: 'index',
      };
    });

    return json({ data: { indices }, success: true });
  } catch (e) {
    return error(e.message);
  }
}

async function handleSectorMomentum() {
  try {
    const { quotes } = await getAllQuotes();

    // 按行业聚合
    const sectorMap = {};
    for (const stock of STOCKS) {
      const tencentSym = `${stock.market === 'SH' ? 'sh' : 'sz'}${stock.symbol}`;
      const q = quotes.find(qu => qu.symbol === stock.symbol);
      if (!q) continue;

      if (!sectorMap[stock.industry]) {
        sectorMap[stock.industry] = {
          stocks: [],
          totalChange: 0,
          totalVolume: 0,
          totalTurnover: 0,
          limitUpCount: 0,
        };
      }
      sectorMap[stock.industry].stocks.push({ ...stock, quote: q });
      sectorMap[stock.industry].totalChange += q.changePercent;
      sectorMap[stock.industry].totalVolume += q.volume;
      sectorMap[stock.industry].totalTurnover += q.turnover;
      if (q.changePercent >= 9.9) sectorMap[stock.industry].limitUpCount++;
    }

    // 计算得分
    const sectors = Object.entries(sectorMap).map(([industry, data]) => {
      const count = data.stocks.length;
      const avgChange = data.totalChange / count;
      const upCount = data.stocks.filter(s => s.quote.changePercent > 0).length;
      const breadthScore = (upCount / count) * 100;

      // 综合评分: 涨跌幅40% + 上涨广度30% + 成交量30%
      const changeScore = Math.min(100, Math.max(0, 50 + avgChange * 10));
      const volumeScore = Math.min(100, Math.max(0, Math.log10(data.totalVolume / count + 1) * 10));
      const score = Math.round(changeScore * 0.4 + breadthScore * 0.3 + volumeScore * 0.3);

      return {
        industry,
        score,
        changeScore: Math.round(changeScore),
        volumeScore: Math.round(volumeScore),
        breadthScore: Math.round(breadthScore),
        stock_count: count,
        avg_change_percent: Math.round(avgChange * 100) / 100,
        total_turnover: data.totalTurnover,
        limit_up_count: data.limitUpCount,
      };
    });

    sectors.sort((a, b) => b.score - a.score);

    return json({ data: { sectors }, success: true });
  } catch (e) {
    return error(e.message);
  }
}

async function handleSectorStocks(industry, pageSize = 50) {
  try {
    const { quotes } = await getAllQuotes();
    const decodedIndustry = decodeURIComponent(industry);

    const matched = STOCKS
      .filter(s => s.industry === decodedIndustry)
      .map(s => {
        const tencentSym = `${s.market === 'SH' ? 'sh' : 'sz'}${s.symbol}`;
        const q = quotes.find(qu => qu.symbol === s.symbol);
        return {
          symbol: s.symbol,
          name: s.name,
          market: s.market,
          industry: s.industry,
          latestQuote: q ? {
            closePrice: q.price,
            changePercent: q.changePercent,
            turnoverRate: q.turnoverRate,
            peRatio: q.peRatio,
          } : null,
        };
      })
      .sort((a, b) => (b.latestQuote?.changePercent || 0) - (a.latestQuote?.changePercent || 0));

    const page = 1;
    const paged = matched.slice(0, pageSize);
    const total = matched.length;

    return json({
      data: { items: paged, total, page, pageSize },
      success: true,
    });
  } catch (e) {
    return error(e.message);
  }
}

async function handleStockDetail(symbol) {
  try {
    const stock = STOCKS.find(s => s.symbol === symbol);
    if (!stock) return error('Stock not found', 404);

    const { quotes } = await getAllQuotes();
    const q = quotes.find(qu => qu.symbol === symbol);

    if (!q) return error('Quote not available', 404);

    return json({
      data: {
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        industry: stock.industry,
        quote: {
          price: q.price,
          prevClose: q.prevClose,
          open: q.open,
          high: q.high,
          low: q.low,
          volume: q.volume,
          turnover: q.turnover,
          changePercent: q.changePercent,
          turnoverRate: q.turnoverRate,
          peRatio: q.peRatio,
        },
      },
      success: true,
    });
  } catch (e) {
    return error(e.message);
  }
}

async function handleStockSearch(q) {
  const keyword = (q || '').toLowerCase();
  const results = STOCKS
    .filter(s => s.symbol.includes(keyword) || s.name.includes(keyword))
    .slice(0, 20)
    .map(s => ({ symbol: s.symbol, name: s.name, market: s.market, industry: s.industry }));
  return json({ data: { items: results }, success: true });
}

// ==================== Phase 2: AI 市场解读 ====================

function generateMarketInsight(indices, sectors) {
  const upIndices = indices.filter(i => i.changePercent > 0);
  const downIndices = indices.filter(i => i.changePercent < 0);
  const topSectors = sectors.slice(0, 3);
  const bottomSectors = sectors.slice(-3).reverse();
  const avgIndexChange = indices.reduce((s, i) => s + i.changePercent, 0) / indices.length;
  const marketBreadth = upIndices.length / indices.length;

  // 市场状态判定
  let mood, moodEmoji, moodColor;
  if (avgIndexChange > 1 && marketBreadth > 0.7) {
    mood = '强势上涨'; moodEmoji = '🔥'; moodColor = '#cf2a2a';
  } else if (avgIndexChange > 0.3) {
    mood = '温和上行'; moodEmoji = '📈'; moodColor = '#f59e0b';
  } else if (avgIndexChange > -0.3) {
    mood = '震荡整理'; moodEmoji = '⚖️'; moodColor = '#94a3b8';
  } else if (avgIndexChange > -1) {
    mood = '弱势调整'; moodEmoji = '📉'; moodColor = '#3b82f6';
  } else {
    mood = '大幅下挫'; moodEmoji = '🌧️'; moodColor = '#1db468';
  }

  // 生成解读文本
  const indexSummary = indices.slice(0, 3).map(i =>
    `${i.name} ${i.changePercent > 0 ? '+' : ''}${i.changePercent.toFixed(2)}%`
  ).join('，');

  const sectorSummary = topSectors.map(s =>
    `${s.industry}(+${s.avg_change_percent}% ${s.limit_up_count > 0 ? s.limit_up_count + '家涨停' : ''})`
  ).join('、');

  const weakSummary = bottomSectors[0]
    ? `${bottomSectors[0].industry}(${bottomSectors[0].avg_change_percent}%)`
    : '';

  const lines = [
    `${moodEmoji} 今日市场${mood}`,
    '',
    `**指数表现**`,
    `${indexSummary}`,
    `上涨 ${upIndices.length} 个 / 下跌 ${downIndices.length} 个，市场宽度 ${Math.round(marketBreadth * 100)}%`,
    '',
    `**领涨板块**`,
    `${sectorSummary}`,
    '',
    `**弱势板块**`,
    `${weakSummary}`,
    '',
    avgIndexChange > 0.5
      ? '💡 资金集中在领涨板块，关注板块内龙头股的持续性。'
      : avgIndexChange < -0.3
        ? '💡 市场调整中，关注抗跌板块和低估值品种，控制仓位。'
        : '💡 市场方向不明，建议多看少动，等待趋势明朗。',
  ];

  return {
    mood,
    moodEmoji,
    moodColor,
    text: lines.join('\n'),
    marketBreadth: {
      up: upIndices.length,
      down: downIndices.length,
      neutral: indices.length - upIndices.length - downIndices.length,
      breadthRatio: marketBreadth,
    },
    avgIndexChange: Math.round(avgIndexChange * 100) / 100,
    topSectors: topSectors.map(s => ({ industry: s.industry, score: s.score, avgChange: s.avg_change_percent })),
    weakSectors: bottomSectors.map(s => ({ industry: s.industry, score: s.score, avgChange: s.avg_change_percent })),
    timestamp: Date.now(),
  };
}

async function handleMarketInsight() {
  try {
    const { quoteMap } = await getAllQuotes();
    const indices = INDEX_SYMBOLS.map(idx => {
      const q = quoteMap[idx.tencent] || quoteMap[idx.symbol];
      return {
        name: idx.name,
        symbol: idx.symbol,
        changePercent: q ? q.changePercent : 0,
      };
    });

    // Get sectors for context
    const sectors = await getSectorData();

    const insight = generateMarketInsight(indices, sectors);
    return json({ data: insight, success: true });
  } catch (e) {
    return error(e.message);
  }
}

// Extract sector data for reuse
async function getSectorData() {
  const { quotes } = await getAllQuotes();
  const sectorMap = {};
  for (const stock of STOCKS) {
    const q = quotes.find(qu => qu.symbol === stock.symbol);
    if (!q) continue;
    if (!sectorMap[stock.industry]) {
      sectorMap[stock.industry] = { stocks: [], totalChange: 0, totalVolume: 0, totalTurnover: 0, limitUpCount: 0 };
    }
    sectorMap[stock.industry].stocks.push({ ...stock, quote: q });
    sectorMap[stock.industry].totalChange += q.changePercent;
    sectorMap[stock.industry].totalVolume += q.volume;
    sectorMap[stock.industry].totalTurnover += q.turnover;
    if (q.changePercent >= 9.9) sectorMap[stock.industry].limitUpCount++;
  }

  return Object.entries(sectorMap).map(([industry, data]) => {
    const count = data.stocks.length;
    const avgChange = data.totalChange / count;
    const upCount = data.stocks.filter(s => s.quote.changePercent > 0).length;
    const breadthScore = (upCount / count) * 100;
    const changeScore = Math.min(100, Math.max(0, 50 + avgChange * 10));
    const volumeScore = Math.min(100, Math.max(0, Math.log10(data.totalVolume / count + 1) * 10));

    // Phase 2 增强: 动量 + 趋势强度 + 广度 + 集中度
    const momentumScore = Math.min(100, Math.max(0, 50 + avgChange * 8));
    const trendScore = changeScore;
    const concentrationScore = count <= 3 ? 70 : count <= 6 ? 80 : 90;
    const score = Math.round(momentumScore * 0.35 + trendScore * 0.25 + breadthScore * 0.25 + concentrationScore * 0.15);

    return {
      industry, score,
      changeScore: Math.round(changeScore),
      volumeScore: Math.round(volumeScore),
      breadthScore: Math.round(breadthScore),
      momentumScore: Math.round(momentumScore),
      trendScore: Math.round(trendScore),
      concentrationScore,
      stock_count: count,
      avg_change_percent: Math.round(avgChange * 100) / 100,
      total_turnover: data.totalTurnover,
      limit_up_count: data.limitUpCount,
    };
  }).sort((a, b) => b.score - a.score);
}

// ==================== Phase 3: 策略信号引擎 ====================

/**
 * 计算简单移动平均线
 */
function calcSMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((s, p) => s + p, 0) / period;
}

/**
 * 计算 EMA
 */
function calcEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * 计算 MACD
 */
function calcMACD(prices) {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  if (!ema12 || !ema26) return { dif: null, dea: null, macd: null, signal: 'insufficient_data' };

  const dif = ema12 - ema26;
  // DEA = 9-period EMA of DIF — simplified: use DIF difference approach
  const dea = dif * 0.2 + (ema12 * 0.8 - ema26 * 0.8) * 0.1;
  const macd = (dif - (dea || dif)) * 2;

  let signal;
  if (macd > 0 && dif > (dea || dif)) signal = 'bullish';
  else if (macd < 0 && dif < (dea || dif)) signal = 'bearish';
  else if (macd > 0) signal = 'weakening';
  else signal = 'recovering';

  return {
    dif: Math.round(dif * 10000) / 10000,
    dea: dea ? Math.round(dea * 10000) / 10000 : null,
    macd: Math.round(macd * 10000) / 10000,
    signal,
  };
}

/**
 * 计算 RSI
 */
function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

/**
 * 计算支撑位和压力位
 */
function calcSupportResistance(prices) {
  if (prices.length < 20) return { support: null, resistance: null };
  const recent = prices.slice(-20);
  const sorted = [...recent].sort((a, b) => a - b);
  const low25 = sorted[Math.floor(sorted.length * 0.25)];
  const high75 = sorted[Math.floor(sorted.length * 0.75)];
  const current = prices[prices.length - 1];

  return {
    support: Math.round((low25 * 0.7 + recent.reduce((a, b) => Math.min(a, b)) * 0.3) * 100) / 100,
    resistance: Math.round((high75 * 0.7 + recent.reduce((a, b) => Math.max(a, b)) * 0.3) * 100) / 100,
    supportDistance: Math.round((current - low25) / current * 10000) / 100,
    resistanceDistance: Math.round((high75 - current) / current * 10000) / 100,
  };
}

/**
 * 策略综合评估
 */
function generateStrategy(quote, prices) {
  const currentPrice = quote.price;
  const ma5 = calcSMA(prices, 5);
  const ma10 = calcSMA(prices, 10);
  const ma20 = calcSMA(prices, 20);
  const ma60 = calcSMA(prices, 60);
  const macd = calcMACD(prices);
  const rsi14 = calcRSI(prices, 14);
  const sr = calcSupportResistance(prices);

  // 均线排列
  let maAlignment = 'neutral';
  if (ma5 && ma10 && ma20 && ma60) {
    if (ma5 > ma10 && ma10 > ma20 && ma20 > ma60) maAlignment = 'bullish_perfect';
    else if (ma5 > ma10 && ma10 > ma20) maAlignment = 'bullish';
    else if (ma5 < ma10 && ma10 < ma20 && ma20 < ma60) maAlignment = 'bearish_perfect';
    else if (ma5 < ma10 && ma10 < ma20) maAlignment = 'bearish';
  }

  // 金叉/死叉检测
  let crossover = 'none';
  if (ma5 && ma10) {
    const prevMA5 = calcSMA(prices.slice(0, -1), 5);
    const prevMA10 = calcSMA(prices.slice(0, -1), 10);
    if (prevMA5 && prevMA10) {
      if (prevMA5 <= prevMA10 && ma5 > ma10) crossover = 'golden_cross';
      else if (prevMA5 >= prevMA10 && ma5 < ma10) crossover = 'death_cross';
    }
  }

  // 综合评分 (0-100)
  let score = 50;
  if (maAlignment.includes('bullish')) score += 20;
  if (maAlignment.includes('bearish')) score -= 20;
  if (crossover === 'golden_cross') score += 10;
  if (crossover === 'death_cross') score -= 10;
  if (macd.signal === 'bullish') score += 10;
  if (macd.signal === 'bearish') score -= 10;
  if (rsi14 !== null) {
    if (rsi14 < 30) score += 10; // 超卖反弹
    if (rsi14 > 70) score -= 10; // 超买回调
  }
  if (sr.supportDistance !== null && sr.supportDistance > -3) score += 5;
  if (sr.resistanceDistance !== null && sr.resistanceDistance < 3) score -= 5;
  score = Math.max(0, Math.min(100, score));

  // 仓位建议
  let position = '观望';
  let positionPct = 0;
  if (score >= 75) { position = '积极建仓'; positionPct = 80; }
  else if (score >= 60) { position = '适度参与'; positionPct = 50; }
  else if (score >= 40) { position = '轻仓试探'; positionPct = 20; }
  else if (score >= 25) { position = '减仓观望'; positionPct = 10; }
  else { position = '清仓回避'; positionPct = 0; }

  // 止损位: 支撑位下方2% 或 当前价-5%
  const stopLoss = sr.support
    ? Math.round(Math.min(sr.support * 0.98, currentPrice * 0.95) * 100) / 100
    : Math.round(currentPrice * 0.93 * 100) / 100;

  return {
    symbol: quote.symbol,
    currentPrice,
    score,
    rating: score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 25 ? 'D' : 'E',
    position,
    positionPct,
    stopLoss,
    stopLossPct: Math.round((currentPrice - stopLoss) / currentPrice * 10000) / 100,
    takeProfit: Math.round(currentPrice * 1.15 * 100) / 100,
    indicators: {
      ma5: ma5 ? Math.round(ma5 * 100) / 100 : null,
      ma10: ma10 ? Math.round(ma10 * 100) / 100 : null,
      ma20: ma20 ? Math.round(ma20 * 100) / 100 : null,
      ma60: ma60 ? Math.round(ma60 * 100) / 100 : null,
      maAlignment,
      rsi14,
      macd,
      crossover,
      supportResistance: sr,
    },
    summary: generateStrategySummary(score, maAlignment, crossover, macd.signal, rsi14),
  };
}

function generateStrategySummary(score, maAlignment, crossover, macdSignal, rsi) {
  const parts = [];
  if (score >= 75) parts.push('多项指标共振看多，技术面强势');
  else if (score >= 60) parts.push('技术面偏多，可适度参与');
  else if (score >= 40) parts.push('信号中性，方向不明');
  else if (score >= 25) parts.push('技术面偏弱，注意风险');
  else parts.push('多项指标看空，建议回避');

  if (maAlignment.includes('bullish_perfect')) parts.push('均线多头排列完美');
  else if (maAlignment.includes('bullish')) parts.push('短期均线多头');
  else if (maAlignment.includes('bearish_perfect')) parts.push('均线空头排列');
  else if (maAlignment.includes('bearish')) parts.push('短期均线空头');

  if (crossover === 'golden_cross') parts.push('5日线上穿10日线(金叉)');
  if (crossover === 'death_cross') parts.push('5日线下穿10日线(死叉)');

  if (macdSignal === 'bullish') parts.push('MACD金叉');
  if (macdSignal === 'bearish') parts.push('MACD死叉');

  if (rsi !== null) {
    if (rsi > 70) parts.push(`RSI超买(${rsi})`);
    else if (rsi < 30) parts.push(`RSI超卖(${rsi})`);
    else parts.push(`RSI中性(${rsi})`);
  }

  return parts.join('；');
}

/**
 * Fetch K-line data from Tencent API
 */
async function fetchKLine(symbol) {
  const stock = STOCKS.find(s => s.symbol === symbol);
  if (!stock) return null;
  const tencentSymbol = `${stock.market === 'SH' ? 'sh' : 'sz'}${symbol}`;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentSymbol},day,,,120,qfq`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://finance.qq.com',
      },
    });
    const data = await resp.json();
    const dayData = data?.data?.[tencentSymbol]?.day || data?.data?.[tencentSymbol]?.qfqday;
    if (!dayData || !Array.isArray(dayData)) return null;

    // Extract close prices: dayData is [date, open, close, high, low, volume]
    return dayData.map(d => parseFloat(d[2])).filter(p => isFinite(p) && p > 0);
  } catch {
    return null;
  }
}

async function handleStockStrategy(symbol) {
  try {
    const { quotes } = await getAllQuotes();
    const q = quotes.find(qu => qu.symbol === symbol);
    if (!q) return error('Quote not available', 404);

    const prices = await fetchKLine(symbol);
    if (!prices || prices.length < 30) {
      // Fallback: use available data with simulated K-line
      return json({
        data: {
          symbol,
          currentPrice: q.price,
          note: 'K线数据不足(需≥30日)，展示基础指标',
          basic: {
            changePercent: q.changePercent,
            turnoverRate: q.turnoverRate,
            peRatio: q.peRatio,
            volume: q.volume,
          },
        },
        success: true,
      });
    }

    const strategy = generateStrategy(q, prices);
    return json({ data: strategy, success: true });
  } catch (e) {
    return error(e.message);
  }
}

// ==================== 主入口 ====================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Health check
    if (path === '/health' || path === '/') {
      return json({ status: 'ok', service: 'clair-worker', timestamp: Date.now() });
    }

    // Market indices
    if (path === '/api/market/indices') {
      return handleMarketIndices();
    }

    // Sector momentum
    if (path === '/api/sectors/momentum') {
      return handleSectorMomentum();
    }

    // Sector stocks: /api/sectors/:industry/stocks
    const sectorStocksMatch = path.match(/^\/api\/sectors\/(.+)\/stocks$/);
    if (sectorStocksMatch) {
      const pageSize = parseInt(url.searchParams.get('pageSize') || '50');
      return handleSectorStocks(sectorStocksMatch[1], pageSize);
    }

    // Stock detail: /api/stocks/:symbol
    const stockMatch = path.match(/^\/api\/stocks\/(\d+)$/);
    if (stockMatch) {
      return handleStockDetail(stockMatch[1]);
    }

    // Stock search: /api/stocks/search?q=
    if (path === '/api/stocks/search') {
      return handleStockSearch(url.searchParams.get('q'));
    }

    // Phase 2: AI market insight
    if (path === '/api/ai/market-insight') {
      return handleMarketInsight();
    }

    // Phase 3: Stock strategy: /api/stocks/:symbol/strategy
    const strategyMatch = path.match(/^\/api\/stocks\/(\d+)\/strategy$/);
    if (strategyMatch) {
      return handleStockStrategy(strategyMatch[1]);
    }

    return error('Not found', 404);
  },
};
