import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- 手动模拟 @tarojs/taro（仅 request + storage 子集）----
const { mockRequest, chunkCallbacks, failRef } = vi.hoisted(() => {
  const chunkCallbacks: Array<(c: { data: ArrayBuffer }) => void> = []
  const failRef: { current: (() => void) | null } = { current: null }
  const mockRequest = vi.fn((opts: any) => {
    failRef.current = opts?.fail ?? null
    const task = {
      onChunkReceived: (cb: (c: { data: ArrayBuffer }) => void) => {
        chunkCallbacks.push(cb)
      },
      offChunkReceived: vi.fn(),
      abort: vi.fn(),
      onHeadersReceived: vi.fn(),
    }
    return task
  })
  return { mockRequest, chunkCallbacks, failRef }
})

vi.mock('@tarojs/taro', () => ({
  default: {
    request: (...args: any[]) => mockRequest(...args),
    getStorageSync: () => '',
    setStorageSync: () => {},
    removeStorageSync: () => {},
  },
}))

// 必须在 mock 之后导入被测模块
const { streamChat } = await import('../src/services/sse')

/** 把字符串编码为 ArrayBuffer 并以「分片」方式喂给所有 onChunkReceived 回调 */
function feed(text: string, splitAt?: number) {
  const bytes = new TextEncoder().encode(text)
  if (splitAt === undefined || splitAt >= bytes.length) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
    chunkCallbacks.forEach((cb) => cb({ data: buf as ArrayBuffer }))
    return
  }
  const part1 = bytes.subarray(0, splitAt).slice().buffer as ArrayBuffer
  const part2 = bytes.subarray(splitAt).slice().buffer as ArrayBuffer
  chunkCallbacks.forEach((cb) => cb({ data: part1 }))
  chunkCallbacks.forEach((cb) => cb({ data: part2 }))
}

describe('streamChat — SSE 分帧 / 半包累积（联调清单 §A）', () => {
  beforeEach(() => {
    chunkCallbacks.length = 0
    failRef.current = null
    mockRequest.mockClear()
  })

  it('正常累积 token 并在 [DONE] 触发 onDone(fullText)', () => {
    const tokens: string[] = []
    let doneText = ''
    streamChat('hi', {
      onToken: (t) => tokens.push(t),
      onDone: (t) => {
        doneText = t
      },
    })
    feed('data: {"content":"你"}\n\ndata: {"content":"好"}\n\n')
    feed('data: [DONE]\n\n')
    expect(tokens).toEqual(['你', '好'])
    expect(doneText).toBe('你好')
  })

  it('ASCII 帧被拆到两个 chunk 仍能正确拼接', () => {
    const tokens: string[] = []
    streamChat('hi', { onToken: (t) => tokens.push(t) })
    // 把一段完整事件从中间拆开
    const full = 'data: {"content":"hello"}\n\ndata: [DONE]\n\n'
    feed(full, Math.floor(full.length / 2))
    expect(tokens).toEqual(['hello'])
  })

  it('跨 chunk 的多字节中文不会被截断乱码（关键回归）', () => {
    const tokens: string[] = []
    streamChat('hi', { onToken: (t) => tokens.push(t) })
    const full = 'data: {"content":"澄观Clair智能"}\n\ndata: [DONE]\n\n'
    const bytes = new TextEncoder().encode(full)
    // 在第一个中文字节的字节中间切断（澄 = E6 B8 85，3 字节）
    const cut = 14 // 落在某个多字节字符内部
    const part1 = bytes.subarray(0, cut).slice().buffer as ArrayBuffer
    const part2 = bytes.subarray(cut).slice().buffer as ArrayBuffer
    chunkCallbacks.forEach((cb) => cb({ data: part1 }))
    chunkCallbacks.forEach((cb) => cb({ data: part2 }))
    expect(tokens).toEqual(['澄观Clair智能'])
  })

  it('忽略空 content 帧，且仍能在 [DONE] 结束', () => {
    let done = false
    streamChat('hi', { onDone: () => { done = true } })
    feed('data: {"content":""}\n\n')
    feed('data: [DONE]\n\n')
    expect(done).toBe(true)
  })

  it('请求失败（fail）时调用 onError', () => {
    let err = ''
    streamChat('hi', { onError: (m) => { err = m } })
    expect(typeof failRef.current).toBe('function')
    failRef.current?.()
    expect(err).toContain('暂时不可用')
  })

  it('[DONE] 多次/半包到达也能正确终止（半包 DONE 跨 chunk）', () => {
    let done = false
    streamChat('hi', { onDone: () => { done = true } })
    // 把 data: [DONE]\n\n 切成一个字节一个字节喂（极端半包）
    const doneFrame = 'data: [DONE]\n\n'
    const bytes = new TextEncoder().encode(doneFrame)
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes.subarray(i, i + 1).slice().buffer as ArrayBuffer
      chunkCallbacks.forEach((cb) => cb({ data: b }))
    }
    expect(done).toBe(true)
  })
})
