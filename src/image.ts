import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { span, type Span } from './style.ts';

export type ImageProtocol = 'kitty' | 'iterm' | 'halfblock' | 'none';

export interface ImageEntry {
  id: number;
  src: string;
  status: 'loading' | 'ready' | 'error';
  data?: Buffer;
  format?: 'png' | 'jpeg' | 'gif' | 'webp' | 'other';
  width?: number;
  height?: number;
  rgba?: Uint8Array;
}

const MAX_ROWS = 30;
const CELL_PIXEL_WIDTH = 8;

export function detectProtocol(env: NodeJS.ProcessEnv = process.env): ImageProtocol {
  if (env.TMUX || env.TERM?.startsWith('screen')) return 'halfblock';
  if (env.KITTY_WINDOW_ID || env.TERM === 'xterm-kitty' || env.TERM_PROGRAM === 'ghostty' || env.GHOSTTY_RESOURCES_DIR) return 'kitty';
  if (env.TERM_PROGRAM === 'iTerm.app' || env.TERM_PROGRAM === 'WezTerm' || env.LC_TERMINAL === 'iTerm2') return 'iterm';
  return 'halfblock';
}

function sniff(data: Buffer): Pick<ImageEntry, 'format' | 'width' | 'height'> {
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { format: 'png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length > 10 && data.toString('ascii', 0, 3) === 'GIF') {
    return { format: 'gif', width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
  }
  if (data.length > 30 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = data.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { format: 'webp', width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { format: 'webp', width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = data.readUInt32LE(21);
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return { format: 'webp' };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) break;
      const marker = data[offset + 1];
      const length = data.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: 'jpeg', height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    return { format: 'jpeg' };
  }
  return { format: 'other' };
}

function decode(entry: ImageEntry): void {
  if (!entry.data) return;
  try {
    if (entry.format === 'png') {
      const png = PNG.sync.read(entry.data);
      entry.rgba = new Uint8Array(png.data);
      entry.width = png.width;
      entry.height = png.height;
    } else if (entry.format === 'jpeg') {
      const img = jpeg.decode(entry.data, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
      entry.rgba = img.data;
      entry.width = img.width;
      entry.height = img.height;
    }
  } catch {
    entry.rgba = undefined;
  }
}

export class ImageStore {
  private readonly entries = new Map<string, ImageEntry>();
  private readonly byId: ImageEntry[] = [];
  onUpdate: () => void = () => {};
  allowRemote = true;

  get(src: string, baseDir: string): ImageEntry {
    const remote = /^https?:\/\//i.test(src);
    const key = remote ? src : resolve(baseDir, decodeURIComponent(src));
    const existing = this.entries.get(key);
    if (existing) return existing;
    const entry: ImageEntry = { id: this.byId.length, src: key, status: 'loading' };
    this.entries.set(key, entry);
    this.byId.push(entry);
    if (remote) {
      if (this.allowRemote) void this.fetchRemote(entry);
      else entry.status = 'error';
    } else {
      try {
        this.accept(entry, readFileSync(key));
      } catch {
        entry.status = 'error';
      }
    }
    return entry;
  }

  byIndex(id: number): ImageEntry | undefined {
    return this.byId[id];
  }

  private accept(entry: ImageEntry, data: Buffer): void {
    entry.data = data;
    Object.assign(entry, sniff(data));
    decode(entry);
    entry.status = entry.width && entry.height ? 'ready' : 'error';
  }

  private async fetchRemote(entry: ImageEntry): Promise<void> {
    try {
      const res = await fetch(entry.src, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(String(res.status));
      this.accept(entry, Buffer.from(await res.arrayBuffer()));
    } catch {
      entry.status = 'error';
    }
    this.onUpdate();
  }
}

export function imageCells(entry: ImageEntry, maxCols: number): { cols: number; rows: number } {
  const w = entry.width ?? 1;
  const h = entry.height ?? 1;
  let cols = Math.max(1, Math.min(maxCols, Math.ceil(w / CELL_PIXEL_WIDTH)));
  let rows = Math.max(1, Math.round((cols * h) / w / 2));
  if (rows > MAX_ROWS) {
    rows = MAX_ROWS;
    cols = Math.max(1, Math.min(maxCols, Math.round((rows * 2 * w) / h)));
  }
  return { cols, rows };
}

function hex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function halfBlockRows(entry: ImageEntry, cols: number, rows: number, background: string): Span[][] | undefined {
  const { rgba, width, height } = entry;
  if (!rgba || !width || !height) return undefined;
  const bg = parseInt(background.slice(1), 16);
  const bgr = (bg >> 16) & 255;
  const bgg = (bg >> 8) & 255;
  const bgb = bg & 255;
  const pixelRows = rows * 2;
  const sample = (px: number, py: number): string => {
    const x0 = Math.floor((px * width) / cols);
    const x1 = Math.max(x0 + 1, Math.floor(((px + 1) * width) / cols));
    const y0 = Math.floor((py * height) / pixelRows);
    const y1 = Math.max(y0 + 1, Math.floor(((py + 1) * height) / pixelRows));
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const stepX = Math.max(1, Math.floor((x1 - x0) / 4));
    const stepY = Math.max(1, Math.floor((y1 - y0) / 4));
    for (let y = y0; y < y1; y += stepY) {
      for (let x = x0; x < x1; x += stepX) {
        const i = (y * width + x) * 4;
        const a = rgba[i + 3] / 255;
        r += rgba[i] * a + bgr * (1 - a);
        g += rgba[i + 1] * a + bgg * (1 - a);
        b += rgba[i + 2] * a + bgb * (1 - a);
        n++;
      }
    }
    return hex(Math.round(r / n), Math.round(g / n), Math.round(b / n));
  };
  const out: Span[][] = [];
  for (let row = 0; row < rows; row++) {
    const spans: Span[] = [];
    for (let col = 0; col < cols; col++) {
      spans.push(span('▀', { fg: sample(col, row * 2), bg: sample(col, row * 2 + 1) }));
    }
    out.push(spans);
  }
  return out;
}

function chunked(payload: string, header: string): string {
  const parts: string[] = [];
  for (let i = 0; i < payload.length; i += 4096) {
    const chunk = payload.slice(i, i + 4096);
    const more = i + 4096 < payload.length ? 1 : 0;
    parts.push(i === 0 ? `\x1b_G${header},m=${more};${chunk}\x1b\\` : `\x1b_Gm=${more};${chunk}\x1b\\`);
  }
  return parts.join('');
}

const kittyTransmitted = new Set<number>();

export function protocolSequence(entry: ImageEntry, cols: number, rows: number, protocol: ImageProtocol): string | undefined {
  if (!entry.data || entry.status !== 'ready') return undefined;
  if (protocol === 'iterm') {
    return `\x1b]1337;File=inline=1;size=${entry.data.length};width=${cols};height=${rows};preserveAspectRatio=0:${entry.data.toString('base64')}\x07`;
  }
  if (protocol !== 'kitty') return undefined;
  const id = entry.id + 1;
  let out = '';
  if (!kittyTransmitted.has(id)) {
    if (entry.format === 'png') out = chunked(entry.data.toString('base64'), `a=t,f=100,i=${id},q=2`);
    else if (entry.rgba) out = chunked(Buffer.from(entry.rgba).toString('base64'), `a=t,f=32,s=${entry.width},v=${entry.height},i=${id},q=2`);
    else return undefined;
    kittyTransmitted.add(id);
  }
  return `${out}\x1b_Ga=p,i=${id},c=${cols},r=${rows},C=1,q=2\x1b\\`;
}

export const KITTY_CLEAR = '\x1b_Ga=d,d=a,q=2\x1b\\';
