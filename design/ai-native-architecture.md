# 澄观 Clair · AI-Native 架构契约（D5 / D6 / D7 对齐）

> 角色：架构师（高见远）｜类型：**架构契约（分析 / 设计，无实现代码）**
> 配套：D5（真实 LLM，非规则）／ D6（轻量静态 UI 守卫先行）／ D7（前端现代化 + 多端 + 小程序可移植）
> 已决决策：**D9** — LLM 默认供应商 = **DeepSeek**（预算内，保留多模型适配器注册表含 OpenAI / Claude / 本地兜底）；**D13** — 知识库 **RAG 纳入 P1（阶段1）**，非阶段3。
> 四阶段对齐：`frontend-modernization-strategy.md` §6 的 P0–P3（基建硬化 → 单点真实化 → 游戏化叠加 → 全面差异化）
> 现状声明：本文所有「现状」均经代码核查（backend/src、frontend/src），非假设。

---

## 0. 核查基线（已验证事实，供下游引用）

| 核查项 | 现状 | 出处 |
|--------|------|------|
| 真实 LLM 调用 | `chat` / `chatStream` 已落地，默认 `provider = deepseek`（env 可切 openai / claude / local） | `backend/src/services/aiService.ts` |
| 多模型适配 | `callOpenAI`/`streamOpenAI`/`callClaude`/`streamClaude`/`callLocal`/`streamLocal` 均为**真实实现**，但是**模块内私有（未 export）**；`streamOpenAI` 兼处理 deepseek（OpenAI 兼容） | 同上 |
| SSE 网关 | `POST /api/ai/chat` 已存在，置 `text/event-stream`，消费 `chatStream` 逐块 `data:` 转发，结尾 `data: [DONE]` | `backend/src/api/ai-chat.ts` |
| 网关安全 | `app.ts` 全局 `corsMiddleware()` + helmet + rateLimit；密钥仅存服务端 env | `backend/src/app.ts` |
| 前端流式状态 | `useAIStore` **尚未创建**；`useGamificationStore` **尚未创建** | frontend/src grep 无命中 |
| 事件总线 | `EventBus` / `NamespacedEventBus` 已实现（on/once/emit/off/use/getHistory/replay/waitFor） | `frontend/src/services/eventBus.ts` |
| 成就事件 | `achievement_unlocked` 等事件名**尚未定义 / 广播** | grep 无命中 |
| 兜底系统 | `demoData.ts`（`isDemoMode()`、`_isDemo` 标记）+ `offlineMode.ts`（网络态 / IndexedDB）+ 规则版 `/ai/market-insight` 已存在 | frontend/src、backend |

> **对 D5 成本的关键结论**：真实 LLM 基座（多模型适配 + SSE 网关 + 流式解析）**已具备**，D5 工程量显著低于「从零接入」假设。供应商默认已决 = **DeepSeek（D9）**；**RAG 知识库已定 P1（D13）**。主要缺口：① 仍缺运行时适配注册表（env 单值 → 注册表，P1 建立）；② 前端流式 / 游戏化状态与事件契约尚未落地；③ AI 路由缺独立鉴权 / 配额。

> **决策状态（D9 / D13 落点）**：① LLM 默认供应商 = **DeepSeek**（**已决**，D9；保留多模型适配器注册表含 OpenAI / Claude / 本地兜底）；⑤ 知识库 **RAG 纳入 P1（阶段1）**（**已决**，D13；非阶段3，P1 接通检索 grounding，见 §1.4 / §4）。其余开放项见 §5（O1 游戏化 Schema 入库 / O3 浅色与小程序运行时 / O4 伴生语气映射）。

---

## 1. LLM 集成拓扑

