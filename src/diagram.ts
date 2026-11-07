import { span, textWidth, type Span, type Style } from './style.ts';
import type { Theme } from './theme.ts';

type Shape = 'rect' | 'round' | 'diamond' | 'double' | 'circle';
type EdgeKind = 'normal' | 'dotted' | 'thick';
type Direction = 'TD' | 'BT' | 'LR' | 'RL';

interface GraphNode {
  id: string;
  label: string;
  shape: Shape;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
  arrow: boolean;
}

export interface Graph {
  direction: Direction;
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

const SHAPES: [string, string, Shape][] = [
  ['(((', ')))', 'circle'],
  ['((', '))', 'circle'],
  ['([', '])', 'round'],
  ['[[', ']]', 'double'],
  ['[(', ')]', 'round'],
  ['{{', '}}', 'diamond'],
  ['[/', '/]', 'rect'],
  ['[\\', '\\]', 'rect'],
  ['[/', '\\]', 'rect'],
  ['[', ']', 'rect'],
  ['(', ')', 'round'],
  ['{', '}', 'diamond'],
  ['>', ']', 'rect'],
];

const ARROW = /^\s*(<?)(-->|---|-\.->|-\.-|==>|===|--[ox]|-\.\.->|~~~)(?:\|([^|]*)\|)?\s*/;
const TEXT_ARROW = /^\s*(<?)(--|-\.|==)\s+(.+?)\s+(-->|---|\.->|-\.-|==>|===)\s*/;

function cleanLabel(label: string): string {
  return label
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

function parseNodeRef(input: string, graph: Graph): { ids: string[]; rest: string } | undefined {
  const ids: string[] = [];
  let rest = input;
  for (;;) {
    rest = rest.trimStart();
    const idMatch = /^([\w.$\-]+?)(?=[\s[({>&]|-->|---|-\.|==|$|;)/.exec(rest) ?? /^([\w.$]+)/.exec(rest);
    if (!idMatch) return ids.length ? { ids, rest } : undefined;
    const id = idMatch[1];
    rest = rest.slice(id.length);
    let label: string | undefined;
    let shape: Shape = 'rect';
    for (const [open, close, s] of SHAPES) {
      if (!rest.startsWith(open)) continue;
      const end = rest.indexOf(close, open.length);
      if (end === -1) continue;
      label = cleanLabel(rest.slice(open.length, end));
      shape = s;
      rest = rest.slice(end + close.length);
      break;
    }
    rest = rest.replace(/^:::[\w-]+/, '');
    const existing = graph.nodes.get(id);
    if (!existing) graph.nodes.set(id, { id, label: label ?? id, shape });
    else if (label !== undefined) graph.nodes.set(id, { id, label, shape });
    ids.push(id);
    const amp = /^\s*&\s*/.exec(rest);
    if (!amp) return { ids, rest };
    rest = rest.slice(amp[0].length);
  }
}

function edgeKind(token: string): EdgeKind {
  if (token.includes('.')) return 'dotted';
  if (token.includes('=')) return 'thick';
  return 'normal';
}

export function parseMermaid(code: string): Graph | undefined {
  const lines = code.split(/\r?\n|;/).map((l) => l.trim());
  let i = 0;
  while (i < lines.length && (!lines[i] || lines[i].startsWith('%%'))) i++;
  const header = /^(graph|flowchart)\s*(TD|TB|BT|LR|RL)?\s*$/i.exec(lines[i] ?? '');
  if (!header) return undefined;
  const dir = (header[2] ?? 'TD').toUpperCase();
  const graph: Graph = {
    direction: dir === 'TB' ? 'TD' : (dir as Direction),
    nodes: new Map(),
    edges: [],
  };
  for (const line of lines.slice(i + 1)) {
    if (!line || line.startsWith('%%') || /^(subgraph|end$|style |classDef |class |linkStyle |click |direction )/.test(line)) continue;
    let left = parseNodeRef(line, graph);
    if (!left) continue;
    let rest = left.rest;
    while (rest.trim()) {
      let label = '';
      let token = '';
      let bidirectional = false;
      const textMatch = TEXT_ARROW.exec(rest);
      const plain = ARROW.exec(rest);
      if (plain) {
        token = plain[2];
        label = cleanLabel(plain[3] ?? '');
        bidirectional = plain[1] === '<';
        rest = rest.slice(plain[0].length);
      } else if (textMatch) {
        token = textMatch[4];
        label = cleanLabel(textMatch[3]);
        bidirectional = textMatch[1] === '<';
        rest = rest.slice(textMatch[0].length);
      } else {
        break;
      }
      const right = parseNodeRef(rest, graph);
      if (!right) break;
      const arrow = token.endsWith('>');
      for (const from of left.ids) {
        for (const to of right.ids) {
          graph.edges.push({ from, to, label, kind: edgeKind(token), arrow });
          if (bidirectional) graph.edges.push({ from: to, to: from, label: '', kind: edgeKind(token), arrow: true });
        }
      }
      left = right;
      rest = right.rest;
    }
  }
  return graph.nodes.size ? graph : undefined;
}

interface LayoutEdge {
  path: string[];
  label: string;
  kind: EdgeKind;
  arrowAtEnd: boolean;
  arrowAtStart: boolean;
}

interface Layout {
  layers: string[][];
  edges: LayoutEdge[];
  dummies: Set<string>;
}

function removeCycles(graph: Graph): Set<number> {
  const reversed = new Set<number>();
  const state = new Map<string, number>();
  const outgoing = new Map<string, number[]>();
  graph.edges.forEach((e, idx) => {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from)!.push(idx);
  });
  const visit = (id: string): void => {
    state.set(id, 1);
    for (const idx of outgoing.get(id) ?? []) {
      const to = graph.edges[idx].to;
      if (to === id) continue;
      const s = state.get(to) ?? 0;
      if (s === 1) reversed.add(idx);
      else if (s === 0) visit(to);
    }
    state.set(id, 2);
  };
  for (const id of graph.nodes.keys()) if (!state.get(id)) visit(id);
  return reversed;
}

function layout(graph: Graph): Layout {
  const reversed = removeCycles(graph);
  const flip = graph.direction === 'BT' || graph.direction === 'RL';
  const directed = graph.edges
    .map((e, idx) => {
      let [from, to] = [e.from, e.to];
      let forward = !reversed.has(idx);
      if (!forward) [from, to] = [to, from];
      if (flip) {
        [from, to] = [to, from];
        forward = !forward;
      }
      return { ...e, from, to, forward };
    })
    .filter((e) => e.from !== e.to);

  const rank = new Map<string, number>();
  const ids = [...graph.nodes.keys()];
  for (const id of ids) rank.set(id, 0);
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of directed) {
      const r = rank.get(e.from)! + 1;
      if (r > rank.get(e.to)!) {
        rank.set(e.to, r);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const maxRank = Math.max(0, ...rank.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const id of ids) layers[rank.get(id)!].push(id);

  const dummies = new Set<string>();
  const edges: LayoutEdge[] = [];
  let dummyCount = 0;
  for (const e of directed) {
    const path = [e.from];
    for (let r = rank.get(e.from)! + 1; r < rank.get(e.to)!; r++) {
      const id = `\u0000${dummyCount++}`;
      dummies.add(id);
      layers[r].push(id);
      path.push(id);
    }
    path.push(e.to);
    edges.push({
      path,
      label: e.label,
      kind: e.kind,
      arrowAtEnd: e.arrow && e.forward,
      arrowAtStart: e.arrow && !e.forward,
    });
  }

  const neighbors = (id: string, up: boolean): string[] => {
    const out: string[] = [];
    for (const e of edges) {
      for (let k = 0; k + 1 < e.path.length; k++) {
        if (up && e.path[k + 1] === id) out.push(e.path[k]);
        if (!up && e.path[k] === id) out.push(e.path[k + 1]);
      }
    }
    return out;
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).reverse().slice(1);
    for (const li of order) {
      const ref = layers[down ? li - 1 : li + 1];
      const pos = new Map(ref.map((id, idx) => [id, idx]));
      const score = new Map<string, number>();
      layers[li].forEach((id, idx) => {
        const ns = neighbors(id, down).filter((n) => pos.has(n));
        score.set(id, ns.length ? ns.reduce((a, n) => a + pos.get(n)!, 0) / ns.length : idx);
      });
      layers[li].sort((a, b) => score.get(a)! - score.get(b)!);
    }
  }
  return { layers, edges, dummies };
}

const UP = 1;
const DOWN = 2;
const LEFT = 4;
const RIGHT = 8;

const JUNCTIONS: Record<number, string> = {
  [UP]: '│', [DOWN]: '│', [UP | DOWN]: '│', [LEFT]: '─', [RIGHT]: '─', [LEFT | RIGHT]: '─',
  [DOWN | RIGHT]: '╭', [DOWN | LEFT]: '╮', [UP | RIGHT]: '╰', [UP | LEFT]: '╯',
  [UP | DOWN | RIGHT]: '├', [UP | DOWN | LEFT]: '┤', [LEFT | RIGHT | DOWN]: '┬', [LEFT | RIGHT | UP]: '┴',
  [UP | DOWN | LEFT | RIGHT]: '┼',
};

interface Cell {
  ch: string;
  mask: number;
  kind: EdgeKind;
  role: 'empty' | 'box' | 'text' | 'edge' | 'label' | 'arrow';
}

class Canvas {
  readonly cells: Cell[][] = [];
  width = 0;

  private cell(x: number, y: number): Cell {
    while (this.cells.length <= y) this.cells.push([]);
    const row = this.cells[y];
    while (row.length <= x) row.push({ ch: ' ', mask: 0, kind: 'normal', role: 'empty' });
    this.width = Math.max(this.width, x + 1);
    return row[x];
  }

  put(x: number, y: number, ch: string, role: Cell['role']): void {
    const c = this.cell(x, y);
    c.ch = ch;
    c.role = role;
  }

  text(x: number, y: number, text: string, role: Cell['role']): void {
    let col = x;
    for (const ch of text) {
      this.put(col, y, ch, role);
      const w = textWidth(ch);
      for (let k = 1; k < w; k++) this.put(col + k, y, '', role);
      col += w;
    }
  }

  line(x: number, y: number, mask: number, kind: EdgeKind): void {
    const c = this.cell(x, y);
    if (c.role === 'box' || c.role === 'text' || c.role === 'arrow' || c.role === 'label') return;
    c.mask |= mask;
    c.kind = kind;
    c.role = 'edge';
  }

  hline(x1: number, x2: number, y: number, kind: EdgeKind): void {
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    for (let x = a; x <= b; x++) this.line(x, y, (x > a ? LEFT : 0) | (x < b ? RIGHT : 0), kind);
  }

  vline(x: number, y1: number, y2: number, kind: EdgeKind): void {
    const [a, b] = y1 < y2 ? [y1, y2] : [y2, y1];
    for (let y = a; y <= b; y++) this.line(x, y, (y > a ? UP : 0) | (y < b ? DOWN : 0), kind);
  }

  render(theme: Theme): Span[][] {
    const styles: Record<Cell['role'], Style> = {
      empty: {},
      box: { fg: theme.diagramBox },
      text: { fg: theme.fg, bold: true },
      edge: { fg: theme.diagramEdge },
      label: { fg: theme.diagramLabel, italic: true },
      arrow: { fg: theme.diagramEdge, bold: true },
    };
    return this.cells.map((row) => {
      const spans: Span[] = [];
      for (const c of row) {
        let ch = c.ch;
        if (c.role === 'edge') {
          ch = JUNCTIONS[c.mask] ?? ' ';
          if (c.kind === 'dotted') ch = ch === '│' ? '┆' : ch === '─' ? '┄' : ch;
          if (c.kind === 'thick') ch = ch === '│' ? '┃' : ch === '─' ? '━' : ch;
        }
        const style = styles[c.role];
        const last = spans[spans.length - 1];
        if (last && last.style === style) last.text += ch;
        else spans.push(span(ch, style));
      }
      const last = spans[spans.length - 1];
      if (last && last.style === styles.empty) last.text = last.text.trimEnd();
      return spans.filter((s) => s.text);
    });
  }
}

const BORDERS: Record<Shape, [string, string, string, string, string, string]> = {
  rect: ['┌', '┐', '└', '┘', '─', '│'],
  round: ['╭', '╮', '╰', '╯', '─', '│'],
  circle: ['╭', '╮', '╰', '╯', '─', '│'],
  diamond: ['╱', '╲', '╲', '╱', '─', '│'],
  double: ['╔', '╗', '╚', '╝', '═', '║'],
};

const MAX_LABEL = 24;

function fitLabel(label: string): string {
  if (textWidth(label) <= MAX_LABEL) return label;
  let out = '';
  for (const ch of label) {
    if (textWidth(out + ch) > MAX_LABEL - 1) break;
    out += ch;
  }
  return `${out}…`;
}

function drawBox(canvas: Canvas, x: number, y: number, width: number, node: GraphNode): void {
  const [tl, tr, bl, br, h, v] = BORDERS[node.shape];
  canvas.put(x, y, tl, 'box');
  canvas.put(x + width - 1, y, tr, 'box');
  canvas.put(x, y + 2, bl, 'box');
  canvas.put(x + width - 1, y + 2, br, 'box');
  for (let k = 1; k < width - 1; k++) {
    canvas.put(x + k, y, h, 'box');
    canvas.put(x + k, y + 2, h, 'box');
    canvas.put(x + k, y + 1, ' ', 'text');
  }
  canvas.put(x, y + 1, node.shape === 'circle' ? '(' : v, 'box');
  canvas.put(x + width - 1, y + 1, node.shape === 'circle' ? ')' : v, 'box');
  const label = fitLabel(node.label);
  canvas.text(x + Math.floor((width - textWidth(label)) / 2), y + 1, label, 'text');
}

function boxWidth(graph: Graph, id: string, dummies: Set<string>): number {
  if (dummies.has(id)) return 1;
  return textWidth(fitLabel(graph.nodes.get(id)!.label)) + 4;
}

function placeAlongAxis(layers: string[][], size: (id: string) => number, gap: number, edges: LayoutEdge[]): Map<string, number> {
  const pos = new Map<string, number>();
  for (const layer of layers) {
    let cursor = 0;
    for (const id of layer) {
      pos.set(id, cursor);
      cursor += size(id) + gap;
    }
  }
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    for (let k = 0; k + 1 < e.path.length; k++) {
      const child = e.path[k + 1];
      if (!parents.has(child)) parents.set(child, []);
      parents.get(child)!.push(e.path[k]);
    }
  }
  const center = (id: string): number => pos.get(id)! + Math.floor(size(id) / 2);
  for (let li = 1; li < layers.length; li++) {
    let minStart = 0;
    for (const id of layers[li]) {
      const ps = parents.get(id) ?? [];
      const desired = ps.length ? Math.round(ps.reduce((a, p) => a + center(p), 0) / ps.length) - Math.floor(size(id) / 2) : pos.get(id)!;
      const start = Math.max(minStart, desired);
      pos.set(id, start);
      minStart = start + size(id) + gap;
    }
  }
  return pos;
}

function renderVertical(graph: Graph, lay: Layout, theme: Theme): Span[][] {
  const canvas = new Canvas();
  const width = (id: string): number => boxWidth(graph, id, lay.dummies);
  const xs = placeAlongAxis(lay.layers, width, 3, lay.edges);
  const gapHasLabel = lay.layers.map((layer) => lay.edges.some((e) => e.label && layer.includes(e.path[0])));
  const ys: number[] = [];
  let y = 0;
  lay.layers.forEach((_, li) => {
    ys.push(y);
    y += 3 + (gapHasLabel[li] ? 4 : 3);
  });
  const layerOf = new Map<string, number>();
  lay.layers.forEach((layer, li) => layer.forEach((id) => layerOf.set(id, li)));
  const cx = (id: string): number => xs.get(id)! + Math.floor(width(id) / 2);

  for (const e of lay.edges) {
    for (let k = 0; k + 1 < e.path.length; k++) {
      const a = e.path[k];
      const b = e.path[k + 1];
      const li = layerOf.get(a)!;
      const top = ys[li] + 2;
      const bottom = ys[li + 1];
      const x1 = cx(a);
      const x2 = cx(b);
      const mid = top + 2;
      if (lay.dummies.has(a)) canvas.vline(x1, ys[li], top + 1, e.kind);
      canvas.vline(x1, top + 1, mid, e.kind);
      canvas.hline(x1, x2, mid, e.kind);
      canvas.vline(x2, mid, bottom - 1, e.kind);
      if (lay.dummies.has(b)) canvas.vline(x2, bottom - 1, bottom + 2, e.kind);
      if (k === 0 && e.label) canvas.text(x2 + 2, mid + 1, fitLabel(e.label), 'label');
      if (k === 0 && e.arrowAtStart) canvas.put(x1, top + 1, '▲', 'arrow');
      if (k + 2 === e.path.length && e.arrowAtEnd) canvas.put(x2, bottom - 1, '▼', 'arrow');
    }
  }
  lay.layers.forEach((layer, li) => {
    for (const id of layer) if (!lay.dummies.has(id)) drawBox(canvas, xs.get(id)!, ys[li], width(id), graph.nodes.get(id)!);
  });
  return canvas.render(theme);
}

function renderHorizontal(graph: Graph, lay: Layout, theme: Theme): Span[][] {
  const canvas = new Canvas();
  const height = (id: string): number => (lay.dummies.has(id) ? 1 : 3);
  const ys = placeAlongAxis(lay.layers, height, 1, lay.edges);
  const colWidth = lay.layers.map((layer) => Math.max(1, ...layer.map((id) => boxWidth(graph, id, lay.dummies))));
  const gapWidth = lay.layers.map((layer) => {
    const labels = lay.edges.filter((e) => layer.includes(e.path[0]) && e.label).map((e) => textWidth(fitLabel(e.label)));
    return Math.max(6, labels.length ? Math.max(...labels) + 6 : 0);
  });
  const xs: number[] = [];
  let x = 0;
  lay.layers.forEach((_, li) => {
    xs.push(x);
    x += colWidth[li] + gapWidth[li];
  });
  const layerOf = new Map<string, number>();
  lay.layers.forEach((layer, li) => layer.forEach((id) => layerOf.set(id, li)));
  const cy = (id: string): number => ys.get(id)! + (lay.dummies.has(id) ? 0 : 1);
  const left = (id: string): number => xs[layerOf.get(id)!];
  const right = (id: string): number => {
    const li = layerOf.get(id)!;
    return lay.dummies.has(id) ? xs[li] + colWidth[li] - 1 : xs[li] + boxWidth(graph, id, lay.dummies) - 1;
  };

  for (const e of lay.edges) {
    for (let k = 0; k + 1 < e.path.length; k++) {
      const a = e.path[k];
      const b = e.path[k + 1];
      const y1 = cy(a);
      const y2 = cy(b);
      const start = right(a) + 1;
      const end = left(b) - 1;
      const bend = start + 1;
      if (lay.dummies.has(a)) canvas.hline(left(a), start, y1, e.kind);
      canvas.hline(start, bend, y1, e.kind);
      canvas.vline(bend, y1, y2, e.kind);
      canvas.hline(bend, end, y2, e.kind);
      if (lay.dummies.has(b)) canvas.hline(end, right(b) + 1, y2, e.kind);
      if (k === 0 && e.label) canvas.text(bend + 2, y2, ` ${fitLabel(e.label)} `, 'label');
      if (k === 0 && e.arrowAtStart) canvas.put(start, y1, '◀', 'arrow');
      if (k + 2 === e.path.length && e.arrowAtEnd) canvas.put(end, y2, '▶', 'arrow');
    }
  }
  for (const layer of lay.layers) {
    for (const id of layer) if (!lay.dummies.has(id)) drawBox(canvas, left(id), ys.get(id)!, boxWidth(graph, id, lay.dummies), graph.nodes.get(id)!);
  }
  return canvas.render(theme);
}

export function renderMermaid(code: string, theme: Theme): Span[][] | undefined {
  const graph = parseMermaid(code);
  if (!graph) return undefined;
  const lay = layout(graph);
  return graph.direction === 'LR' || graph.direction === 'RL' ? renderHorizontal(graph, lay, theme) : renderVertical(graph, lay, theme);
}
