/**
 * ChatPanel — AI对话界面组件
 * 
 * 澄观的核心交互：对话式投资研究
 * 
 * 功能：
 * 1. 实时对话（Streaming打字机效果）
 * 2. 上下文记忆
 * 3. 快捷指令
 * 4. 数据卡片嵌入
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { chatStream } from '../../services/aiClient';

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

interface QuickCommand {
  label: string;
  icon: string;
  prompt: string;
}

// ============================================================
// 快捷指令
// ============================================================

const QUICK_COMMANDS: QuickCommand[] = [
  {
    label: '今日大盘',
    icon: '📊',
    prompt: '请分析今天A股大盘的整体表现，包括主要指数、市场情绪、资金流向。',
  },
  {
    label: '板块分析',
    icon: '🔥',
    prompt: '今天哪些板块表现最好？为什么？有什么轮动信号？',
  },
  {
    label: '个股诊断',
    icon: '🔍',
    prompt: '帮我诊断一只股票，我会告诉你股票代码。',
  },
  {
    label: '策略建议',
    icon: '💡',
    prompt: '根据当前市场状况，有什么操作建议？',
  },
];

// ============================================================
// 组件
// ============================================================

const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 初始化欢迎消息
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `你好！我是**澄观**，你的AI投资研究助手。

我可以帮你：
- 📊 分析大盘走势和市场情绪
- 🔥 解读板块轮动和资金流向
- 🔍 诊断个股（技术面+基本面）
- 💡 提供交易策略建议

有什么想问的？直接输入，或者点击下方快捷指令开始。`,
        timestamp: new Date(),
      },
    ]);
  }, []);

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
      // 构建上下文（最近5条消息）
      const context = messages.slice(-5).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // 调用AI（流式）
      const stream = chatStream(content, context);

      let fullContent = '';
      for await (const chunk of stream) {
        fullContent += chunk.content;
        
        setMessages(prev =>
          prev.map(m =>
            m.id === aiMessageId
              ? { ...m, content: fullContent }
              : m
          )
        );
      }

      // 标记流式结束
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMessageId
            ? { ...m, isStreaming: false }
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
  }, [inputValue, isLoading, messages]);

  // 快捷指令点击
  const handleQuickCommand = useCallback((command: QuickCommand) => {
    setInputValue(command.prompt);
    inputRef.current?.focus();
  }, []);

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
    // 简单的Markdown渲染
    let html = content
      // 加粗
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // 换行
      .replace(/\n/g, '<br/>')
      // 列表项
      .replace(/^- (.*)/gm, '<li>$1</li>')
      // 标题
      .replace(/^### (.*)/gm, '<h4>$1</h4>')
      .replace(/^## (.*)/gm, '<h3>$1</h3>');

    return html;
  };

  return (
    <div className="chat-panel">
      {/* 头部 */}
      <div className="chat-header">
        <div className="chat-title">
          <span className="ai-icon">🤖</span>
          <span>澄观 AI 助手</span>
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

      {/* 快捷指令 */}
      {messages.length <= 1 && (
        <div className="quick-commands">
          {QUICK_COMMANDS.map((cmd, index) => (
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
          placeholder="输入你的问题..."
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
