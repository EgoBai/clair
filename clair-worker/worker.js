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

    return error('Not found', 404);
  },
};
