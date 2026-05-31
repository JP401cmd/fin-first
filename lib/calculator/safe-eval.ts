/**
 * safe-eval — minimale, veilige formule-evaluator voor de Rekenhulp.
 *
 * VERVANGT de externe dependency `expr-eval`, die twee HIGH-advisories heeft
 * zonder upstream fix (prototype pollution + onbeperkte functie-toegang via
 * `x.constructor.constructor("…")()`). De rekenhulp draait formules die door
 * de AI gegenereerd én publiek deelbaar/forkbaar zijn, dus de sandbox-escape
 * was reëel exploiteerbaar in de browser van een slachtoffer.
 *
 * Deze evaluator sluit die hele klasse uit BY CONSTRUCTION:
 *   - de grammatica kent GEEN member-access (`.`), array-index (`[]`) of
 *     assignment (`=`) → `scenario.constructor` is simpelweg een parse-fout;
 *   - variabele-/functie-opzoekingen gaan uitsluitend via
 *     `Object.prototype.hasOwnProperty` → overgeërfde namen als `constructor`,
 *     `__proto__` en `toString` resolven NOOIT;
 *   - functies komen alleen uit de meegegeven scope (WHITELIST_FNS) of uit een
 *     vaste, numerieke BUILTINS-tabel — nooit uit waarden in scope.
 *
 * De API is een drop-in voor de subset van `expr-eval` die de rekenhulp
 * gebruikte: `new Parser(options?)`, `parser.parse(formula).evaluate(scope)` en
 * `parser.parse(formula).variables({ withMembers })`. Operator-semantiek,
 * built-in functies (incl. `log` = natuurlijke logaritme), constanten en de
 * `variables()`-exclusielijst zijn 1-op-1 overgenomen van expr-eval 2.0.2 zodat
 * bestaande (opgeslagen) calculators identiek blijven rekenen.
 *
 * gamma()/roundTo()/isInteger() zijn verbatim geport uit expr-eval (MIT,
 * © Matthew Crumley) zodat exotische built-ins niet regresseren.
 */

export interface ParserOptions {
  /** Geaccepteerd voor API-compat met de oude expr-eval Parser; genegeerd —
   *  concatenate/assignment/member-access bestaan hier sowieso niet. */
  operators?: Record<string, boolean>
  allowMemberAccess?: boolean
}

export interface VariablesOptions {
  /** Geaccepteerd voor API-compat; er zijn geen member-expressies, dus de
   *  optie heeft geen effect. */
  withMembers?: boolean
}

/** Runtime-waarde die een (sub)expressie kan opleveren. */
type Value = number | boolean | string

type Scope = Record<string, unknown>

// ── Built-in namen ────────────────────────────────────────────────
//
// Exact de namen die expr-eval als operator/functie/constante kent. Ze worden
// uit `variables()` gefilterd (net als bij expr-eval), zodat een formule die
// bijvoorbeeld `log(...)` gebruikt niet als "onbekende variabele" wordt
// aangemerkt door validateFormulas.

const EXCLUDED_NAMES: ReadonlySet<string> = new Set([
  // unaryOps (expr-eval)
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'asinh', 'acosh', 'atanh', 'sqrt', 'cbrt', 'log', 'log2', 'ln', 'lg',
  'log10', 'expm1', 'log1p', 'abs', 'ceil', 'floor', 'round', 'trunc',
  'exp', 'not', 'length', 'sign',
  // binaryOps-woorden (expr-eval)
  'and', 'or', 'in',
  // functions (expr-eval)
  'random', 'fac', 'min', 'max', 'hypot', 'pyt', 'pow', 'atan2', 'if',
  'gamma', 'roundTo', 'map', 'fold', 'filter', 'indexOf', 'join',
  // consts (expr-eval)
  'E', 'PI', 'true', 'false',
])

const CONSTS: ReadonlyMap<string, Value> = new Map<string, Value>([
  ['E', Math.E],
  ['PI', Math.PI],
  ['true', true],
  ['false', false],
])

