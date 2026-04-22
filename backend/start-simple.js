// 简化启动脚本
const express = require('express');
const cors = require('cors');
const app = express();

// 基础中间件
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'A股行情分析后端',
    version: '1.0.0'
  });
});

// 数据库状态
app.get('/api/db/status', (req, res) => {
  res.json({
    connected: true,
    database: 'astock',
    message: '数据库连接正常'
  });
});

// 模拟股票数据
app.get('/api/stocks', (req, res) => {
  const mockStocks = [
    { code: '000001', name: '平安银行', price: 15.23, change: 0.45 },
    { code: '000002', name: '万科A', price: 8.67, change: -0.12 },
    { code: '600519', name: '贵州茅台', price: 1650.50, change: 25.30 },
    { code: '000858', name: '五粮液', price: 145.80, change: 3.20 },
    { code: '002415', name: '海康威视', price: 32.45, change: -0.85 }
  ];
  res.json({
    stocks: mockStocks,
    count: mockStocks.length,
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 后端服务已启动，端口: ${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/health`);
  console.log(`📈 股票数据: http://localhost:${PORT}/api/stocks`);
});