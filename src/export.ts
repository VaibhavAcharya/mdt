import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { Marked, type Tokens } from 'marked';
import { renderMermaid } from './diagram.ts';
import { highlightHtml } from './highlight.ts';
import { blockMath, inlineMath, slugify, stripFrontMatter } from './markdown.ts';
import { renderMath } from './math.ts';
import type { Theme } from './theme.ts';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

function inlineImage(href: string, baseDir: string): string {
  if (/^(https?:|data:)/i.test(href)) return href;
  const mime = MIME[extname(href).toLowerCase()];
  if (!mime) return href;
  try {
    return `data:${mime};base64,${readFileSync(resolve(baseDir, decodeURIComponent(href))).toString('base64')}`;
  } catch {
    return href;
  }
}

function css(theme: Theme): string {
  return `
:root { color-scheme: ${theme.name}; }
* { box-sizing: border-box; }
body { margin: 0; background: ${theme.bg}; color: ${theme.fg}; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; }
h1, h2 { padding-bottom: .3em; border-bottom: 1px solid ${theme.rule}; }
${theme.headings.map((c, i) => `h${i + 1} { color: ${c}; }`).join('\n')}
a { color: ${theme.link}; }
code { font: 0.9em ui-monospace, SFMono-Regular, Menlo, monospace; background: ${theme.inlineCodeBg}; color: ${theme.inlineCode}; padding: .15em .35em; border-radius: 4px; }
pre { background: ${theme.codeBg} !important; border: 1px solid ${theme.codeBorder}; border-radius: 8px; padding: 14px 16px; overflow-x: auto; }
pre code { background: none; color: inherit; padding: 0; font-size: 14px; }
pre.diagram { line-height: 1.2; color: ${theme.diagramBox}; }
blockquote { margin: 0; padding: 0 1em; border-left: 4px solid ${theme.quoteBar}; color: ${theme.quoteFg}; }
${Object.entries(theme.alerts).map(([k, c]) => `blockquote.alert-${k} { border-color: ${c}; color: ${theme.fg}; } blockquote.alert-${k} .alert-title { color: ${c}; font-weight: 600; }`).join('\n')}
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid ${theme.tableBorder}; padding: 6px 13px; }
th { color: ${theme.tableHeader}; }
hr { border: 0; border-top: 1px solid ${theme.rule}; margin: 24px 0; }
img { max-width: 100%; }
.math { color: ${theme.math}; font-style: italic; }
.math-block { display: block; text-align: center; margin: 1em 0; }
li:has(> input[type=checkbox]) { list-style: none; margin-left: -1.4em; }
`;
}

export function exportHtml(source: string, theme: Theme, title: string, baseDir: string): string {
  const marked = new Marked({
    gfm: true,
    extensions: [
      { ...inlineMath, renderer: (t) => `<span class="math">${escapeHtml(renderMath((t as Tokens.Generic).text))}</span>` },
      { ...blockMath, renderer: (t) => `<span class="math math-block">${escapeHtml(renderMath((t as Tokens.Generic).text)).replace(/\n/g, '<br>')}</span>\n` },
    ],
  });
  const slugs = new Map<string, number>();
  marked.use({
    renderer: {
      code({ text, lang }) {
        const language = (lang ?? '').trim().split(/\s/)[0];
        if (language === 'mermaid') {
          const diagram = renderMermaid(text, theme);
          if (diagram) return `<pre class="diagram">${escapeHtml(diagram.map((l) => l.map((s) => s.text).join('')).join('\n'))}</pre>\n`;
        }
        if (language === 'math') return `<span class="math math-block">${escapeHtml(renderMath(text))}</span>\n`;
        return highlightHtml(text, language, theme) ?? `<pre><code>${escapeHtml(text)}</code></pre>\n`;
      },
      heading({ tokens, depth, text }) {
        const base = slugify(text.replace(/<[^>]+>/g, ''));
        const count = slugs.get(base) ?? 0;
        slugs.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      blockquote({ tokens }) {
        const body = this.parser.parse(tokens);
        const match = /^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(body);
        if (!match) return `<blockquote>${body}</blockquote>\n`;
        const kind = match[1].toLowerCase();
        return `<blockquote class="alert-${kind}"><p class="alert-title">${kind[0].toUpperCase()}${kind.slice(1)}</p><p>${body.slice(match[0].length)}</blockquote>\n`;
      },
      image({ href, title, text }) {
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<img src="${escapeHtml(inlineImage(href, baseDir))}" alt="${escapeHtml(text)}"${titleAttr}>`;
      },
    },
  });
  const body = marked.parse(stripFrontMatter(source), { async: false });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css(theme)}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}
