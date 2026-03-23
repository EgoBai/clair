/**
 * 搜索优化工具
 * 支持：模糊匹配、拼音搜索、搜索历史
 * 参考雪球/同花顺的搜索体验
 */

/**
 * 拼音首字母映射（常用A股股票名）
 * 实际项目应使用 pinyin 库，这里用静态映射做轻量实现
 */
const PINYIN_MAP: Record<string, string> = {
  '平安银行': 'payh', '浦发银行': 'pfyh', '招商银行': 'zsyh', '工商银行': 'gsyh',
  '建设银行': 'jsyh', '农业银行': 'nyyh', '中国银行': 'zgyh', '交通银行': 'jtyh',
  '兴业银行': 'xyyh', '民生银行': 'msyh', '中信银行': 'zxyh', '光大银行': 'gdyh',
  '华夏银行': 'hxyh', '北京银行': 'bjyh', '南京银行': 'njyh', '宁波银行': 'nbyh',
  '贵州茅台': 'gzmt', '五粮液': 'wly', '泸州老窖': 'lzlj', '洋河股份': 'yhgf',
  '山西汾酒': 'sxfj', '青岛啤酒': 'qdpj', '伊利股份': 'ylgf', '海天味业': 'htwy',
  '恒瑞医药': 'hryy', '药明康德': 'ymkd', '迈瑞医疗': 'mryl', '片仔癀': 'pzh',
  '云南白药': 'ynby', '同仁堂': 'trt', '长春高新': 'ccgx', '智飞生物': 'zfsw',
  '宁德时代': 'ndsd', '比亚迪': 'byd', '隆基绿能': 'ljln', '通威股份': 'twgf',
  '阳光电源': 'ygdy', '亿纬锂能': 'ywln', '天齐锂业': 'tqly', '赣锋锂业': 'gfly',
  '比亚迪股份': 'bydgf', '长城汽车': 'ccqc', '上汽集团': 'sqjt', '广汽集团': 'gqjt',
  '中国平安': 'zgpa', '中国人寿': 'zgrs', '新华保险': 'xhbx', '中国太保': 'zgtb',
  '万科A': 'wka', '保利发展': 'blfz', '招商蛇口': 'zssk', '新城控股': 'xckg',
  '海康威视': 'hkws', '大华股份': 'dhgf', '科大讯飞': 'kdxf', '中兴通讯': 'zxtx',
  '京东方A': 'jdfa', 'TCL科技': 'tclkj', '韦尔股份': 'wegf', '立讯精密': 'lxjm',
  '歌尔股份': 'gegf', '蓝思科技': 'lskj', '三安光电': 'sagd', '北方华创': 'bfhc',
  '中芯国际': 'zxgj', '紫光国微': 'zggw', '兆易创新': 'zycx', '卓胜微': 'zsw',
  '东方财富': 'dfcf', '中信证券': 'zxzq', '华泰证券': 'htzq', '国泰君安': 'gtja',
  '海通证券': 'htzq2', '广发证券': 'gfzq', '招商证券': 'zszq', '申万宏源': 'swhy',
  '长江电力': 'cjdl', '华能水电': 'hnsd', '国电南瑞': 'gdnr', '三峡能源': 'sxny',
  '中国神华': 'zgsh', '陕西煤业': 'sxmy', '兖矿能源': 'ykny', '中煤能源': 'zmny',
  '美的集团': 'mdjt', '格力电器': 'gldq', '海尔智家': 'hezj', '三花智控': 'shzk',
  '汇川技术': 'hcjs', '先导智能': 'xdzn', '埃斯顿': 'asth', '绿的谐波': 'ldxb',
  '恒生电子': 'hsdz', '用友网络': 'yywl', '金蝶国际': 'jdgj', '广联达': 'gld',
  '金山办公': 'jsbg', '中望软件': 'zwrj', '万兴科技': 'wxkj', '福昕软件': 'fxrj',
  '中国中免': 'zgzm', '宋城演艺': 'csyj', '中国国旅': 'zggl', '锦江酒店': 'jjjd',
  '海底捞': 'hdl', '呷哺呷哺': 'xbxb', '百胜中国': 'bszg', '九毛九': 'jmj',
  '顺丰控股': 'sfkg', '中通快递': 'ztkd', '圆通速递': 'ytsd', '韵达股份': 'ydgf',
  '中国建筑': 'zgjz', '中国铁建': 'zgtj', '中国交建': 'zgjj', '中国电建': 'zgdj',
  '海螺水泥': 'hlsn', '华新水泥': 'hxsn', '天山股份': 'tsgf', '冀东水泥': 'jdsn',
  '宝钢股份': 'bggf', '中信特钢': 'zxtg', '华菱钢铁': 'hlgt', '包钢股份': 'bggf2',
  '紫金矿业': 'zjky', '洛阳钼业': 'lymy', '山东黄金': 'sdhj', '中金黄金': 'zjhj',
};

