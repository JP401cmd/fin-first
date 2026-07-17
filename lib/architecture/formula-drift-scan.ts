// ── Formule-drift guardrail — hardcoded-constante scan ──────────────────
//
// Vangrail tegen "eigen sommen" (Arch F2, architectuurreview 3 jul 2026,
// bevinding #22, klasse 3). CLAUDE.md "Consume, don't recompute" verbiedt
// hardcoded financiële constanten buiten lib/constants.ts / lib/box3-data.ts:
// een lokale `0.04` (safe-withdrawal-rate / 4%-vermogensnorm) of een Box 3-
// forfaitpercentage in een component of API-route is per definitie toekomstige
// drift — het schaduwt de canonieke constante en loopt uit de pas zodra die
// verandert. De eenduidige-gegevens-audit vond precies deze overtredingsvorm.
//
// Waarom een SCAN-TEST en geen ESLint-`no-restricted-syntax` (zoals klasse 1
// en 2)? Een kále literal-selector op `0.04` is te grof: dat getal staat
// legitiem in opacity, animatie-stagger, chart-geometrie en heatmap-drempels
// (~20 zulke plekken in components/). We matchen daarom alleen de twee
// SIGNATUREN die vrijwel uitsluitend een financiële constante bedoelen:
//   • DELING door literal 0.04 — de klassieke `jaaruitgaven / 0.04`-recompute
//     van het FIRE-doel (25×-regel) i.p.v. NL_SWR/effectiveSwr te consumeren;
//   • een Box 3-FORFAITPERCENTAGE als bare literal (0.0137/0.0588/…): 4-cijferig
//     en distinctief, hoort uitsluitend in lib/box3-data.ts.
// Beide hebben nul huidige treffers in app/api+components → de scanner is groen
// zonder suppressions. Dit volgt het bewezen huis-idioom van
// lib/ai/ai-callsite-scan.ts (ADR 0035): een gerichte scanner met een
// gemotiveerde allowlist. De test staat bewust onder lib/architecture/ zodat
// hij automatisch binnen de bestaande CI-vitest-glob valt (ci.yml).
//
// Scope gescand: app/api/** en components/** (.ts/.tsx, excl. *.test.*). De
// engines in lib/ vallen buiten scope — dáár HOREN de constanten.

import * as fs from 'fs'
import * as path from 'path'

/**
 * De canonieke financiële tarief-constanten die NIET als kale literal in
 * app/api of components mogen staan. `value` is de exact-geschreven vorm zoals
 * die in de bron (lib/constants.ts / lib/box3-data.ts) voorkomt; de scanner
 * matcht 'm als losstaand JS-getal (niet als deel van een langer getal).
 */
/**
 * Matchvorm van een constante:
 *  • 'division' — alleen als DELER (`… / 0.04`); een bare 0.04 (opacity/animatie)
 *    valt bewust NIET, alleen de SWR-recompute-signatuur.
 *  • 'literal'  — als losstaand getal (distinctieve, ondubbelzinnige waarde).
 */
export type LiteralMode = 'division' | 'literal'

export interface CanonicalRateLiteral {
  /** Exact-geschreven getal, bv. "0.04". */
  value: string
  /** Matchvorm (zie LiteralMode). */
  mode: LiteralMode
  /** Wat het getal betekent (voor de foutmelding). */
  label: string
  /** Waar de canonieke bron staat. */
  canonical: string
}

export const CANONICAL_RATE_LITERALS: CanonicalRateLiteral[] = [
  { value: '0.04', mode: 'division', label: 'FIRE-doel via safe-withdrawal-rate (25×-regel)', canonical: 'NL_SWR/effectiveSwr — consumeer uit de bundel of lib/constants.ts' },
  { value: '0.0137', mode: 'literal', label: 'Box 3 forfait spaargeld', canonical: 'lib/box3-data.ts' },
  { value: '0.0588', mode: 'literal', label: 'Box 3 forfait beleggingen', canonical: 'lib/box3-data.ts' },
  { value: '0.0270', mode: 'literal', label: 'Box 3 forfait schulden', canonical: 'lib/box3-data.ts' },
  { value: '0.0128', mode: 'literal', label: 'Box 3 forfait spaargeld', canonical: 'lib/box3-data.ts' },
  { value: '0.0600', mode: 'literal', label: 'Box 3 forfait beleggingen', canonical: 'lib/box3-data.ts' },
]

export interface RateAllowlistEntry {
  /** Repo-relatief pad, forward slashes. */
  file: string
  /** De literal-waarde die in dit bestand is toegestaan. */
  value: string
  /** Waarom deze literal hier legitiem is (of bewust wordt uitgesteld). */
  reason: string
}

