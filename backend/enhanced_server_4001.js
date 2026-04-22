const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 4001;

// 启用CORS
app.use(cors());

// 解析JSON请求体
app.use(express.json());

// 模拟股票数据
const mockStocks = [
  { id: 1, symbol: '000001', name: '平安银行', market: 'SZ', industry: '银行', price: 15.32, change: 0.45, volume: 12543000, marketCap: 298.5 },
  { id: 2, symbol: '000002', name: '万科A', market: 'SZ', industry: '房地产', price: 18.76, change: -0.23, volume: 8765400, marketCap: 218.9 },
  { id: 3, symbol: '600036', name: '招商银行', market: 'SH', industry: '银行', price: 32.45, change: 1.25, volume: 23456000, marketCap: 820.3 },
  { id: 4, symbol: '600519', name: '贵州茅台', market: 'SH', industry: '食品饮料', price: 1680.50, change: 12.80, volume: 4567000, marketCap: 2100.8 },
  { id: 5, symbol: '000858', name: '五粮液', market: 'SZ', industry: '食品饮料', price: 145.60, change: -2.30, volume: 9876000, marketCap: 565.4 },
  { id: 6, symbol: '002415', name: '海康威视', market: 'SZ', industry: '电子', price: 32.18, change: 0.68, volume: 6543200, marketCap: 301.2 },
  { id: 7, symbol: '300750', name: '宁德时代', market: 'SZ', industry: '电力设备', price: 185.40, change: 3.20, volume: 12345000, marketCap: 810.5 },
  { id: 8, symbol: '601318', name: '中国平安', market: 'SH', industry: '非银金融', price: 42.35, change: -0.85, volume: 8765400, marketCap: 775.8 },
  { id: 9, symbol: '000333', name: '美的集团', market: 'SZ', industry: '家用电器', price: 56.78, change: 0.92, volume: 5432100, marketCap: 398.6 },
  { id: 10, symbol: '002594', name: '比亚迪', market: 'SZ', industry: '汽车', price: 210.25, change: 5.60, volume: 9876500, marketCap: 612.3 },
];

// 生成模拟日线数据
function generateDailyQuotes(stockId, days = 30) {
  const quotes = [];
  const basePrice = mockStocks.find(s => s.id === stockId)?.price || 100;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const open = basePrice * (0.95 + Math.random() * 0.1);
    const close = open * (0.98 + Math.random() * 0.04);
    const high = Math.max(open, close) * (1 + Math.random() * 0.03);
    const low = Math.min(open, close) * (0.97 - Math.random() * 0.03);
    const volume = Math.floor(1000000 + Math.random() * 9000000);
    
    quotes.push({
      id: stockId * 1000 + i,
      stockId: stockId,
      tradeDate: date.toISOString().split('T')[0],
      openPrice: parseFloat(open.toFixed(2)),
      closePrice: parseFloat(close.toFixed(2)),
      highPrice: parseFloat(high.toFixed(2)),
      lowPrice: parseFloat(low.toFixed(2)),
      changePercent: parseFloat(((close - open) / open * 100).toFixed(2)),
      volume: volume,
      turnover: parseFloat((volume * close).toFixed(2)),
      marketCap: parseFloat((volume * close * 10).toFixed(2)),
    });
  }
  
  return quotes;
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'A股行情分析后端',
    version: '1.5.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/stocks',
      '/api/stocks/:symbol',
      '/api/stocks/:symbol/quotes',
      '/api/market/summary',
      '/api/market/top-gainers',
      '/api/market/top-losers',
    ],
  });
});

// ========== 前端期望的API端点 ==========

// 1. 获取所有股票
app.get('/api/stocks', (req, res) => {
  const { page = 1, limit = 10, sort = 'symbol', order = 'asc' } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  
  // 排序
  let sortedStocks = [...mockStocks];
  sortedStocks.sort((a, b) => {
    if (order === 'asc') {
      return a[sort] > b[sort] ? 1 : -1;
    } else {
      return a[sort] < b[sort] ? 1 : -1;
    }
  });
  
  // 分页
  const start = (pageNum - 1) * limitNum;
  const end = start + limitNum;
  const paginatedStocks = sortedStocks.slice(start, end);
  
  // 添加最新报价
  const stocksWithQuotes = paginatedStocks.map(stock => {
    const quote = generateDailyQuotes(stock.id, 0)[0]; // 最新一天
    return {
      ...stock,
      latestQuote: quote,
    };
  });
  
  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    data: stocksWithQuotes,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: mockStocks.length,
      pages: Math.ceil(mockStocks.length / limitNum),
    },
  });
});

