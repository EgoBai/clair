import Taro from '@tarojs/taro'
import { BASE_URL } from './request'

/**
 * AI 流式对话（SSE）消费 —— 后端零改造
 *
 * 后端 /api/ai/chat 返回 text/event-stream，逐 token 写 `data: {"content":"..."}\n\n`，
 * 结束帧 `data: [DONE]\n\n`。小程序无 fetch/ReadableStream/EventSource，改用
 * wx.request({ enableChunked: true }) + onChunkReceived 手动累积解析。
 *
 * 注意：enableChunked 跨端（iOS/Android/开发者工具）表现有差异，需真机验证（联调清单 A 项）。
 */

export interface StreamHandlers {
  /** 每个 token 片段 */
  onToken?: (text: string) => void
  /** 收到 [DONE] */
  onDone?: (fullText: string) => void
  /** 请求失败 / 服务不可用 */
  onError?: (message: string) => void
}

/** 简易 UTF-8 字节解码（避免依赖 TextDecoder 在旧基础库的兼容问题） */
function utf8Decode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    if (b < 0x80) {
      out += String.fromCharCode(b)
      i += 1
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
      i += 2
    } else if (b < 0xf0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
      )
      i += 3
    } else {
      const codePoint =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f)
      out += String.fromCodePoint(codePoint)
      i += 4
    }
  }
  return out
}

export function streamChat(
  message: string,
  handlers: StreamHandlers,
  context: Array<{ role: string; content: string }> = [],
) {
  let buffer = '' // 跨 chunk 的半包累积缓冲
  let fullText = ''

  const task = Taro.request({
    url: `${BASE_URL}/api/ai/chat`,
    method: 'POST',
    enableChunked: true, // 关键：开启分块接收
    data: { message, context, stream: true },
    header: { 'Content-Type': 'application/json' },
    fail: () => {
      handlers.onError?.('AI 服务暂时不可用，请稍后重试')
    },
  })

  task.onChunkReceived((chunk) => {
    // chunk.data 为 ArrayBuffer
    buffer += utf8Decode(chunk.data as ArrayBuffer)

    // 按 \n\n 切分完整事件帧
    let idx = buffer.indexOf('\n\n')
    while (idx !== -1) {
      const rawEvent = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)

      const lines = rawEvent.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') {
          handlers.onDone?.(fullText)
          return
        }
        try {
          const parsed = JSON.parse(payload)
          const content: string = parsed?.content ?? ''
          if (content) {
            fullText += content
            handlers.onToken?.(content)
          }
        } catch {
          // 半包 JSON 忽略，等待下一个 chunk 补齐
        }
      }
      idx = buffer.indexOf('\n\n')
    }
  })

  return task
}
