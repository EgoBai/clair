const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 4001; // 使用4001端口避免冲突

// 中间件
app.use(cors());
app.use(express.json());

// 模拟股票数据
const mockStocks = [
  { code: '000001', name: '平安银行', price: 12.34, change: 0.23, volume: 1234567 },
  { code: '000002', name: '万科A', price: 8.56, change: -0.12, volume: 987654 },
  { code: '600519', name: '贵州茅台', price: 1567.89, change: 15.67, volume: 34567 },
  { code: '000858', name: '五粮液', price: 123.45, change: 2.34, volume: 234567 },
  { code: '002415', name: '海康威视', price: 34.56, change: -0.45, volume: 456789 },
];

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'A股行情分析后端',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 获取股票数据
app.get('/api/stocks', (req, res) => {
  // 添加一些随机变化
  const stocks = mockStocks.map(stock => ({
    ...stock,
    price: stock.price + (Math.random() - 0.5) * 0.1,
    change: stock.change + (Math.random() - 0.5) * 0.05,
  }));
  
  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    stocks: stocks,
    count: stocks.length,
  });
});

// 获取单个股票
app.get('/api/stocks/:code', (req, res) => {
  const code = req.params.code;
  const stock = mockStocks.find(s => s.code === code);
  
  if (stock) {
    res.json({
      status: 'success',
      stock: {
        ...stock,
        price: stock.price + (Math.random() - 0.5) * 0.1,
        change: stock.change + (Math.random() - 0.5) * 0.05,
      },
    });
  } else {
    res.status(404).json({
      status: 'error',
      message: `股票代码 ${code} 不存在`,
    });
  }
});

// 搜索股票
app.get('/api/stocks/search/:keyword', (req, res) => {
  const keyword = req.params.keyword.toLowerCase();
  const results = mockStocks.filter(stock => 
    stock.name.toLowerCase().includes(keyword) || 
    stock.code.includes(keyword)
  );
  
  res.json({
    status: 'success',
    results: results,
    count: results.length,
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   A股行情分析网站 - 简化后端服务已启动          ║
╠══════════════════════════════════════════════════╣
║   HTTP服务:     http://localhost:${PORT}          ║
║   健康检查:     http://localhost:${PORT}/health    ║
║   股票数据:     http://localhost:${PORT}/api/stocks ║
╚══════════════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('正在关闭服务器...');
  process.exit(0);
});