import { useState, useRef } from 'react'
import { View, Text, Textarea, Button, ScrollView } from '@tarojs/components'
import { streamChat } from '../../services/sse'
import './index.scss'

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export default function AiChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollIntoView = useRef('')

  const handleSend = () => {
    const text = input.trim()
    if (!text || busy) return

    const next: Message[] = [
      ...messages,
      { role: 'user', content: text },
      { role: 'assistant', content: '', streaming: true },
    ]
    setMessages(next)
    setInput('')
    setBusy(true)

    // SSE 流式消费 /api/ai/chat（后端零改造）
    streamChat(
      text,
      {
        onToken: (token) => {
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: last.content + token }
            }
            return copy
          })
        },
        onDone: () => {
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, streaming: false }
            }
            return copy
          })
          setBusy(false)
        },
        onError: (err) => {
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: err, streaming: false }
            }
            return copy
          })
          setBusy(false)
        },
      },
      // 携带最近 10 条作为上下文（与后端 context 契约一致）
      messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    )
  }

  return (
    <View className='ai-page'>
      <ScrollView scrollY className='msg-list' scrollIntoView={scrollIntoView.current}>
        {messages.length === 0 && (
          <View className='empty-state'>向 AI 提问，研究参考、非投资建议</View>
        )}
        {messages.map((m, i) => (
          <View key={i} className={m.role === 'user' ? 'bubble bubble-user' : 'bubble bubble-ai'}>
            <Text className='bubble-text'>{m.content || (m.streaming ? '思考中…' : '')}</Text>
            {m.streaming && <Text className='cursor'>▍</Text>}
          </View>
        ))}
        {/* 底部占位，保证最新消息可见 */}
        <View id='msg-bottom' style={{ height: '20rpx' }} />
      </ScrollView>

      <View className='input-bar'>
        <Textarea
          className='input'
          value={input}
          onInput={(e) => setInput(e.detail.value)}
          placeholder='输入你的问题…'
          maxlength={500}
          autoHeight
        />
        <Button className='send-btn' size='mini' disabled={busy || !input.trim()} onClick={handleSend}>
          发送
        </Button>
      </View>
      <View className='compliance-footer'>AI 内容为研究参考，非投资建议</View>
    </View>
  )
}
