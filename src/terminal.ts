import { spawn, spawnSync } from 'node:child_process';

export interface Key {
  name: string;
  ch?: string;
  ctrl?: boolean;
  shift?: boolean;
}

export interface Mouse {
  button: number;
  x: number;
  y: number;
  release: boolean;
}

export type InputEvent = { type: 'key'; key: Key } | { type: 'mouse'; mouse: Mouse };

const CSI_KEYS: Record<string, string> = {
  A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end', Z: 'backtab', P: 'f1',
  '1~': 'home', '2~': 'insert', '3~': 'delete', '4~': 'end', '5~': 'pageup', '6~': 'pagedown',
  '7~': 'home', '8~': 'end', '11~': 'f1',
};

export function parseInput(data: string): InputEvent[] {
  const events: InputEvent[] = [];
  let i = 0;
  while (i < data.length) {
    const ch = data[i];
    if (ch === '\x1b') {
      const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(data.slice(i));
      if (mouse) {
        events.push({
          type: 'mouse',
          mouse: { button: Number(mouse[1]), x: Number(mouse[2]), y: Number(mouse[3]), release: mouse[4] === 'm' },
        });
        i += mouse[0].length;
        continue;
      }
      const csi = /^\x1b[[O](?:(\d+(?:;\d+)?)?([A-Za-z~]))/.exec(data.slice(i));
      if (csi) {
        const params = csi[1] ?? '';
        const final = csi[2];
        const [num, mod] = params.split(';');
        const name = final === '~' ? CSI_KEYS[`${num}~`] : CSI_KEYS[final];
        const modifier = Number(mod ?? 1) - 1;
        events.push({ type: 'key', key: { name: name ?? 'unknown', shift: (modifier & 1) !== 0, ctrl: (modifier & 4) !== 0 } });
        i += csi[0].length;
        continue;
      }
      if (i + 1 < data.length && data[i + 1] !== '\x1b') {
        events.push({ type: 'key', key: { name: 'char', ch: data[i + 1], ctrl: false } });
        i += 2;
        continue;
      }
      events.push({ type: 'key', key: { name: 'escape' } });
      i++;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (ch === '\r' || ch === '\n') events.push({ type: 'key', key: { name: 'enter' } });
    else if (ch === '\t') events.push({ type: 'key', key: { name: 'tab' } });
    else if (ch === '\x7f' || ch === '\x08') events.push({ type: 'key', key: { name: 'backspace' } });
    else if (code < 32) events.push({ type: 'key', key: { name: 'char', ch: String.fromCharCode(code + 96), ctrl: true } });
    else {
      const cp = data.codePointAt(i)!;
      const char = String.fromCodePoint(cp);
      events.push({ type: 'key', key: { name: 'char', ch: char } });
      i += char.length;
      continue;
    }
    i++;
  }
  return events;
}

export function copyToClipboard(text: string, write: (s: string) => void): boolean {
  const candidates: [string, string[]][] =
    process.platform === 'darwin'
      ? [['pbcopy', []]]
      : process.platform === 'win32'
        ? [['clip', []]]
        : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];
  if (!process.env.SSH_TTY) {
    for (const [cmd, args] of candidates) {
      const result = spawnSync(cmd, args, { input: text, stdio: ['pipe', 'ignore', 'ignore'], timeout: 2000 });
      if (result.status === 0) return true;
    }
  }
  write(`\x1b]52;c;${Buffer.from(text).toString('base64')}\x07`);
  return true;
}

export function openExternal(target: string): void {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [target]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', target]] : ['xdg-open', [target]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}

export const ENTER_SCREEN = '\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1002h\x1b[?1006h';
export const LEAVE_SCREEN = '\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[0m\x1b[?25h\x1b[?1049l';
