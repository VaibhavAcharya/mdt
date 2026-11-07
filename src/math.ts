const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο',
  pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', infty: '∞',
  partial: '∂', nabla: '∇', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', cdots: '⋯',
  ldots: '…', dots: '…', vdots: '⋮', ddots: '⋱', circ: '∘', bullet: '•', star: '⋆', ast: '∗',
  oplus: '⊕', otimes: '⊗', odot: '⊙', wedge: '∧', vee: '∨',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼',
  simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', prec: '≺', succ: '≻', perp: '⊥',
  parallel: '∥', mid: '∣', models: '⊨', vdash: '⊢',
  subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', in: '∈', notin: '∉', ni: '∋',
  cup: '∪', cap: '∩', bigcup: '⋃', bigcap: '⋂', emptyset: '∅', varnothing: '∅', setminus: '∖',
  forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬', land: '∧', lor: '∨',
  implies: '⟹', impliedby: '⟸', iff: '⟺', therefore: '∴', because: '∵',
  rightarrow: '→', to: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', longrightarrow: '⟶', longleftarrow: '⟵', mapsto: '↦',
  uparrow: '↑', downarrow: '↓', Uparrow: '⇑', Downarrow: '⇓', hookrightarrow: '↪',
  aleph: 'ℵ', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', wp: '℘', angle: '∠', triangle: '△',
  degree: '°', prime: '′', surd: '√', top: '⊤', bot: '⊥', diamond: '⋄', square: '□',
  langle: '⟨', rangle: '⟩', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋', vert: '|', Vert: '‖',
  lbrace: '{', rbrace: '}', '{': '{', '}': '}', '|': '‖', '%': '%', '$': '$', '&': '&', '#': '#', _: '_',
  ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ', quad: '  ', qquad: '    ',
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc', arcsin: 'arcsin',
  arccos: 'arccos', arctan: 'arctan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', log: 'log',
  ln: 'ln', lg: 'lg', exp: 'exp', lim: 'lim', limsup: 'lim sup', liminf: 'lim inf', max: 'max',
  min: 'min', sup: 'sup', inf: 'inf', det: 'det', dim: 'dim', ker: 'ker', gcd: 'gcd', deg: 'deg',
  arg: 'arg', Pr: 'Pr', mod: 'mod', bmod: 'mod', pmod: 'mod',
};

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ',
  f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ',
  s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ',
  G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ', O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ',
  U: 'ᵁ', V: 'ⱽ', W: 'ᵂ', '′': '′', ' ': ' ', 'α': 'ᵅ', 'β': 'ᵝ', 'γ': 'ᵞ', 'δ': 'ᵟ', 'θ': 'ᶿ', 'ϕ': 'ᵠ', 'χ': 'ᵡ',
  '∗': '*', '*': '*',
};

const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ',
  k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  ' ': ' ', 'β': 'ᵦ', 'γ': 'ᵧ', 'ρ': 'ᵨ', 'ϕ': 'ᵩ', 'χ': 'ᵪ',
};

const BLACKBOARD: Record<string, string> = {
  A: '𝔸', B: '𝔹', C: 'ℂ', D: '𝔻', E: '𝔼', F: '𝔽', G: '𝔾', H: 'ℍ', I: '𝕀', J: '𝕁', K: '𝕂', L: '𝕃',
  M: '𝕄', N: 'ℕ', O: '𝕆', P: 'ℙ', Q: 'ℚ', R: 'ℝ', S: '𝕊', T: '𝕋', U: '𝕌', V: '𝕍', W: '𝕎', X: '𝕏',
  Y: '𝕐', Z: 'ℤ', '1': '𝟙',
};

const CALLIGRAPHIC: Record<string, string> = {
  A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ', I: 'ℐ', J: '𝒥', K: '𝒦', L: 'ℒ',
  M: 'ℳ', N: '𝒩', O: '𝒪', P: '𝒫', Q: '𝒬', R: 'ℛ', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱', W: '𝒲', X: '𝒳',
  Y: '𝒴', Z: '𝒵',
};

const ACCENTS: Record<string, string> = {
  hat: '̂', widehat: '̂', bar: '̄', overline: '̅', vec: '⃗', dot: '̇',
  ddot: '̈', tilde: '̃', widetilde: '̃', acute: '́', grave: '̀', check: '̌',
  breve: '̆', underline: '̲',
};

const TEXT_COMMANDS = new Set([
  'text', 'textrm', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'operatorname',
  'boldsymbol', 'bm', 'mbox', 'displaystyle', 'textstyle', 'scriptstyle', 'mathnormal',
]);

const IGNORED = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'limits', 'nolimits', 'notag', 'nonumber']);

class Parser {
  private pos = 0;
  private readonly src: string;

  constructor(src: string) {
    this.src = src;
  }

