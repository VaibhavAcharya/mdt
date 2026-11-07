import { bundledLanguages, bundledLanguagesAlias, createHighlighter, createJavaScriptRegexEngine, type Highlighter } from 'shiki';
import { span, type Span } from './style.ts';
import type { Theme } from './theme.ts';

let highlighter: Highlighter | undefined;
const loaded = new Set<string>();

const ALIASES: Record<string, string> = {
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', js: 'javascript', ts: 'typescript',
  py: 'python', rb: 'ruby', rs: 'rust', yml: 'yaml', md: 'markdown', golang: 'go', 'c++': 'cpp',
  cs: 'csharp', kt: 'kotlin', ps1: 'powershell', dockerfile: 'docker', tf: 'hcl', jsonc: 'jsonc',
};

export function resolveLanguage(lang: string | undefined): string | undefined {
  if (!lang) return undefined;
  const name = lang.toLowerCase().split(/[\s{,]/)[0];
  const resolved = ALIASES[name] ?? name;
  if (resolved in bundledLanguages || resolved in bundledLanguagesAlias) return resolved;
  return undefined;
}

export async function prepareHighlighter(langs: Iterable<string | undefined>): Promise<void> {
  const wanted = new Set<string>();
  for (const lang of langs) {
    const resolved = resolveLanguage(lang);
    if (resolved && !loaded.has(resolved)) wanted.add(resolved);
  }
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [...wanted],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
    for (const lang of wanted) loaded.add(lang);
    return;
  }
  for (const lang of wanted) {
    await highlighter.loadLanguage(lang as keyof typeof bundledLanguages);
    loaded.add(lang);
  }
}

export function highlightCode(code: string, lang: string | undefined, theme: Theme): Span[][] {
  const resolved = resolveLanguage(lang);
  if (!highlighter || !resolved || !loaded.has(resolved)) {
    return code.split('\n').map((line) => [span(line, { fg: theme.codeFg })]);
  }
  const tokens = highlighter.codeToTokensBase(code, { lang: resolved as keyof typeof bundledLanguages, theme: theme.shiki });
  return tokens.map((line) =>
    line.map((token) => {
      const style = token.fontStyle ?? 0;
      return span(token.content, {
        fg: token.color?.slice(0, 7) ?? theme.codeFg,
        italic: (style & 1) !== 0,
        bold: (style & 2) !== 0,
        underline: (style & 4) !== 0,
      });
    }),
  );
}

export function highlightHtml(code: string, lang: string | undefined, theme: Theme): string | undefined {
  const resolved = resolveLanguage(lang);
  if (!highlighter || !resolved || !loaded.has(resolved)) return undefined;
  return highlighter.codeToHtml(code, { lang: resolved as keyof typeof bundledLanguages, theme: theme.shiki });
}
