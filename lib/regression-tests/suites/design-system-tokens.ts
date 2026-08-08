import { registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThan } from '../assert'
import type { TestCase } from '../test-types'
import { formatTimestamp } from '@/lib/format'
import * as fs from 'fs'
import * as path from 'path'

const CAT = 'design-system.tokens'

// ── Helper: read source file ────────────────────────────────────────────────

function readSourceFile(relativePath: string): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')
  } catch {
    return ''
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── 1. CSS custom properties: semantic change tokens ─────────────────
  {
    id: 'ds-positive-token',
    name: 'globals.css bevat --positive variabele',
    category: CAT,
    description: 'De --positive custom property moet bestaan voor positieve waardeveranderingen (groen)',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const css = readSourceFile('app/globals.css')
      assert(css.length > 0, 'globals.css kon niet gelezen worden')
      assert(css.includes('--positive'), '--positive CSS custom property niet gevonden in globals.css')
    },
  },
  {
    id: 'ds-negative-token',
    name: 'globals.css bevat --negative variabele',
    category: CAT,
    description: 'De --negative custom property moet bestaan voor negatieve waardeveranderingen (rood)',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const css = readSourceFile('app/globals.css')
      assert(css.length > 0, 'globals.css kon niet gelezen worden')
      assert(css.includes('--negative'), '--negative CSS custom property niet gevonden in globals.css')
    },
  },
  {
    id: 'ds-neutral-change-token',
    name: 'globals.css bevat --neutral-change variabele',
    category: CAT,
    description: 'De --neutral-change custom property moet bestaan voor neutrale waardeveranderingen',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const css = readSourceFile('app/globals.css')
      assert(css.length > 0, 'globals.css kon niet gelezen worden')
      assert(css.includes('--neutral-change'), '--neutral-change CSS custom property niet gevonden in globals.css')
    },
  },

  // ── 2. CSS keyframes: flash animations ───────────────────────────────
  {
    id: 'ds-flash-up-keyframes',
    name: 'globals.css bevat @keyframes flash-up',
    category: CAT,
    description: 'flash-up animatie moet bestaan voor positieve waardeveranderingen',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const css = readSourceFile('app/globals.css')
      assert(css.length > 0, 'globals.css kon niet gelezen worden')
      assert(css.includes('@keyframes flash-up'), '@keyframes flash-up niet gevonden in globals.css')
    },
  },
  {
    id: 'ds-flash-down-keyframes',
    name: 'globals.css bevat @keyframes flash-down',
    category: CAT,
    description: 'flash-down animatie moet bestaan voor negatieve waardeveranderingen',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const css = readSourceFile('app/globals.css')
      assert(css.length > 0, 'globals.css kon niet gelezen worden')
      assert(css.includes('@keyframes flash-down'), '@keyframes flash-down niet gevonden in globals.css')
    },
  },

  // ── 3. SectionDivider component ──────────────────────────────────────
  {
    id: 'ds-section-divider-exists',
    name: 'SectionDivider component bestaat in components/app/',
    category: CAT,
    description: 'SectionDivider met line en asterisk varianten moet bestaan',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const src = readSourceFile('components/app/section-divider.tsx')
      assert(src.length > 0, 'components/app/section-divider.tsx niet gevonden')
      assert(src.includes('SectionDivider'), 'SectionDivider export ontbreekt')
    },
  },
  {
    id: 'ds-section-divider-line-variant',
    name: 'SectionDivider heeft line variant',
    category: CAT,
    description: 'SectionDivider ondersteunt variant="line" (standaard horizontale lijn)',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const src = readSourceFile('components/app/section-divider.tsx')
      assert(src.includes("'line'"), "SectionDivider mist 'line' variant")
      // line variant renders an <hr>
      assert(src.includes('<hr'), 'SectionDivider line variant moet een <hr> renderen')
    },
  },
  {
    id: 'ds-section-divider-asterisk-variant',
    name: 'SectionDivider heeft asterisk variant',
    category: CAT,
    description: 'SectionDivider ondersteunt variant="asterisk" (editorial * * * scheiding)',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const src = readSourceFile('components/app/section-divider.tsx')
      assert(src.includes("'asterisk'"), "SectionDivider mist 'asterisk' variant")
      // asterisk variant renders * characters
      assert(src.includes('*'), 'SectionDivider asterisk variant moet * tekens bevatten')
    },
  },

  // ── 4. formatTimestamp utility ────────────────────────────────────────
  {
    id: 'ds-format-timestamp-exists',
    name: 'formatTimestamp functie bestaat in lib/format.ts',
    category: CAT,
    description: 'formatTimestamp moet ge-exporteerd zijn vanuit lib/format',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      assertNotNull(formatTimestamp, 'formatTimestamp export ontbreekt')
      assertEqual(typeof formatTimestamp, 'function', 'formatTimestamp moet een functie zijn')
    },
  },
  {
    id: 'ds-format-timestamp-today-hhmm',
    name: 'formatTimestamp vandaag retourneert HH:mm (geen relatieve tijd)',
    category: CAT,
    description: 'Timestamps van vandaag moeten in HH:mm formaat zijn, niet "x uur geleden"',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const now = new Date(2026, 2, 20, 14, 30, 0) // 20 maart 2026 14:30
      const twoHoursAgo = new Date(2026, 2, 20, 12, 0, 0) // zelfde dag 12:00
      const result = formatTimestamp(twoHoursAgo, now)

      // Must be HH:mm format
      assert(/^\d{2}:\d{2}$/.test(result), `Verwacht HH:mm formaat, kreeg: "${result}"`)
      assertEqual(result, '12:00', 'Vandaag 12:00 moet "12:00" opleveren')

      // Must NOT contain relative time words
      assert(!result.includes('geleden'), 'Mag geen "geleden" bevatten (relatieve tijd)')
      assert(!result.includes('uur'), 'Mag geen "uur" bevatten (relatieve tijd)')
      assert(!result.includes('minuten'), 'Mag geen "minuten" bevatten (relatieve tijd)')
    },
  },
  {
    id: 'ds-format-timestamp-no-relative',
    name: 'formatTimestamp retourneert nooit relatieve tijd',
    category: CAT,
    description: 'Geen enkel timestamp mag "x uur/minuten geleden" formaat gebruiken',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const now = new Date(2026, 2, 20, 14, 30, 0)
      const cases = [
        new Date(2026, 2, 20, 14, 25, 0),  // 5 min geleden
        new Date(2026, 2, 20, 10, 0, 0),   // 4.5 uur geleden
        new Date(2026, 2, 19, 14, 30, 0),  // gisteren
        new Date(2026, 2, 15, 14, 30, 0),  // 5 dagen geleden
        new Date(2026, 1, 20, 14, 30, 0),  // vorige maand
        new Date(2025, 2, 20, 14, 30, 0),  // vorig jaar
      ]
      for (const c of cases) {
        const result = formatTimestamp(c, now)
        assert(!result.includes('geleden'), `"${result}" bevat "geleden" voor ${c.toISOString()}`)
        assert(!result.includes('ago'), `"${result}" bevat "ago" voor ${c.toISOString()}`)
        assert(!result.includes('minuten'), `"${result}" bevat "minuten" voor ${c.toISOString()}`)
      }
    },
  },

  // ── 5. Active nav-tab background tint ────────────────────────────────
  {
    id: 'ds-active-nav-bg-tint',
    name: 'Actieve nav-tab heeft achtergrondtint (bg-*-50/40)',
    category: CAT,
    // app-header.tsx bestaat niet meer — de nav is verplaatst naar
    // components/app/shell/bottom-nav-tabs.tsx (mobiele tabbar) +
    // nav-menu-sheet.tsx (zie CLAUDE.md-vermelding in de opdracht die deze
    // suite herstelde). bottom-nav-tabs.tsx draagt dezelfde bg-*-50/40 tint.
    description: 'bottom-nav-tabs.tsx activeClasses bevat bg-[module]-50/40 achtergrondkleur op actieve tab',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const src = readSourceFile('components/app/shell/bottom-nav-tabs.tsx')
      assert(src.length > 0, 'bottom-nav-tabs.tsx kon niet gelezen worden')

      // Verify each module has a bg-*-50/40 class in activeClasses
      assert(src.includes('bg-kern-50/40'), 'Actieve kern-tab mist bg-kern-50/40 achtergrond')
      assert(src.includes('bg-wil-50/40'), 'Actieve wil-tab mist bg-wil-50/40 achtergrond')
      assert(src.includes('bg-horizon-50/40'), 'Actieve horizon-tab mist bg-horizon-50/40 achtergrond')
    },
  },

  // ── 6. WidgetShell kicker prop ───────────────────────────────────────
  {
    id: 'ds-widgetshell-kicker-required',
    name: 'WidgetShell heeft kicker als verplichte prop',
    category: CAT,
    description: 'WidgetShell interface moet kicker: string bevatten (niet optioneel)',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const src = readSourceFile('components/widgets/widget-shell.tsx')
      assert(src.length > 0, 'widget-shell.tsx kon niet gelezen worden')

      // Check that kicker is defined as a required prop (no ? after it)
      assert(src.includes('kicker'), 'WidgetShell mist kicker prop definitie')
      // Verify it's typed as string, not optional
      assert(
        src.includes('kicker: string') || src.includes('kicker:string'),
        'kicker moet als verplichte string prop gedefinieerd zijn',
      )
      // Should NOT be optional (kicker?: string)
      assert(
        !src.includes('kicker?: string') && !src.includes('kicker?:string'),
        'kicker mag NIET optioneel zijn (? verwijderen)',
      )
    },
  },
  {
    id: 'ds-widgetshell-all-instances-have-kicker',
    name: 'Alle WidgetShell instanties in widget-renderer hebben kicker',
    category: CAT,
    description: 'Elke <WidgetShell> aanroep in widget bestanden moet een kicker prop bevatten',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Check all widget files for WidgetShell usage
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
        // Find all <WidgetShell occurrences
        const shellMatches = src.match(/<WidgetShell[^>]*>/g)
        if (!shellMatches) continue

        for (const match of shellMatches) {
          if (!match.includes('kicker')) {
            violations.push(`${file}: ${match.substring(0, 80)}`)
          }
        }
      }

      assertEqual(
        violations.length,
        0,
        `WidgetShell zonder kicker gevonden:\n${violations.join('\n')}`,
      )
    },
  },
]

export function register() {
  registerTests(tests)
}