  parse(stop?: string): string {
    let out = '';
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (stop && ch === stop) break;
      out += this.atom(out);
    }
    return out;
  }

  private atom(before: string): string {
    const ch = this.src[this.pos];
    if (ch === '{') return this.group();
    if (ch === '}') {
      this.pos++;
      return '';
    }
    if (ch === '^' || ch === '_') {
      this.pos++;
      const arg = this.argument();
      return ch === '^' ? toScript(arg, SUPERSCRIPT, '^') : toScript(arg, SUBSCRIPT, '_');
    }
    if (ch === '\\') return this.command(before);
    if (ch === '&') {
      this.pos++;
      return ' ';
    }
    if (ch === '~') {
      this.pos++;
      return ' ';
    }
    this.pos++;
    if (ch === '-') return '−';
    if (ch === "'") return '′';
    if (ch === '*') return '∗';
    return ch;
  }

  private group(): string {
    this.pos++;
    const inner = this.parse('}');
    this.pos++;
    return inner;
  }

  private skipSpaces(): void {
    while (this.src[this.pos] === ' ') this.pos++;
  }

  private argument(): string {
    this.skipSpaces();
    const ch = this.src[this.pos];
    if (ch === undefined) return '';
    if (ch === '{') return this.group();
    if (ch === '\\') return this.command('');
    this.pos++;
    return ch;
  }

  private rawGroup(): string {
    this.skipSpaces();
    if (this.src[this.pos] !== '{') return this.argument();
    let depth = 0;
    const start = this.pos + 1;
    for (; this.pos < this.src.length; this.pos++) {
      if (this.src[this.pos] === '{') depth++;
      else if (this.src[this.pos] === '}' && --depth === 0) break;
    }
    const raw = this.src.slice(start, this.pos);
    this.pos++;
    return raw;
  }

  private optional(): string | undefined {
    this.skipSpaces();
    if (this.src[this.pos] !== '[') return undefined;
    this.pos++;
    const inner = this.parse(']');
    this.pos++;
    return inner;
  }

  private command(before: string): string {
    this.pos++;
    let name = '';
    if (/[a-zA-Z]/.test(this.src[this.pos] ?? '')) {
      while (/[a-zA-Z]/.test(this.src[this.pos] ?? '')) name += this.src[this.pos++];
    } else {
      name = this.src[this.pos++] ?? '';
    }
    if (name === '\\') return '\n';
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      const num = this.argument();
      const den = this.argument();
      return fraction(num, den);
    }
    if (name === 'binom' || name === 'dbinom' || name === 'tbinom') {
      const n = this.argument();
      const k = this.argument();
      return `(${n} choose ${k})`;
    }
    if (name === 'sqrt') {
      const index = this.optional();
      const body = this.argument();
      const root = index === '3' ? '∛' : index === '4' ? '∜' : `${index ? toScript(index, SUPERSCRIPT, '') : ''}√`;
      return [...body].length > 1 ? `${root}(${body})` : `${root}${body}`;
    }
    if (name === 'mathbb' || name === 'mathbbm') return mapChars(this.argument(), BLACKBOARD);
    if (name === 'mathcal' || name === 'mathscr') return mapChars(this.argument(), CALLIGRAPHIC);
    if (TEXT_COMMANDS.has(name)) {
      if (name.startsWith('text') || name === 'mbox') return this.rawGroup();
      if (name.endsWith('style')) return '';
      return this.argument();
    }
    if (name in ACCENTS) {
      const body = this.argument();
      return [...body].map((c) => c + ACCENTS[name]).join('');
    }
    if (name === 'begin' || name === 'end') {
      this.rawGroup();
      return name === 'end' ? '' : '';
    }
    if (name === 'not') {
      const next = this.argument();
      return next === '=' ? '≠' : next === '∈' ? '∉' : `${next}̸`;
    }
    if (IGNORED.has(name)) return '';
    if (name === 'over') return '/';
    const symbol = SYMBOLS[name];
    if (symbol === undefined) return name;
    const isWord = /^[a-z]{2,}$/.test(symbol) && /[\w)]$/.test(before);
    return isWord ? ` ${symbol}` : symbol;
  }
}

function needsParens(text: string): boolean {
  return [...text].length > 1 && !/^[\w.′]+$|^\(.*\)$/u.test(text);
}

function fraction(num: string, den: string): string {
  const n = needsParens(num) ? `(${num})` : num;
  const d = needsParens(den) ? `(${den})` : den;
  return `${n}/${d}`;
}

function toScript(text: string, map: Record<string, string>, marker: string): string {
  const chars = [...text];
  if (chars.every((c) => map[c] !== undefined)) return chars.map((c) => map[c]).join('');
  if (!marker) return text;
  return chars.length === 1 ? `${marker}${text}` : `${marker}(${text})`;
}

function mapChars(text: string, map: Record<string, string>): string {
  return [...text].map((c) => map[c] ?? c).join('');
}

export function renderMath(latex: string): string {
  const result = new Parser(latex.trim()).parse();
  return result
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}
