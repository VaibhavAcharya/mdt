import { existsSync, readFileSync, unwatchFile, watchFile, writeFileSync, type ReadStream as FsReadStream } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import type { ReadStream, WriteStream } from 'node:tty';
import { prepareHighlighter } from './highlight.ts';
import { ImageStore, KITTY_CLEAR, protocolSequence, type ImageProtocol } from './image.ts';
import { allContainers, defaultExpanded, isContainerAt, parentPath, renderJson, type Json } from './json.ts';
import { collectCodeLangs, finalize, renderMarkdown, splitSlides, toggleTaskInSource, type Rendered } from './markdown.ts';
import { isExternalLink, lineText, padSpans, serializeSpans, sliceSpans, span, textWidth, truncateSpans, type Line, type Span, type Style } from './style.ts';
import { ENTER_SCREEN, LEAVE_SCREEN, copyToClipboard, openExternal, parseInput, type Key, type Mouse } from './terminal.ts';
import { otherTheme, themes, type ThemeName } from './theme.ts';

export interface Doc {
  path?: string;
  name: string;
  source: string;
  json?: Json;
  offset: number;
  jsonExpanded?: Set<string>;
  jsonCursor?: number;
}

export interface ViewerOptions {
  theme: ThemeName;
  lineNumbers: boolean;
  width: number;
  slides: boolean;
  color: boolean;
  imageProtocol: ImageProtocol;
}

type Mode = 'normal' | 'search' | 'toc' | 'fuzzy' | 'links' | 'help';

interface Match {
  line: number;
  start: number;
  end: number;
}

export function loadDoc(path: string): Doc {
  const source = readFileSync(path, 'utf8');
  return makeDoc(source, basename(path), path);
}

export function makeDoc(source: string, name: string, path?: string): Doc {
  const doc: Doc = { path, name, source, offset: 0 };
  const isJson = path ? /\.(json|jsonc|geojson|webmanifest)$/i.test(path) : /^\s*[[{]/.test(source);
  if (isJson) {
    try {
      doc.json = JSON.parse(source) as Json;
    } catch {
      doc.json = undefined;
    }
  }
  return doc;
}

export const HELP: [string, [string, string][]][] = [
  ['Navigation', [
    ['j / ↓', 'Scroll down one line'], ['k / ↑', 'Scroll up one line'], ['Space / PgDn', 'Page down'],
    ['b / PgUp', 'Page up'], ['d / u (Ctrl+d/u)', 'Half page down / up'], ['g / Home', 'Jump to top'],
    ['G / End', 'Jump to bottom'], ['[ / ]', 'Previous / next heading'], ['Backspace', 'Go back after following a link'],
    ['Mouse wheel', 'Scroll'],
  ]],
  ['Search', [['/', 'Search (regex supported)'], ['Enter', 'Run search'], ['n / N', 'Next / previous match'], ['Esc', 'Clear search']]],
  ['Features', [
    ['o', 'Table of contents'], [':', 'Fuzzy heading search'], ['f', 'Link picker'], ['t', 'Toggle dark / light theme'],
    ['l', 'Toggle line numbers in code blocks'], ['Click heading', 'Copy heading section'], ['Click list', 'Copy list'],
    ['Click code block', 'Copy code block'], ['Click checkbox', 'Toggle task in file'], ['Click link', 'Open link'],
    ['Y', 'Copy entire document'], ['c', 'Copy nearest code block'], ['Tab / Shift+Tab', 'Next / previous file'],
    ['h / ? / F1', 'This help'], ['q / Ctrl+C', 'Quit'],
  ]],
  ['JSON', [
    ['j / k', 'Move cursor'], ['Enter / Space', 'Expand or collapse'], ['l / →', 'Expand'], ['h / ←', 'Collapse or go to parent'],
    ['L / H', 'Expand all / collapse all'],
  ]],
  ['Slides (--slides)', [
    ['→ Space l j ↓ PgDn', 'Next slide'], ['← b h k ↑ PgUp', 'Previous slide'], ['g / Home', 'First slide'], ['G / End', 'Last slide'],
  ]],
];

function fuzzyScore(text: string, query: string): number | undefined {
  if (!query) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  let pos = -1;
  let streak = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, pos + 1);
    if (idx === -1) return undefined;
    streak = idx === pos + 1 ? streak + 1 : 0;
    score += 10 - Math.min(9, idx - pos - 1) + streak * 5 + (idx === 0 || /[\s\-_]/.test(t[idx - 1]) ? 8 : 0);
    pos = idx;
  }
  return score - t.length * 0.1;
}