// 2. 获取单个股票
app.get('/api/stocks/:symbol', (req, res) => {
  const symbol = req.params.symbol;
  const stock = mockStocks.find(s => s.symbol === symbol);
  
  if (stock) {
    const quote = generateDailyQuotes(stock.id, 0)[0];
    res.json({
      status: 'success',
      data: {
        ...stock,
        latestQuote: quote,
      },
    });
  } else {
    res.status(404).json({
      status: 'error',
      message: `股票代码 ${symbol} 不存在`,
    });
  }
});

// 3. 获取股票日线数据
app.get('/api/stocks/:symbol/quotes', (req, res) => {
  const symbol = req.params.symbol;
  const { days = 30, startDate, endDate } = req.query;
  const stock = mockStocks.find(s => s.symbol === symbol);
  
  if (stock) {
    const quotes = generateDailyQuotes(stock.id, parseInt(days));
    
    // 日期过滤
    let filteredQuotes = quotes;
    if (startDate) {
      filteredQuotes = filteredQuotes.filter(q => q.tradeDate >= startDate);
    }
    if (endDate) {
      filteredQuotes = filteredQuotes.filter(q => q.tradeDate <= endDate);
    }
    
    res.json({
      status: 'success',
      data: filteredQuotes,
      stock: {
        symbol: stock.symbol,
        name: stock.name,
      },
    });
  } else {
    res.status(404).json({
      status: 'error',
      message: `股票代码 ${symbol} 不存在`,
    });
  }
});

// 4. 市场概况
app.get('/api/market/summary', (req, res) => {
  const risingStocks = mockStocks.filter(s => s.change > 0).length;
  const fallingStocks = mockStocks.filter(s => s.change < 0).length;
  const unchangedStocks = mockStocks.filter(s => s.change === 0).length;
  
  const totalMarketCap = mockStocks.reduce((sum, s) => sum + s.marketCap, 0);
  const totalVolume = mockStocks.reduce((sum, s) => sum + s.volume, 0);
  
  res.json({
    status: 'success',
    data: {
      date: new Date().toISOString().split('T')[0],
      totalStocks: mockStocks.length,
      totalMarketCap: parseFloat(totalMarketCap.toFixed(2)),
      totalVolume: totalVolume,
      totalTurnover: parseFloat((totalVolume * 15).toFixed(2)), // 模拟成交额
      risingStocks: risingStocks,
      fallingStocks: fallingStocks,
      unchangedStocks: unchangedStocks,
      avgChangePercent: parseFloat((mockStocks.reduce((sum, s) => sum + s.change, 0) / mockStocks.length).toFixed(2)),
    },
  });
});

// 5. 涨幅榜
app.get('/api/market/top-gainers', (req, res) => {
  const { limit = 10 } = req.query;
  const gainers = [...mockStocks]
    .filter(s => s.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, parseInt(limit))
    .map(stock => ({
      ...stock,
      latestQuote: generateDailyQuotes(stock.id, 0)[0],
    }));
  
  res.json({
    status: 'success',
    data: gainers,
  });
});

// 6. 跌幅榜
app.get('/api/market/top-losers', (req, res) => {
  const { limit = 10 } = req.query;
  const losers = [...mockStocks]
    .filter(s => s.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, parseInt(limit))
    .map(stock => ({
      ...stock,
      latestQuote: generateDailyQuotes(stock.id, 0)[0],
    }));
  
  res.json({
    status: 'success',
    data: losers,
  });
});

// 7. 搜索股票
app.get('/api/stocks/search/:keyword', (req, res) => {
  const keyword = req.params.keyword.toLowerCase();
  const results = mockStocks.filter(stock => 
    stock.name.toLowerCase().includes(keyword) || 
    stock.symbol.includes(keyword)
  ).map(stock => ({
    ...stock,
    latestQuote: generateDailyQuotes(stock.id, 0)[0],
  }));
  
  res.json({
    status: 'success',
    data: results,
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 A股行情分析后端服务已启动`);
  console.log(`📊 服务地址: http://localhost:${PORT}`);
  console.log(`🔍 健康检查: http://localhost:${PORT}/health`);
  console.log(`📈 API端点:`);
  console.log(`   • GET /api/stocks - 获取股票列表`);
  console.log(`   • GET /api/stocks/:symbol - 获取单个股票`);
  console.log(`   • GET /api/stocks/:symbol/quotes - 获取股票日线`);
  console.log(`   • GET /api/market/summary - 市场概况`);
  console.log(`   • GET /api/market/top-gainers - 涨幅榜`);
  console.log(`   • GET /api/market/top-losers - 跌幅榜`);
  console.log(`   • GET /api/stocks/search/:keyword - 搜索股票`);
});