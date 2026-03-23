# 股票分析算法

## 技术指标计算

### 1. 移动平均线 (MA)
```javascript
// 简单移动平均线
function calculateSMA(data, period) {
  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
    sma.push({ date: data[i].date, value: sum / period });
  }
  return sma;
}

// 指数移动平均线
function calculateEMA(data, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  // 第一个EMA使用SMA
  let emaValue = calculateSMA(data.slice(0, period), period)[0].value;
  ema.push({ date: data[period - 1].date, value: emaValue });
  
  for (let i = period; i < data.length; i++) {
    emaValue = (data[i].close - emaValue) * multiplier + emaValue;
    ema.push({ date: data[i].date, value: emaValue });
  }
  
  return ema;
}
```

### 2. MACD (移动平均收敛发散)
```javascript
function calculateMACD(data) {
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  
  const dif = ema12.map((ema, i) => ({
    date: ema.date,
    value: ema.value - ema26[i].value
  }));
  
  const dea = calculateEMA(dif.map(d => ({ close: d.value, date: d.date })), 9);
  const macd = dif.map((d, i) => ({
    date: d.date,
    value: 2 * (d.value - dea[i].value)
  }));
  
  return { dif, dea, macd };
}
```

### 3. KDJ 随机指标
```javascript
function calculateKDJ(data, period = 9) {
  const kdj = [];
  
  for (let i = period - 1; i < data.length; i++) {
    const window = data.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map(d => d.high));
    const low = Math.min(...window.map(d => d.low));
    const close = data[i].close;
    
    const rsv = ((close - low) / (high - low)) * 100;
    
    let k = 50, d = 50; // 默认值
    if (i === period - 1) {
      k = rsv;
      d = rsv;
    } else {
      k = (2/3) * kdj[i - period].k + (1/3) * rsv;
      d = (2/3) * kdj[i - period].d + (1/3) * k;
    }
    
    const j = 3 * k - 2 * d;
    
    kdj.push({
      date: data[i].date,
      k: parseFloat(k.toFixed(2)),
      d: parseFloat(d.toFixed(2)),
      j: parseFloat(j.toFixed(2))
    });
  }
  
  return kdj;
}
```

### 4. RSI (相对强弱指数)
```javascript
function calculateRSI(data, period = 14) {
  const rsi = [];
  const gains = [];
  const losses = [];
  
  // 计算价格变化
  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // 计算RSI
  for (let i = period; i < gains.length; i++) {
    const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    
    const rs = avgGain / avgLoss;
    const rsiValue = 100 - (100 / (1 + rs));
    
    rsi.push({
      date: data[i + 1].date, // 调整索引
      value: parseFloat(rsiValue.toFixed(2))
    });
  }
  
  return rsi;
}
```

### 5. 布林带 (Bollinger Bands)
```javascript
function calculateBollingerBands(data, period = 20, stdDev = 2) {
  const bands = [];
  
  for (let i = period - 1; i < data.length; i++) {
    const window = data.slice(i - period + 1, i + 1);
    const closes = window.map(d => d.close);
    
    const mean = closes.reduce((a, b) => a + b, 0) / period;
    const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);
    
    bands.push({
      date: data[i].date,
      upper: mean + (stdDev * standardDeviation),
      middle: mean,
      lower: mean - (stdDev * standardDeviation)
    });
  }
  
  return bands;
}
```

## 选股策略算法

### 1. 多因子选股模型
```javascript
class MultiFactorStockSelector {
  constructor(factors) {
    this.factors = factors;
  }
  
  // 计算股票得分
  calculateScore(stock) {
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const factor of this.factors) {
      const value = this.getFactorValue(stock, factor.name);
      const normalized = this.normalize(value, factor.min, factor.max);
      const score = normalized * factor.weight;
      
      totalScore += score;
      totalWeight += factor.weight;
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }
  
  // 获取因子值
  getFactorValue(stock, factorName) {
    const factors = {
      'pe': stock.pe_ratio,           // 市盈率
      'pb': stock.pb_ratio,           // 市净率
      'roe': stock.roe,               // 净资产收益率
      'revenue_growth': stock.revenue_growth, // 营收增长率
      'profit_growth': stock.profit_growth,   // 利润增长率
      'dividend_yield': stock.dividend_yield, // 股息率
      'debt_ratio': stock.debt_ratio,         // 负债率
      'current_ratio': stock.current_ratio,   // 流动比率
      'rsi': stock.technical.rsi,             // RSI
      'macd': stock.technical.macd_signal,    // MACD信号
      'volume_ratio': stock.volume_ratio      // 成交量比率
    };
    
    return factors[factorName] || 0;
  }
  
  // 归一化处理
  normalize(value, min, max) {
    if (max === min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }
  
  // 筛选股票
  filterStocks(stocks, minScore = 0.6, limit = 50) {
    const scoredStocks = stocks.map(stock => ({
      ...stock,
      score: this.calculateScore(stock)
    }));
    
    return scoredStocks
      .filter(stock => stock.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
```