/**
 * 获取股票的拼音首字母
 */
export function getPinyinInitials(name: string): string {
  return PINYIN_MAP[name] || '';
}

/**
 * 股票搜索匹配
 * 支持：代码匹配、名称匹配、拼音匹配
 */
export function matchStock(
  query: string,
  symbol: string,
  name: string
): { matched: boolean; score: number } {
  const q = query.toLowerCase().trim();
  if (!q) return { matched: true, score: 0 };

  const sym = symbol.toLowerCase();
  const nm = name.toLowerCase();

  // 1. 代码精确匹配 (最高优先)
  if (sym === q) return { matched: true, score: 1000 };
  // 2. 代码前缀匹配
  if (sym.startsWith(q)) return { matched: true, score: 900 };
  // 3. 代码包含匹配
  if (sym.includes(q)) return { matched: true, score: 800 };
  // 4. 名称精确匹配
  if (nm === q) return { matched: true, score: 700 };
  // 5. 名称前缀匹配
  if (nm.startsWith(q)) return { matched: true, score: 600 };
  // 6. 名称包含匹配
  if (nm.includes(q)) return { matched: true, score: 500 };
  // 7. 拼音首字母匹配
  const pinyin = getPinyinInitials(name);
  if (pinyin && pinyin.includes(q)) return { matched: true, score: 400 };
  // 8. 名称模糊匹配（每个字都包含）
  if (q.length >= 2 && q.split('').every(ch => nm.includes(ch))) {
    return { matched: true, score: 300 };
  }

  return { matched: false, score: 0 };
}

/**
 * 搜索排序：按匹配分数降序
 */
export function searchAndSort<T extends { symbol: string; name: string }>(
  stocks: T[],
  query: string
): T[] {
  if (!query.trim()) return stocks;

  return stocks
    .map(stock => ({
      stock,
      result: matchStock(query, stock.symbol, stock.name),
    }))
    .filter(item => item.result.matched)
    .sort((a, b) => b.result.score - a.result.score)
    .map(item => item.stock);
}

// ==================== 搜索历史管理 ====================

const SEARCH_HISTORY_KEY = 'stock_search_history';
const MAX_HISTORY = 20;

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  symbol?: string;
  name?: string;
}

/**
 * 获取搜索历史（服务端存储版本 - 按用户）
 */
export function getSearchHistory(userId: number = 1): SearchHistoryItem[] {
  // 在实际项目中，应从数据库/Redis读取
  // 这里用内存Map模拟
  return searchHistoryStore.get(userId) || [];
}

export function addSearchHistory(userId: number, item: Omit<SearchHistoryItem, 'timestamp'>): void {
  const history = getSearchHistory(userId);
  // 去重
  const filtered = history.filter(h => h.query !== item.query);
  filtered.unshift({ ...item, timestamp: Date.now() });
  searchHistoryStore.set(userId, filtered.slice(0, MAX_HISTORY));
}

export function clearSearchHistory(userId: number): void {
  searchHistoryStore.set(userId, []);
}

// 内存存储（实际项目用Redis）
const searchHistoryStore = new Map<number, SearchHistoryItem[]>();
