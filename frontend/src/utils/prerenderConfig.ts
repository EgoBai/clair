/**
 * 预渲染配置
 * 关键页面静态预渲染策略
 */

export interface PrerenderRoute {
  path: string;
  title: string;
  description: string;
  priority: number;     // 0-1, 越高越优先
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly';
}

/**
 * 需要预渲染的路由
 */
export const prerenderRoutes: PrerenderRoute[] = [
  {
    path: '/',
    title: 'A股行情分析 - 实时行情 | K线图 | 选股器',
    description: '专业A股实时行情分析平台，提供K线图、智能选股、回测策略、自选股管理',
    priority: 1.0,
    changefreq: 'hourly',
  },
  {
    path: '/stocks',
    title: '股票列表 - A股全部股票',
    description: '浏览A股全部股票列表，实时行情、涨跌幅、成交量',
    priority: 0.9,
    changefreq: 'always',
  },
  {
    path: '/market',
    title: '市场分析 - 大盘行情',
    description: '上证指数、深证成指、创业板指实时走势分析',
    priority: 0.9,
    changefreq: 'always',
  },
  {
    path: '/screener',
    title: '选股器 - 智能选股',
    description: '多维度股票筛选工具，按基本面、技术面、资金面选股',
    priority: 0.8,
    changefreq: 'daily',
  },
  {
    path: '/watchlist',
    title: '自选股 - 我的股票',
    description: '自选股管理，实时监控关注的股票',
    priority: 0.8,
    changefreq: 'always',
  },
  {
    path: '/news',
    title: '财经资讯 - 最新新闻',
    description: 'A股市场最新财经资讯、公告、研报',
    priority: 0.7,
    changefreq: 'hourly',
  },
  {
    path: '/etf',
    title: 'ETF基金 - 场内基金',
    description: 'ETF基金行情、涨跌幅、成交量排名',
    priority: 0.7,
    changefreq: 'daily',
  },
  {
    path: '/dashboard',
    title: '仪表盘 - 个人中心',
    description: '个人投资仪表盘，一目了然看持仓、收益',
    priority: 0.6,
    changefreq: 'always',
  },
];

/**
 * 生成 sitemap.xml
 */
export function generateSitemap(baseUrl: string): string {
  const urls = prerenderRoutes
    .map(route => `  <url>
    <loc>${baseUrl}${route.path}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

/**
 * 生成 robots.txt
 */
export function generateRobotsTxt(baseUrl: string): string {
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /ws/
Disallow: /settings

Sitemap: ${baseUrl}/sitemap.xml`;
}

/**
 * 检查路由是否应预渲染
 */
export function shouldPrerender(path: string): boolean {
  return prerenderRoutes.some(r => r.path === path);
}

export default {
  prerenderRoutes,
  generateSitemap,
  generateRobotsTxt,
  shouldPrerender,
};