### 2. 技术面选股策略
```javascript
class TechnicalStockSelector {
  // 突破选股
  findBreakoutStocks(stocks, period = 20) {
    return stocks.filter(stock => {
      const prices = stock.history.slice(-period);
      if (prices.length < period) return false;
      
      const currentPrice = stock.current_price;
      const highest = Math.max(...prices.map(p => p.high));
      const lowest = Math.min(...prices.map(p => p.low));
      
      // 突破前期高点
      const breakoutHigh = currentPrice > highest * 1.02;
      // 突破前期低点
      const breakoutLow = currentPrice < lowest * 0.98;
      
      return breakoutHigh || breakoutLow;
    });
  }
  
  // 金叉死叉选股
  findCrossStocks(stocks) {
    return stocks.filter(stock => {
      const ma5 = calculateSMA(stock.history, 5);
      const ma10 = calculateSMA(stock.history, 10);
      const ma20 = calculateSMA(stock.history, 20);
      
      if (ma5.length < 2 || ma10.length < 2 || ma20.length < 2) return false;
      
      const lastMA5 = ma5[ma5.length - 1].value;
      const prevMA5 = ma5[ma5.length - 2].value;
      const lastMA10 = ma10[ma10.length - 1].value;
      const prevMA10 = ma10[ma10.length - 2].value;
      const lastMA20 = ma20[ma20.length - 1].value;
      
      // 金叉：短期均线上穿长期均线
      const goldenCross = 
        (prevMA5 <= prevMA10 && lastMA5 > lastMA10) ||  // 5日线上穿10日线
        (prevMA5 <= lastMA20 && lastMA5 > lastMA20);    // 5日线上穿20日线
      
      // 死叉：短期均线下穿长期均线
      const deathCross = 
        (prevMA5 >= prevMA10 && lastMA5 < lastMA10) ||  // 5日线下穿10日线
        (prevMA5 >= lastMA20 && lastMA5 < lastMA20);    // 5日线下穿20日线
      
      return goldenCross && !deathCross; // 只选金叉股票
    });
  }
  
  // 超买超卖选股
  findOverboughtOversoldStocks(stocks) {
    return stocks.filter(stock => {
      const rsi = calculateRSI(stock.history, 14);
      if (rsi.length === 0) return false;
      
      const lastRSI = rsi[rsi.length - 1].value;
      
      // 超卖：RSI < 30，可能反弹
      const oversold = lastRSI < 30;
      // 超买：RSI > 70，可能回调
      const overbought = lastRSI > 70;
      
      return oversold; // 只选超卖股票（安全边际更高）
    });
  }
}
```

### 3. 基本面选股策略
```javascript
class FundamentalStockSelector {
  // 价值投资选股
  findValueStocks(stocks) {
    return stocks.filter(stock => {
      // 低市盈率
      const lowPE = stock.pe_ratio > 0 && stock.pe_ratio < 15;
      // 低市净率
      const lowPB = stock.pb_ratio > 0 && stock.pb_ratio < 1.5;
      // 高股息率
      const highDividend = stock.dividend_yield > 0.03;
      // 低负债率
      const lowDebt = stock.debt_ratio < 0.5;
      // 正现金流
      const positiveCashFlow = stock.cash_flow > 0;
      
      return lowPE && lowPB && highDividend && lowDebt && positiveCashFlow;
    });
  }
  
  // 成长股选股
  findGrowthStocks(stocks) {
    return stocks.filter(stock => {
      // 高营收增长率
      const highRevenueGrowth = stock.revenue_growth > 0.2;
      // 高利润增长率
      const highProfitGrowth = stock.profit_growth > 0.15;
      // 高ROE
      const highROE = stock.roe > 0.15;
      // 研发投入高
      const highRND = stock.rnd_ratio > 0.05;
      // 行业前景好
      const goodIndustry = this.isGrowthIndustry(stock.industry);
      
      return highRevenueGrowth && highProfitGrowth && highROE && highRND && goodIndustry;
    });
  }
  
  // 判断是否为成长行业
  isGrowthIndustry(industry) {
    const growthIndustries = [
      '新能源', '半导体', '人工智能', '生物医药', 
      '云计算', '5G', '物联网', '新能源汽车'
    ];
    
    return growthIndustries.some(growthIndustry => 
      industry.includes(growthIndustry)
    );
  }
}
```

