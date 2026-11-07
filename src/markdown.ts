import { Marked, type Token, type Tokens, type TokenizerExtension } from 'marked';
import { renderMermaid } from './diagram.ts';
import { highlightCode } from './highlight.ts';
import { halfBlockRows, imageCells, type ImageProtocol, type ImageStore } from './image.ts';
import { renderMath } from './math.ts';
import { lineText, mergeStyle, span, splitGraphemes, textWidth, type Line, type Span, type Style } from './style.ts';
import type { Theme } from './theme.ts';

export interface RenderOptions {
  width: number;
  theme: Theme;
  lineNumbers: boolean;
  baseDir: string;
  images?: ImageStore;
  imageProtocol: ImageProtocol;
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
  line: number;
}

export interface LinkRef {
  text: string;
  url: string;
  line: number;
}

export interface CodeBlockRef {
  lang: string;
  code: string;
  start: number;
  end: number;
}

export interface CopyBlock {
  kind: 'heading' | 'list' | 'code';
  text: string;
}

export interface Rendered {
  lines: Line[];
  headings: Heading[];
  links: LinkRef[];
  codeBlocks: CodeBlockRef[];
  blocks: CopyBlock[];
}

interface MathToken {
  type: 'inlineMath' | 'blockMath';
  raw: string;
  text: string;
}

export const inlineMath: TokenizerExtension = {
  name: 'inlineMath',
  level: 'inline',
  start(src: string) {
    const idx = src.indexOf('$');
    return idx === -1 ? undefined : idx;
  },
  tokenizer(src: string) {
    const display = /^\$\$([^$]+?)\$\$/.exec(src);
    if (display) return { type: 'inlineMath', raw: display[0], text: display[1] };
    const match = /^\$(?![\s$])([^$\n]+?)(?<!\s)\$(?![\d$])/.exec(src);
    if (match) return { type: 'inlineMath', raw: match[0], text: match[1] };
    return undefined;
  },
};

export const blockMath: TokenizerExtension = {
  name: 'blockMath',
  level: 'block',
  start(src: string) {
    const idx = src.search(/^\$\$/m);
    return idx === -1 ? undefined : idx;
  },
  tokenizer(src: string) {
    const match = /^\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$[ \t]*(?:\n+|$)/.exec(src);
    if (match) return { type: 'blockMath', raw: match[0], text: match[1] };
    return undefined;
  },
};

const marked = new Marked({ gfm: true, extensions: [blockMath, inlineMath] });

