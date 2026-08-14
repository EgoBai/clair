import { useState } from 'react'
import { View, Text, Button, Input } from '@tarojs/components'
import { login, fetchUnreadCount } from '../../services/api'
import { getAccessToken, setTokens, clearTokens } from '../../services/request'
import './index.scss'

/**
 * 我的页（阶段 0 最小版）：登录态 + 通知中心入口。
 * 登录：POST /api/user/login；未读角标：GET /api/notifications/user/:userId/unread-count。
 */

export default function ProfilePage() {
  const [loggedIn, setLoggedIn] = useState(!!getAccessToken())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [unread, setUnread] = useState(0)
  const [msg, setMsg] = useState('')

  const doLogin = async () => {
    try {
      const res = await login(email.trim(), password)
      setTokens(res.accessToken, res.refreshToken)
      setLoggedIn(true)
      setMsg(`已登录：${res.user.nickname || res.user.email}`)
      // 未读角标（用户 ID 为 JWT sub 对应的内存用户 id）
      const unreadRes = await fetchUnreadCount(res.user.id)
      setUnread(unreadRes.count)
    } catch (e: any) {
      setMsg(e?.message || '登录失败')
    }
  }

  const doLogout = () => {
    clearTokens()
    setLoggedIn(false)
    setUnread(0)
    setMsg('已退出登录')
  }

  return (
    <View className='profile-page'>
      <View className='card'>
        {loggedIn ? (
          <>
            <Text className='status-text'>已登录</Text>
            <Button className='btn' onClick={doLogout}>
              退出登录
            </Button>
          </>
        ) : (
          <>
            <Input
              className='input'
              value={email}
              placeholder='邮箱'
              onInput={(e) => setEmail(e.detail.value)}
            />
            <Input
              className='input'
              password
              value={password}
              placeholder='密码'
              onInput={(e) => setPassword(e.detail.value)}
            />
            <Button className='btn btn-primary' onClick={doLogin}>
              登录 / 注册
            </Button>
          </>
        )}
        {msg ? <Text className='msg'>{msg}</Text> : null}
      </View>

      <View className='card row'>
        <Text className='label'>通知中心</Text>
        {unread > 0 ? <Text className='badge'>{unread}</Text> : <Text className='label muted'>无未读</Text>}
      </View>

      <View className='compliance-footer'>行情与 AI 内容为研究参考，非投资建议</View>
    </View>
  )
}