// ── Math-helpers verbatim uit expr-eval 2.0.2 (MIT) ───────────────

function isInteger(value: number): boolean {
  return isFinite(value) && value === Math.round(value)
}

const GAMMA_G = 4.7421875
const GAMMA_P = [
  0.99999999999999709182,
  57.156235665862923517, -59.597960355475491248,
  14.136097974741747174, -0.49191381609762019978,
  0.33994649984811888699e-4,
  0.46523628927048575665e-4, -0.98374475304879564677e-4,
  0.15808870322491248884e-3, -0.21026444172410488319e-3,
  0.21743961811521264320e-3, -0.16431810653676389022e-3,
  0.84418223983852743293e-4, -0.26190838401581408670e-4,
  0.36899182659531622704e-5,
]

function gamma(n: number): number {
  let t: number
  let x: number

  if (isInteger(n)) {
    if (n <= 0) return isFinite(n) ? Infinity : NaN
    if (n > 171) return Infinity
    let value = n - 2
    let res = n - 1
    while (value > 1) {
      res *= value
      value--
    }
    if (res === 0) res = 1
    return res
  }

  if (n < 0.5) return Math.PI / (Math.sin(Math.PI * n) * gamma(1 - n))
  if (n >= 171.35) return Infinity

  if (n > 85.0) {
    const twoN = n * n
    const threeN = twoN * n
    const fourN = threeN * n
    const fiveN = fourN * n
    return Math.sqrt(2 * Math.PI / n) * Math.pow(n / Math.E, n) *
      (1 + (1 / (12 * n)) + (1 / (288 * twoN)) - (139 / (51840 * threeN)) -
      (571 / (2488320 * fourN)) + (163879 / (209018880 * fiveN)) +
      (5246819 / (75246796800 * fiveN * n)))
  }

  n--
  x = GAMMA_P[0]
  for (let i = 1; i < GAMMA_P.length; ++i) {
    x += GAMMA_P[i] / (n + i)
  }
  t = n + GAMMA_G + 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x
}

function roundTo(value: number, exp?: number): number {
  if (typeof exp === 'undefined' || +exp === 0) return Math.round(value)
  value = +value
  const e = -(+exp)
  if (isNaN(value) || !(typeof e === 'number' && e % 1 === 0)) return NaN
  let parts = value.toString().split('e')
  value = Math.round(+(parts[0] + 'e' + (parts[1] ? +parts[1] - e : -e)))
  parts = value.toString().split('e')
  return +(parts[0] + 'e' + (parts[1] ? +parts[1] + e : e))
}

// ── Built-in functies (numeriek) ──────────────────────────────────
//
// Een Map zodat opzoeking immuun is voor prototype-vervuiling. Trig/hyperbool/
// log-varianten gebruiken native Math.* (alle aanwezig in de runtime-baseline).
// Resolutie-volgorde in evaluate: eerst scope (WHITELIST_FNS), dan deze tabel.

const BUILTINS: ReadonlyMap<string, (...args: number[]) => number> = new Map<
  string,
  (...args: number[]) => number
>([
  ['sin', Math.sin], ['cos', Math.cos], ['tan', Math.tan],
  ['asin', Math.asin], ['acos', Math.acos], ['atan', Math.atan],
  ['sinh', Math.sinh], ['cosh', Math.cosh], ['tanh', Math.tanh],
  ['asinh', Math.asinh], ['acosh', Math.acosh], ['atanh', Math.atanh],
  ['sqrt', Math.sqrt], ['cbrt', Math.cbrt],
  ['log', Math.log], ['ln', Math.log], ['log2', Math.log2],
  ['lg', Math.log10], ['log10', Math.log10],
  ['expm1', Math.expm1], ['log1p', Math.log1p], ['exp', Math.exp],
  ['abs', Math.abs], ['ceil', Math.ceil], ['floor', Math.floor],
  ['round', Math.round], ['trunc', Math.trunc], ['sign', Math.sign],
  ['min', (...a) => Math.min(...a)], ['max', (...a) => Math.max(...a)],
  ['hypot', (...a) => Math.hypot(...a)], ['pyt', (...a) => Math.hypot(...a)],
  ['pow', Math.pow], ['atan2', Math.atan2],
  ['gamma', gamma], ['fac', (n) => gamma(n + 1)],
  ['roundTo', (v, e) => roundTo(v, e)],
  ['random', (a) => Math.random() * (a || 1)],
  ['if', (cond, a, b) => (cond ? a : b)],
  ['not', (a) => (!a ? 1 : 0)],
])

