/**
 * 简单的Markdown渲染器
 * 支持：粗体、标题、列表、换行、代码块
 *
 * 安全（F04）：renderMarkdown 的输入可能来自 AI 输出或上游接口，属于不可信内容。
 * 因此先 escapeHtml 转义原始文本（使注入的标签无法成为标签），再套用 Markdown
 * 规则生成本模块自己的 HTML，最后经 DOMPurify 消毒后返回。
 * 调用方仍以 dangerouslySetInnerHTML 使用，但内容已确保无脚本。
 */

import { escapeHtml, sanitizeHtml } from './sanitizeHtml';

export function renderMarkdown(content: string): string {
  if (!content) return '';

  // 第一道防线：先转义，任何 <script>/<img onerror> 都会变成纯文本
  const safe = escapeHtml(content);

  const html = safe
    // 代码块
    .replace(/```([\s\S]*?)```/g, '<pre style="background:#0f172a;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;margin:8px 0"><code>$1</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code style="background:#1e293b;padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
    // 粗体
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // 标题
    .replace(/^#### (.*)/gm, '<h4 style="margin:12px 0 6px;font-size:14px">$1</h4>')
    .replace(/^### (.*)/gm, '<h4 style="margin:12px 0 6px;font-size:14px">$1</h4>')
    .replace(/^## (.*)/gm, '<h3 style="margin:16px 0 8px;font-size:15px">$1</h3>')
    .replace(/^# (.*)/gm, '<h3 style="margin:16px 0 8px;font-size:16px">$1</h3>')
    // 无序列表
    .replace(/^[*-] (.*)/gm, '<div style="padding-left:16px;margin:4px 0">• $1</div>')
    // 有序列表
    .replace(/^\d+\. (.*)/gm, (match, p1) => {
      const num = match.match(/^\d+/);
      return `<div style="padding-left:16px;margin:4px 0">${num ? num[0] : '1'}. ${p1}</div>`;
    })
    // 换行
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  // 第二道防线：插入 DOM 前统一消毒，防止后续新增规则引入注入面
  return sanitizeHtml(html);
}