### 1.1 后端代理网关（Proxy Gateway）模式
前端**不直接**调用 LLM 供应商。所有对话经 `POST /api/ai/chat`，由网关统一收口：
- **密钥安全**：API Key 仅存服务端 env（`OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `CLAUDE_API_KEY`），前端零接触。
- **CORS**：同源经 `corsMiddleware()`；小程序端走独立适配（见 §4 / §5）。
- **流式**：网关以 SSE 向浏览器推 `data: {content}\n\n`，前端用 `fetch` + `ReadableStream` 读取。
- **上下文注入**：网关已在 `/ai/chat` 注入实时板块 / 个股 / 自选股上下文（DB 查询），前端只需传 `message` / `context` / `symbols`。

### 1.2 多模型适配器（Multi-Model Adapter）
- **供应商决策（已决，D9）**：默认 `provider = DeepSeek`（预算内，性价比最优）；`openai` / `claude` / `local` 作为强任务备选与降级通道。`aiService` 当前以 `switch(provider)` 静态分发、`AI_CONFIG.provider` 由 env 单值决定；per-provider 函数为内部实现。
- **契约演进（本架构提供）**：保留 `chat` / `chatStream` 作为**统一入口**；建议在 **P1** 建立**适配器注册表** `ModelAdapter { id; chat(req); chatStream(req) }`，以便按任务路由与供应商降级切换（摘要 → DeepSeek；诊断 / 策略 → 强模型 gpt-4o / claude）。内部 per-provider 函数经注册表暴露，避免前端耦合供应商协议。

### 1.3 SSE 流式契约（前端消费侧）
```
请求:  POST /api/ai/chat   body: { message, context?, symbols?, stream: true }
响应:  Content-Type: text/event-stream
逐块:  data: {"content":"..."}\n\n
结束:  data: [DONE]\n\n
错误:  data: {"content":"\n\n⚠️ AI服务暂时不可用"}\n\n  +  data: [DONE]\n\n
```
前端以 `useAIStore.streaming` 消费；单块 `content` 追加到当前 session 的 assistant 消息。

### 1.4 RAG 知识库（P1 能力）
- **能力（已决，D13）**：RAG 知识库 = 向量检索 / 分段 → 注入 prompt → LLM 生成。作为 **P1** 能力纳入迁移路径（见 §4），**非阶段3**。
- **检索层**：新增向量库（embedding + 相似度检索）+ 文档分段器（chunking），对研报 / 公告 / 行业知识做离线索引；运行时按用户 query 召回 top-k 片段。
- **上下文注入**：网关在 `/api/ai/chat` 注入检索片段，位置类比 §1.1 既有「实时板块 / 个股 / 自选股上下文」的 DB 注入——统一在 `messages` 前置 system/context 块；`aiService.chat` / `chatStream` 入口与 SSE 契约不变。
- **降级**：检索层缺失或超时 → 跳过注入、退化为无知识库纯 LLM（仍走 §2 降级闭环），不阻断对话。

---

## 2. 降级闭环（Degradation Loop）

原则：**保住既有 `demoData` 兜底系统，不推翻重写**（D7 一致性约束）。

```
LLM 可用?
  ├─ 是 ─> 正常流式 ──> 网络离线? ──是──> offlineMode 网络态(reconnecting) + IndexedDB 缓存读取
  └─ 否 ─> 网关 chatStream 自身已 yield 兜底文案
                  └─> 前端置 degrade=true，切 demoData 演示态：
                        · isDemoMode() / DEMO_* 数据（带 _isDemo 标）
                        · 规则版 /ai/market-insight（无 LLM 依赖，稳定占位）
                        · UI 显「演示数据」微标（动画提示，不阻断）
```

- **网关层兜底**：`chatStream` 捕获异常后 yield 固定提示，避免连接断裂。
- **前端层兜底**：`useAIStore.degrade` 标志驱动「演示数据」微标与规则引擎路径（参考现有 `/ai/market-insight` 规则实现）。
- **不引入新兜底数据源**，复用 `demoData.ts` / `offlineMode.ts`。

---

## 3. 状态与事件契约（核心，供各文档消费）

### 3.1 `useAIStore` 数据形状（TS 接口，无实现）
```ts
export type AIProvider = 'deepseek' | 'openai' | 'claude' | 'local';
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';

export interface AISession {
  id: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string; createdAt: number }[];
  model: AIProvider;
  isDemo: boolean;            // 命中 demoData 兜底时置 true
}

export interface AIState {
  sessions: Record<string, AISession>;
  activeSessionId: string | null;
  streaming: StreamStatus;
  currentChunk: string;       // 正在追加的流式片段
  modelConfig: { provider: AIProvider; temperature: number; maxTokens: number };
  error: string | null;
  degrade: boolean;           // 降级标志（LLM 不可用）
  companionHint: string;      // 注入 ChatPanel 的 systemHint（与 gamification 联动）
  // actions（仅签名，无体）
  startSession(symbol?: string): string;
  send(message: string, ctx?: unknown[]): Promise<void>;
  abort(): void;
  setModel(provider: AIProvider): void;
  reset(): void;
}
```

### 3.2 `useGamificationStore` 数据形状（TS 接口，无实现）
```ts
export type BondTier = 'low' | 'mid' | 'high';
export type CompanionMood = 'calm' | 'thinking' | 'excited' | 'warning';
export type LoopPhase = 'explore' | 'research' | 'decide' | 'review' | 'levelup';

export interface Achievement { id: string; unlockedAt: number; narrativeCopy: string; xp: number; }
export interface Quest { id: string; title: string; progress: number; target: number; done: boolean; }
export interface CompanionState {
  mood: CompanionMood;
  loopPhase: LoopPhase;
  bond: number;            // 0..100
  bondTier: BondTier;      // toneByBond 驱动语气
  level: number;
  activeQuestId: string | null;
}

