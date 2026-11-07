import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMermaid, renderMermaid } from '../src/diagram.ts';
import { renderJson, parentPath, allContainers } from '../src/json.ts';
import { linesToText, renderMarkdown, slugify, splitSlides, toggleTaskInSource } from '../src/markdown.ts';
import { renderMath } from '../src/math.ts';
import { parseInput } from '../src/terminal.ts';
import { themes } from '../src/theme.ts';

const theme = themes.dark;
const render = (source: string, width = 60) =>
  renderMarkdown(source, { width, theme, lineNumbers: false, baseDir: '.', imageProtocol: 'none' });

test('math converts LaTeX to Unicode', () => {
  assert.equal(renderMath('\\alpha + \\beta'), 'α + β');
  assert.equal(renderMath('x^2 + y_i'), 'x² + yᵢ');
  assert.equal(renderMath('\\frac{a+b}{2}'), '(a+b)/2');
  assert.equal(renderMath('\\sqrt{x}'), '√x');
  assert.equal(renderMath('\\mathbb{R}^n'), 'ℝⁿ');
});

test('inline and display math render in documents', () => {
  const text = linesToText(render('Energy $E = mc^2$ here.\n\n$$\n\\sum_{i=1}^{n} i\n$$\n').lines);
  assert.match(text, /E = mc²/);
  assert.match(text, /∑ᵢ₌₁ⁿ i/);
});

test('headings get GitHub slugs and are collected', () => {
  const r = render('# Hello World\n\n## Hello World\n\ntext\n');
  assert.deepEqual(r.headings.map((h) => h.slug), ['hello-world', 'hello-world-1']);
  assert.equal(slugify('What is `mdt`?'), 'what-is-mdt');
});

test('paragraphs wrap to width', () => {
  const r = render('word '.repeat(40), 20);
  for (const line of linesToText(r.lines).split('\n')) assert.ok(line.length <= 20);
});

test('links are collected for the picker', () => {
  const r = render('See [one](https://a.example) and [two](b.md).');
  assert.deepEqual(r.links.map((l) => [l.text, l.url]), [['one', 'https://a.example'], ['two', 'b.md']]);
});

test('tables use box drawing with alignment', () => {
  const text = linesToText(render('| a | b |\n|:-|-:|\n| 1 | 22 |\n').lines);
  assert.match(text, /╭───┬────╮/);
  assert.match(text, /│ 1 │ 22 │/);
});

test('task checkboxes toggle in source, skipping code fences', () => {
  const source = '```\n- [ ] not a task\n```\n- [ ] one\n- [x] two\n> - [ ] quoted\n';
  assert.equal(toggleTaskInSource(source, 0), source.replace('- [ ] one', '- [x] one'));
  assert.equal(toggleTaskInSource(source, 1), source.replace('- [x] two', '- [ ] two'));
  assert.equal(toggleTaskInSource(source, 2), source.replace('> - [ ] quoted', '> - [x] quoted'));
  assert.equal(toggleTaskInSource(source, 3), undefined);
});

test('rendered task lines carry their index', () => {
  const r = render('- [ ] a\n- [x] b\n');
  assert.deepEqual(r.lines.filter((l) => l.task).map((l) => l.task), [{ index: 0, checked: false }, { index: 1, checked: true }]);
});

test('click-to-copy blocks hold source text', () => {
  const r = render('# A\n\ntext\n\n## B\n\nmore\n\n# C\n\n- x\n- y\n\n```js\nlet a\n```\n');
  assert.deepEqual(r.blocks.map((b) => b.kind), ['heading', 'heading', 'heading', 'list', 'code']);
  assert.equal(r.blocks[0].text, '# A\n\ntext\n\n## B\n\nmore');
  assert.equal(r.blocks[3].text, '- x\n- y');
  assert.equal(r.blocks[4].text, 'let a');
});

test('slides split on --- outside code fences and skip front matter', () => {
  const slides = splitSlides('---\ntitle: x\n---\n# One\n\n---\n\n# Two\n```\n---\n```\n');
  assert.equal(slides.length, 2);
  assert.match(slides[1], /```\n---\n```/);
});

test('mermaid flowcharts parse and render', () => {
  const graph = parseMermaid('graph TD\n  A[Start] --> B{Ok?}\n  B -->|Yes| C\n  B -- No --> A');
  assert.equal(graph?.nodes.size, 3);
  assert.equal(graph?.edges.length, 3);
  const text = renderMermaid('flowchart LR\n  A --> B', theme)!.map((l) => l.map((s) => s.text).join('')).join('\n');
  assert.match(text, /│ A │─*▶│ B │/);
  assert.equal(renderMermaid('sequenceDiagram\n A->>B: hi', theme), undefined);
});

test('alerts render a title', () => {
  assert.match(linesToText(render('> [!WARNING]\n> Careful\n').lines), /⚠ Warning\n▎ Careful/);
});

test('json renders collapsible tree and tables', () => {
  const value = { a: [1, 2], users: [{ id: 1 }, { id: 2 }] };
  const text = linesToText(renderJson(value, { theme, width: 60, expanded: allContainers(value) }));
  assert.match(text, /▾ a: \[2 items\]/);
  assert.match(text, /│ id │/);
  assert.equal(parentPath('$.a[0]'), '$.a');
  assert.equal(parentPath('$'), undefined);
});

test('input parser handles keys and SGR mouse', () => {
  const events = parseInput('j\x1b[A\x1b[<64;5;6M\x1b[Z\x04');
  assert.deepEqual(events.map((e) => (e.type === 'key' ? e.key.name + (e.key.ch ?? '') : `mouse${e.mouse.button}`)), ['charj', 'up', 'mouse64', 'backtab', 'chard']);
});
