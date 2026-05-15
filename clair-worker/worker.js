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

// ==================== 动态股票列表 (EastMoney API) ====================

/**
 * 从东方财富 API 获取全 A 股列表（含行业分类）
 * 返回 { symbol, name, market, industry } 数组
 * 缓存 1 小时
 */
let stockListCache = null;
let stockListCacheTime = 0;
const STOCK_LIST_CACHE_TTL = 3600_000; // 1 小时

async function getStockList() {
  const now = Date.now();
  if (stockListCache && (now - stockListCacheTime) < STOCK_LIST_CACHE_TTL) {
    return stockListCache;
  }

  try {
    // 申万行业分类 — 从东方财富 API 拉取
    const url = 'https://push2.eastmoney.com/api/qt/clist/get' +
      '?pn=1&pz=5000&po=1&np=1&fltt=2&invt=2&fid=f3' +
      '&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23' +
      '&fields=f2,f3,f4,f12,f14,f100,f102';

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com' },
    });
    const data = await resp.json();
    const items = data?.data?.diff || [];

    if (items.length === 0) throw new Error('Empty response');

    const stocks = [];
    for (const item of items) {
      const code = item.f12;
      const name = item.f14;
      const industry = item.f100 || '综合';
      if (!code || !name) continue;

      let market = 'SZ';
      if (code.startsWith('6')) market = 'SH';
      else if (code.startsWith('0') || code.startsWith('3')) market = 'SZ';
      else if (code.startsWith('8') || code.startsWith('4')) market = 'BJ';

      stocks.push({ symbol: code, name, market, industry, concept: null });
    }

    const seen = new Set();
    const unique = stocks.filter(s => {
      if (seen.has(s.symbol)) return false;
      seen.add(s.symbol);
      return s.symbol.length === 6;
    });

    console.log(`[StockList] 从 EastMoney 拉取 ${unique.length} 只股票`);
    stockListCache = unique;
    stockListCacheTime = now;
    return unique;
  } catch (e) {
    console.error('[StockList] EastMoney API 失败:', e.message);
    if (stockListCache) return stockListCache;
    // Fallback: 200只核心A股，覆盖28个申万一级行业
    return getFallbackStocks();
  }
}

// 行业标准化映射 (EastMoney → 申万一级行业)
const INDUSTRY_NORMALIZE = {
  '银行': '银行', '保险': '非银金融', '证券': '非银金融', '多元金融': '非银金融',
  '房地产': '房地产', '房地产开发': '房地产',
  '白酒': '食品饮料', '食品饮料': '食品饮料', '乳业': '食品饮料', '调味品': '食品饮料',
  '医药': '医药生物', '医疗器械': '医药生物', '生物制品': '医药生物', '中药': '医药生物',
  '半导体': '电子', '消费电子': '电子', '面板': '电子', '光电子': '电子',
  '新能源汽车': '汽车', '汽车': '汽车', '汽车零部件': '汽车', '智能驾驶': '汽车',
  '光伏': '电力设备', '新能源电池': '电力设备', '风电': '电力设备', '储能': '电力设备',
  '电力': '公用事业', '水力发电': '公用事业', '水务': '公用事业',
  '煤炭': '煤炭', '石油': '石油石化', '化工': '基础化工', '化肥': '基础化工',
  '有色金属': '有色金属', '黄金': '有色金属', '稀土': '有色金属',
  '钢铁': '钢铁', '建材': '建筑材料', '水泥': '建筑材料',
  '家电': '家用电器', '零售': '商贸零售', '服装': '纺织服饰',
  '农林牧渔': '农林牧渔', '养殖': '农林牧渔', '种业': '农林牧渔',
  '通信设备': '通信', '电信': '通信', '光通信': '通信',
  '计算机': '计算机', '人工智能': '计算机', '软件开发': '计算机', '金融科技': '计算机',
  '军工': '国防军工', '航天': '国防军工',
  '传媒': '传媒', '游戏': '传媒', '影视': '传媒',
  '交通运输': '交通运输', '物流': '交通运输', '港口': '交通运输',
  '机械设备': '机械设备', '工业自动化': '机械设备',
  '建筑装饰': '建筑装饰', '环保': '环保',
  '社会服务': '社会服务', '旅游': '社会服务', '教育': '社会服务',
  '美容护理': '美容护理', '轻工制造': '轻工制造',
};

function normalizeIndustry(raw) {
  if (!raw) return '综合';
  let clean = raw.replace(/行业$|板块$|产业$/g, '');
  return INDUSTRY_NORMALIZE[clean] || clean;
}