// ── AST ────────────────────────────────────────────────────────────

type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'var'; name: string }
  | { t: 'unary'; op: string; x: Node }
  | { t: 'binary'; op: string; a: Node; b: Node }
  | { t: 'cond'; cond: Node; yes: Node; no: Node }
  | { t: 'call'; name: string; args: Node[] }

// ── Tokenizer ───────────────────────────────────────────────────────

type TokType = 'num' | 'str' | 'name' | 'op' | 'eof'
interface Token {
  type: TokType
  value: string
  num?: number
}

const WORD_OPS: ReadonlySet<string> = new Set(['and', 'or', 'not'])

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = src.length

  const isDigit = (c: string) => c >= '0' && c <= '9'
  const isIdentStart = (c: string) =>
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
  const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c)

  while (i < n) {
    const c = src[i]

    // whitespace
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') {
      i++
      continue
    }

    // number: 123, 1.5, .5, 1e3, 2.5e-3
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i
      while (j < n && isDigit(src[j])) j++
      if (src[j] === '.') {
        j++
        while (j < n && isDigit(src[j])) j++
      }
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1
        if (src[k] === '+' || src[k] === '-') k++
        if (isDigit(src[k] ?? '')) {
          k++
          while (k < n && isDigit(src[k])) k++
          j = k
        }
      }
      const raw = src.slice(i, j)
      tokens.push({ type: 'num', value: raw, num: Number(raw) })
      i = j
      continue
    }

    // string literal: "…" or '…' with simple escapes
    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      let out = ''
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < n) {
          const e = src[j + 1]
          out +=
            e === 'n' ? '\n' :
            e === 't' ? '\t' :
            e === 'r' ? '\r' :
            e // \\ \" \' \/ → letterlijk
          j += 2
        } else {
          out += src[j]
          j++
        }
      }
      if (j >= n) throw new SyntaxError('Niet-afgesloten string in formule')
      tokens.push({ type: 'str', value: out })
      i = j + 1
      continue
    }

    // identifier / word-operator
    if (isIdentStart(c)) {
      let j = i + 1
      while (j < n && isIdentPart(src[j])) j++
      const word = src.slice(i, j)
      tokens.push(WORD_OPS.has(word) ? { type: 'op', value: word } : { type: 'name', value: word })
      i = j
      continue
    }

    // multi-char operators
    const two = src.slice(i, i + 2)
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
      tokens.push({ type: 'op', value: two })
      i += 2
      continue
    }

    // single-char operators / punctuation
    if ('+-*/%^()?:,<>!'.includes(c)) {
      tokens.push({ type: 'op', value: c })
      i++
      continue
    }

    // `=` los, `&` los, `|` los, etc. → niet ondersteund (geen assignment/concat)
    throw new SyntaxError(`Onverwacht teken '${c}' in formule`)
  }

  tokens.push({ type: 'eof', value: '' })
  return tokens
}

// ── Parser (precedence climbing) ─────────────────────────────────────

// Links-associatieve binaire operators, laag → hoog. `^` (rechts-assoc) en de
// prefix-unary's worden apart afgehandeld in parsePower/parseUnary.
const BINARY_BP: Readonly<Record<string, number>> = {
  '||': 1, or: 1,
  '&&': 2, and: 2,
  '==': 3, '!=': 3,
  '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
}

