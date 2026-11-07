import { span, textWidth, type Line, type Span, type Style } from './style.ts';
import type { Theme } from './theme.ts';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function parseJson(source: string): Json | undefined {
  try {
    return JSON.parse(source) as Json;
  } catch {
    return undefined;
  }
}

export function looksLikeJson(source: string): boolean {
  const trimmed = source.trimStart();
  return (trimmed.startsWith('{') || trimmed.startsWith('[')) && parseJson(source) !== undefined;
}

function isContainer(value: Json): value is Json[] | { [key: string]: Json } {
  return typeof value === 'object' && value !== null;
}

function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

export function defaultExpanded(value: Json, depth = 2): Set<string> {
  const out = new Set<string>();
  const walk = (v: Json, path: string, d: number): void => {
    if (!isContainer(v) || d >= depth) return;
    out.add(path);
    for (const [k, child] of entries(v)) walk(child, childPath(path, k), d + 1);
  };
  walk(value, '$', 0);
  return out;
}

export function allContainers(value: Json): Set<string> {
  const out = new Set<string>();
  const walk = (v: Json, path: string): void => {
    if (!isContainer(v)) return;
    out.add(path);
    for (const [k, child] of entries(v)) walk(child, childPath(path, k));
  };
  walk(value, '$');
  return out;
}

function entries(value: Json[] | { [key: string]: Json }): [string | number, Json][] {
  return Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
}

function valueSpan(value: Json, theme: Theme): Span {
  if (value === null) return span('null', { fg: theme.jsonNull, italic: true });
  if (typeof value === 'boolean') return span(String(value), { fg: theme.jsonBool });
  if (typeof value === 'number') return span(String(value), { fg: theme.jsonNumber });
  if (typeof value === 'string') return span(JSON.stringify(value), { fg: theme.jsonString });
  return span('');
}

function summary(value: Json[] | { [key: string]: Json }): string {
  if (Array.isArray(value)) return `[${value.length} ${value.length === 1 ? 'item' : 'items'}]`;
  const n = Object.keys(value).length;
  return `{${n} ${n === 1 ? 'key' : 'keys'}}`;
}

function tableColumns(value: Json[]): string[] | undefined {
  if (value.length < 2 || !value.every((v) => isContainer(v) && !Array.isArray(v))) return undefined;
  const cols: string[] = [];
  for (const row of value as { [key: string]: Json }[]) {
    for (const [k, v] of Object.entries(row)) {
      if (isContainer(v)) return undefined;
      if (!cols.includes(k)) cols.push(k);
    }
  }
  return cols.length && cols.length <= 8 ? cols : undefined;
}

function cellText(value: Json | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function truncate(text: string, width: number): string {
  if (textWidth(text) <= width) return text;
  let out = '';
  for (const ch of text) {
    if (textWidth(out + ch) > width - 1) break;
    out += ch;
  }
  return `${out}…`;
}

function table(rows: { [key: string]: Json }[], cols: string[], theme: Theme, width: number, indent: string): Line[] {
  const border: Style = { fg: theme.tableBorder };
  const widths = cols.map((c) => Math.max(textWidth(c), ...rows.map((r) => textWidth(cellText(r[c])))));
  const available = Math.max(cols.length * 3, width - textWidth(indent) - cols.length * 3 - 1);
  while (widths.reduce((a, b) => a + b, 0) > available) {
    const max = Math.max(...widths);
    if (max <= 3) break;
    widths[widths.indexOf(max)] = max - 1;
  }
  const rule = (l: string, m: string, r: string): Line => ({
    spans: [span(indent), span(l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r, border)],
    kind: 'json',
  });
  const row = (cells: Span[]): Line => {
    const spans: Span[] = [span(indent), span('│', border)];
    cells.forEach((cell, i) => {
      const text = truncate(cell.text, widths[i]);
      spans.push(span(' '), { ...cell, text }, span(' '.repeat(widths[i] - textWidth(text) + 1)), span('│', border));
    });
    return { spans, kind: 'json' };
  };
  return [
    rule('╭', '┬', '╮'),
    row(cols.map((c) => span(c, { fg: theme.jsonKey, bold: true }))),
    rule('├', '┼', '┤'),
    ...rows.map((r) => row(cols.map((c) => (r[c] === undefined ? span('') : { ...valueSpan(r[c], theme), text: cellText(r[c]) })))),
    rule('╰', '┴', '╯'),
  ];
}

export interface JsonRenderOptions {
  theme: Theme;
  width: number;
  expanded: Set<string>;
}

export function renderJson(value: Json, opts: JsonRenderOptions): Line[] {
  const { theme } = opts;
  const lines: Line[] = [];
  const punct: Style = { fg: theme.jsonPunct };
  const keySpan = (key: string | number | undefined): Span[] => {
    if (key === undefined) return [];
    if (typeof key === 'number') return [span(`${key}`, { fg: theme.jsonPunct }), span(': ', punct)];
    return [span(key, { fg: theme.jsonKey, bold: true }), span(': ', punct)];
  };
  const walk = (v: Json, path: string, key: string | number | undefined, depth: number): void => {
    const indent = '  '.repeat(depth);
    if (!isContainer(v)) {
      lines.push({ spans: [span(indent), span('  '), ...keySpan(key), valueSpan(v, theme)], kind: 'json', jsonPath: path });
      return;
    }
    const open = opts.expanded.has(path);
    const empty = entries(v).length === 0;
    lines.push({
      spans: [
        span(indent),
        span(empty ? '  ' : open ? '▾ ' : '▸ ', { fg: theme.accent }),
        ...keySpan(key ?? (depth === 0 ? undefined : '')),
        span(empty ? (Array.isArray(v) ? '[]' : '{}') : summary(v), punct),
      ],
      kind: 'json',
      jsonPath: path,
    });
    if (!open || empty) return;
    const cols = Array.isArray(v) ? tableColumns(v) : undefined;
    if (cols) {
      lines.push(...table(v as { [key: string]: Json }[], cols, theme, opts.width, `${indent}    `));
      return;
    }
    for (const [k, child] of entries(v)) walk(child, childPath(path, k), k, depth + 1);
  };
  walk(value, '$', undefined, 0);
  return lines;
}

export function parentPath(path: string): string | undefined {
  if (path === '$') return undefined;
  const match = /^(.*?)(\.[A-Za-z_$][\w$]*|\[(?:\d+|"(?:[^"\\]|\\.)*")\])$/.exec(path);
  return match ? match[1] : undefined;
}

export function isContainerAt(value: Json, path: string): boolean {
  let current: Json | undefined = value;
  const parts = path.slice(1).match(/\.[A-Za-z_$][\w$]*|\[(?:\d+|"(?:[^"\\]|\\.)*")\]/g) ?? [];
  for (const part of parts) {
    if (!current || !isContainer(current)) return false;
    const key: string | number = part.startsWith('.') ? part.slice(1) : part[1] === '"' ? (JSON.parse(part.slice(1, -1)) as string) : Number(part.slice(1, -1));
    current = (current as Record<string, Json>)[key as string];
  }
  return current !== undefined && isContainer(current) && entries(current).length > 0;
}

export type { Json };