export interface GamificationState {
  level: number;
  xp: number;
  xpToNext: number;
  streakDays: number;
  lastActiveDate: string;       // ISO
  quests: Record<string, Quest>;
  achievements: Record<string, Achievement>;
  companion: CompanionState;
  // actions（仅签名，无体）
  addXp(delta: number): void;
  unlockAchievement(id: string): void;
  completeQuest(id: string): void;
  setCompanionMood(m: CompanionMood): void;
  bondUp(delta: number): void;
}
```

### 3.3 事件契约（经 `eventBus`，定义事件名常量 + payload）
```ts
// 事件名（建议在 eventBus 侧建常量枚举，避免字符串散落）
export const AI_EVENTS = {
  achievement_unlocked: 'achievement_unlocked',
  quest_completed: 'quest_completed',
  level_up: 'level_up',
  companion_mood_changed: 'companion_mood_changed',
} as const;

export interface AchievementUnlockedPayload { achievementId: string; narrativeCopy: string; xpDelta: number; }
export interface QuestCompletedPayload { questId: string; xpDelta: number; }
export interface LevelUpPayload { level: number; totalXp: number; }
export interface CompanionMoodPayload { mood: CompanionMood; loopPhase: LoopPhase; tone: 'low' | 'mid' | 'high'; }
```
**流向**：`Journey Engine` 写 `useGamificationStore` → 广播 `achievement_unlocked` / `level_up` → 动效层（motion / Lottie）播放；`companion_mood_changed` 反向注入 `useAIStore.companionHint` → ChatPanel systemHint。两端经 `eventBus` 解耦（D7 §5.4）。

---

## 4. 四阶段迁移（对齐 D7 §6 的 P0–P3，1:1）

| 阶段 | 前端依赖（D7 §6） | 本架构提供 | 量级 |
|------|------------------|-----------|------|
| **P0 基建硬化** | L1 token 收敛；轻量守卫(D6)先发；React19 验证（不切）；antd 读 CSS 变量 | ① 定义 `AI_EVENTS` 常量 + payload 类型，供编译期引用；② 确立 `/api/ai/chat` SSE 契约与 `useAIStore` 接口骨架；③ 记录降级契约（demoData）；④ 适配器注册表接口（默认 DeepSeek，D9；env 单值 → 注册表，P1 建立）；⑤ 定义 RAG 检索层接口 / 数据契约（P1 接通 grounding，§1.4） | ~3–5 |
| **P1 单点真实化** | motion + L2 primitives 起步；React19 升级（验证后）；流式 ChatPanel UI；Tailwind preflight 隔离 | 落地 `useAIStore` 运行时 + SSE 客户端消费；CompanionState 映射雏形；网关 `/api/ai/chat` 接真实流；**RAG 知识库（已决 D13）**（§1.4：向量检索 / 分段 → 注入 prompt → LLM 生成，检索层 + 上下文注入，P1 接通检索 grounding） | ~6–8 |
| **P2 游戏化叠加** | L3 全量开启；gamification + Journey + 成就动画；`useAIStore` 联动 + 伴生语气注入 | 落地 `useGamificationStore` + 事件契约全量广播；`useAIStore↔gamification` 经 eventBus 联动；companion tone 注入 | ~6–10 |
| **P3 全面差异化** | 响应式深化（容器查询 / 密度）；小程序护栏 + Taro 验证壳 | 复用框架无关的 store / eventBus；`aiService.ts` service 层供 Taro 复用；SSE → 小程序 transport 适配器 | ~4–6 + 独立小程序 |

---

## 5. 风险与开放决策

**风险**
1. **安全 / 成本**：`/api/ai/chat` 仅依赖全局 rateLimit，缺独立**用户鉴权 / 配额**——Key 滥用与费用失控风险。→ 加 per-user 配额 + 模型路由护栏。
2. **延迟**：网关注入 DB 上下文 + 供应商往返增加首包时延；SSE 流式已缓解 TTFB，但需客户端按字节奏渲染（~24ms / 字）。
3. **CORS / 多端**：全局 `corsMiddleware()` 须确认非 `*` 通配；小程序（Taro）无 `fetch` SSE，需 `wx.request` 流式适配层。
4. **可靠性**：供应商宕机 → 依赖降级闭环；`chatStream` 已有兜底文案，但前端须显式切 `degrade` + demoData 微标。

**开放决策**
- **O1**：`gamification-framework-schema.md` 在仓库 `requirements/` 缺位（仅外部路径可见），P2 前须入库并冻结 JourneyStage / Quest / Achievement / LevelCurve 结构。
- **O2（已决，D9）**：默认 `provider = DeepSeek`（预算内）。仍建议在 **P1** 建立多模型适配注册表（§1.2），以便按任务路由与供应商降级切换；接口已定。
- **O3**：浅色主题与小程序运行时（Taro vs uni-app）待定，影响 §4 P3 适配层选型。
- **O4**：`useAIStore.companionHint` 与 `CompanionState.toneByBond` 的语气映射规则需 PM / 设计确认。

---

*— 架构契约结束 · 由架构师（高见远）产出，供 D5/D6/D7 及 eng-d9 引用，无源码修改。*
