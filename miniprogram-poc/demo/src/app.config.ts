export default defineAppConfig({
  pages: [
    'pages/market/index',
    'pages/ai-chat/index',
    'pages/profile/index',
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#0a0e1a',
    navigationBarTitleText: '澄观 Clair',
    navigationBarTextStyle: 'white',
    backgroundColor: '#0a0e1a',
  },
  tabBar: {
    color: '#64748b',
    selectedColor: '#3b82f6',
    backgroundColor: '#111827',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/market/index',
        text: '行情',
        // iconPath / selectedIconPath 需替换为真实 tab 图标资源（POC 占位为空）
      },
      {
        pagePath: 'pages/ai-chat/index',
        text: 'AI',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
      },
    ],
  },
})
