/**
 * 修正版种子数据 - 匹配实际 stocks 表结构
 */
import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: {
    host: 'localhost',
    port: 5432,
    user: 'ego_bai',
    password: '',
    database: 'a_stock',
  },
});

const stocks = [
  { symbol: '600519.SH', code: '600519', market: 'SH', name: '贵州茅台', industry: '食品饮料' },
  { symbol: '601318.SH', code: '601318', market: 'SH', name: '中国平安', industry: '非银金融' },
  { symbol: '600036.SH', code: '600036', market: 'SH', name: '招商银行', industry: '银行' },
  { symbol: '601166.SH', code: '601166', market: 'SH', name: '兴业银行', industry: '银行' },
  { symbol: '600276.SH', code: '600276', market: 'SH', name: '恒瑞医药', industry: '医药生物' },
  { symbol: '601012.SH', code: '601012', market: 'SH', name: '隆基绿能', industry: '电力设备' },
  { symbol: '600900.SH', code: '600900', market: 'SH', name: '长江电力', industry: '公用事业' },
  { symbol: '601398.SH', code: '601398', market: 'SH', name: '工商银行', industry: '银行' },
  { symbol: '601288.SH', code: '601288', market: 'SH', name: '农业银行', industry: '银行' },
  { symbol: '600030.SH', code: '600030', market: 'SH', name: '中信证券', industry: '非银金融' },
  { symbol: '600585.SH', code: '600585', market: 'SH', name: '海螺水泥', industry: '建筑材料' },
  { symbol: '600887.SH', code: '600887', market: 'SH', name: '伊利股份', industry: '食品饮料' },
  { symbol: '601668.SH', code: '601668', market: 'SH', name: '中国建筑', industry: '建筑装饰' },
  { symbol: '600703.SH', code: '600703', market: 'SH', name: '三安光电', industry: '电子' },
  { symbol: '601601.SH', code: '601601', market: 'SH', name: '中国太保', industry: '非银金融' },
  { symbol: '600809.SH', code: '600809', market: 'SH', name: '山西汾酒', industry: '食品饮料' },
  { symbol: '601919.SH', code: '601919', market: 'SH', name: '中远海控', industry: '交通运输' },
  { symbol: '600547.SH', code: '600547', market: 'SH', name: '山东黄金', industry: '有色金属' },
  { symbol: '601857.SH', code: '601857', market: 'SH', name: '中国石油', industry: '石油石化' },
  { symbol: '600196.SH', code: '600196', market: 'SH', name: '复星医药', industry: '医药生物' },
  { symbol: '600028.SH', code: '600028', market: 'SH', name: '中国石化', industry: '石油石化' },
  { symbol: '601888.SH', code: '601888', market: 'SH', name: '中国中免', industry: '商贸零售' },
  { symbol: '000858.SZ', code: '000858', market: 'SZ', name: '五粮液', industry: '食品饮料' },
  { symbol: '000002.SZ', code: '000002', market: 'SZ', name: '万科A', industry: '房地产' },
  { symbol: '000333.SZ', code: '000333', market: 'SZ', name: '美的集团', industry: '家用电器' },
  { symbol: '000001.SZ', code: '000001', market: 'SZ', name: '平安银行', industry: '银行' },
  { symbol: '002714.SZ', code: '002714', market: 'SZ', name: '牧原股份', industry: '农林牧渔' },
  { symbol: '002594.SZ', code: '002594', market: 'SZ', name: '比亚迪', industry: '汽车' },
  { symbol: '300750.SZ', code: '300750', market: 'SZ', name: '宁德时代', industry: '电力设备' },
  { symbol: '002475.SZ', code: '002475', market: 'SZ', name: '立讯精密', industry: '电子' },
  { symbol: '002352.SZ', code: '002352', market: 'SZ', name: '顺丰控股', industry: '交通运输' },
  { symbol: '000651.SZ', code: '000651', market: 'SZ', name: '格力电器', industry: '家用电器' },
  { symbol: '300059.SZ', code: '300059', market: 'SZ', name: '东方财富', industry: '非银金融' },
  { symbol: '002230.SZ', code: '002230', market: 'SZ', name: '科大讯飞', industry: '计算机' },
  { symbol: '002415.SZ', code: '002415', market: 'SZ', name: '海康威视', industry: '计算机' },
  { symbol: '002304.SZ', code: '002304', market: 'SZ', name: '洋河股份', industry: '食品饮料' },
  { symbol: '300015.SZ', code: '300015', market: 'SZ', name: '爱尔眼科', industry: '医药生物' },
  { symbol: '002049.SZ', code: '002049', market: 'SZ', name: '紫光国微', industry: '电子' },
  { symbol: '000568.SZ', code: '000568', market: 'SZ', name: '泸州老窖', industry: '食品饮料' },
  { symbol: '002241.SZ', code: '002241', market: 'SZ', name: '歌尔股份', industry: '电子' },
  { symbol: '000725.SZ', code: '000725', market: 'SZ', name: '京东方A', industry: '电子' },
  { symbol: '002466.SZ', code: '002466', market: 'SZ', name: '天齐锂业', industry: '有色金属' },
  { symbol: '300122.SZ', code: '300122', market: 'SZ', name: '智飞生物', industry: '医药生物' },
  { symbol: '688981.SH', code: '688981', market: 'SH', name: '中芯国际', industry: '电子' },
  { symbol: '600309.SH', code: '600309', market: 'SH', name: '万华化学', industry: '基础化工' },
  { symbol: '600436.SH', code: '600436', market: 'SH', name: '片仔癀', industry: '医药生物' },
  { symbol: '000338.SZ', code: '000338', market: 'SZ', name: '潍柴动力', industry: '汽车' },
  { symbol: '002920.SZ', code: '002920', market: 'SZ', name: '德赛西威', industry: '汽车' },
  { symbol: '601799.SH', code: '601799', market: 'SH', name: '星宇股份', industry: '汽车' },
];

