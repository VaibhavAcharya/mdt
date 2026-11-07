#!/usr/bin/env node
import { openSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { ReadStream } from 'node:tty';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.ts';
import { exportHtml } from './export.ts';
import { prepareHighlighter } from './highlight.ts';
import { detectProtocol, ImageStore } from './image.ts';
import { allContainers, renderJson } from './json.ts';
import { collectCodeLangs, renderMarkdown, splitSlides } from './markdown.ts';
import { serializeSpans, type Line } from './style.ts';
import { themes, type ThemeName } from './theme.ts';
import { loadDoc, makeDoc, Viewer, type Doc } from './viewer.ts';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;

const USAGE = `mdt ${VERSION}: Markdown in terminal

Usage: mdt [OPTIONS] [FILES]...

Arguments:
  [FILES]...               Markdown or JSON file(s) to view (reads stdin when omitted)

Options:
  -T, --theme <THEME>      Theme: dark or light
  -w, --width <WIDTH>      Display width override (0 = auto)
  -s, --slides             Slide mode (--- as slide separators)
  -l, --line-numbers       Show line numbers in code blocks
      --export <FORMAT>    Export format (html)
      --no-color           Disable colors
  -h, --help               Print help
  -V, --version            Print version

Config: ~/.config/mdt/config.toml (theme, line_numbers, width)`;

function fail(message: string): never {
  process.stderr.write(`mdt: ${message}\n`);
  process.exit(2);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        theme: { type: 'string', short: 'T' },
        width: { type: 'string', short: 'w' },
        slides: { type: 'boolean', short: 's' },
        'line-numbers': { type: 'boolean', short: 'l' },
        export: { type: 'string' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'V' },
      },
    });
  } catch (error) {
    fail(`${(error as Error).message}\n\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (values.version) {
    process.stdout.write(`mdt ${VERSION}\n`);
    return;
  }

  const config = loadConfig();
  const themeName = (values.theme ?? config.theme) as ThemeName;
  if (themeName !== 'dark' && themeName !== 'light') fail(`unknown theme "${values.theme}", expected dark or light`);
  const width = values.width !== undefined ? Number(values.width) : config.width;
  if (!Number.isInteger(width) || width < 0) fail(`invalid width "${values.width}"`);
  if (values.export !== undefined && values.export !== 'html') fail(`unknown export format "${values.export}", expected html`);
  const color = !values['no-color'] && !process.env.NO_COLOR;
  const lineNumbers = Boolean(values['line-numbers']) || config.lineNumbers;

  const docs: Doc[] = [];
  for (const file of positionals) {
    try {
      docs.push(loadDoc(resolve(file)));
    } catch (error) {
      fail(`cannot read ${file}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}`);
    }
  }
  const stdinPiped = !process.stdin.isTTY;
  if (!docs.length) {
    if (!stdinPiped) fail(`no input\n\n${USAGE}`);
    docs.push(makeDoc(await readStdin(), 'stdin'));
  }

  const theme = themes[themeName];
  await prepareHighlighter(docs.flatMap((d) => (d.json === undefined ? collectCodeLangs(d.source) : [])));

  if (values.export === 'html') {
    const doc = docs[0];
    const baseDir = doc.path ? dirname(doc.path) : process.cwd();
    const source = doc.json !== undefined ? `\`\`\`json\n${JSON.stringify(doc.json, null, 2)}\n\`\`\`\n` : doc.source;
    await prepareHighlighter(['json']);
    process.stdout.write(exportHtml(source, theme, doc.path ? basename(doc.path) : 'mdt', baseDir));
    return;
  }

  if (!process.stdout.isTTY) {
    const cols = width || Number(process.env.COLUMNS) || 80;
    const images = new ImageStore();
    images.allowRemote = false;
    const out: string[] = [];
    docs.forEach((doc, i) => {
      if (i > 0) out.push('');
      let lines: Line[];
      if (doc.json !== undefined) {
        lines = renderJson(doc.json, { theme, width: cols, expanded: allContainers(doc.json) });
      } else {
        const source = values.slides ? splitSlides(doc.source).join('\n\n---\n\n') : doc.source;
        lines = renderMarkdown(source, {
          width: cols,
          theme,
          lineNumbers,
          baseDir: doc.path ? dirname(doc.path) : process.cwd(),
          images,
          imageProtocol: color ? 'halfblock' : 'none',
        }).lines;
      }
      for (const line of lines) out.push(serializeSpans(line.spans, { color, styles: color, links: false }).trimEnd());
    });
    process.stdout.write(`${out.join('\n')}\n`);
    return;
  }

  let input: ReadStream | typeof process.stdin = process.stdin;
  if (stdinPiped) {
    try {
      input = new ReadStream(openSync('/dev/tty', 'r'));
    } catch {
      fail('cannot open terminal for keyboard input');
    }
  }
  const viewer = new Viewer(docs, { theme: themeName, lineNumbers, width, slides: Boolean(values.slides), color, imageProtocol: detectProtocol() }, input as ReadStream, process.stdout);
  await viewer.run();
  process.exit(0);
}

main().catch((error: unknown) => {
  process.stderr.write(`mdt: ${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
