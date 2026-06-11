/**
 * ChatPanel — AI对话界面组件（上下文感知版）
 * 
 * 澄观的核心交互：对话式投资研究
 * 
 * 功能：
 * 1. 实时对话（Streaming打字机效果）
 * 2. 上下文记忆 + 页面感知
 * 3. 动态快捷指令（根据页面变化）
 * 4. 数据卡片嵌入
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { chat } from '../../services/aiClient';
import { renderMarkdown } from '../../utils/markdown';

// ============================================================
// 类型定义
// ============================================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface PageContext {
  page: string;
  pageName: string;
  symbol?: string;
  stockName?: string;
  systemHint: string;
}

interface QuickCommand {
  label: string;
  icon: string;
  prompt: string;
  pages?: string[]; // 限定在哪些页面显示，不设则全部显示
}

// ============================================================
// 快捷指令（页面感知）
// ============================================================

const QUICK_COMMANDS: QuickCommand[] = [
  {
    label: '今日大盘',
    icon: '📊',
    prompt: '请分析今天A股大盘的整体表现，包括主要指数涨跌、市场情绪、资金流向、涨跌家数。',
    pages: ['discover', 'other'],
  },
  {
    label: '板块轮动',
    icon: '🔥',
    prompt: '今天哪些板块表现最好？有什么轮动信号？哪些板块值得关注？',
    pages: ['discover', 'screener'],
  },
  {
    label: '个股诊断',
    icon: '🔍',
    prompt: '帮我诊断当前查看的这只股票，从技术面、基本面、估值三个维度分析。',
    pages: ['stock-detail'],
  },
  {
    label: '选股建议',
    icon: '🎯',
    prompt: '根据当前市场状况，推荐几个选股方向和筛选条件。',
    pages: ['screener'],
  },
  {
    label: '组合分析',
    icon: '📋',
    prompt: '分析我的自选股组合，看看整体风险和收益特征，有什么调仓建议？',
    pages: ['watchlist'],
  },
  {
    label: '交易复盘',
    icon: '📝',
    prompt: '帮我复盘最近的交易记录，分析盈亏原因和改进空间。',
    pages: ['review'],
  },
  {
    label: '策略建议',
    icon: '💡',
    prompt: '根据当前市场状况，有什么操作建议？仓位如何调整？',
  },
  {
    label: '风险提示',
    icon: '⚠️',
    prompt: '当前市场有哪些风险信号需要注意？',
  },
];

// ============================================================
// 组件
// ============================================================

interface ChatPanelProps {
  pageContext?: PageContext;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ pageContext }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 根据页面过滤快捷指令
  const filteredCommands = useMemo(() => {
    if (!pageContext) return QUICK_COMMANDS.filter(c => !c.pages);
    return QUICK_COMMANDS.filter(c => !c.pages || c.pages.includes(pageContext.page));
  }, [pageContext?.page]);

  // 构建系统提示
  const systemHint = useMemo(() => {
    const base = '你是澄观，一个专业的A股投资研究AI助手。你基于真实市场数据提供分析，不编造信息。回答要简洁专业，使用Markdown格式。';
    if (!pageContext) return base;
    return `${base}\n\n当前上下文：${pageContext.systemHint}`;
  }, [pageContext]);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 初始化欢迎消息（根据页面变化）
  useEffect(() => {
    const pageName = pageContext?.pageName || '澄观';
    const symbolHint = pageContext?.symbol ? `（正在查看 ${pageContext.symbol}）` : '';
    
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `你好！我是**澄观**，你的AI投资研究助手 ${symbolHint}。

当前页面：**${pageName}**

我可以帮你：
${pageContext?.page === 'stock-detail' ? '- 🔍 深度诊断当前股票\n- 📊 技术面+基本面分析\n- 💡 买卖信号判断' :
  pageContext?.page === 'screener' ? '- 🎯 选股策略建议\n- 📊 筛选条件优化\n- 🔥 热门板块解读' :
  pageContext?.page === 'watchlist' ? '- 📋 组合分析\n- ⚠️ 风险评估\n- 📊 个股对比' :
  pageContext?.page === 'review' ? '- 📝 交易复盘\n- 📊 盈亏归因\n- 💡 策略改进' :
  '- 📊 分析大盘走势\n- 🔥 解读板块轮动\n- 🔍 诊断个股\n- 💡 策略建议'}

直接输入问题，或点击下方快捷指令开始。`,
        timestamp: new Date(),
      },
    ]);
  }, [pageContext?.page, pageContext?.symbol]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || isLoading) return;

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // 添加AI占位消息
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, aiMessage]);

    try {
      // 构建上下文：系统提示 + 最近5条消息
      const context = [
        { role: 'system' as const, content: systemHint },
        ...messages.slice(-5).map(m => ({
          role: m.role,
          content: m.content,
        })),
      ];

      // 调用AI（非流式，更可靠）
      const aiContent = await chat(content, context);

      setMessages(prev =>
        prev.map(m =>
          m.id === aiMessageId
            ? { ...m, content: aiContent, isStreaming: false }
            : m
        )
      );
    } catch (error) {
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMessageId
            ? {
                ...m,
                content: '⚠️ AI服务暂时不可用，请稍后重试。',
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [inputValue, isLoading, messages, systemHint]);

  // 快捷指令点击
  const handleQuickCommand = useCallback((command: QuickCommand) => {
    // 如果是个股页面且指令需要股票代码，注入当前股票
    let prompt = command.prompt;
    if (pageContext?.symbol && command.pages?.includes('stock-detail')) {
      prompt = prompt.replace('当前查看的这只股票', `${pageContext.symbol}`);
    }
    setInputValue(prompt);
    inputRef.current?.focus();
  }, [pageContext?.symbol]);

  // 键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // 渲染Markdown（简单版本）
  const renderContent = (content: string) => {
    return renderMarkdown(content);
  };

  return (
    <div className="chat-panel">
      {/* 头部 — 显示当前页面上下文 */}
      <div className="chat-header">
        <div className="chat-title">
          <span className="ai-icon">🤖</span>
          <span>澄观 AI</span>
          {pageContext && (
            <span className="page-badge">{pageContext.pageName}</span>
          )}
        </div>
        <div className="chat-status">
          {isLoading ? '思考中...' : '在线'}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.map(message => (
          <div
            key={message.id}
            className={`message ${message.role}`}
          >
            <div className="message-avatar">
              {message.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="message-content">
              <div
                className="message-text"
                dangerouslySetInnerHTML={{
                  __html: renderContent(message.content),
                }}
              />
              {message.isStreaming && (
                <span className="typing-cursor">▊</span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 快捷指令 — 页面感知 */}
      {messages.length <= 1 && filteredCommands.length > 0 && (
        <div className="quick-commands">
          {filteredCommands.map((cmd, index) => (
            <button
              key={index}
              className="quick-command-btn"
              onClick={() => handleQuickCommand(cmd)}
            >
              <span className="command-icon">{cmd.icon}</span>
              <span className="command-label">{cmd.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div className="chat-input">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pageContext?.symbol ? `问关于 ${pageContext.symbol} 的问题...` : '输入你的问题...'}
          disabled={isLoading}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={isLoading || !inputValue.trim()}
        >
          {isLoading ? '⏳' : '➤'}
        </button>
      </div>

      {/* 样式 */}
      <style>{`
        .chat-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1a1a2e;
          color: #eee;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #16213e;
          border-bottom: 1px solid #0f3460;
        }

        .chat-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
        }

        .ai-icon {
          font-size: 20px;
        }

        .page-badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
          background: rgba(96, 165, 250, 0.2);
          color: #60a5fa;
          font-weight: 500;
        }

        .chat-status {
          font-size: 12px;
          color: #4ade80;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .message {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .message.user {
          flex-direction: row-reverse;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #0f3460;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }

        .message-content {
          max-width: 80%;
        }

        .message.user .message-content {
          text-align: right;
        }

        .message-text {
          padding: 12px 16px;
          border-radius: 12px;
          line-height: 1.6;
          font-size: 14px;
        }

        .message.user .message-text {
          background: #0f3460;
          border-bottom-right-radius: 4px;
        }

        .message.assistant .message-text {
          background: #16213e;
          border-bottom-left-radius: 4px;
        }

        .message-text h3,
        .message-text h4 {
          margin: 12px 0 8px 0;
          color: #60a5fa;
        }

        .message-text strong {
          color: #f59e0b;
        }

        .message-text li {
          margin-left: 16px;
          margin-bottom: 4px;
        }

        .typing-cursor {
          animation: blink 0.8s infinite;
          color: #60a5fa;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        .quick-commands {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          flex-wrap: wrap;
        }

        .quick-command-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 20px;
          color: #eee;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 13px;
        }

        .quick-command-btn:hover {
          background: #0f3460;
          border-color: #60a5fa;
        }

        .command-icon {
          font-size: 16px;
        }

        .chat-input {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          background: #16213e;
          border-top: 1px solid #0f3460;
        }

        .chat-input input {
          flex: 1;
          padding: 10px 16px;
          background: #1a1a2e;
          border: 1px solid #0f3460;
          border-radius: 8px;
          color: #eee;
          font-size: 14px;
          outline: none;
        }

        .chat-input input:focus {
          border-color: #60a5fa;
        }

        .chat-input input::placeholder {
          color: #666;
        }

        .send-btn {
          padding: 10px 16px;
          background: #3b82f6;
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          font-size: 16px;
          transition: background 0.2s;
        }

        .send-btn:hover:not(:disabled) {
          background: #2563eb;
        }

        .send-btn:disabled {
          background: #374151;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default ChatPanel;
