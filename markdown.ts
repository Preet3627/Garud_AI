import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    link({ href, title, text }) {
      const safeHref = href || '';
      const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
      const hrefAttr = safeHref ? ` href="${safeHref.replace(/"/g, '&quot;')}"` : '';
      const secureAttrs =
        safeHref.startsWith('http://') || safeHref.startsWith('https://')
          ? ' rel="noopener noreferrer" target="_blank"'
          : '';

      return `<a${hrefAttr}${titleAttr}${secureAttrs}>${text}</a>`;
    },
  },
});

export function renderMarkdown(text: string): string {
  if (!text) {
    return '';
  }

  try {
    const rawHtml = marked.parse(text) as string;
    return DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
      ALLOWED_TAGS: [
        'a',
        'blockquote',
        'br',
        'code',
        'em',
        'h1',
        'h2',
        'h3',
        'hr',
        'li',
        'ol',
        'p',
        'pre',
        'strong',
        'table',
        'tbody',
        'td',
        'th',
        'thead',
        'tr',
        'ul',
      ],
      KEEP_CONTENT: true,
    });
  } catch (error) {
    console.error('Failed to render markdown', error);
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br />');
  }
}

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~>#-]/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