export class Viewer {
  private readonly docs: Doc[];
  private readonly opts: ViewerOptions;
  private readonly input: ReadStream | FsReadStream;
  private readonly output: WriteStream;
  private readonly images = new ImageStore();
  private current = 0;
  private history: { doc: Doc; offset: number; index: number }[] = [];
  private theme: ThemeName;
  private lineNumbers: boolean;
  private rendered: Rendered = { lines: [], headings: [], links: [], codeBlocks: [], blocks: [] };
  private mode: Mode = 'normal';
  private searchInput = '';
  private query = '';
  private matches: Match[] = [];
  private matchIndex = -1;
  private listSelected = 0;
  private fuzzyInput = '';
  private linkInput = '';
  private helpOffset = 0;
  private toast: { text: string; until: number } | undefined;
  private toastTimer: NodeJS.Timeout | undefined;
  private slides: string[] = [];
  private slideIndex = 0;
  private margin = 2;
  private contentWidth = 80;
  private watched: string | undefined;
  private finished: () => void = () => {};
  private terminalBg: string | undefined;

  constructor(docs: Doc[], opts: ViewerOptions, input: ReadStream | FsReadStream, output: WriteStream) {
    this.docs = docs;
    this.opts = opts;
    this.input = input;
    this.output = output;
    this.theme = opts.theme;
    this.lineNumbers = opts.lineNumbers;
    this.images.onUpdate = () => {
      this.rebuild();
      this.draw();
    };
  }

  private get doc(): Doc {
    return this.docs[this.current];
  }

  private get cols(): number {
    return this.output.columns || 80;
  }

  private get rows(): number {
    return this.output.rows || 24;
  }

  private get viewport(): number {
    return Math.max(1, this.rows - 1);
  }

  private get maxOffset(): number {
    return Math.max(0, this.rendered.lines.length - this.viewport);
  }

  async run(): Promise<void> {
    await prepareHighlighter(this.docs.flatMap((d) => (d.json === undefined ? collectCodeLangs(d.source) : [])));
    const tty = this.input as ReadStream;
    if (typeof tty.setRawMode === 'function') tty.setRawMode(true);
    this.output.write(ENTER_SCREEN);
    const restore = (): void => {
      if (typeof tty.setRawMode === 'function') tty.setRawMode(false);
      this.output.write((this.opts.imageProtocol === 'kitty' ? KITTY_CLEAR : '') + (this.terminalBg ? '\x1b]111\x07' : '') + LEAVE_SCREEN);
    };
    process.on('exit', restore);
    const onSignal = (): void => this.quit();
    process.on('SIGTERM', onSignal);
    process.on('SIGHUP', onSignal);
    this.output.on('resize', () => {
      this.rebuild();
      this.draw();
    });
    this.loadCurrent();
    this.draw();
    this.input.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
    this.input.resume();
    await new Promise<void>((resolveRun) => {
      this.finished = () => {
        restore();
        process.off('exit', restore);
        resolveRun();
      };
    });
  }

  private quit(): void {
    if (this.watched) unwatchFile(this.watched);
    this.input.pause();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.finished();
  }

  private loadCurrent(): void {
    const doc = this.doc;
    if (this.opts.slides && doc.json === undefined) {
      this.slides = splitSlides(doc.source);
      this.slideIndex = Math.min(this.slideIndex, Math.max(0, this.slides.length - 1));
    }
    if (doc.json !== undefined && !doc.jsonExpanded) {
      doc.jsonExpanded = defaultExpanded(doc.json);
      doc.jsonCursor = 0;
    }
    this.watch();
    this.rebuild();
    this.offsetTo(doc.offset);
  }

  private watch(): void {
    const path = this.doc.path;
    if (this.watched === path) return;
    if (this.watched) unwatchFile(this.watched);
    this.watched = path;
    if (!path) return;
    watchFile(path, { interval: 300 }, (curr, prev) => {
      if (curr.mtimeMs === prev.mtimeMs || this.watched !== path) return;
      void this.reload(path);
    });
  }

  private async reload(path: string): Promise<void> {
    let source: string;
    try {
      source = readFileSync(path, 'utf8');
    } catch {
      return;
    }
    if (source === this.doc.source) return;
    const fresh = makeDoc(source, this.doc.name, path);
    this.doc.source = fresh.source;
    if (fresh.json !== undefined || this.doc.json !== undefined) this.doc.json = fresh.json;
    await prepareHighlighter(collectCodeLangs(source));
    if (this.opts.slides) this.slides = splitSlides(source);
    this.rebuild();
    this.setToast('Reloaded');
    this.draw();
  }

  private rebuild(): void {
    const theme = themes[this.theme];
    const cols = this.cols;
    const wanted = this.opts.width > 0 ? Math.min(this.opts.width, cols - 4) : cols - 4;
    this.contentWidth = Math.max(10, wanted);
    this.margin = Math.max(2, Math.floor((cols - this.contentWidth) / 2));
    if (this.opts.width <= 0) this.margin = 2;
    const doc = this.doc;
    if (doc.json !== undefined) {
      const lines = renderJson(doc.json, { theme, width: this.contentWidth, expanded: doc.jsonExpanded ?? new Set() });
      this.rendered = finalize(lines, [], []);
    } else {
      const source = this.opts.slides ? (this.slides[this.slideIndex] ?? '') : doc.source;
      const width = this.opts.slides ? Math.min(this.contentWidth, 100) : this.contentWidth;
      if (this.opts.slides) this.margin = Math.max(2, Math.floor((cols - width) / 2));
      this.rendered = renderMarkdown(source, {
        width,
        theme,
        lineNumbers: this.lineNumbers,
        baseDir: doc.path ? dirname(doc.path) : process.cwd(),
        images: this.images,
        imageProtocol: this.opts.imageProtocol,
      });
      if (this.opts.slides) {
        const pad = Math.max(0, Math.floor((this.viewport - this.rendered.lines.length) / 2));
        const blank = Array.from({ length: pad }, (): Line => ({ spans: [] }));
        this.rendered = finalize([...blank, ...this.rendered.lines], this.rendered.codeBlocks, this.rendered.blocks);
      }
    }
    if (this.query) this.findMatches();
    this.doc.offset = Math.min(this.doc.offset, this.maxOffset);
  }