export function lex(source: string): Token[] {
  return marked.lexer(source);
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  mdash: '—', ndash: '–', hellip: '…', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔',
  laquo: '«', raquo: '»', middot: '·', bull: '•', deg: '°', times: '×', divide: '÷', check: '✓',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function plainInline(tokens: Token[] | undefined): string {
  if (!tokens) return '';
  return tokens
    .map((t) => {
      if ('tokens' in t && t.tokens && t.type !== 'codespan') return plainInline(t.tokens);
      if (t.type === 'inlineMath') return renderMath((t as unknown as MathToken).text);
      if (t.type === 'html') return '';
      return decodeEntities((t as Tokens.Text).text ?? '');
    })
    .join('');
}

export function wrapSpans(spans: Span[], width: number): Span[][] {
  const lines: Span[][] = [];
  let current: Span[] = [];
  let used = 0;
  const pushText = (text: string, s: Span): void => {
    const last = current[current.length - 1];
    if (last && last.style === s.style && last.link === s.link) last.text += text;
    else current.push({ ...s, text });
  };
  const newline = (): void => {
    const last = current[current.length - 1];
    if (last) last.text = last.text.trimEnd();
    lines.push(current.filter((s) => s.text));
    current = [];
    used = 0;
  };
  for (const s of spans) {
    if (s.text === '\n') {
      newline();
      continue;
    }
    for (const word of s.text.split(/(\s+)/)) {
      if (!word) continue;
      if (/^\s+$/.test(word)) {
        if (used === 0) continue;
        if (used + 1 > width) newline();
        else {
          pushText(' ', s);
          used += 1;
        }
        continue;
      }
      const w = textWidth(word);
      if (used + w > width && used > 0) newline();
      if (w <= width) {
        pushText(word, s);
        used += w;
        continue;
      }
      for (const g of splitGraphemes(word)) {
        const gw = textWidth(g);
        if (used + gw > width && used > 0) newline();
        pushText(g, s);
        used += gw;
      }
    }
  }
  if (current.length || lines.length === 0) newline();
  return lines;
}

function prefixed(lines: Line[], first: Span[], rest: Span[]): Line[] {
  return lines.map((line, idx) => ({ ...line, spans: [...(idx === 0 ? first : rest), ...line.spans] }));
}

function repeatToWidth(ch: string, width: number): string {
  return ch.repeat(Math.max(0, width));
}

const ALERTS: Record<string, { icon: string; title: string }> = {
  NOTE: { icon: 'ⓘ', title: 'Note' },
  TIP: { icon: '✦', title: 'Tip' },
  IMPORTANT: { icon: '❢', title: 'Important' },
  WARNING: { icon: '⚠', title: 'Warning' },
  CAUTION: { icon: '⊘', title: 'Caution' },
};

class Renderer {
  private readonly opts: RenderOptions;
  private readonly theme: Theme;
  private taskIndex = 0;
  private codeIndex = 0;
  readonly codeBlocks: { lang: string; code: string }[] = [];

  constructor(opts: RenderOptions) {
    this.opts = opts;
    this.theme = opts.theme;
  }

  inline(tokens: Token[] | undefined, base: Style, link?: string): Span[] {
    const t = this.theme;
    const out: Span[] = [];
    for (const token of tokens ?? []) {
      switch (token.type) {
        case 'text':
        case 'escape': {
          const tt = token as Tokens.Text;
          if (tt.tokens?.length) out.push(...this.inline(tt.tokens, base, link));
          else out.push(span(decodeEntities(tt.text).replace(/\n/g, ' '), base, link));
          break;
        }
        case 'strong':
          out.push(...this.inline(token.tokens, mergeStyle(base, { bold: true }), link));
          break;
        case 'em':
          out.push(...this.inline(token.tokens, mergeStyle(base, { italic: true }), link));
          break;
        case 'del':
          out.push(...this.inline(token.tokens, mergeStyle(base, { strike: true }), link));
          break;
        case 'codespan':
          out.push(span(decodeEntities((token as Tokens.Codespan).text), mergeStyle(base, { fg: t.inlineCode, bg: t.inlineCodeBg }), link));
          break;
        case 'br':
          out.push(span('\n', base));
          break;
        case 'link': {
          const lt = token as Tokens.Link;
          out.push(...this.inline(lt.tokens, mergeStyle(base, { fg: t.link, underline: true }), lt.href));
          break;
        }
        case 'image': {
          const it = token as Tokens.Image;
          out.push(span(`🖼 ${it.text || 'image'}`, mergeStyle(base, { fg: t.link, italic: true }), link ?? it.href));
          break;
        }
        case 'inlineMath':
          out.push(span(renderMath((token as unknown as MathToken).text), mergeStyle(base, { fg: t.math, italic: true }), link));
          break;
        case 'html': {
          const html = (token as Tokens.HTML).text;
          if (/^<br\s*\/?>$/i.test(html)) out.push(span('\n', base));
          break;
        }
        default:
          if ('tokens' in token && token.tokens) out.push(...this.inline(token.tokens, base, link));
          else if ('text' in token) out.push(span(decodeEntities(String(token.text)), base, link));
      }
    }
    return out;
  }

  paragraph(spans: Span[], width: number, kind: Line['kind'] = 'text'): Line[] {
    return wrapSpans(spans, width).map((s) => ({ spans: s, kind }));
  }

  blocks(tokens: Token[], width: number, base: Style, tight = false): Line[] {
    const out: Line[] = [];
    for (const token of tokens) {
      if (token.type === 'space') continue;
      const lines = this.block(token, width, base, tight);
      if (!lines.length) continue;
      if (out.length && !tight) out.push({ spans: [], kind: 'blank' });
      out.push(...lines);
    }
    return out;
  }

  block(token: Token, width: number, base: Style, tight = false): Line[] {
    const t = this.theme;
    switch (token.type) {
      case 'heading':
        return this.heading(token as Tokens.Heading, width);
      case 'paragraph':
        return this.paragraphBlock(token as Tokens.Paragraph, width, base);
      case 'text': {
        const tt = token as Tokens.Text;
        return this.paragraph(this.inline(tt.tokens ?? [tt], base), width);
      }
      case 'code':
        return this.code(token as Tokens.Code, width);
      case 'blockMath':
        return this.mathBlock((token as unknown as MathToken).text, width);
      case 'blockquote':
        return this.blockquote(token as Tokens.Blockquote, width, base);
      case 'list':
        return this.list(token as Tokens.List, width, base, 0);
      case 'table':
        return this.table(token as Tokens.Table, width, base);
      case 'hr':
        return [{ spans: [span(repeatToWidth('─', width), { fg: t.rule })], kind: 'text' }];
      case 'html':
        return this.html((token as Tokens.HTML).text, width, base);
      case 'def':
        return [];
      default:
        if ('tokens' in token && token.tokens) return this.blocks(token.tokens, width, base, tight);
        if ('text' in token) return this.paragraph([span(String(token.text), base)], width);
        return [];
    }
  }

  heading(token: Tokens.Heading, width: number): Line[] {
    const t = this.theme;
    const level = token.depth;
    const color = t.headings[level - 1];
    const style: Style = { fg: color, bold: level <= 4, italic: level >= 5, dim: level === 6 };
    const spans = this.inline(token.tokens, style).map((s) => ({ ...s, style: { ...s.style, fg: s.link ? s.style.fg : color } }));
    const marker: Span[] = level >= 3 ? [span(`${'#'.repeat(level)} `, { fg: color, dim: true })] : [];
    const text = plainInline(token.tokens);
    const lines = wrapSpans([...marker, ...spans], width).map((s): Line => ({ spans: s, kind: 'heading' }));
    lines[0].heading = { level, text };
    if (level === 1) lines.push({ spans: [span(repeatToWidth('━', width), { fg: color })], kind: 'heading' });
    if (level === 2) lines.push({ spans: [span(repeatToWidth('─', width), { fg: t.rule })], kind: 'heading' });
    return lines;
  }

  paragraphBlock(token: Tokens.Paragraph, width: number, base: Style): Line[] {
    const meaningful = token.tokens.filter((x) => !(x.type === 'text' && !(x as Tokens.Text).text.trim()) && x.type !== 'br');
    const asImage = (x: Token): Tokens.Image | undefined => {
      if (x.type === 'image') return x as Tokens.Image;
      const inner = x.type === 'link' ? (x as Tokens.Link).tokens : undefined;
      return inner?.length === 1 && inner[0].type === 'image' ? (inner[0] as Tokens.Image) : undefined;
    };
    const images = meaningful.map(asImage).filter((x) => x !== undefined);
    if (images.length && images.length === meaningful.length) {
      const out: Line[] = [];
      for (const it of images) {
        out.push(...this.image(it.href, it.text, width));
      }
      return out;
    }
    return this.paragraph(this.inline(token.tokens, base), width);
  }

  image(src: string, alt: string, width: number): Line[] {
    const t = this.theme;
    const placeholder = (note = ''): Line[] => [
      { spans: [span(`🖼 ${alt || src}${note}`, { fg: t.link, italic: true }, src)], kind: 'image' },
    ];
    const store = this.opts.images;
    if (!store || this.opts.imageProtocol === 'none') return placeholder();
    const entry = store.get(src, this.opts.baseDir);
    if (entry.status === 'loading') return placeholder(' (loading…)');
    if (entry.status === 'error') return placeholder();
    const { cols, rows } = imageCells(entry, width);
    const half = halfBlockRows(entry, cols, rows, t.bg);
    const protocol = this.opts.imageProtocol;
    if (protocol === 'halfblock' && !half) return placeholder();
    const lines: Line[] = [];
    for (let row = 0; row < rows; row++) {
      lines.push({
        spans: half ? half[row] : [],
        kind: 'image',
        image: protocol === 'halfblock' ? undefined : { imageId: entry.id, row, rows, cols },
      });
    }
    if (alt) lines.push({ spans: [span(alt, { fg: t.muted, italic: true }, src)], kind: 'image' });
    return lines;
  }

  code(token: Tokens.Code, width: number): Line[] {
    const t = this.theme;
    const lang = (token.lang ?? '').trim().split(/\s/)[0];
    if (lang === 'mermaid') {
      const diagram = renderMermaid(token.text, t);
      if (diagram) return diagram.map((spans) => ({ spans, kind: 'diagram' }));
    }
    if (lang === 'math' || lang === 'latex' || lang === 'tex') return this.mathBlock(token.text, width);
    const index = this.codeIndex++;
    this.codeBlocks.push({ lang, code: token.text });
    const border: Style = { fg: t.codeBorder };
    const bg: Style = { bg: t.codeBg };
    const inner = Math.max(4, width - 4);
    const highlighted = highlightCode(token.text, lang, t);
    const gutterWidth = this.opts.lineNumbers ? String(highlighted.length).length + 1 : 0;
    const contentWidth = Math.max(1, inner - gutterWidth);
    const label = lang ? ` ${lang} ` : '';
    const lines: Line[] = [
      {
        spans: [span('╭─', border), span(label, { fg: t.muted, italic: true }), span(repeatToWidth('─', width - 3 - textWidth(label)), border), span('╮', border)],
        kind: 'code',
        codeBlock: index,
      },
    ];
    highlighted.forEach((tokens, n) => {
      const withBg = tokens.map((s) => ({ ...s, style: { ...s.style, bg: t.codeBg } }));
      const chunks = splitSpansByWidth(withBg.length ? withBg : [span('', bg.bg ? bg : {})], contentWidth);
      chunks.forEach((chunk, k) => {
        const used = chunk.reduce((a, s) => a + textWidth(s.text), 0);
        const gutter = this.opts.lineNumbers ? [span(`${k === 0 ? String(n + 1).padStart(gutterWidth - 1) : ' '.repeat(gutterWidth - 1)} `, { fg: t.lineNumber, bg: t.codeBg })] : [];
        lines.push({
          spans: [span('│', border), span(' ', bg), ...gutter, ...chunk, span(' '.repeat(Math.max(0, contentWidth - used)), bg), span(' ', bg), span('│', border)],
          kind: 'code',
          codeBlock: index,
        });
      });
    });
    lines.push({ spans: [span(`╰${repeatToWidth('─', width - 2)}╯`, border)], kind: 'code', codeBlock: index });
    return lines;
  }

  mathBlock(text: string, width: number): Line[] {
    const rendered = renderMath(text);
    return rendered.split('\n').map((line) => {
      const pad = Math.max(0, Math.floor((width - textWidth(line)) / 2));
      return { spans: [span(' '.repeat(pad)), span(line, { fg: this.theme.math, italic: true })], kind: 'text' as const };
    });
  }

  blockquote(token: Tokens.Blockquote, width: number, base: Style): Line[] {
    const t = this.theme;
    let tokens = token.tokens;
    let color = t.quoteBar;
    let title: Line | undefined;
    const first = tokens[0];
    const alertMatch = first?.type === 'paragraph' ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec((first as Tokens.Paragraph).text) : null;
    if (alertMatch && first.type === 'paragraph') {
      const kind = alertMatch[1].toUpperCase();
      const alert = ALERTS[kind];
      color = t.alerts[kind.toLowerCase() as keyof Theme['alerts']];
      title = { spans: [span(`${alert.icon} ${alert.title}`, { fg: color, bold: true })], kind: 'quote' };
      const rest = (first as Tokens.Paragraph).text.slice(alertMatch[0].length);
      const restTokens = rest.trim() ? lex(rest) : [];
      tokens = [...restTokens, ...tokens.slice(1)];
    }
    const inner = this.blocks(tokens, Math.max(1, width - 2), mergeStyle(base, alertMatch ? {} : { fg: t.quoteFg, italic: true }));
    const bar = [span('▎ ', { fg: color })];
    const lines = title ? [title, ...inner] : inner;
    return prefixed(lines.length ? lines : [{ spans: [] }], bar, bar).map((l) => ({ ...l, kind: l.kind === 'blank' ? 'quote' : l.kind ?? 'quote' }));
  }

  list(token: Tokens.List, width: number, base: Style, depth: number): Line[] {
    const t = this.theme;
    const start = typeof token.start === 'number' ? token.start : 1;
    const bullets = ['•', '◦', '▪', '▫'];
    const markerWidth = token.ordered ? String(start + token.items.length - 1).length + 2 : 2;
    const out: Line[] = [];
    token.items.forEach((item, idx) => {
      let marker: Span;
      let task: Line['task'];
      if (item.task) {
        task = { index: this.taskIndex++, checked: Boolean(item.checked) };
        marker = item.checked ? span('☑ ', { fg: t.taskDone, bold: true }) : span('☐ ', { fg: t.taskTodo });
      } else if (token.ordered) {
        marker = span(`${start + idx}.`.padEnd(markerWidth), { fg: t.listMarker, bold: true });
      } else {
        marker = span(bullets[depth % bullets.length].padEnd(markerWidth), { fg: t.listMarker });
      }
      const mWidth = textWidth(marker.text);
      const childWidth = Math.max(1, width - mWidth);
      const children: Line[] = [];
      const loose = token.loose;
      for (const child of item.tokens) {
        if (child.type === 'checkbox' || child.type === 'space') continue;
        const lines = child.type === 'list' ? this.list(child as Tokens.List, childWidth, base, depth + 1) : this.block(child, childWidth, item.checked ? mergeStyle(base, { fg: t.muted, strike: true }) : base, !loose);
        if (!lines.length) continue;
        if (children.length && loose) children.push({ spans: [], kind: 'blank' });
        children.push(...lines);
      }
      if (!children.length) children.push({ spans: [] });
      const lines = prefixed(children, [marker], [span(' '.repeat(mWidth))]).map((l) => ({ ...l, kind: l.kind === 'code' || l.kind === 'image' ? l.kind : ('list' as const) }));
      if (task) lines[0].task = task;
      if (out.length && loose) out.push({ spans: [], kind: 'list' });
      out.push(...lines);
    });
    return out;
  }

  table(token: Tokens.Table, width: number, base: Style): Line[] {
    const t = this.theme;
    const border: Style = { fg: t.tableBorder };
    const headerStyle = mergeStyle(base, { bold: true, fg: t.tableHeader });
    const header = token.header.map((cell) => this.inline(cell.tokens, headerStyle));
    const rows = token.rows.map((row) => row.map((cell) => this.inline(cell.tokens, base)));
    const cols = header.length;
    const natural = Array.from({ length: cols }, (_, c) =>
      Math.max(1, ...[header[c], ...rows.map((r) => r[c] ?? [])].map((cell) => cell.reduce((a, s) => a + textWidth(s.text), 0))),
    );
    const available = Math.max(cols, width - (cols + 1) - cols * 2);
    const widths = [...natural];
    while (widths.reduce((a, b) => a + b, 0) > available) {
      const max = Math.max(...widths);
      if (max <= 3) break;
      const i = widths.indexOf(max);
      widths[i] = max - 1;
    }
    const rule = (l: string, m: string, r: string): Line => ({
      spans: [span(l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r, border)],
      kind: 'table',
    });
    const renderRow = (cells: Span[][]): Line[] => {
      const wrapped = widths.map((w, c) => wrapSpans(cells[c] ?? [], w));
      const height = Math.max(...wrapped.map((w) => w.length));
      const lines: Line[] = [];
      for (let k = 0; k < height; k++) {
        const spans: Span[] = [span('│', border)];
        widths.forEach((w, c) => {
          const content = wrapped[c][k] ?? [];
          const used = content.reduce((a, s) => a + textWidth(s.text), 0);
          const pad = w - used;
          const align = token.align[c];
          const left = align === 'center' ? Math.floor(pad / 2) : align === 'right' ? pad : 0;
          spans.push(span(' '.repeat(left + 1)), ...content, span(' '.repeat(pad - left + 1)), span('│', border));
        });
        lines.push({ spans, kind: 'table' });
      }
      return lines;
    };
    const lines: Line[] = [rule('╭', '┬', '╮'), ...renderRow(header), rule('├', '┼', '┤')];
    rows.forEach((row) => lines.push(...renderRow(row)));
    lines.push(rule('╰', '┴', '╯'));
    return lines;
  }

  html(html: string, width: number, base: Style): Line[] {
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
    if (!withoutComments.trim()) return [];
    const out: Line[] = [];
    const imgRe = /<img\b[^>]*>/gi;
    for (const tag of withoutComments.match(imgRe) ?? []) {
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
      if (src) out.push(...this.image(src, alt, width));
    }
    const text = decodeEntities(
      withoutComments
        .replace(imgRe, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h\d|li|summary|details|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    )
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of text) out.push(...this.paragraph([span(line, base)], width));
    return out;
  }
}

function splitSpansByWidth(spans: Span[], width: number): Span[][] {
  const out: Span[][] = [[]];
  let used = 0;
  for (const s of spans) {
    let text = '';
    for (const g of splitGraphemes(s.text.replace(/\t/g, '    '))) {
      const gw = textWidth(g);
      if (used + gw > width) {
        if (text) out[out.length - 1].push({ ...s, text });
        out.push([]);
        text = '';
        used = 0;
      }
      text += g;
      used += gw;
    }
    if (text) out[out.length - 1].push({ ...s, text });
  }
  return out;
}

function sectionText(tokens: Token[], start: number): string {
  const level = (tokens[start] as Tokens.Heading).depth;
  let text = '';
  for (let i = start; i < tokens.length; i++) {
    const tk = tokens[i];
    if (i > start && tk.type === 'heading' && (tk as Tokens.Heading).depth <= level) break;
    text += tk.raw;
  }
  return text.trim();
}

export function stripFrontMatter(source: string): string {
  const match = /^---\r?\n(?:[\w-]+\s*:.*\r?\n|\s+.*\r?\n|\r?\n)*---[ \t]*(?:\r?\n|$)/.exec(source);
  return match ? source.slice(match[0].length) : source;
}

export function renderMarkdown(source: string, opts: RenderOptions): Rendered {
  const tokens = lex(stripFrontMatter(source));
  const renderer = new Renderer(opts);
  const width = Math.max(10, opts.width);
  const lines: Line[] = [];
  const blocks: CopyBlock[] = [];
  tokens.forEach((token, idx) => {
    if (token.type === 'space') return;
    const blockLines = renderer.block(token, width, {});
    if (!blockLines.length) return;
    let blockIndex: number | undefined;
    if (token.type === 'heading') blockIndex = blocks.push({ kind: 'heading', text: sectionText(tokens, idx) }) - 1;
    else if (token.type === 'list') blockIndex = blocks.push({ kind: 'list', text: token.raw.trim() }) - 1;
    else if (token.type === 'code') blockIndex = blocks.push({ kind: 'code', text: (token as Tokens.Code).text }) - 1;
    if (lines.length) lines.push({ spans: [], kind: 'blank' });
    for (const line of blockLines) lines.push(blockIndex === undefined ? line : { ...line, block: blockIndex });
  });
  return finalize(lines, renderer.codeBlocks, blocks);
}

export function finalize(lines: Line[], codeSources: { lang: string; code: string }[], blocks: CopyBlock[]): Rendered {
  const headings: Heading[] = [];
  const links: LinkRef[] = [];
  const codeBlocks: CodeBlockRef[] = [];
  const slugCounts = new Map<string, number>();
  lines.forEach((line, idx) => {
    if (line.heading) {
      const base = slugify(line.heading.text);
      const count = slugCounts.get(base) ?? 0;
      slugCounts.set(base, count + 1);
      headings.push({ ...line.heading, slug: count ? `${base}-${count}` : base, line: idx });
    }
    if (line.codeBlock !== undefined) {
      const existing = codeBlocks[line.codeBlock];
      if (existing) existing.end = idx;
      else codeBlocks[line.codeBlock] = { ...codeSources[line.codeBlock], start: idx, end: idx };
    }
    let previous: Span | undefined;
    for (const s of line.spans) {
      if (s.link && s.text.trim()) {
        const last = links[links.length - 1];
        const continues = previous?.link === s.link || (last && last.url === s.link && last.line === idx - 1 && line.spans.indexOf(s) <= 1);
        if (continues && last) last.text += s.text;
        else links.push({ text: s.text, url: s.link, line: idx });
      }
      previous = s;
    }
  });
  for (const link of links) link.text = link.text.trim();
  return { lines, headings, links, codeBlocks, blocks };
}

export function collectCodeLangs(source: string): string[] {
  const langs = new Set<string>();
  for (const match of source.matchAll(/^[ \t>]*(?:`{3,}|~{3,})[ \t]*([\w+#.-]+)/gm)) langs.add(match[1]);
  return [...langs];
}

const TASK_RE = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])(\])/;

export function toggleTaskInSource(source: string, index: number): string | undefined {
  const lines = source.split('\n');
  let fence: string | undefined;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = /^[ \t>]*(`{3,}|~{3,})/.exec(lines[i]);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1].startsWith(fence[0]) && fenceMatch[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const match = TASK_RE.exec(lines[i]);
    if (!match) continue;
    if (count++ === index) {
      lines[i] = match[1] + (match[2] === ' ' ? 'x' : ' ') + match[3] + lines[i].slice(match[0].length);
      return lines.join('\n');
    }
  }
  return undefined;
}

export function splitSlides(source: string): string[] {
  const slides: string[] = [];
  let current: string[] = [];
  let fence: string | undefined;
  const lines = source.split('\n');
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0 && lines.slice(1, end).every((l) => /^[\w-]+\s*:/.test(l) || !l.trim())) start = end + 1;
  }
  for (const line of lines.slice(start)) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) fence = fence ? undefined : fenceMatch[1];
    if (!fence && /^\s*---\s*$/.test(line)) {
      slides.push(current.join('\n'));
      current = [];
      continue;
    }
    current.push(line);
  }
  slides.push(current.join('\n'));
  return slides.filter((s) => s.trim());
}

export function linesToText(lines: Line[]): string {
  return lines.map((l) => lineText(l).trimEnd()).join('\n');
}
