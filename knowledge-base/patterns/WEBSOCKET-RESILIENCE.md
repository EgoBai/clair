# WebSocket 韧性架构

## 概述
金融实时数据推送需要高可用性。本文档总结了WebSocket的韧性设计方案。

## 核心机制

### 1. 指数退避重连 (Exponential Backoff)
```
delay = initialRetryDelay * retryMultiplier^retryCount
jitter = delay * (0.8 + random() * 0.4)  // ±20%抖动
```
- 初始延迟: 1s
- 退避倍数: 2x
- 最大延迟: 30s
- 最大重试: 15次
- 抖动避免惊群效应

### 2. 心跳检测 (Heartbeat)
- 客户端每15秒发送 ping
- 服务端10秒内未响应则判定超时
- 超时后主动断开触发重连
- ping 携带最后序列号，服务端可据此判断是否需要补发

### 3. 断线数据补全 (Gap Fill)
- 客户端维护消息序列号 (seq)
- 重连后发送 gap_fill_request(fromSeq)
- 服务端补发 fromSeq 之后的消息
- 客户端有本地消息缓冲 (最近100条) 做参考

### 4. 多数据源容灾 (Failover)
```
sources = [primary, backup, emergency]
```
- 主数据源失败后自动切换
- 每个源独立重试计数
- 所有源耗尽后进入 failed 状态
- 服务端可通知 source_switch 事件

### 5. 状态机
```
disconnected → connecting → connected
                  ↓              ↓
              reconnecting ← disconnect (自动)
                  ↓
              failed (所有源耗尽)
```

## 状态事件
前端通过 `onStateChange` 监听状态变化，UI 可据此展示连接指示器：
- 🟢 connected: 正常
- 🟡 reconnecting: 断线重连中 (显示重连次数)
- 🔴 disconnected/failed: 连接断开

## 关键设计决策

1. **订阅持久化**: `subscribedSymbols` 在实例级别维护，重连后自动重新订阅
2. **序列号追踪**: `lastSeq` 用于断线补全，避免数据丢失
3. **消息缓冲**: 客户端缓存最近N条消息，可用于本地补全参考
4. **手动 vs 自动断开**: `isManualClose` 标记区分，手动断开不触发重连
5. **通配符监听**: `on('*', handler)` 监听所有消息类型

## 参考
- Bloomberg B-PIPE: 心跳 + 序列号 + 断线补全
- WebSocket RFC 6455: 协议层断线检测