const PREFIX_OPS: ReadonlySet<string> = new Set(['-', '+', 'not', '!'])

class TokenCursor {
  private pos = 0
  constructor(private readonly tokens: Token[]) {}
  peek(): Token {
    return this.tokens[this.pos]
  }
  next(): Token {
    return this.tokens[this.pos++]
  }
  isOp(value: string): boolean {
    const t = this.tokens[this.pos]
    return t.type === 'op' && t.value === value
  }
  expectOp(value: string): void {
    if (!this.isOp(value)) {
      throw new SyntaxError(`Verwacht '${value}' in formule`)
    }
    this.pos++
  }
}

function parseFormula(src: string): Node {
  const cur = new TokenCursor(tokenize(src))
  const node = parseTernary(cur)
  if (cur.peek().type !== 'eof') {
    throw new SyntaxError('Onverwachte tokens na einde van formule')
  }
  return node
}

function parseTernary(cur: TokenCursor): Node {
  const cond = parseBinary(cur, 0)
  if (cur.isOp('?')) {
    cur.next()
    const yes = parseTernary(cur)
    cur.expectOp(':')
    const no = parseTernary(cur)
    return { t: 'cond', cond, yes, no }
  }
  return cond
}

function parseBinary(cur: TokenCursor, minBP: number): Node {
  let left = parseUnary(cur)
  for (;;) {
    const tok = cur.peek()
    if (tok.type !== 'op') break
    const bp = BINARY_BP[tok.value]
    if (bp === undefined || bp < minBP) break
    cur.next()
    const right = parseBinary(cur, bp + 1) // links-assoc
    left = { t: 'binary', op: tok.value, a: left, b: right }
  }
  return left
}

function parseUnary(cur: TokenCursor): Node {
  const tok = cur.peek()
  if (tok.type === 'op' && PREFIX_OPS.has(tok.value)) {
    cur.next()
    return { t: 'unary', op: tok.value, x: parseUnary(cur) }
  }
  return parsePower(cur)
}

function parsePower(cur: TokenCursor): Node {
  const base = parsePrimary(cur)
  if (cur.isOp('^')) {
    cur.next()
    const exp = parseUnary(cur) // rechts-assoc, staat `2^-3` toe
    return { t: 'binary', op: '^', a: base, b: exp }
  }
  return base
}

function parsePrimary(cur: TokenCursor): Node {
  const tok = cur.next()

  if (tok.type === 'num') return { t: 'num', v: tok.num! }
  if (tok.type === 'str') return { t: 'str', v: tok.value }

  if (tok.type === 'name') {
    if (cur.isOp('(')) {
      cur.next()
      const args: Node[] = []
      if (!cur.isOp(')')) {
        args.push(parseTernary(cur))
        while (cur.isOp(',')) {
          cur.next()
          args.push(parseTernary(cur))
        }
      }
      cur.expectOp(')')
      return { t: 'call', name: tok.value, args }
    }
    return { t: 'var', name: tok.value }
  }

  if (tok.type === 'op' && tok.value === '(') {
    const inner = parseTernary(cur)
    cur.expectOp(')')
    return inner
  }

  throw new SyntaxError(`Onverwacht token '${tok.value || tok.type}' in formule`)
}

// ── Evaluatie ────────────────────────────────────────────────────────

const hasOwn = (obj: Scope, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key)