// 模拟行情数据
function mockQuote() {
  const price = +(10 + Math.random() * 190).toFixed(2);
  const change = +(Math.random() * 10 - 5).toFixed(2);
  const pct = +(change / price * 100).toFixed(4);
  return {
    current_price: price,
    open_price: +(price * (1 + (Math.random() - 0.5) * 0.03)).toFixed(2),
    high_price: +(price * (1 + Math.random() * 0.05)).toFixed(2),
    low_price: +(price * (1 - Math.random() * 0.05)).toFixed(2),
    prev_close: +(price - change).toFixed(2),
    volume: Math.floor(Math.random() * 50000000),
    turnover: +(Math.random() * 500000000).toFixed(2),
    change_amount: change,
    change_percent: pct,
    amplitude: +(Math.random() * 8).toFixed(4),
    turnover_rate: +(Math.random() * 5).toFixed(4),
    pe_ratio: +(5 + Math.random() * 80).toFixed(2),
    pb_ratio: +(0.5 + Math.random() * 10).toFixed(2),
    market_cap: +(Math.random() * 2000000000000).toFixed(2),
    circulating_market_cap: +(Math.random() * 1500000000000).toFixed(2),
  };
}

async function seed() {
  try {
    console.log('🌱 写入种子数据...');
    await db('daily_quotes').del();
    await db('money_flow').del();
    await db('watchlist').del();
    await db('alerts').del();
    await db('stocks').del();
    console.log('✅ 已清理旧数据');

    const now = new Date();
    for (let i = 0; i < stocks.length; i += 10) {
      const batch = stocks.slice(i, i + 10).map(s => ({
        ...s,
        ...mockQuote(),
        is_active: true,
        data_source: 'seed',
        created_at: now,
        updated_at: now,
      }));
      await db('stocks').insert(batch);
      console.log(`  📊 ${Math.min(i + 10, stocks.length)}/${stocks.length}`);
    }

    const count = await db('stocks').count('id as c').first();
    console.log(`✅ 完成: ${count?.c} 只股票`);
  } catch (e) {
    console.error('❌', e);
  } finally {
    await db.destroy();
  }
}

seed();