## 投资策略算法

### 1. 风险评估模型
```javascript
class RiskAssessment {
  // 计算股票风险等级
  calculateRiskLevel(stock) {
    let riskScore = 0;
    
    // 波动性风险（20%）
    const volatility = this.calculateVolatility(stock.history);
    riskScore += volatility * 0.2;
    
    // 基本面风险（30%）
    const fundamentalRisk = this.calculateFundamentalRisk(stock);
    riskScore += fundamentalRisk * 0.3;
    
    // 技术面风险（25%）
    const technicalRisk = this.calculateTechnicalRisk(stock);
    riskScore += technicalRisk * 0.25;
    
    // 市场风险（25%）
    const marketRisk = this.calculateMarketRisk(stock);
    riskScore += marketRisk * 0.25;
    
    // 转换为风险等级
    if (riskScore < 0.3) return '低风险';
    if (riskScore < 0.6) return '中风险';
    return '高风险';
  }
  
  // 计算波动性
  calculateVolatility(history) {
    if (history.length < 20) return 0.5;
    
    const returns = [];
    for (let i = 1; i < history.length; i++) {
      const returnRate = (history[i].close - history[i - 1].close) / history[i - 1].close;
      returns.push(returnRate);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);
    
    return Math.min(1, volatility * Math.sqrt(252)); // 年化波动率
  }
  
  // 计算基本面风险
  calculateFundamentalRisk(stock) {
    let risk = 0;
    
    // 高市盈率风险
    if (stock.pe_ratio > 50) risk += 0.3;
    else if (stock.pe_ratio > 30) risk += 0.2;
    else if (stock.pe_ratio > 15) risk += 0.1;
    
    // 高负债风险
    if (stock.debt_ratio > 0.7) risk += 0.3;
    else if (stock.debt_ratio > 0.5) risk += 0.2;
    else if (stock.debt_ratio > 0.3) risk += 0.1;
    
    // 负利润风险
    if (stock.profit < 0) risk += 0.4;
    
    return Math.min(1, risk);
  }
  
  // 计算技术面风险
  calculateTechnicalRisk(stock) {
    let risk = 0;
    
    const rsi = calculateRSI(stock.history, 14);
    if (rsi.length > 0) {
      const lastRSI = rsi[rsi.length - 1].value;
      // RSI超买风险
      if (lastRSI > 80) risk += 0.4;
      else if (lastRSI > 70) risk += 0.2;
    }
    
    const macd = calculateMACD(stock.history);
    if (macd.macd.length > 0) {
      const lastMACD = macd.macd[macd.macd.length - 1].value;
      const prevMACD = macd.macd[macd.macd.length - 2]?.value || 0;
      // MACD死叉风险
      if (prevMACD > 0 && lastMACD < 0) risk += 0.3;
    }
    
    return Math.min(1, risk);
  }
  
  // 计算市场风险
  calculateMarketRisk(stock) {
    // 基于Beta系数（需要市场数据）
    // 这里简化处理
    const beta = stock.beta || 1.0;
    
    if (beta > 1.5) return 0.8;
    if (beta > 1.2) return 0.6;
    if (beta > 0.8) return 0.4;
    return 0.2;
  }
}
```

### 2. 仓位管理策略
```javascript
class PositionManagement {
  // 凯利公式仓位计算
  calculateKellyPosition(winRate, winLossRatio) {
    // 凯利公式：f* = (bp - q) / b
    // 其中：b = 赢亏比，p = 胜率，q = 败率
    const p = winRate;
    const q = 1 - winRate;
    const b = winLossRatio;
    
    const kelly = (b * p - q) / b;
    
    // 通常使用半