function evalNode(node: Node, scope: Scope): Value {
  switch (node.t) {
    case 'num':
      return node.v
    case 'str':
      return node.v
    case 'var': {
      // Alleen eigen properties — NOOIT overgeërfd (constructor, __proto__, …).
      if (hasOwn(scope, node.name)) return scope[node.name] as Value
      const c = CONSTS.get(node.name)
      if (c !== undefined) return c
      throw new Error(`undefined variable: ${node.name}`)
    }
    case 'unary': {
      const v = evalNode(node.x, scope)
      switch (node.op) {
        case '-':
          return -(v as number)
        case '+':
          return Number(v)
        case 'not':
        case '!':
          return !v
      }
      throw new Error(`onbekende unaire operator: ${node.op}`)
    }
    case 'cond':
      // Lazy ternair (alleen de gekozen tak wordt geëvalueerd).
      return evalNode(node.cond, scope) ? evalNode(node.yes, scope) : evalNode(node.no, scope)
    case 'binary': {
      const a = evalNode(node.a, scope)
      const b = evalNode(node.b, scope)
      switch (node.op) {
        case '+':
          return (Number(a) + Number(b))
        case '-':
          return (a as number) - (b as number)
        case '*':
          return (a as number) * (b as number)
        case '/':
          return (a as number) / (b as number)
        case '%':
          return (a as number) % (b as number)
        case '^':
          return Math.pow(a as number, b as number)
        case '==':
          return a === b
        case '!=':
          return a !== b
        case '<':
          return (a as number) < (b as number)
        case '<=':
          return (a as number) <= (b as number)
        case '>':
          return (a as number) > (b as number)
        case '>=':
          return (a as number) >= (b as number)
        case '&&':
        case 'and':
          return Boolean(a && b)
        case '||':
        case 'or':
          return Boolean(a || b)
      }
      throw new Error(`onbekende operator: ${node.op}`)
    }
    case 'call': {
      const fn = resolveFn(node.name, scope)
      const argv = node.args.map((arg) => evalNode(arg, scope))
      return fn(...(argv as number[]))
    }
  }
}

function resolveFn(name: string, scope: Scope): (...args: number[]) => Value {
  // Scope eerst (WHITELIST_FNS), dan de vaste built-in tabel. Nooit via de
  // prototype-keten — `hasOwn` voorkomt dat `constructor` e.d. een functie
  // oplevert.
  if (hasOwn(scope, name)) {
    const f = scope[name]
    if (typeof f === 'function') return f as (...args: number[]) => Value
    throw new Error(`${name} is geen functie`)
  }
  const builtin = BUILTINS.get(name)
  if (builtin) return builtin
  throw new Error(`undefined function: ${name}`)
}

function collectNames(node: Node, into: string[], seen: Set<string>): void {
  switch (node.t) {
    case 'var':
      if (!seen.has(node.name)) {
        seen.add(node.name)
        into.push(node.name)
      }
      break
    case 'call':
      if (!seen.has(node.name)) {
        seen.add(node.name)
        into.push(node.name)
      }
      node.args.forEach((a) => collectNames(a, into, seen))
      break
    case 'unary':
      collectNames(node.x, into, seen)
      break
    case 'binary':
      collectNames(node.a, into, seen)
      collectNames(node.b, into, seen)
      break
    case 'cond':
      collectNames(node.cond, into, seen)
      collectNames(node.yes, into, seen)
      collectNames(node.no, into, seen)
      break
    // num / str: geen namen
  }
}

/** Gecompileerde expressie — drop-in voor expr-eval's `Expression`. */
export class Expression {
  private readonly names: string[]

  constructor(private readonly ast: Node) {
    const collected: string[] = []
    collectNames(ast, collected, new Set())
    // Sluit built-in operator/functie/constante-namen uit, net als expr-eval.
    this.names = collected.filter((n) => !EXCLUDED_NAMES.has(n))
  }

  evaluate(scope: Record<string, unknown> = {}): number | boolean | string {
    return evalNode(this.ast, scope)
  }

  variables(_options?: VariablesOptions): string[] {
    return this.names.slice()
  }
}

/** Veilige formule-parser — drop-in voor de subset van expr-eval's `Parser`. */
export class Parser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_options?: ParserOptions) {
    // Opties worden genegeerd: concatenate/assignment/member-access bestaan
    // niet in deze grammatica.
  }

  parse(formula: string): Expression {
    return new Expression(parseFormula(formula))
  }

  static parse(formula: string): Expression {
    return new Expression(parseFormula(formula))
  }
}