// Fallback 股票列表：200只核心A股，覆盖28个申万一级行业
function getFallbackStocks() {
  // 概念标签映射
  const CONCEPT_TAGS = {
    '600519': ['白酒龙头','消费升级','价值投资'], '000858': ['白酒龙头','消费升级'],
    '002594': ['新能源汽车','锂电池','比亚迪产业链'], '300750': ['新能源电池','宁德时代产业链','储能'],
    '601012': ['光伏','碳中和','新能源'], '300274': ['光伏逆变器','储能','新能源'],
    '002230': ['人工智能','ChatGPT','数字经济'], '688256': ['AI芯片','人工智能','半导体'],
    '688981': ['半导体','国产替代','芯片'], '002371': ['半导体设备','国产替代'],
    '300059': ['互联网金融','券商','AI金融'], '300033': ['金融科技','AI金融'],
    '600941': ['数字经济','央企改革','5G'], '601728': ['数字经济','央企改革'],
    '601318': ['保险龙头','金融科技'], '600036': ['银行龙头','高股息'],
    '601088': ['煤炭','高股息','央企改革'], '600900': ['电力','高股息','碳中和'],
    '601899': ['黄金','有色金属','贵金属'], '603799': ['锂电池','新能源','钴'],
    '600276': ['创新药','医药龙头'], '300760': ['医疗器械','医药龙头'],
    '601857': ['石油','央企改革','高股息'], '600028': ['石油','央企改革'],
    '601127': ['新能源汽车','华为产业链'], '002475': ['消费电子','苹果产业链'],
    '300308': ['光通信','AI算力','CPO'], '000063': ['5G','通信设备','数字经济'],
    '601985': ['核电','央企改革','碳中和'], '600031': ['工程机械','基建'],
    '601668': ['基建','央企改革','一带一路'], '601390': ['基建','央企改革'],
    '002352': ['物流','快递'], '603259': ['CRO','创新药','医药'],
    '688012': ['半导体设备','国产替代','中芯国际产业链'],
    '600760': ['军工','航天','国企改革'], '600893': ['军工','航空发动机'],
    '002027': ['传媒','数字经济'], '002555': ['游戏','元宇宙'],
    '600754': ['旅游','消费复苏'], '300896': ['医美','消费升级'],
    '688111': ['信创','数字经济','办公软件'], '600570': ['金融科技','信创'],
    '002459': ['光伏','新能源'], '300014': ['新能源电池','储能'],
    '600048': ['房地产','央企改革'], '000002': ['房地产'],
    '601111': ['航空','国企改革'], '600029': ['航空','国企改革'],
    '002714': ['猪肉','农林牧渔'], '300498': ['猪肉','农林牧渔'],
    '600809': ['白酒','消费升级'], '000568': ['白酒','消费升级'],
    '600887': ['乳业','消费升级'], '603288': ['调味品','消费升级'],
    '688041': ['AI芯片','半导体','国产替代'], '002049': ['半导体','国产替代','军工电子'],
    '688599': ['光伏','新能源'], '002812': ['锂电池','新能源'],
    '600150': ['船舶','军工','国企改革'], '600111': ['稀土','有色金属','新能源'],
    '002460': ['锂电池','新能源','锂矿'], '000725': ['面板','消费电子'],
    '603501': ['半导体','消费电子','芯片'], '300782': ['射频','5G','半导体'],
    '601615': ['风电','新能源','碳中和'],
  };

  const list = [
    // 银行 (8)
    ['601398','工商银行','SH','银行'],['600036','招商银行','SH','银行'],['601939','建设银行','SH','银行'],
    ['601288','农业银行','SH','银行'],['601166','兴业银行','SH','银行'],['000001','平安银行','SZ','银行'],
    ['600016','民生银行','SH','银行'],['002142','宁波银行','SZ','银行'],
    // 非银金融 (8)
    ['601318','中国平安','SH','保险'],['600030','中信证券','SH','证券'],['300059','东方财富','SZ','证券'],
    ['601688','华泰证券','SH','证券'],['601628','中国人寿','SH','保险'],['600837','海通证券','SH','证券'],
    ['000776','广发证券','SZ','证券'],['601211','国泰君安','SH','证券'],
    // 房地产 (5)
    ['000002','万科A','SZ','房地产'],['600048','保利发展','SH','房地产'],['001979','招商蛇口','SZ','房地产'],
    ['600383','金地集团','SH','房地产'],['600325','华发股份','SH','房地产'],
    // 食品饮料 (10)
    ['600519','贵州茅台','SH','白酒'],['000858','五粮液','SZ','白酒'],['600887','伊利股份','SH','食品饮料'],
    ['002304','洋河股份','SZ','白酒'],['000568','泸州老窖','SZ','白酒'],['603288','海天味业','SH','食品饮料'],
    ['600809','山西汾酒','SH','白酒'],['002714','牧原股份','SZ','农林牧渔'],['000895','双汇发展','SZ','食品饮料'],
    ['600600','青岛啤酒','SH','食品饮料'],
    // 医药生物 (10)
    ['600276','恒瑞医药','SH','医药'],['300760','迈瑞医疗','SZ','医药'],['603259','药明康德','SH','医药'],
    ['000538','云南白药','SZ','医药'],['002001','新和成','SZ','医药'],['300122','智飞生物','SZ','医药'],
    ['600196','复星医药','SH','医药'],['000661','长春高新','SZ','医药'],['300015','爱尔眼科','SZ','医药'],
    ['002007','华兰生物','SZ','医药'],
    // 电子 (12)
    ['002475','立讯精密','SZ','消费电子'],['688981','中芯国际','SH','半导体'],['000725','京东方A','SZ','面板'],
    ['603501','韦尔股份','SH','半导体'],['002049','紫光国微','SZ','半导体'],['600703','三安光电','SH','半导体'],
    ['688012','中微公司','SH','半导体'],['688041','海光信息','SH','半导体'],['002371','北方华创','SZ','半导体'],
    ['300782','卓胜微','SZ','半导体'],['688256','寒武纪','SH','人工智能'],['603986','兆易创新','SH','半导体'],
    // 汽车 (8)
    ['002594','比亚迪','SZ','新能源汽车'],['601127','赛力斯','SH','新能源汽车'],['600104','上汽集团','SH','汽车'],
    ['000625','长安汽车','SZ','汽车'],['601238','广汽集团','SH','汽车'],['600741','华域汽车','SH','汽车'],
    ['002920','德赛西威','SZ','汽车'],['300750','宁德时代','SZ','新能源电池'],
    // 电力设备 (8)
    ['601012','隆基绿能','SH','光伏'],['300274','阳光电源','SZ','光伏'],['002459','晶澳科技','SZ','光伏'],
    ['688599','天合光能','SH','光伏'],['300014','亿纬锂能','SZ','新能源电池'],['002812','恩捷股份','SZ','新能源电池'],
    ['601615','明阳智能','SH','风电'],['300124','汇川技术','SZ','工业自动化'],
    // 公用事业 (5)
    ['600900','长江电力','SH','电力'],['601985','中国核电','SH','电力'],['600011','华能国际','SH','电力'],
    ['600886','国投电力','SH','电力'],['601985','三峡能源','SH','电力'],
    // 煤炭 (4)
    ['601088','中国神华','SH','煤炭'],['600188','兖矿能源','SH','煤炭'],['601225','陕西煤业','SH','煤炭'],
    ['000983','山西焦煤','SZ','煤炭'],
    // 石油石化 (4)
    ['601857','中国石油','SH','石油'],['600028','中国石化','SH','石油'],['600938','中国海油','SH','石油'],
    ['600346','恒力石化','SH','石油'],
    // 基础化工 (6)
    ['600309','万华化学','SH','化工'],['002601','龙佰集团','SZ','化工'],['600426','华鲁恒升','SH','化工'],
    ['002493','荣盛石化','SZ','化工'],['000301','东方盛虹','SZ','化工'],['002648','卫星化学','SZ','化工'],
    // 有色金属 (6)
    ['601899','紫金矿业','SH','有色金属'],['600111','北方稀土','SH','有色金属'],['603799','华友钴业','SH','有色金属'],
    ['002460','赣锋锂业','SZ','有色金属'],['000630','铜陵有色','SZ','有色金属'],['601600','中国铝业','SH','有色金属'],
    // 钢铁 (3)
    ['600019','宝钢股份','SH','钢铁'],['000932','华菱钢铁','SZ','钢铁'],['600010','包钢股份','SH','钢铁'],
    // 建筑材料 (4)
    ['600585','海螺水泥','SH','建材'],['000786','北新建材','SZ','建材'],['002271','东方雨虹','SZ','建材'],
    ['601636','旗滨集团','SH','建材'],
    // 家用电器 (4)
    ['000333','美的集团','SZ','家电'],['000651','格力电器','SZ','家电'],['600690','海尔智家','SH','家电'],
    ['002032','苏泊尔','SZ','家电'],
    // 商贸零售 (4)
    ['601888','中国中免','SH','零售'],['002024','苏宁易购','SZ','零售'],['600859','王府井','SH','零售'],
    ['603708','家家悦','SH','零售'],
    // 农林牧渔 (5)
    ['002714','牧原股份','SZ','农林牧渔'],['300498','温氏股份','SZ','农林牧渔'],['000876','新希望','SZ','农林牧渔'],
    ['002311','海大集团','SZ','农林牧渔'],['600737','中粮糖业','SH','农林牧渔'],
    // 通信 (6)
    ['600941','中国移动','SH','通信'],['601728','中国电信','SH','通信'],['000063','中兴通讯','SZ','通信'],
    ['300308','中际旭创','SZ','通信'],['688027','国盾量子','SH','通信'],['600050','中国联通','SH','通信'],
    // 计算机 (6)
    ['002230','科大讯飞','SZ','人工智能'],['300033','同花顺','SZ','金融科技'],['600570','恒生电子','SH','计算机'],
    ['002410','广联达','SZ','计算机'],['688111','金山办公','SH','计算机'],['300454','深信服','SZ','计算机'],
    // 国防军工 (5)
    ['600760','中航沈飞','SH','军工'],['600893','航发动力','SH','军工'],['002025','航天电器','SZ','军工'],
    ['600862','中航高科','SH','军工'],['000768','中航西飞','SZ','军工'],
    // 传媒 (5)
    ['002027','分众传媒','SZ','传媒'],['300413','芒果超媒','SZ','传媒'],['002555','三七互娱','SZ','传媒'],
    ['603444','吉比特','SH','传媒'],['300251','光线传媒','SZ','传媒'],
    // 交通运输 (4)
    ['002352','顺丰控股','SZ','物流'],['601111','中国国航','SH','交通运输'],['600029','南方航空','SH','交通运输'],
    ['601006','大秦铁路','SH','交通运输'],
    // 机械设备 (5)
    ['600031','三一重工','SH','机械设备'],['000157','中联重科','SZ','机械设备'],['600150','中国船舶','SH','机械设备'],
    ['601100','恒立液压','SH','机械设备'],['688017','绿的谐波','SH','机械设备'],
    // 建筑装饰 (4)
    ['601668','中国建筑','SH','建筑装饰'],['601390','中国中铁','SH','建筑装饰'],['601186','中国铁建','SH','建筑装饰'],
    ['601800','中国交建','SH','建筑装饰'],
    // 社会服务 (3)
    ['600754','锦江酒店','SH','社会服务'],['002607','中公教育','SZ','社会服务'],['300144','宋城演艺','SZ','社会服务'],
    // 美容护理 (2)
    ['603605','珀莱雅','SH','美容护理'],['300896','爱美客','SZ','美容护理'],
    // 轻工制造 (2)
    ['002572','索菲亚','SZ','轻工制造'],['603833','欧派家居','SH','轻工制造'],
  ];
  return list.map(([code, name, market, industry]) => ({ 
    symbol: code, name, market, industry,
    concepts: CONCEPT_TAGS[code] || []
  }));
}

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
      turnover: v(37) * 10000, // 腾讯返回万元 → 元
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

  const stocks = await getStockList();

  // 腾讯 API 格式: sh600519,sz000858
  const allSymbols = [
    ...INDEX_SYMBOLS.map(i => i.tencent),
    ...stocks.slice(0, 300).map(s => `${s.market === 'SH' ? 'sh' : 'sz'}${s.symbol}`),
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

    // 腾讯 index 返回的 symbol 是纯代码(如"000001")，不含市场前缀
    const indices = INDEX_SYMBOLS.map(idx => {
      // 从 tencent symbol 提取纯代码 (sh000001 → 000001)
      const pureCode = idx.tencent.replace(/^[a-z]+/, '');
      const q = quoteMap[pureCode] || quoteMap[idx.symbol] || quoteMap[idx.tencent];
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
    const stocks = await getStockList();

    // 按标准化行业聚合
    const sectorMap = {};
    for (const stock of stocks) {
      const q = quotes.find(qu => qu.symbol === stock.symbol);
      if (!q) continue;
      const normIndustry = normalizeIndustry(stock.industry);

      if (!sectorMap[normIndustry]) {
        sectorMap[normIndustry] = {
          stocks: [],
          totalChange: 0,
          totalVolume: 0,
          totalTurnover: 0,
          limitUpCount: 0,
        };
      }
      sectorMap[normIndustry].stocks.push({ ...stock, quote: q });
      sectorMap[normIndustry].totalChange += q.changePercent;
      sectorMap[normIndustry].totalVolume += q.volume;
      sectorMap[normIndustry].totalTurnover += q.turnover;
      if (q.changePercent >= 9.9) sectorMap[normIndustry].limitUpCount++;
    }

    const sectors = buildSectorScores(sectorMap);
    return json({ data: { sectors, type: 'industry', total_stocks: stocks.length }, success: true });
  } catch (e) {
    return error(e.message);
  }
}

function buildSectorScores(sectorMap) {
  return Object.entries(sectorMap).map(([industry, data]) => {
    const count = data.stocks.length;
    if (count < 3) return null;
    const avgChange = data.totalChange / count;
    const upCount = data.stocks.filter(s => s.quote.changePercent > 0).length;
    const breadthScore = (upCount / count) * 100;
    const changeScore = Math.min(100, Math.max(0, 50 + avgChange * 10));
    const volumeScore = Math.min(100, Math.max(0, Math.log10(data.totalVolume / count + 1) * 8));
    const momentumScore = Math.min(100, Math.max(0, 50 + avgChange * 8));
    const score = Math.round(momentumScore * 0.35 + changeScore * 0.25 + breadthScore * 0.25 + volumeScore * 0.15);

    return {
      industry, score,
      changeScore: Math.round(changeScore),
      volumeScore: Math.round(volumeScore),
      breadthScore: Math.round(breadthScore),
      momentumScore: Math.round(momentumScore),
      stock_count: count,
      avg_change_percent: Math.round(avgChange * 100) / 100,
      total_turnover: data.totalTurnover,
      limit_up_count: data.limitUpCount,
    };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

// ==================== 概念板块 ====================

async function handleConceptMomentum() {
  try {
    const { quotes } = await getAllQuotes();
    const stocks = await getStockList();

    const conceptMap = {};
    for (const stock of stocks) {
      const q = quotes.find(qu => qu.symbol === stock.symbol);
      if (!q) continue;
      const concepts = stock.concepts || [];
      if (concepts.length === 0) continue;

      for (const concept of concepts) {
        if (!conceptMap[concept]) {
          conceptMap[concept] = { stocks: [], totalChange: 0, totalVolume: 0, totalTurnover: 0, limitUpCount: 0 };
        }
        conceptMap[concept].stocks.push({ ...stock, quote: q });
        conceptMap[concept].totalChange += q.changePercent;
        conceptMap[concept].totalVolume += q.volume;
        conceptMap[concept].totalTurnover += q.turnover;
        if (q.changePercent >= 9.9) conceptMap[concept].limitUpCount++;
      }
    }

    const sectors = buildSectorScores(conceptMap);
    return json({ data: { sectors, type: 'concept', total_stocks: stocks.length }, success: true });
  } catch (e) {
    return error(e.message);
  }
}

async function handleSectorStocks(industry, pageSize = 50) {
  try {
    const { quotes } = await getAllQuotes();
    const stocks = await getStockList();
    const decodedIndustry = decodeURIComponent(industry);

    const matched = stocks
      .filter(s => normalizeIndustry(s.industry) === decodedIndustry)
      .map(s => {
        const q = quotes.find(qu => qu.symbol === s.symbol);
        return {
          symbol: s.symbol,
          name: s.name,
          market: s.market,
          industry: normalizeIndustry(s.industry),
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
    const stocks = await getStockList();
    const stock = stocks.find(s => s.symbol === symbol);
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
  const stocks = await getStockList();
  const results = stocks
    .filter(s => s.symbol.includes(keyword) || s.name.includes(keyword))
    .slice(0, 20)
    .map(s => ({ symbol: s.symbol, name: s.name, market: s.market, industry: normalizeIndustry(s.industry) }));
  return json({ data: { items: results }, success: true });
}

// ==================== Phase 2: AI 市场解读 ====================

function generateMarketInsight(indices, sectors, stocks, quotes) {
  const upIndices = indices.filter(i => i.changePercent > 0);
  const downIndices = indices.filter(i => i.changePercent < 0);
  const topSectors = sectors.slice(0, 5);
  const bottomSectors = sectors.slice(-3).reverse();
  const avgIndexChange = indices.reduce((s, i) => s + i.changePercent, 0) / (indices.length || 1);
  const marketBreadth = upIndices.length / (indices.length || 1);

  // ====== 市场状态 ======
  let mood, moodEmoji;
  if (avgIndexChange > 1.5 && marketBreadth > 0.7) { mood = '强势上攻'; moodEmoji = '🔥'; }
  else if (avgIndexChange > 0.5) { mood = '温和上行'; moodEmoji = '📈'; }
  else if (avgIndexChange > -0.3) { mood = '震荡整理'; moodEmoji = '⚖️'; }
  else if (avgIndexChange > -1) { mood = '弱势调整'; moodEmoji = '📉'; }
  else { mood = '大幅下挫'; moodEmoji = '🌧️'; }

  // ====== 一、市场基本面 ======
  const indexLines = indices.slice(0, 5).map(i =>
    `· ${i.name}: ${i.changePercent > 0 ? '+' : ''}${i.changePercent.toFixed(2)}%（${i.changePercent > 0 ? '上涨' : '下跌'}）`
  );

  const allQuotes = quotes.filter(q => q && q.changePercent !== undefined && isFinite(q.changePercent));
  const upStocks = allQuotes.filter(q => q.changePercent > 0).length;
  const downStocks = allQuotes.filter(q => q.changePercent < 0).length;
  const totalStocks = allQuotes.length || 1;
  const upRatio = Math.round(upStocks / totalStocks * 100);

  const limitUpStocks = allQuotes.filter(q => q.changePercent >= 9.9);
  const limitDownStocks = allQuotes.filter(q => q.changePercent <= -9.9);

  let breadthAnalysis;
  if (upRatio >= 70) breadthAnalysis = `普涨格局（${upRatio}%个股上涨），市场赚钱效应显著，做多情绪高涨`;
  else if (upRatio >= 50) breadthAnalysis = `涨多跌少（${upRatio}%个股上涨），市场情绪偏积极，但分化明显需要精选方向`;
  else if (upRatio >= 30) breadthAnalysis = `跌多涨少（${upRatio}%个股上涨），市场偏弱，操作难度加大，控制仓位为主`;
  else breadthAnalysis = `普跌格局（仅${upRatio}%个股上涨），市场恐慌情绪蔓延，建议观望等待企稳信号`;

  // PE 分布简析
  const peValues = allQuotes.map(q => q.peRatio).filter(p => p > 0 && p < 1000);
  const avgPE = peValues.length > 0 ? Math.round(peValues.reduce((s, p) => s + p, 0) / peValues.length) : null;
  let peAnalysis = '';
  if (avgPE) {
    if (avgPE < 15) peAnalysis = `整体PE偏低（均${avgPE}倍），市场估值处于历史低位区域，中长期配置价值显现`;
    else if (avgPE < 25) peAnalysis = `整体PE适中（均${avgPE}倍），估值处于合理区间，精选盈利增长确定的标的`;
    else peAnalysis = `整体PE偏高（均${avgPE}倍），估值扩张阶段需注意回调风险，关注业绩能否消化估值`;
  }

  const fundamentalText = [
    `**指数表现**`,
    ...indexLines,
    `**涨跌分布**: ${upStocks}涨 / ${downStocks}跌 / ${totalStocks - upStocks - downStocks}平`,
    `**涨停/跌停**: ${limitUpStocks.length}只涨停 / ${limitDownStocks.length}只跌停`,
    breadthAnalysis,
    avgPE ? peAnalysis : '',
    '',
  ].filter(Boolean).join('\n');

  // ====== 二、资金面 ======
  const totalTurnover = allQuotes.reduce((s, q) => s + (q.turnover || 0), 0);
  const turnoverStr = totalTurnover > 1e12
    ? (totalTurnover / 1e12).toFixed(1) + '万亿'
    : (totalTurnover / 1e8).toFixed(0) + '亿';

  const sectorFlowLines = topSectors.slice(0, 3).map(s =>
    `· ${s.industry}: 成交${(s.total_turnover / 1e8).toFixed(0)}亿，均涨${s.avg_change_percent > 0 ? '+' : ''}${s.avg_change_percent}%，资金集中度高`
  );

  const volumeSurgeSectors = sectors
    .filter(s => s.stock_count >= 5 && s.avg_change_percent > 1)
    .slice(0, 3);
  const surgeText = volumeSurgeSectors.length > 0
    ? `资金聚焦：${volumeSurgeSectors.map(s => s.industry).join('、')} 量价齐升`
    : '无明显资金集中方向，市场观望情绪浓厚';

  const outflowSectors = bottomSectors.filter(s => s.avg_change_percent < -1);
  const outflowText = outflowSectors.length > 0
    ? `资金流出：${outflowSectors.map(s => s.industry).join('、')} 板块弱势，资金撤离明显`
    : '';

  const capitalText = [
    `**市场总成交**: ${turnoverStr}`,
    surgeText,
    `**资金流入板块**`,
    ...sectorFlowLines,
    outflowText,
    `**资金特征**: ${avgIndexChange > 0.3 ? '增量资金入场迹象，关注成交量能否持续放大' : avgIndexChange < -0.3 ? '存量博弈为主，观望资金较多，缺乏增量驱动' : '存量博弈，结构性行情为主，资金在板块间轮动'}`,
    '',
  ].filter(Boolean).join('\n');

  // ====== 三、政策/消息面 ======
  const topIndustry = topSectors[0];
  const hotEvents = [];
  if (limitUpStocks.length >= 10) hotEvents.push(`${limitUpStocks.length}只个股涨停，短线情绪活跃`);
  if (limitDownStocks.length >= 10) hotEvents.push(`${limitDownStocks.length}只个股跌停，注意规避风险`);
  if (topSectors.length > 0 && topSectors[0].avg_change_percent > 3)
    hotEvents.push(`${topSectors[0].industry}板块大涨${topSectors[0].avg_change_percent.toFixed(1)}%，催化因素值得跟踪`);

  let policyNote;
  if (topIndustry && ['电子', '计算机', '国防军工', '通信'].includes(topIndustry.industry))
    policyNote = '科技自主可控、国产替代等政策方向持续受到市场关注';
  else if (topIndustry && ['电力设备', '公用事业', '环保'].includes(topIndustry.industry))
    policyNote = '"双碳"目标及新型电力系统建设带来结构性机会';
  else if (topIndustry && ['食品饮料', '家用电器', '商贸零售'].includes(topIndustry.industry))
    policyNote = '促消费政策持续发力，关注消费复苏节奏及CPI数据变化';
  else if (topIndustry && ['医药生物', '社会服务'].includes(topIndustry.industry))
    policyNote = '医药集采政策边际缓和，创新药/医疗器械出海逻辑值得跟踪';
  else if (topIndustry && ['非银金融', '银行'].includes(topIndustry.industry))
    policyNote = '资本市场改革深化（注册制、并购重组等），关注券商及金融IT';
  else
    policyNote = '保持对产业政策、货币政策信号及外围市场走势的跟踪';

  const policyText = [
    `**市场动态**`,
    ...(hotEvents.length > 0 ? hotEvents.map(e => `· ${e}`) : ['· 今日市场表现相对平稳，无极端事件']),
    `**政策观察**`,
    `· ${policyNote}`,
    `**操作建议**`,
    avgIndexChange > 1
      ? '· 强势行情下不宜追高，可关注回调到位的二线龙头补涨机会'
      : avgIndexChange > 0.3
        ? '· 结构性行情中，聚焦景气评分 > 60 的板块，精选龙头做波段'
        : avgIndexChange > -0.3
          ? '· 震荡市中多看少动，控制仓位 3-5 成，等待方向选择'
          : avgIndexChange > -1
            ? '· 弱势环境下降低仓位至 3 成以下，保留现金等待市场企稳'
            : '· 急跌后不宜恐慌杀跌，关注超跌板块的反弹机会，分批建仓',
    '',
  ].join('\n');

  return {
    mood, moodEmoji,
    sections: [
      { title: '一、市场基本面', icon: '📊', text: fundamentalText },
      { title: '二、资金面分析', icon: '💰', text: capitalText },
      { title: '三、政策/消息面', icon: '📰', text: policyText },
    ],
    marketBreadth: {
      up: upIndices.length, down: downIndices.length,
      neutral: indices.length - upIndices.length - downIndices.length,
      breadthRatio: marketBreadth,
      stockUpRatio: upRatio,
    },
    avgIndexChange: Math.round(avgIndexChange * 100) / 100,
    topSectors: topSectors.map(s => ({ industry: s.industry, score: s.score, avgChange: s.avg_change_percent })),
    weakSectors: bottomSectors.map(s => ({ industry: s.industry, score: s.score, avgChange: s.avg_change_percent })),
    limitUpCount: limitUpStocks.length,
    limitDownCount: limitDownStocks.length,
    timestamp: Date.now(),
  };
}

async function handleMarketInsight() {
  try {
    const { quoteMap, quotes } = await getAllQuotes();
    const stocks = await getStockList();
    const indices = INDEX_SYMBOLS.map(idx => {
      const pureCode = idx.tencent.replace(/^[a-z]+/, '');
      const q = quoteMap[pureCode] || quoteMap[idx.symbol] || quoteMap[idx.tencent];
      return {
        name: idx.name,
        symbol: idx.symbol,
        changePercent: q ? q.changePercent : 0,
      };
    });

    const sectors = await getSectorData();
    const insight = generateMarketInsight(indices, sectors, stocks, quotes);
    return json({ data: insight, success: true });
  } catch (e) {
    return error(e.message);
  }
}

// Extract sector data for reuse
async function getSectorData() {
  const { quotes } = await getAllQuotes();
  const stocks = await getStockList();
  const sectorMap = {};
  for (const stock of stocks) {
    const q = quotes.find(qu => qu.symbol === stock.symbol);
    if (!q) continue;
    const ind = normalizeIndustry(stock.industry);
    if (!sectorMap[ind]) {
      sectorMap[ind] = { stocks: [], totalChange: 0, totalVolume: 0, totalTurnover: 0, limitUpCount: 0 };
    }
    sectorMap[ind].stocks.push({ ...stock, quote: q });
    sectorMap[ind].totalChange += q.changePercent;
    sectorMap[ind].totalVolume += q.volume;
    sectorMap[ind].totalTurnover += q.turnover;
    if (q.changePercent >= 9.9) sectorMap[ind].limitUpCount++;
  }

  return Object.entries(sectorMap).map(([industry, data]) => {
    const count = data.stocks.length;
    if (count < 3) return null;
    const avgChange = data.totalChange / count;
    const upCount = data.stocks.filter(s => s.quote.changePercent > 0).length;
    const breadthScore = (upCount / count) * 100;
    const changeScore = Math.min(100, Math.max(0, 50 + avgChange * 10));
    const volumeScore = Math.min(100, Math.max(0, Math.log10(data.totalVolume / count + 1) * 8));
    const momentumScore = Math.min(100, Math.max(0, 50 + avgChange * 8));
    const score = Math.round(momentumScore * 0.35 + changeScore * 0.25 + breadthScore * 0.25 + volumeScore * 0.15);
    return {
      industry, score,
      changeScore: Math.round(changeScore),
      volumeScore: Math.round(volumeScore),
      breadthScore: Math.round(breadthScore),
      momentumScore: Math.round(momentumScore),
      stock_count: count,
      avg_change_percent: Math.round(avgChange * 100) / 100,
      total_turnover: data.totalTurnover,
      limit_up_count: data.limitUpCount,
    };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
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
  const stocks = await getStockList();
  const stock = stocks.find(s => s.symbol === symbol);
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

async function handleDebug() {
  const results = {};

  // Test 1: Tencent API connectivity
  try {
    const tStart = Date.now();
    const resp = await fetch('https://qt.gtimg.cn/q=sh000001', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.qq.com' },
    });
    const buffer = await resp.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(buffer);
    results.tencent = {
      ok: resp.ok,
      status: resp.status,
      latencyMs: Date.now() - tStart,
      textPreview: text.substring(0, 200),
      containsChinese: /[\u4e00-\u9fff]/.test(text),
      hasData: text.includes('v_sh000001'),
    };
  } catch (e) {
    results.tencent = { error: e.message };
  }

  // Test 2: EastMoney API
  try {
    const emStart = Date.now();
    const emResp = await fetch('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&fid=f3&fs=m:0+t:6&fields=f12,f14', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com' },
    });
    const emData = await emResp.json();
    results.eastmoney = {
      ok: emResp.ok,
      status: emResp.status,
      latencyMs: Date.now() - emStart,
      count: emData?.data?.diff?.length || 0,
      sample: emData?.data?.diff?.slice(0, 3),
    };
  } catch (e) {
    results.eastmoney = { error: e.message };
  }

  // Test 3: Worker env info
  results.env = {
    hasGbKDecoder: typeof TextDecoder !== 'undefined',
    platform: typeof navigator !== 'undefined' ? 'browser' : 'worker',
    timestamp: Date.now(),
  };

  return json({ data: results, success: true });
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

    // Concept momentum
    if (path === '/api/sectors/concept') {
      return handleConceptMomentum();
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

    // Debug endpoint: test Tencent API connectivity
    if (path === '/api/debug') {
      return handleDebug();
    }

    return error('Not found', 404);
  },
};
