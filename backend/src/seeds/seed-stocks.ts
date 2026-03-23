/**
 * 种子数据脚本 - 至少50只A股股票基础数据
 * 运行方式: npx tsx src/seeds/seed-stocks.ts
 */

import knex, { Knex } from 'knex';

const dbConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'a_stock',
  },
};

interface StockSeed {
  symbol: string;
  name: string;
  fullName: string;
  market: string;
  industry: string;
  subIndustry: string;
  area: string;
  listingDate: string;
  totalShares: number;
  circulatingShares: number;
}

// 50+ A股核心股票数据
const stocks: StockSeed[] = [
  // 沪市主板
  { symbol: '600519.SH', name: '贵州茅台', fullName: '贵州茅台酒股份有限公司', market: 'SH', industry: '食品饮料', subIndustry: '白酒', area: '贵州', listingDate: '2001-08-27', totalShares: 125600, circulatingShares: 125600 },
  { symbol: '601318.SH', name: '中国平安', fullName: '中国平安保险(集团)股份有限公司', market: 'SH', industry: '非银金融', subIndustry: '保险', area: '广东', listingDate: '2007-03-01', totalShares: 1828000, circulatingShares: 1078000 },
  { symbol: '600036.SH', name: '招商银行', fullName: '招商银行股份有限公司', market: 'SH', industry: '银行', subIndustry: '银行', area: '广东', listingDate: '2002-04-09', totalShares: 2522000, circulatingShares: 2061000 },
  { symbol: '601166.SH', name: '兴业银行', fullName: '兴业银行股份有限公司', market: 'SH', industry: '银行', subIndustry: '银行', area: '福建', listingDate: '2007-02-05', totalShares: 2077400, circulatingShares: 2077400 },
  { symbol: '600276.SH', name: '恒瑞医药', fullName: '江苏恒瑞医药股份有限公司', market: 'SH', industry: '医药生物', subIndustry: '化学制药', area: '江苏', listingDate: '2000-10-18', totalShares: 637900, circulatingShares: 637900 },
  { symbol: '601012.SH', name: '隆基绿能', fullName: '隆基绿能科技股份有限公司', market: 'SH', industry: '电力设备', subIndustry: '光伏设备', area: '陕西', listingDate: '2012-04-11', totalShares: 757800, circulatingShares: 757800 },
  { symbol: '600900.SH', name: '长江电力', fullName: '中国长江电力股份有限公司', market: 'SH', industry: '公用事业', subIndustry: '电力', area: '湖北', listingDate: '2003-11-18', totalShares: 2452700, circulatingShares: 2452700 },
  { symbol: '601398.SH', name: '工商银行', fullName: '中国工商银行股份有限公司', market: 'SH', industry: '银行', subIndustry: '银行', area: '北京', listingDate: '2006-10-27', totalShares: 35640000, circulatingShares: 26960000 },
  { symbol: '601288.SH', name: '农业银行', fullName: '中国农业银行股份有限公司', market: 'SH', industry: '银行', subIndustry: '银行', area: '北京', listingDate: '2010-07-15', totalShares: 34998000, circulatingShares: 31900000 },
  { symbol: '600030.SH', name: '中信证券', fullName: '中信证券股份有限公司', market: 'SH', industry: '非银金融', subIndustry: '证券', area: '广东', listingDate: '2003-01-06', totalShares: 1482000, circulatingShares: 1217000 },
  { symbol: '600585.SH', name: '海螺水泥', fullName: '安徽海螺水泥股份有限公司', market: 'SH', industry: '建筑材料', subIndustry: '水泥', area: '安徽', listingDate: '2002-02-07', totalShares: 529900, circulatingShares: 399900 },
  { symbol: '600887.SH', name: '伊利股份', fullName: '内蒙古伊利实业集团股份有限公司', market: 'SH', industry: '食品饮料', subIndustry: '乳品', area: '内蒙古', listingDate: '1996-03-12', totalShares: 639900, circulatingShares: 627700 },
  { symbol: '601668.SH', name: '中国建筑', fullName: '中国建筑股份有限公司', market: 'SH', industry: '建筑装饰', subIndustry: '房屋建设', area: '北京', listingDate: '2009-07-29', totalShares: 4200000, circulatingShares: 4200000 },
  { symbol: '600703.SH', name: '三安光电', fullName: '三安光电股份有限公司', market: 'SH', industry: '电子', subIndustry: 'LED', area: '湖北', listingDate: '1996-05-28', totalShares: 497300, circulatingShares: 497300 },
  { symbol: '601601.SH', name: '中国太保', fullName: '中国太平洋保险(集团)股份有限公司', market: 'SH', industry: '非银金融', subIndustry: '保险', area: '上海', listingDate: '2007-12-25', totalShares: 962000, circulatingShares: 685400 },
  { symbol: '600809.SH', name: '山西汾酒', fullName: '山西杏花村汾酒厂股份有限公司', market: 'SH', industry: '食品饮料', subIndustry: '白酒', area: '山西', listingDate: '1994-01-06', totalShares: 122000, circulatingShares: 122000 },
  { symbol: '601919.SH', name: '中远海控', fullName: '中远海运控股股份有限公司', market: 'SH', industry: '交通运输', subIndustry: '航运', area: '天津', listingDate: '2007-06-26', totalShares: 1609000, circulatingShares: 1268000 },
  { symbol: '600547.SH', name: '山东黄金', fullName: '山东黄金矿业股份有限公司', market: 'SH', industry: '有色金属', subIndustry: '黄金', area: '山东', listingDate: '2003-08-28', totalShares: 447000, circulatingShares: 346000 },
  { symbol: '601857.SH', name: '中国石油', fullName: '中国石油天然气股份有限公司', market: 'SH', industry: '石油石化', subIndustry: '油气开采', area: '北京', listingDate: '2007-11-05', totalShares: 18302000, circulatingShares: 16192000 },
  { symbol: '600196.SH', name: '复星医药', fullName: '上海复星医药(集团)股份有限公司', market: 'SH', industry: '医药生物', subIndustry: '化学制药', area: '上海', listingDate: '1998-08-07', totalShares: 266200, circulatingShares: 200600 },
  { symbol: '600028.SH', name: '中国石化', fullName: '中国石油化工股份有限公司', market: 'SH', industry: '石油石化', subIndustry: '炼化', area: '北京', listingDate: '2001-08-08', totalShares: 12107100, circulatingShares: 9581300 },
  { symbol: '601888.SH', name: '中国中免', fullName: '中国旅游集团中免股份有限公司', market: 'SH', industry: '商贸零售', subIndustry: '免税', area: '北京', listingDate: '2009-10-15', totalShares: 195300, circulatingShares: 195300 },
  // 深市主板
  { symbol: '000858.SZ', name: '五粮液', fullName: '宜宾五粮液股份有限公司', market: 'SZ', industry: '食品饮料', subIndustry: '白酒', area: '四川', listingDate: '1998-04-27', totalShares: 388200, circulatingShares: 388200 },
  { symbol: '000002.SZ', name: '万科A', fullName: '万科企业股份有限公司', market: 'SZ', industry: '房地产', subIndustry: '房地产开发', area: '广东', listingDate: '1991-01-29', totalShares: 1193000, circulatingShares: 971000 },
  { symbol: '000333.SZ', name: '美的集团', fullName: '美的集团股份有限公司', market: 'SZ', industry: '家用电器', subIndustry: '白色家电', area: '广东', listingDate: '2013-09-18', totalShares: 702500, circulatingShares: 689600 },
  { symbol: '000001.SZ', name: '平安银行', fullName: '平安银行股份有限公司', market: 'SZ', industry: '银行', subIndustry: '银行', area: '广东', listingDate: '1991-04-03', totalShares: 1940600, circulatingShares: 1940600 },
  { symbol: '002714.SZ', name: '牧原股份', fullName: '牧原食品股份有限公司', market: 'SZ', industry: '农林牧渔', subIndustry: '养殖', area: '河南', listingDate: '2014-01-28', totalShares: 546000, circulatingShares: 387500 },
  { symbol: '002594.SZ', name: '比亚迪', fullName: '比亚迪股份有限公司', market: 'SZ', industry: '汽车', subIndustry: '乘用车', area: '广东', listingDate: '2011-06-30', totalShares: 291100, circulatingShares: 116400 },
  { symbol: '300750.SZ', name: '宁德时代', fullName: '宁德时代新能源科技股份有限公司', market: 'SZ', industry: '电力设备', subIndustry: '电池', area: '福建', listingDate: '2018-06-11', totalShares: 439900, circulatingShares: 401300 },
  { symbol: '002475.SZ', name: '立讯精密', fullName: '立讯精密工业股份有限公司', market: 'SZ', industry: '电子', subIndustry: '消费电子', area: '广东', listingDate: '2010-09-15', totalShares: 713800, circulatingShares: 710700 },
  { symbol: '002352.SZ', name: '顺丰控股', fullName: '顺丰控股股份有限公司', market: 'SZ', industry: '交通运输', subIndustry: '快递', area: '广东', listingDate: '2010-02-05', totalShares: 489900, circulatingShares: 482600 },
  { symbol: '000651.SZ', name: '格力电器', fullName: '珠海格力电器股份有限公司', market: 'SZ', industry: '家用电器', subIndustry: '白色家电', area: '广东', listingDate: '1996-11-18', totalShares: 591500, circulatingShares: 591500 },
  { symbol: '300059.SZ', name: '东方财富', fullName: '东方财富信息股份有限公司', market: 'SZ', industry: '非银金融', subIndustry: '证券', area: '上海', listingDate: '2010-03-19', totalShares: 1585700, circulatingShares: 1323900 },
  { symbol: '002230.SZ', name: '科大讯飞', fullName: '科大讯飞股份有限公司', market: 'SZ', industry: '计算机', subIndustry: '软件开发', area: '安徽', listingDate: '2008-05-12', totalShares: 232400, circulatingShares: 215400 },
  { symbol: '002415.SZ', name: '海康威视', fullName: '杭州海康威视数字技术股份有限公司', market: 'SZ', industry: '计算机', subIndustry: '安防设备', area: '浙江', listingDate: '2010-05-28', totalShares: 943200, circulatingShares: 920800 },
  { symbol: '002304.SZ', name: '洋河股份', fullName: '江苏洋河酒厂股份有限公司', market: 'SZ', industry: '食品饮料', subIndustry: '白酒', area: '江苏', listingDate: '2009-11-06', totalShares: 150700, circulatingShares: 150700 },
  { symbol: '300015.SZ', name: '爱尔眼科', fullName: '爱尔眼科医院集团股份有限公司', market: 'SZ', industry: '医药生物', subIndustry: '医疗服务', area: '湖南', listingDate: '2009-10-30', totalShares: 920900, circulatingShares: 812700 },
  { symbol: '002049.SZ', name: '紫光国微', fullName: '紫光国芯微电子股份有限公司', market: 'SZ', industry: '电子', subIndustry: '半导体', area: '河北', listingDate: '2005-06-06', totalShares: 84900, circulatingShares: 84900 },
  { symbol: '000568.SZ', name: '泸州老窖', fullName: '泸州老窖股份有限公司', market: 'SZ', industry: '食品饮料', subIndustry: '白酒', area: '四川', listingDate: '1994-05-09', totalShares: 146900, circulatingShares: 146900 },
  { symbol: '002241.SZ', name: '歌尔股份', fullName: '歌尔股份有限公司', market: 'SZ', industry: '电子', subIndustry: '消费电子', area: '山东', listingDate: '2008-05-22', totalShares: 342000, circulatingShares: 294300 },
  { symbol: '000725.SZ', name: '京东方A', fullName: '京东方科技集团股份有限公司', market: 'SZ', industry: '电子', subIndustry: '面板', area: '北京', listingDate: '2001-01-12', totalShares: 3819600, circulatingShares: 3728000 },
  { symbol: '002466.SZ', name: '天齐锂业', fullName: '天齐锂业股份有限公司', market: 'SZ', industry: '有色金属', subIndustry: '锂', area: '四川', listingDate: '2010-08-31', totalShares: 164100, circulatingShares: 146800 },
  { symbol: '300122.SZ', name: '智飞生物', fullName: '重庆智飞生物制品股份有限公司', market: 'SZ', industry: '医药生物', subIndustry: '生物制品', area: '重庆', listingDate: '2010-09-28', totalShares: 240000, circulatingShares: 156600 },
  { symbol: '002129.SZ', name: '中环股份', fullName: 'TCL中环新能源科技股份有限公司', market: 'SZ', industry: '电力设备', subIndustry: '光伏设备', area: '天津', listingDate: '2007-04-20', totalShares: 326600, circulatingShares: 306400 },
  { symbol: '000338.SZ', name: '潍柴动力', fullName: '潍柴动力股份有限公司', market: 'SZ', industry: '汽车', subIndustry: '汽车零部件', area: '山东', listingDate: '2004-03-11', totalShares: 872700, circulatingShares: 524900 },
  { symbol: '002153.SZ', name: '石基信息', fullName: '北京中长石基信息技术股份有限公司', market: 'SZ', industry: '计算机', subIndustry: '软件开发', area: '北京', listingDate: '2007-08-13', totalShares: 211000, circulatingShares: 124600 },
  // 创业板
  { symbol: '300059.SZ', name: '东方财富', fullName: '东方财富信息股份有限公司', market: 'SZ', industry: '非银金融', subIndustry: '证券', area: '上海', listingDate: '2010-03-19', totalShares: 1585700, circulatingShares: 1323900 },
  // 科创板
  { symbol: '688981.SH', name: '中芯国际', fullName: '中芯国际集成电路制造有限公司', market: 'SH', industry: '电子', subIndustry: '半导体', area: '上海', listingDate: '2020-07-16', totalShares: 793400, circulatingShares: 194400 },
  // 北交所
  { symbol: '835185.BJ', name: '贝特瑞', fullName: '贝特瑞新材料集团股份有限公司', market: 'BJ', industry: '电力设备', subIndustry: '电池材料', area: '广东', listingDate: '2021-11-15', totalShares: 72800, circulatingShares: 48600 },
  // 更多蓝筹
  { symbol: '600036.SH', name: '招商银行', fullName: '招商银行股份有限公司', market: 'SH', industry: '银行', subIndustry: '银行', area: '广东', listingDate: '2002-04-09', totalShares: 2522000, circulatingShares: 2061000 },
  { symbol: '601318.SH', name: '中国平安', fullName: '中国平安保险(集团)股份有限公司', market: 'SH', industry: '非银金融', subIndustry: '保险', area: '广东', listingDate: '2007-03-01', totalShares: 1828000, circulatingShares: 1078000 },
  { symbol: '600309.SH', name: '万华化学', fullName: '万华化学集团股份有限公司', market: 'SH', industry: '基础化工', subIndustry: '化学制品', area: '山东', listingDate: '2001-01-05', totalShares: 314000, circulatingShares: 314000 },
  { symbol: '601799.SH', name: '星宇股份', fullName: '常州星宇车灯股份有限公司', market: 'SH', industry: '汽车', subIndustry: '汽车零部件', area: '江苏', listingDate: '2011-02-01', totalShares: 28500, circulatingShares: 28500 },
  { symbol: '002920.SZ', name: '德赛西威', fullName: '惠州市德赛西威汽车电子股份有限公司', market: 'SZ', industry: '汽车', subIndustry: '汽车电子', area: '广东', listingDate: '2017-12-26', totalShares: 55500, circulatingShares: 54800 },
  { symbol: '600436.SH', name: '片仔癀', fullName: '漳州片仔癀药业股份有限公司', market: 'SH', industry: '医药生物', subIndustry: '中药', area: '福建', listingDate: '2003-06-16', totalShares: 60300, circulatingShares: 60300 },
];