  private offsetTo(offset: number): void {
    this.doc.offset = Math.max(0, Math.min(this.maxOffset, offset));
  }

  private setToast(text: string): void {
    this.toast = { text, until: Date.now() + 2000 };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = undefined;
      this.draw();
    }, 2000);
  }

  private onData(data: string): void {
    for (const event of parseInput(data)) {
      if (event.type === 'mouse') this.onMouse(event.mouse);
      else if (this.onKey(event.key)) {
        this.quit();
        return;
      }
    }
    this.draw();
  }

  private onKey(key: Key): boolean {
    if (key.ctrl && key.ch === 'c') return true;
    if (this.mode === 'help') {
      if (key.name === 'f1' || key.name === 'escape' || ['?', 'q', 'h'].includes(key.ch ?? '')) this.mode = 'normal';
      else if (key.ch === 'j' || key.name === 'down') this.helpOffset++;
      else if (key.ch === 'k' || key.name === 'up') this.helpOffset = Math.max(0, this.helpOffset - 1);
      return false;
    }
    if (this.mode === 'search') return this.onSearchKey(key);
    if (this.mode === 'toc') return this.onTocKey(key);
    if (this.mode === 'fuzzy') return this.onFuzzyKey(key);
    if (this.mode === 'links') return this.onLinksKey(key);
    if (key.name === 'f1' || (key.ch === '?' && !key.ctrl)) {
      this.mode = 'help';
      this.helpOffset = 0;
      return false;
    }
    if (this.opts.slides && this.doc.json === undefined && this.onSlideKey(key)) return false;
    if (this.doc.json !== undefined && this.onJsonKey(key)) return false;
    return this.onNormalKey(key);
  }

  private onNormalKey(key: Key): boolean {
    const page = this.viewport;
    const offset = this.doc.offset;
    if (key.name === 'char' && !key.ctrl) {
      switch (key.ch) {
        case 'q':
          return true;
        case 'j':
          this.offsetTo(offset + 1);
          break;
        case 'k':
          this.offsetTo(offset - 1);
          break;
        case ' ':
          this.offsetTo(offset + page);
          break;
        case 'b':
          this.offsetTo(offset - page);
          break;
        case 'd':
          this.offsetTo(offset + Math.floor(page / 2));
          break;
        case 'u':
          this.offsetTo(offset - Math.floor(page / 2));
          break;
        case 'g':
          this.offsetTo(0);
          break;
        case 'G':
          this.offsetTo(this.maxOffset);
          break;
        case ']': {
          const next = this.rendered.headings.find((h) => h.line > offset);
          if (next) this.offsetTo(next.line);
          break;
        }
        case '[': {
          const prev = [...this.rendered.headings].reverse().find((h) => h.line < offset);
          this.offsetTo(prev ? prev.line : 0);
          break;
        }
        case '/':
          this.mode = 'search';
          this.searchInput = '';
          break;
        case 'n':
          this.stepMatch(1);
          break;
        case 'N':
          this.stepMatch(-1);
          break;
        case 'o':
          this.mode = 'toc';
          this.listSelected = this.currentHeadingIndex();
          break;
        case ':':
          this.mode = 'fuzzy';
          this.fuzzyInput = '';
          this.listSelected = 0;
          break;
        case 'f':
          this.mode = 'links';
          this.linkInput = '';
          this.listSelected = 0;
          break;
        case 't':
          this.theme = otherTheme(this.theme);
          this.rebuild();
          this.setToast(`${this.theme === 'dark' ? 'Dark' : 'Light'} theme`);
          break;
        case 'l':
          this.lineNumbers = !this.lineNumbers;
          this.rebuild();
          this.setToast(`Line numbers ${this.lineNumbers ? 'on' : 'off'}`);
          break;
        case 'h':
          this.mode = 'help';
          this.helpOffset = 0;
          break;
        case 'Y':
          this.copy(this.doc.source, 'Copied document');
          break;
        case 'c':
          this.copyNearestCode();
          break;
      }
      return false;
    }
    if (key.ctrl && key.ch === 'd') this.offsetTo(offset + Math.floor(page / 2));
    else if (key.ctrl && key.ch === 'u') this.offsetTo(offset - Math.floor(page / 2));
    else if (key.name === 'down') this.offsetTo(offset + 1);
    else if (key.name === 'up') this.offsetTo(offset - 1);
    else if (key.name === 'pagedown') this.offsetTo(offset + page);
    else if (key.name === 'pageup') this.offsetTo(offset - page);
    else if (key.name === 'home') this.offsetTo(0);
    else if (key.name === 'end') this.offsetTo(this.maxOffset);
    else if (key.name === 'tab') this.switchFile(1);
    else if (key.name === 'backtab') this.switchFile(-1);
    else if (key.name === 'backspace') this.goBack();
    else if (key.name === 'escape') {
      if (this.query) this.clearSearch();
      else return true;
    }
    return false;
  }

  private onSlideKey(key: Key): boolean {
    const next = ['right', 'down', 'pagedown'].includes(key.name) || (!key.ctrl && [' ', 'l', 'j'].includes(key.ch ?? ''));
    const prev = ['left', 'up', 'pageup'].includes(key.name) || (!key.ctrl && ['b', 'h', 'k'].includes(key.ch ?? ''));
    let target: number | undefined;
    if (next) target = this.slideIndex + 1;
    else if (prev) target = this.slideIndex - 1;
    else if (key.name === 'home' || key.ch === 'g') target = 0;
    else if (key.name === 'end' || key.ch === 'G') target = this.slides.length - 1;
    if (target === undefined) return false;
    this.slideIndex = Math.max(0, Math.min(this.slides.length - 1, target));
    this.doc.offset = 0;
    this.rebuild();
    return true;
  }

  private jsonNavigable(): number[] {
    const out: number[] = [];
    this.rendered.lines.forEach((l, i) => {
      if (l.jsonPath !== undefined) out.push(i);
    });
    return out;
  }

  private onJsonKey(key: Key): boolean {
    const doc = this.doc;
    if (doc.json === undefined || !doc.jsonExpanded) return false;
    const nav = this.jsonNavigable();
    const cursor = Math.min(doc.jsonCursor ?? 0, nav.length - 1);
    const path = this.rendered.lines[nav[cursor]]?.jsonPath ?? '$';
    const ch = key.ctrl ? undefined : key.ch;
    const setCursorToPath = (target: string): void => {
      const idx = this.jsonNavigable().findIndex((i) => this.rendered.lines[i].jsonPath === target);
      if (idx >= 0) doc.jsonCursor = idx;
    };
    if (ch === 'j' || key.name === 'down') doc.jsonCursor = Math.min(nav.length - 1, cursor + 1);
    else if (ch === 'k' || key.name === 'up') doc.jsonCursor = Math.max(0, cursor - 1);
    else if (key.name === 'enter' || ch === ' ') {
      if (!isContainerAt(doc.json, path)) return true;
      if (doc.jsonExpanded.has(path)) doc.jsonExpanded.delete(path);
      else doc.jsonExpanded.add(path);
      this.rebuild();
      setCursorToPath(path);
    } else if (ch === 'l' || key.name === 'right') {
      if (isContainerAt(doc.json, path)) doc.jsonExpanded.add(path);
      this.rebuild();
      setCursorToPath(path);
    } else if (ch === 'h' || key.name === 'left') {
      if (doc.jsonExpanded.has(path) && isContainerAt(doc.json, path)) {
        doc.jsonExpanded.delete(path);
        this.rebuild();
        setCursorToPath(path);
      } else {
        const parent = parentPath(path);
        if (parent !== undefined) {
          doc.jsonExpanded.delete(parent);
          this.rebuild();
          setCursorToPath(parent);
        }
      }
    } else if (ch === 'L') {
      doc.jsonExpanded = allContainers(doc.json);
      this.rebuild();
      setCursorToPath(path);
    } else if (ch === 'H') {
      doc.jsonExpanded = new Set();
      this.rebuild();
      doc.jsonCursor = 0;
    } else return false;
    const line = this.jsonNavigable()[doc.jsonCursor ?? 0] ?? 0;
    if (line < doc.offset) this.offsetTo(line);
    else if (line >= doc.offset + this.viewport) this.offsetTo(line - this.viewport + 1);
    return true;
  }

  private onSearchKey(key: Key): boolean {
    if (key.name === 'escape') {
      this.mode = 'normal';
      return false;
    }
    if (key.name === 'enter') {
      this.mode = 'normal';
      this.query = this.searchInput;
      this.findMatches();
      this.matchIndex = this.matches.findIndex((m) => m.line >= this.doc.offset);
      if (this.matchIndex === -1 && this.matches.length) this.matchIndex = 0;
      this.scrollToMatch();
      if (this.query && !this.matches.length) this.setToast('No matches');
      return false;
    }
    if (key.name === 'backspace') this.searchInput = this.searchInput.slice(0, -1);
    else if (key.ctrl && key.ch === 'u') this.searchInput = '';
    else if (key.name === 'char' && !key.ctrl && key.ch) this.searchInput += key.ch;
    return false;
  }

  private searchRegex(): RegExp | undefined {
    if (!this.query) return undefined;
    const flags = /[A-Z]/.test(this.query) ? 'g' : 'gi';
    try {
      return new RegExp(this.query, flags);
    } catch {
      return new RegExp(this.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    }
  }

  private findMatches(): void {
    this.matches = [];
    const re = this.searchRegex();
    if (!re) return;
    this.rendered.lines.forEach((line, idx) => {
      const text = lineText(line);
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        if (!m[0]) continue;
        const start = textWidth(text.slice(0, m.index));
        this.matches.push({ line: idx, start, end: start + textWidth(m[0]) });
      }
    });
    if (this.matchIndex >= this.matches.length) this.matchIndex = this.matches.length - 1;
  }

  private stepMatch(dir: number): void {
    if (!this.matches.length) return;
    this.matchIndex = (this.matchIndex + dir + this.matches.length) % this.matches.length;
    this.scrollToMatch();
  }

  private scrollToMatch(): void {
    const m = this.matches[this.matchIndex];
    if (!m) return;
    if (m.line < this.doc.offset || m.line >= this.doc.offset + this.viewport) this.offsetTo(m.line - Math.floor(this.viewport / 3));
  }

  private clearSearch(): void {
    this.query = '';
    this.matches = [];
    this.matchIndex = -1;
  }

  private currentHeadingIndex(): number {
    let idx = 0;
    this.rendered.headings.forEach((h, i) => {
      if (h.line <= this.doc.offset) idx = i;
    });
    return idx;
  }

  private onListNav(key: Key, count: number): boolean {
    if (key.name === 'down' || (key.ctrl && key.ch === 'n') || (key.ch === 'j' && this.mode === 'toc')) this.listSelected = Math.min(count - 1, this.listSelected + 1);
    else if (key.name === 'up' || (key.ctrl && key.ch === 'p') || (key.ch === 'k' && this.mode === 'toc')) this.listSelected = Math.max(0, this.listSelected - 1);
    else if (key.name === 'pagedown') this.listSelected = Math.min(count - 1, this.listSelected + 10);
    else if (key.name === 'pageup') this.listSelected = Math.max(0, this.listSelected - 10);
    else return false;
    return true;
  }

  private onTocKey(key: Key): boolean {
    const headings = this.rendered.headings;
    if (key.name === 'escape' || key.ch === 'o' || key.ch === 'q') this.mode = 'normal';
    else if (key.name === 'enter') {
      const h = headings[this.listSelected];
      if (h) this.offsetTo(h.line);
      this.mode = 'normal';
    } else if (key.ch === 'g' || key.name === 'home') this.listSelected = 0;
    else if (key.ch === 'G' || key.name === 'end') this.listSelected = Math.max(0, headings.length - 1);
    else this.onListNav(key, headings.length);
    return false;
  }

  private fuzzyResults(): { index: number; score: number }[] {
    return this.rendered.headings
      .map((h, index) => ({ index, score: fuzzyScore(h.text, this.fuzzyInput) }))
      .filter((r): r is { index: number; score: number } => r.score !== undefined)
      .sort((a, b) => (this.fuzzyInput ? b.score - a.score : a.index - b.index));
  }

  private onFuzzyKey(key: Key): boolean {
    const results = this.fuzzyResults();
    if (key.name === 'escape') this.mode = 'normal';
    else if (key.name === 'enter') {
      const r = results[this.listSelected];
      if (r) this.offsetTo(this.rendered.headings[r.index].line);
      this.mode = 'normal';
    } else if (this.onListNav(key, results.length)) return false;
    else if (key.name === 'backspace') {
      this.fuzzyInput = this.fuzzyInput.slice(0, -1);
      this.listSelected = 0;
    } else if (key.name === 'char' && !key.ctrl && key.ch) {
      this.fuzzyInput += key.ch;
      this.listSelected = 0;
    }
    return false;
  }

  private onLinksKey(key: Key): boolean {
    const links = this.rendered.links;
    if (key.name === 'escape' || key.ch === 'q' || key.ch === 'f') this.mode = 'normal';
    else if (key.name === 'enter') {
      const n = this.linkInput ? Number(this.linkInput) - 1 : this.listSelected;
      const link = links[n];
      this.mode = 'normal';
      if (link) void this.dispatchLink(link.url);
    } else if (key.ch && /^\d$/.test(key.ch)) {
      this.linkInput += key.ch;
      const n = Number(this.linkInput) - 1;
      if (n >= 0 && n < links.length) this.listSelected = n;
    } else if (key.name === 'backspace') this.linkInput = this.linkInput.slice(0, -1);
    else if (key.ch === 'j') this.listSelected = Math.min(links.length - 1, this.listSelected + 1);
    else if (key.ch === 'k') this.listSelected = Math.max(0, this.listSelected - 1);
    else this.onListNav(key, links.length);
    return false;
  }

  private onMouse(mouse: Mouse): void {
    if (mouse.button === 64) {
      if (this.mode === 'help') this.helpOffset = Math.max(0, this.helpOffset - 3);
      else if (this.mode === 'normal') this.offsetTo(this.doc.offset - 3);
      return;
    }
    if (mouse.button === 65) {
      if (this.mode === 'help') this.helpOffset += 3;
      else if (this.mode === 'normal') this.offsetTo(this.doc.offset + 3);
      return;
    }
    if (mouse.button !== 0 || mouse.release || this.mode !== 'normal') return;
    if (mouse.y > this.viewport) return;
    const idx = this.doc.offset + mouse.y - 1;
    const line = this.rendered.lines[idx];
    if (!line) return;
    const col = mouse.x - 1 - this.margin;
    let pos = 0;
    for (const s of line.spans) {
      const w = textWidth(s.text);
      if (col >= pos && col < pos + w && s.link) {
        void this.dispatchLink(s.link);
        return;
      }
      pos += w;
    }
    if (this.doc.json !== undefined && line.jsonPath !== undefined) {
      const navIdx = this.jsonNavigable().indexOf(idx);
      this.doc.jsonCursor = navIdx;
      this.onJsonKey({ name: 'enter' });
      return;
    }
    if (line.task) {
      this.toggleTask(line.task.index);
      return;
    }
    if (line.block !== undefined) {
      const block = this.rendered.blocks[line.block];
      const label = block.kind === 'heading' ? 'heading section' : block.kind === 'list' ? 'list' : 'code block';
      this.copy(block.text, `Copied ${label}`);
    }
  }

  private toggleTask(index: number): void {
    const path = this.doc.path;
    if (!path || this.opts.slides) {
      this.setToast('Checkboxes can only be toggled in a file');
      return;
    }
    const updated = toggleTaskInSource(this.doc.source, index);
    if (updated === undefined) return;
    try {
      writeFileSync(path, updated);
    } catch (error) {
      this.setToast(`Could not save: ${(error as Error).message}`);
      return;
    }
    this.doc.source = updated;
    this.rebuild();
  }

  private copy(text: string, message: string): void {
    copyToClipboard(text, (s) => this.output.write(s));
    this.setToast(message);
  }

  private copyNearestCode(): void {
    const blocks = this.rendered.codeBlocks.filter(Boolean);
    if (!blocks.length) {
      this.setToast('No code blocks');
      return;
    }
    const top = this.doc.offset;
    const bottom = top + this.viewport;
    const visible = blocks.find((b) => b.end >= top && b.start < bottom);
    const nearest = visible ?? blocks.reduce((best, b) => (Math.abs(b.start - top) < Math.abs(best.start - top) ? b : best));
    this.copy(nearest.code, 'Copied code block');
  }

  private switchFile(dir: number): void {
    if (this.docs.length < 2) return;
    this.current = (this.current + dir + this.docs.length) % this.docs.length;
    this.clearSearch();
    this.slideIndex = 0;
    this.loadCurrent();
    this.setToast(`${this.doc.name} (${this.current + 1}/${this.docs.length})`);
  }

  private goBack(): void {
    const entry = this.history.pop();
    if (!entry) return;
    this.docs[entry.index] = entry.doc;
    this.current = entry.index;
    entry.doc.offset = entry.offset;
    this.clearSearch();
    this.loadCurrent();
  }

  private jumpToAnchor(anchor: string): boolean {
    const target = decodeURIComponent(anchor).toLowerCase();
    const heading = this.rendered.headings.find((h) => h.slug === target);
    if (!heading) return false;
    this.offsetTo(heading.line);
    return true;
  }

  private async dispatchLink(url: string): Promise<void> {
    if (url.startsWith('#')) {
      if (!this.jumpToAnchor(url.slice(1))) this.setToast(`No heading ${url}`);
      this.draw();
      return;
    }
    if (isExternalLink(url) || /^[a-z][\w+.-]*:/i.test(url)) {
      openExternal(url);
      this.setToast(`Opened ${url}`);
      this.draw();
      return;
    }
    const [rawPath, anchor] = url.split('#');
    const baseDir = this.doc.path ? dirname(this.doc.path) : process.cwd();
    const target = resolve(baseDir, decodeURIComponent(rawPath));
    if (!existsSync(target)) {
      this.setToast(`Not found: ${rawPath}`);
      this.draw();
      return;
    }
    if (!/^\.(md|markdown|mdown|mkd|txt|json)$/i.test(extname(target)) && extname(target) !== '') {
      openExternal(target);
      this.setToast(`Opened ${basename(target)}`);
      this.draw();
      return;
    }
    let doc: Doc;
    try {
      doc = loadDoc(target);
    } catch (error) {
      this.setToast(`Could not open: ${(error as Error).message}`);
      this.draw();
      return;
    }
    this.history.push({ doc: this.doc, offset: this.doc.offset, index: this.current });
    await prepareHighlighter(collectCodeLangs(doc.source));
    this.docs[this.current] = doc;
    this.clearSearch();
    this.slideIndex = 0;
    this.loadCurrent();
    if (anchor) this.jumpToAnchor(anchor);
    this.setToast(`${doc.name}  (Backspace to go back)`);
    this.draw();
  }

  private decorate(line: Line, idx: number): Span[] {
    let spans = line.spans;
    const theme = themes[this.theme];
    const ranges = this.matches.map((m, i) => ({ ...m, current: i === this.matchIndex })).filter((m) => m.line === idx);
    if (ranges.length) {
      const out: Span[] = [];
      let pos = 0;
      const total = spans.reduce((a, s) => a + textWidth(s.text), 0);
      for (const r of ranges) {
        out.push(...sliceSpans(spans, pos, r.start));
        out.push(
          ...sliceSpans(spans, r.start, r.end).map((s) => ({
            ...s,
            style: { ...s.style, bg: r.current ? theme.searchCurrentBg : theme.searchBg, fg: theme.searchFg },
          })),
        );
        pos = r.end;
      }
      out.push(...sliceSpans(spans, pos, total));
      spans = out;
    }
    const doc = this.doc;
    if (doc.json !== undefined && line.jsonPath !== undefined) {
      const nav = this.jsonNavigable();
      if (nav[doc.jsonCursor ?? 0] === idx) {
        spans = padSpans(spans, this.contentWidth).map((s) => ({ ...s, style: { ...s.style, bg: theme.selectedBg } }));
      }
    }
    return spans;
  }

  private overlayBox(screen: Span[][], title: string, body: Span[][], footer: string, selected?: number, header?: Span[]): void {
    const theme = themes[this.theme];
    const bg: Style = { bg: theme.overlayBg };
    const border: Style = { fg: theme.overlayBorder, bg: theme.overlayBg };
    const longest = Math.max(textWidth(title) + 6, textWidth(footer) + 6, ...body.map((b) => b.reduce((a, s) => a + textWidth(s.text), 0) + 4));
    const width = Math.max(30, Math.min(this.cols - 4, longest, 90));
    const inner = width - 4;
    const extra = header ? 2 : 0;
    const maxBody = Math.max(1, this.viewport - 4 - extra);
    const visible = Math.min(body.length, maxBody);
    let start = 0;
    if (selected !== undefined && selected >= visible) start = selected - visible + 1;
    start = Math.min(start, Math.max(0, body.length - visible));
    const height = visible + 2 + extra;
    const top = Math.max(0, Math.floor((this.viewport - height) / 2));
    const left = Math.max(0, Math.floor((this.cols - width) / 2));
    const rowsOut: Span[][] = [];
    const titleText = ` ${title} `;
    rowsOut.push([span('╭─', border), span(titleText, { ...border, bold: true }), span('─'.repeat(Math.max(0, width - 3 - textWidth(titleText))), border), span('╮', border)]);
    const row = (content: Span[], highlight = false): Span[] => {
      const style: Style = highlight ? { bg: theme.selectedBg } : bg;
      const cut = truncateSpans(content, inner).map((s) => ({ ...s, style: { ...s.style, bg: style.bg } }));
      return [span('│ ', border), ...padSpans(cut, inner, style), span(' │', border)];
    };
    if (header) {
      rowsOut.push(row(header));
      rowsOut.push([span(`├${'─'.repeat(width - 2)}┤`, border)]);
    }
    for (let i = start; i < start + visible; i++) rowsOut.push(row(body[i], i === selected));
    if (!body.length) rowsOut[rowsOut.length] = row([span('(empty)', { fg: theme.muted })]);
    const footerText = ` ${footer} `;
    rowsOut.push([span('╰', border), span('─'.repeat(Math.max(0, width - 3 - textWidth(footerText))), border), span(footerText, { fg: theme.muted, bg: theme.overlayBg }), span('─╯', border)]);
    rowsOut.forEach((r, k) => {
      const y = top + k;
      if (y >= screen.length) return;
      const base = padSpans(screen[y], this.cols);
      screen[y] = [...sliceSpans(base, 0, left), ...r, ...sliceSpans(base, left + width, this.cols)];
    });
  }

  private drawOverlays(screen: Span[][]): void {
    const theme = themes[this.theme];
    if (this.mode === 'toc') {
      const body = this.rendered.headings.map((h) => [span('  '.repeat(h.level - 1)), span(h.text, { fg: theme.headings[h.level - 1], bold: h.level <= 2 })]);
      this.overlayBox(screen, 'Table of contents', body, 'j/k move · Enter jump · Esc close', this.listSelected);
    } else if (this.mode === 'fuzzy') {
      const results = this.fuzzyResults();
      const body = results.map((r) => {
        const h = this.rendered.headings[r.index];
        return [span(`${'#'.repeat(h.level)} `, { fg: theme.muted }), span(h.text, { fg: theme.headings[h.level - 1] })];
      });
      this.overlayBox(screen, 'Go to heading', body, '↑/↓ move · Enter jump · Esc cancel', this.listSelected, [
        span(': ', { fg: theme.accent, bold: true }),
        span(this.fuzzyInput),
        span('█', { fg: theme.accent }),
      ]);
    } else if (this.mode === 'links') {
      const links = this.rendered.links;
      const digits = String(links.length).length;
      const body = links.map((l, i) => [
        span(`${String(i + 1).padStart(digits)}  `, { fg: theme.accent, bold: true }),
        span(l.text || l.url, { fg: theme.fg }),
        span(l.text && l.text !== l.url ? `  ${l.url}` : '', { fg: theme.muted }),
      ]);
      this.overlayBox(screen, 'Links', body, `${this.linkInput ? `#${this.linkInput} · ` : ''}number or j/k · Enter open · Esc close`, this.listSelected);
    } else if (this.mode === 'help') {
      const body: Span[][] = [];
      for (const [section, entries] of HELP) {
        if (body.length) body.push([]);
        body.push([span(section, { fg: theme.accent, bold: true })]);
        for (const [keys, desc] of entries) body.push([span(`  ${keys.padEnd(20)}`, { fg: theme.listMarker }), span(desc, { fg: theme.fg })]);
      }
      const maxStart = Math.max(0, body.length - (this.viewport - 4));
      this.helpOffset = Math.min(this.helpOffset, maxStart);
      this.overlayBox(screen, 'mdt help', body.slice(this.helpOffset), 'j/k scroll · Esc close');
    }
  }

  private statusBar(): Span[] {
    const theme = themes[this.theme];
    const style: Style = { fg: theme.statusFg, bg: theme.statusBg };
    const accent: Style = { fg: theme.bg, bg: theme.accent, bold: true };
    const left: Span[] = [span(' mdt ', accent), span(' ', style)];
    if (this.mode === 'search') {
      left.push(span('/', { ...style, fg: theme.accent, bold: true }), span(this.searchInput, style), span('█', { ...style, fg: theme.accent }));
      return padSpans(left, this.cols, style);
    }
    left.push(span(this.doc.name, { ...style, bold: true }));
    if (this.docs.length > 1) left.push(span(` [${this.current + 1}/${this.docs.length}]`, { ...style, fg: theme.muted }));
    if (this.history.length) left.push(span(' ⌫ back', { ...style, fg: theme.muted }));
    if (this.query) {
      const info = this.matches.length ? `${this.matchIndex + 1}/${this.matches.length}` : 'no matches';
      left.push(span(`  /${this.query} `, { ...style, fg: theme.accent }), span(`(${info})`, { ...style, fg: theme.muted }));
    }
    const doc = this.doc;
    if (doc.json !== undefined) {
      const nav = this.jsonNavigable();
      const path = this.rendered.lines[nav[doc.jsonCursor ?? 0]]?.jsonPath;
      if (path) left.push(span(`  ${path}`, { ...style, fg: theme.muted }));
    }
    if (this.toast) left.push(span(`  ${this.toast.text}`, { ...style, fg: theme.accent, bold: true }));
    let right: string;
    if (this.opts.slides && doc.json === undefined) right = `Slide ${this.slideIndex + 1}/${this.slides.length}`;
    else {
      const total = this.rendered.lines.length;
      const pct = this.maxOffset === 0 ? 100 : Math.round((doc.offset / this.maxOffset) * 100);
      right = `${Math.min(total, doc.offset + 1)}-${Math.min(total, doc.offset + this.viewport)}/${total}  ${pct}%`;
    }
    right += '  ? help ';
    const rightSpan = span(right, { ...style, fg: theme.muted });
    const room = this.cols - textWidth(right);
    return [...padSpans(truncateSpans(left, room), room, style), rightSpan];
  }

  private draw(): void {
    const theme = themes[this.theme];
    const lines = this.rendered.lines;
    const offset = this.doc.offset;
    const screen: Span[][] = [];
    const available = Math.max(1, this.cols - this.margin);
    for (let r = 0; r < this.viewport; r++) {
      const idx = offset + r;
      const line = lines[idx];
      screen.push(line ? [span(' '.repeat(this.margin)), ...truncateSpans(this.decorate(line, idx), available)] : []);
    }
    const overlay = this.mode !== 'normal' && this.mode !== 'search';
    this.drawOverlays(screen);
    screen.push(this.statusBar());
    const base: Style = { fg: theme.fg, bg: theme.bg };
    let out = '\x1b[?2026h';
    if (this.opts.color && this.terminalBg !== theme.bg) {
      out += `\x1b]11;${theme.bg}\x07`;
      this.terminalBg = theme.bg;
    }
    if (this.opts.imageProtocol === 'kitty') out += KITTY_CLEAR;
    screen.forEach((row, r) => {
      out += `\x1b[${r + 1};1H${serializeSpans(padSpans(row, this.cols, {}), { color: this.opts.color, styles: true, links: true, baseStyle: base })}`;
    });
    if (!overlay && (this.opts.imageProtocol === 'kitty' || this.opts.imageProtocol === 'iterm')) {
      for (let r = 0; r < this.viewport; r++) {
        const line = lines[offset + r];
        const placement = line?.image;
        if (!placement || placement.row !== 0 || r + placement.rows > this.viewport) continue;
        const entry = this.images.byIndex(placement.imageId);
        const seq = entry && protocolSequence(entry, placement.cols, placement.rows, this.opts.imageProtocol);
        if (seq) out += `\x1b[${r + 1};${this.margin + 1}H${seq}`;
      }
    }
    out += '\x1b[?2026l';
    this.output.write(out);
  }
}
