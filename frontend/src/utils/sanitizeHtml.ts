/**
 * HTML 消毒工具（F04 — AI 内容 XSS 防护）
 *
 * 背景：AI 返回内容经 renderMarkdown 转成 HTML 后由 dangerouslySetInnerHTML 渲染。
 * AI 输出可被 prompt 注入影响，也可能透传上游数据里的脚本，必须消毒后再插入 DOM。
 *
 * 两道防线：
 *   1) escapeHtml —— 在 Markdown 转换「之前」转义原始文本，使攻击者提供的标签
 *      永远无法成为标签（这是根本防线，不依赖任何库）。
 *   2) sanitizeHtml —— 在插入 DOM「之前」用 DOMPurify 过滤，防止未来新增
 *      Markdown 规则（如链接、图片）时引入新的注入面。
 */

import DOMPurify from 'dompurify';

/** Markdown 渲染器允许自行产出的标签白名单（与暗色主题样式保持一致） */
const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span',
  'strong', 'em', 'del', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

/**
 * 允许 style 属性，因为 renderMarkdown 用内联样式维持暗色主题
 * （代码块 #0f172a / 行内代码 #1e293b）。DOMPurify 会剥离 style 里的
 * javascript: expression() 等危险取值。
 * 不允许 href/src/onerror 等可承载脚本或外发请求的属性。
 */
const ALLOWED_ATTR = ['style', 'class'];

/**
 * 转义 HTML 特殊字符 —— 在 Markdown 转换前调用。
 * 这是防 XSS 的根本手段：用户/AI 提供的 `<script>` 会变成可见文本而非标签。
 */
export function escapeHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 消毒最终 HTML —— 在写入 dangerouslySetInnerHTML 前调用。
 * SSR / 非浏览器环境下 DOMPurify 无 DOM 可用，此时退化为整体转义，绝不放行原始 HTML。
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  if (typeof window === 'undefined' || !DOMPurify.isSupported) {
    return escapeHtml(html);
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // 禁止 data: / javascript: 等伪协议承载的内容
    ALLOW_DATA_ATTR: false,
    // 彻底移除标签及其内容，而不是只脱标签
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcset', 'action', 'formaction', 'background', 'poster', 'href', 'src'],
  });
}

export default sanitizeHtml;
