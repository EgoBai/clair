// 简化服务器用于测试
const express = require('express');
const app = express();
const PORT = process.env.PORT || 4003;

// 基础中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'A股行情分析后端',
    version: '1.0.0'
  });
});

// 股票数据API
app.get('/api/stocks', (req, res) => {
  const mockStocks = [
    { code: '000001', name: '平安银行', price: 10.25, change: 0.12, changePercent: 1.18 },
    { code: '000002', name: '万科A', price: 8.76, change: -0.05, changePercent: -0.57 },
    { code: '000858', name: '五粮液', price: 145.32, change: 2.15, changePercent: 1.50 },
    { code: '002415', name: '海康威视', price: 32.45, change: 0.45, changePercent: 1.41 },
    { code: '300750', name: '宁德时代', price: 185.67, change: -1.23, changePercent: -0.66 }
  ];
  
  res.json({
    success: true,
    data: mockStocks,
    count: mockStocks.length,
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 简化后端服务器运行在 http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/health`);
  console.log(`📈 股票数据: http://localhost:${PORT}/api/stocks`);
});