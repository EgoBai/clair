/**
 * PWA Manifest 配置
 * 渐进式 Web 应用元数据
 */

export interface PWAConfig {
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  startUrl: string;
  scope: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
  shortcuts: { name: string; shortName: string; url: string; description: string }[];
}

export const pwaConfig: PWAConfig = {
  name: 'A股行情分析',
  shortName: 'A股分析',
  description: '专业的A股实时行情分析平台 - K线图、选股器、回测、自选股',
  themeColor: '#1890ff',
  backgroundColor: '#ffffff',
  display: 'standalone',
  startUrl: '/',
  scope: '/',
  icons: [
    { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png' },
    { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
    { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png' },
    { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png' },
    { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
  shortcuts: [
    { name: '自选股', shortName: '自选', url: '/watchlist', description: '查看自选股列表' },
    { name: '选股器', shortName: '选股', url: '/screener', description: '股票筛选工具' },
    { name: '市场分析', shortName: '市场', url: '/market', description: '大盘行情分析' },
    { name: '预警', shortName: '预警', url: '/alerts', description: '价格预警通知' },
  ],
};

/**
 * 生成 manifest.json 内容
 */
export function generateManifest(): string {
  return JSON.stringify({
    name: pwaConfig.name,
    short_name: pwaConfig.shortName,
    description: pwaConfig.description,
    theme_color: pwaConfig.themeColor,
    background_color: pwaConfig.backgroundColor,
    display: pwaConfig.display,
    start_url: pwaConfig.startUrl,
    scope: pwaConfig.scope,
    icons: pwaConfig.icons.map(icon => ({
      src: icon.src,
      sizes: icon.sizes,
      type: icon.type,
      ...(icon.purpose ? { purpose: icon.purpose } : {}),
    })),
    shortcuts: pwaConfig.shortcuts.map(s => ({
      name: s.name,
      short_name: s.shortName,
      url: s.url,
      description: s.description,
    })),
    categories: ['finance', 'business'],
    orientation: 'any',
    lang: 'zh-CN',
  }, null, 2);
}

export default { pwaConfig, generateManifest };