// 去重
const uniqueStocks = Array.from(new Map(stocks.map(s => [s.symbol, s])).values());

export async function seed(): Promise<void> {
  const db = knex(dbConfig);

  try {
    console.log('🌱 开始写入种子数据...');

    // 清理现有数据
    await db('daily_quotes').del();
    await db('stocks').del();
    console.log('✅ 已清理旧数据');

    // 写入股票数据
    const now = new Date();
    const stocksToInsert = uniqueStocks.map(s => ({
      symbol: s.symbol,
      name: s.name,
      full_name: s.fullName,
      market: s.market,
      industry: s.industry,
      sub_industry: s.subIndustry,
      area: s.area,
      listing_date: s.listingDate,
      total_shares: s.totalShares,
      circulating_shares: s.circulatingShares,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));

    // 批量插入，每批20条
    const batchSize = 20;
    for (let i = 0; i < stocksToInsert.length; i += batchSize) {
      const batch = stocksToInsert.slice(i, i + batchSize);
      await db('stocks').insert(batch);
      console.log(`  📊 已插入 ${Math.min(i + batchSize, stocksToInsert.length)}/${stocksToInsert.length} 只股票`);
    }

    console.log(`✅ 成功写入 ${uniqueStocks.length} 只股票数据`);

    // 验证
    const count = await db('stocks').count('id as count').first();
    console.log(`📊 数据库中股票总数: ${count?.count}`);

  } catch (error) {
    console.error('❌ 种子数据写入失败:', error);
    throw error;
  } finally {
    await db.destroy();
  }
}

// 直接执行
if (require.main === module) {
  seed().then(() => {
    console.log('🎉 种子数据脚本执行完成');
    process.exit(0);
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
