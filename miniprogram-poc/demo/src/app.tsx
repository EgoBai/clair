import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    // 启动时无需特殊初始化；token 与市场缓存由各服务层按需读取 Taro.storage
  })

  return children
}

export default App
