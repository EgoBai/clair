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

/**
 * 解码「完整」UTF-8 字节序列为字符串（输入保证是整字符边界，不含半截多字节）。
 * 不依赖 TextDecoder，规避旧基础库兼容问题。
 */
function decodeUtf8(bytes: number[]): string {
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
  let bytesBuf: number[] = [] // 跨 chunk 的原始字节累积（防止多字节字符被分片截断）
  let textBuf = '' // 已解码文本累积（用于按 \n\n 切分事件帧）
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
    // 1) 累积原始字节，仅解码「完整」UTF-8 序列，半截多字节留到下次（修复跨 chunk 中文乱码）
    const incoming = new Uint8Array(chunk.data as ArrayBuffer)
    for (let k = 0; k < incoming.length; k++) bytesBuf.push(incoming[k])

    let i = 0
    let lastComplete = -1
    while (i < bytesBuf.length) {
      const b = bytesBuf[i]
      const len = b < 0x80 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : 4
      if (i + len <= bytesBuf.length) {
        i += len
        lastComplete = i
      } else {
        break // 末尾是不完整的多字节序列，等待后续字节
      }
    }
    if (lastComplete < 0) return // 当前仅有半截多字节，不解码

    const decoded = decodeUtf8(bytesBuf.slice(0, lastComplete))
    bytesBuf = bytesBuf.slice(lastComplete)
    textBuf += decoded

    // 2) 按 \n\n 切分完整事件帧（半包帧留到下次）
    let idx = textBuf.indexOf('\n\n')
    while (idx !== -1) {
      const rawEvent = textBuf.slice(0, idx)
      textBuf = textBuf.slice(idx + 2)

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
      idx = textBuf.indexOf('\n\n')
    }
  })

  return task
}
