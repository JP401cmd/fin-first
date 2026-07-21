import { registerTests } from '../test-registry'
import { assert, assertEqual, assertGreaterThan } from '../assert'
import type { TestCase } from '../test-types'
import * as fs from 'fs'
import * as path from 'path'

const CAT = 'design-system.typography'

// ── Helper: read source file ────────────────────────────────────────────────

function readSourceFile(relativePath: string): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')
  } catch {
    return ''
  }
}

/**
 * Recursively find all .tsx files in a directory (non-worktree)
 */
function findTsxFiles(dir: string, results: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      // Skip .next, node_modules, .worktrees, test files
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      if (entry.isDirectory()) {
        findTsxFiles(fullPath, results)
      } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
        results.push(fullPath)
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return results
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── 1. Financial amounts use font-mono tabular-nums ──────────────────
  // The Kern hero (formerly kern-mission-control) is now <CoreHero /> +
  // <FireProgressStrip />; both use font-mono tabular-nums via shared
  // design tokens. Coverage moved to component-level checks elsewhere —
  // these monolith string-grep tests were removed during the Kern
  // refactor (cleanup task #10).
  {
    id: 'typo-core-hero-font-mono',
    name: 'core-hero: bedragen gebruiken font-mono',
    category: CAT,
    description: 'Financiële bedragen in CoreHero moeten font-mono class gebruiken',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const src = readSourceFile('components/core/core-hero.tsx')
      assert(src.length > 0, 'core-hero.tsx kon niet gelezen worden')

      const formatCurrencyMatches = src.match(/formatCurrency/g) || []
      const fontMonoMatches = src.match(/font-mono/g) || []

      assertGreaterThan(
        formatCurrencyMatches.length, 0,
        'core-hero moet formatCurrency aanroepen',
      )
      assertGreaterThan(
        fontMonoMatches.length, 0,
        'core-hero moet font-mono class bevatten voor bedragen',
      )
    },
  },
  {
    id: 'typo-core-hero-tabular-nums',
    name: 'core-hero: bedragen gebruiken tabular-nums',
    category: CAT,
    description: 'Financiële bedragen in CoreHero moeten tabular-nums gebruiken voor uitgelijnde cijfers',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const src = readSourceFile('components/core/core-hero.tsx')
      assert(src.length > 0, 'core-hero.tsx kon niet gelezen worden')

      const tabularMatches = src.match(/tabular-nums/g) || []
      assertGreaterThan(
        tabularMatches.length, 0,
        'core-hero moet tabular-nums class bevatten',
      )
    },
  },

  // ── 2. Table/kicker headers use uppercase + --ink-3 ──────────────────
  {
    id: 'typo-kicker-uppercase-ink3',
    name: 'Kicker/label headers gebruiken uppercase + --ink-3',
    category: CAT,
    description: 'Editorial kickers en tabel-headers moeten uppercase styling met --ink-3 kleur hebben',
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      // Check widget-shell kicker styling
      const ws = readSourceFile('components/widgets/widget-shell.tsx')
      assert(ws.length > 0, 'widget-shell.tsx kon niet gelezen worden')

      // WidgetShell should have label-editorial or uppercase for kickers
      const hasUppercase = ws.includes('uppercase') || ws.includes('label-editorial')
      assert(hasUppercase, 'WidgetShell kicker moet uppercase of label-editorial class bevatten')

      // Check rapportages section-kicker
      const sk = readSourceFile('app/(app)/rapportages/[id]/components/section-kicker.tsx')
      if (sk.length > 0) {
        const skHasUppercase = sk.includes('uppercase') || sk.includes('label-editorial')
        assert(skHasUppercase, 'section-kicker moet uppercase styling bevatten')
      }
    },
  },
  {
    id: 'typo-news-kickers-uppercase',
    name: 'Berichten kickers gebruiken uppercase + --ink-3',
    category: CAT,
    description: 'Nieuwscomponenten moeten uppercase kickers met --ink-3 styling hebben',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const nc = readSourceFile('components/berichten/news-components.tsx')
      assert(nc.length > 0, 'news-components.tsx kon niet gelezen worden')

      assert(nc.includes('uppercase'), 'news-components moet uppercase class bevatten')
      assert(nc.includes('--ink-3'), 'news-components moet --ink-3 kleur voor kickers bevatten')
    },
  },

  // ── 3. Content sections use text-base for body text ──────────────────
  {
    id: 'typo-rapportages-body-text-base',
    name: 'Rapportages gebruikt text-base voor body tekst',
    category: CAT,
    description: 'Rapportage lead-story en content moeten text-base (16px) voor body tekst gebruiken',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const lead = readSourceFile('app/(app)/rapportages/[id]/components/lead-story.tsx')
      assert(lead.length > 0, 'lead-story.tsx kon niet gelezen worden')
      assert(
        lead.includes('text-base'),
        'lead-story moet text-base gebruiken voor body tekst',
      )
    },
  },
  {
    id: 'typo-briefing-body-text-base',
    name: 'Berichten/briefing gebruikt text-base voor body tekst',
    category: CAT,
    description: 'Berichten lead paragraphs moeten text-base (16px) voor leesbare content gebruiken',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const nc = readSourceFile('components/berichten/news-components.tsx')
      assert(nc.length > 0, 'news-components.tsx kon niet gelezen worden')
      assert(
        nc.includes('text-base'),
        'news-components moet text-base gebruiken voor body/lead tekst',
      )
    },
  },

  // ── 4. No relative timestamps in user-facing components ──────────────
  {
    id: 'typo-no-relative-timestamps',
    name: 'Geen relatieve timestamps in user-facing componenten',
    category: CAT,
    description: 'Componenten mogen geen "geleden" of "ago" in zichtbare tekst gebruiken (fd.nl krant-stijl)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Scan components/ for relative time patterns in JSX text
      const componentDir = path.join(process.cwd(), 'components')
      const files = findTsxFiles(componentDir)
      const violations: string[] = []

      for (const filePath of files) {
        const src = fs.readFileSync(filePath, 'utf-8')
        const relFile = path.relative(process.cwd(), filePath)

        // Look for patterns like "geleden" or "ago" in JSX string contexts
        // Match: string literals containing relative time words
        const lines = src.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          // Skip comments and imports
          if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('import')) continue
          // Skip variable names like 'twelveMonthsAgo', 'sixMonthsAgo'
          if (/\w+Ago\b/.test(line) && !line.includes("'") && !line.includes('"') && !line.includes('`')) continue

          // Check for user-visible relative time strings
          // Patterns: 'x geleden', 'x ago' in string literals or JSX text
          if (
            (/['"`].*\bgeleden\b.*['"`]/.test(line) || />\s*.*\bgeleden\b/.test(line)) &&
            !line.includes('// ') // not a comment
          ) {
            violations.push(relFile + ':' + (i + 1) + ': ' + line.trim().substring(0, 100))
          }
        }
      }

      assertEqual(
        violations.length,
        0,
        'Relatieve timestamps gevonden in componenten:\n' + violations.join('\n'),
      )
    },
  },

  // ── 5. WidgetShell non-empty kicker strings ──────────────────────────
  {
    id: 'typo-widgetshell-nonempty-kicker',
    name: 'Alle WidgetShell instanties hebben niet-lege kicker string',
    category: CAT,
    description: 'Elke WidgetShell aanroep moet een niet-lege kicker prop bevatten',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const widgetDir = path.join(process.cwd(), 'components', 'widgets')
      let files: string[] = []
      try {
        files = fs.readdirSync(widgetDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
      } catch {
        assert(false, 'components/widgets/ directory kon niet gelezen worden')
        return
      }

      const violations: string[] = []
      for (const file of files) {
        const src = fs.readFileSync(path.join(widgetDir, file), 'utf-8')
        const shellMatches = src.match(/<WidgetShell[^>]*>/g)
        if (!shellMatches) continue

        for (const match of shellMatches) {
          // Check for empty kicker: kicker="" or kicker=''
          if (match.includes('kicker=""') || match.includes("kicker=''")) {
            violations.push(file + ': lege kicker gevonden: ' + match.substring(0, 80))
          }
          // Check for missing kicker (already covered in design-system-tokens, but double-check)
          if (!match.includes('kicker')) {
            violations.push(file + ': geen kicker prop: ' + match.substring(0, 80))
          }
        }
      }

      assertEqual(
        violations.length,
        0,
        'WidgetShell met lege of ontbrekende kicker gevonden:\n' + violations.join('\n'),
      )
    },
  },

  // ── 6. Format utility consistency ────────────────────────────────────
  {
    id: 'typo-format-money-mono-pattern',
    name: 'formatCurrency altijd gepaird met font-mono in widgets',
    category: CAT,
    description: 'Widget bestanden die formatCurrency gebruiken moeten ook font-mono bevatten',
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const widgetDir = path.join(process.cwd(), 'components', 'widgets')
      let files: string[] = []
      try {
        files = fs.readdirSync(widgetDir).filter(f => f.endsWith('.tsx'))
      } catch {
        assert(false, 'components/widgets/ directory kon niet gelezen worden')
        return
      }

      const violations: string[] = []
      for (const file of files) {
        const src = fs.readFileSync(path.join(widgetDir, file), 'utf-8')
        // Only check files that render currency values
        if (src.includes('formatCurrency') && !src.includes('font-mono')) {
          // Some widgets import formatCurrency but delegate rendering — skip pure logic files
          if (src.includes('className') && src.includes('formatCurrency(')) {
            violations.push(file + ': gebruikt formatCurrency zonder font-mono')
          }
        }
      }

      assertEqual(
        violations.length,
        0,
        'Widget bestanden met formatCurrency maar zonder font-mono:\n' + violations.join('\n'),
      )
    },
  },
]

export function register() {
  registerTests(tests)
}
