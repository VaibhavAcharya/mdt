import stringWidth from 'string-width';

export interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  dim?: boolean;
}

export interface Span {
  text: string;
  style: Style;
  link?: string;
}

export type LineKind = 'text' | 'heading' | 'code' | 'list' | 'table' | 'quote' | 'image' | 'diagram' | 'blank' | 'json';

export interface ImagePlacement {
  imageId: number;
  row: number;
  rows: number;
  cols: number;
}

export interface Line {
  spans: Span[];
  kind?: LineKind;
  block?: number;
  task?: { index: number; checked: boolean };
  heading?: { level: number; text: string };
  codeBlock?: number;
  image?: ImagePlacement;
  jsonPath?: string;
}

export function span(text: string, style: Style = {}, link?: string): Span {
  return link === undefined ? { text, style } : { text, style, link };
}

export function textWidth(text: string): number {
  if (/^[\x20-\x7e]*$/.test(text)) return text.length;
  return stringWidth(text);
}

export function lineWidth(line: Line): number {
  let width = 0;
  for (const s of line.spans) width += textWidth(s.text);
  return width;
}

export function lineText(line: Line): string {
  return line.spans.map((s) => s.text).join('');
}

export function mergeStyle(base: Style, extra: Style): Style {
  return { ...base, ...extra };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function sgr(style: Style, color: boolean): string {
  const codes: string[] = [];
  if (style.bold) codes.push('1');
  if (style.dim) codes.push('2');
  if (style.italic) codes.push('3');
  if (style.underline) codes.push('4');
  if (style.strike) codes.push('9');
  if (color && style.fg) codes.push(`38;2;${hexToRgb(style.fg).join(';')}`);
  if (color && style.bg) codes.push(`48;2;${hexToRgb(style.bg).join(';')}`);
  return codes.length ? `\x1b[${codes.join(';')}m` : '';
}

export const RESET = '\x1b[0m';

export function hyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

export interface SerializeOptions {
  color: boolean;
  styles: boolean;
  links: boolean;
  baseStyle?: Style;
}

export function serializeSpans(spans: Span[], options: SerializeOptions): string {
  let out = '';
  for (const s of spans) {
    const style = options.baseStyle ? mergeStyle(options.baseStyle, s.style) : s.style;
    const text = options.links && s.link && isExternalLink(s.link) ? hyperlink(s.link, s.text) : s.text;
    if (!options.styles) {
      out += s.text;
      continue;
    }
    const code = sgr(style, options.color);
    out += code ? `${code}${text}${RESET}` : text;
  }
  return out;
}

export function isExternalLink(url: string): boolean {
  return /^(https?|mailto|ftp):/i.test(url);
}

export function splitGraphemes(text: string): string[] {
  return [...new Intl.Segmenter().segment(text)].map((s) => s.segment);
}

export function truncateSpans(spans: Span[], maxWidth: number): Span[] {
  const out: Span[] = [];
  let used = 0;
  for (const s of spans) {
    const w = textWidth(s.text);
    if (used + w <= maxWidth) {
      out.push(s);
      used += w;
      continue;
    }
    let text = '';
    for (const g of splitGraphemes(s.text)) {
      const gw = textWidth(g);
      if (used + gw > maxWidth) break;
      text += g;
      used += gw;
    }
    if (text) out.push({ ...s, text });
    break;
  }
  return out;
}

export function sliceSpans(spans: Span[], start: number, end: number): Span[] {
  const out: Span[] = [];
  let pos = 0;
  for (const s of spans) {
    const w = textWidth(s.text);
    if (pos + w <= start || pos >= end) {
      pos += w;
      continue;
    }
    if (pos >= start && pos + w <= end) {
      out.push(s);
      pos += w;
      continue;
    }
    let text = '';
    for (const g of splitGraphemes(s.text)) {
      const gw = textWidth(g);
      if (pos >= start && pos + gw <= end) text += g;
      pos += gw;
    }
    if (text) out.push({ ...s, text });
  }
  return out;
}

export function padSpans(spans: Span[], width: number, style: Style = {}): Span[] {
  const w = spans.reduce((n, s) => n + textWidth(s.text), 0);
  return w >= width ? spans : [...spans, span(' '.repeat(width - w), style)];
}