/**
 * Gemotiveerde allowlist. Elke regel = één literal in één bestand die géén
 * drift is (of bewust wordt uitgesteld tot een F4-constant-extractie). Kort en
 * onderbouwd houden — een regel toevoegen is een bewuste beslissing.
 */
export const RATE_LITERAL_ALLOWLIST: RateAllowlistEntry[] = [
  // Nog geen uitzonderingen nodig: beide signaturen (deling-door-0.04 en
  // Box 3-forfaitliterals) hebben nul treffers in de huidige app/api+components.
  // De `woz * 0.04` "jaarlijkse huurnorm" in event-pane-view.tsx is
  // VERMENIGVULDIGING (geen deler) → valt terecht buiten de SWR-signatuur en
  // hoeft dus niet ge-allowlist te worden.
]

/**
 * Verwijder comment-inhoud maar behoud de regelstructuur (newlines), zodat
 * regelnummers kloppen. Block-comments worden met spaties opgevuld; line-
 * comments verdwijnen. Best-effort (kan een `//` in een string strippen) — dat
 * is onschadelijk omdat we alleen getal-literals detecteren.
 */
export function stripComments(source: string): string {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return noBlock.replace(/\/\/[^\n]*/g, '')
}

export interface RateLiteralHit {
  value: string
  label: string
  canonical: string
  /** 1-indexed regelnummer. */
  line: number
}

/**
 * Bouw de match-regex per constante. 'literal' matcht `value` als losstaand
 * getal (niet als deel van een langer getal). 'division' matcht `value` alleen
 * als deler: een `/` gevolgd door optionele whitespace en dan de waarde.
 */
function matchRegex(c: CanonicalRateLiteral): RegExp {
  const esc = c.value.replace(/[.]/g, '\\.')
  if (c.mode === 'division') {
    return new RegExp(`/\\s*${esc}(?![\\d.])`)
  }
  return new RegExp(`(?<![\\d.])${esc}(?![\\d])`)
}

/**
 * Vind elke hardcoded canonieke tarief-literal in `source` (comments worden
 * genegeerd). Pure functie — de basis voor zowel de tree-scan als de unit-test.
 */
export function findRateLiterals(source: string): RateLiteralHit[] {
  const stripped = stripComments(source)
  const lines = stripped.split('\n')
  const hits: RateLiteralHit[] = []
  const patterns = CANONICAL_RATE_LITERALS.map((c) => ({ c, re: matchRegex(c) }))
  lines.forEach((lineText, i) => {
    for (const { c, re } of patterns) {
      if (re.test(lineText)) {
        hits.push({ value: c.value, label: c.label, canonical: c.canonical, line: i + 1 })
      }
    }
  })
  return hits
}

function walk(dir: string, onFile: (absPath: string) => void): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(abs, onFile)
    } else if (entry.isFile()) {
      onFile(abs)
    }
  }
}

/** Verzamel elk in-scope bestandspad (absoluut), gede-dupliceerd. */
export function collectScannedFiles(root: string = process.cwd()): string[] {
  const files = new Set<string>()
  const inScope = (fp: string) =>
    (fp.endsWith('.ts') || fp.endsWith('.tsx')) && !fp.endsWith('.test.ts') && !fp.endsWith('.test.tsx')
  walk(path.join(root, 'app', 'api'), (fp) => {
    if (inScope(fp)) files.add(fp)
  })
  walk(path.join(root, 'components'), (fp) => {
    if (inScope(fp)) files.add(fp)
  })
  return [...files]
}

export interface RateLiteralViolation extends RateLiteralHit {
  /** Repo-relatief pad van het overtredende bestand. */
  file: string
}

/**
 * Scan alle in-scope bestanden en geef elke hardcoded canonieke tarief-literal
 * die niet op de allowlist staat. Lege array = de "consume, don't recompute"-
 * regel houdt stand voor deze constanten.
 */
export function scanFormulaDrift(root: string = process.cwd()): RateLiteralViolation[] {
  const allow = new Set(RATE_LITERAL_ALLOWLIST.map((e) => `${e.file}::${e.value}`))
  const violations: RateLiteralViolation[] = []

  for (const abs of collectScannedFiles(root)) {
    let src: string
    try {
      src = fs.readFileSync(abs, 'utf-8')
    } catch {
      continue
    }
    const rel = path.relative(root, abs).split(path.sep).join('/')
    for (const hit of findRateLiterals(src)) {
      if (allow.has(`${rel}::${hit.value}`)) continue
      violations.push({ file: rel, ...hit })
    }
  }

  return violations
}
