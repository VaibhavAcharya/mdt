export type ThemeName = 'dark' | 'light';

export interface Theme {
  name: ThemeName;
  shiki: 'github-dark' | 'github-light';
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  headings: [string, string, string, string, string, string];
  link: string;
  inlineCode: string;
  inlineCodeBg: string;
  codeBg: string;
  codeBorder: string;
  codeFg: string;
  lineNumber: string;
  quoteBar: string;
  quoteFg: string;
  listMarker: string;
  taskDone: string;
  taskTodo: string;
  tableBorder: string;
  tableHeader: string;
  rule: string;
  math: string;
  searchBg: string;
  searchFg: string;
  searchCurrentBg: string;
  statusBg: string;
  statusFg: string;
  overlayBg: string;
  overlayBorder: string;
  selectedBg: string;
  diagramBox: string;
  diagramEdge: string;
  diagramLabel: string;
  jsonKey: string;
  jsonString: string;
  jsonNumber: string;
  jsonBool: string;
  jsonNull: string;
  jsonPunct: string;
  alerts: Record<'note' | 'tip' | 'important' | 'warning' | 'caution', string>;
}

const dark: Theme = {
  name: 'dark',
  shiki: 'github-dark',
  bg: '#0d1117',
  fg: '#d1d7e0',
  muted: '#7d8590',
  accent: '#58a6ff',
  headings: ['#79c0ff', '#d2a8ff', '#7ee787', '#ffa657', '#ff7b72', '#a5d6ff'],
  link: '#58a6ff',
  inlineCode: '#ffa657',
  inlineCodeBg: '#1f2630',
  codeBg: '#161b22',
  codeBorder: '#30363d',
  codeFg: '#e6edf3',
  lineNumber: '#6e7681',
  quoteBar: '#3d444d',
  quoteFg: '#9198a1',
  listMarker: '#ffa657',
  taskDone: '#3fb950',
  taskTodo: '#7d8590',
  tableBorder: '#3d444d',
  tableHeader: '#79c0ff',
  rule: '#3d444d',
  math: '#d2a8ff',
  searchBg: '#614700',
  searchFg: '#ffffff',
  searchCurrentBg: '#bb8009',
  statusBg: '#21262d',
  statusFg: '#d1d7e0',
  overlayBg: '#161b22',
  overlayBorder: '#58a6ff',
  selectedBg: '#1f3a5f',
  diagramBox: '#79c0ff',
  diagramEdge: '#7d8590',
  diagramLabel: '#ffa657',
  jsonKey: '#79c0ff',
  jsonString: '#a5d6ff',
  jsonNumber: '#ffa657',
  jsonBool: '#ff7b72',
  jsonNull: '#7d8590',
  jsonPunct: '#7d8590',
  alerts: { note: '#4493f8', tip: '#3fb950', important: '#ab7df8', warning: '#d29922', caution: '#f85149' },
};

const light: Theme = {
  name: 'light',
  shiki: 'github-light',
  bg: '#ffffff',
  fg: '#1f2328',
  muted: '#59636e',
  accent: '#0969da',
  headings: ['#0550ae', '#8250df', '#116329', '#953800', '#cf222e', '#0a3069'],
  link: '#0969da',
  inlineCode: '#953800',
  inlineCodeBg: '#eff1f3',
  codeBg: '#f6f8fa',
  codeBorder: '#d1d9e0',
  codeFg: '#1f2328',
  lineNumber: '#8c959f',
  quoteBar: '#d1d9e0',
  quoteFg: '#59636e',
  listMarker: '#953800',
  taskDone: '#1a7f37',
  taskTodo: '#8c959f',
  tableBorder: '#d1d9e0',
  tableHeader: '#0550ae',
  rule: '#d1d9e0',
  math: '#8250df',
  searchBg: '#fff8c5',
  searchFg: '#1f2328',
  searchCurrentBg: '#d4a72c',
  statusBg: '#eaeef2',
  statusFg: '#1f2328',
  overlayBg: '#f6f8fa',
  overlayBorder: '#0969da',
  selectedBg: '#ddf4ff',
  diagramBox: '#0550ae',
  diagramEdge: '#59636e',
  diagramLabel: '#953800',
  jsonKey: '#0550ae',
  jsonString: '#0a3069',
  jsonNumber: '#953800',
  jsonBool: '#cf222e',
  jsonNull: '#8c959f',
  jsonPunct: '#8c959f',
  alerts: { note: '#0969da', tip: '#1a7f37', important: '#8250df', warning: '#9a6700', caution: '#d1242f' },
};

export const themes: Record<ThemeName, Theme> = { dark, light };

export function otherTheme(name: ThemeName): ThemeName {
  return name === 'dark' ? 'light' : 'dark';
}
