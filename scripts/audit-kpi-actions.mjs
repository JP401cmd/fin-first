#!/usr/bin/env node
/**
 * audit-kpi-actions — checkt of KPI-componenten een gekoppelde actie
 * exposen (href, onClick, button-action). Plan T-2 (Tier-2 #12):
 * "Voor elke getoonde KPI is er een gekoppelde actie? Zo nee,
 * verwijderen of action koppelen."
 *
 * Detectie-heuristic:
 *  - Bestanden in scope-paden (zie SCOPE_PATTERNS) worden gescand
 *  - Een file telt als "KPI-component" wanneer hij minstens één
 *    `tabular-nums`, `font-serif`, of `formatCurrency(`-occurrentie heeft
 *  - Een file telt als "actie-gekoppeld" wanneer hij minstens één
 *    `<Link `, `href={`, `href="`, of `onClick={` heeft
 *  - Tests, .test.tsx-bestanden en index-bestanden worden overgeslagen
 *
 * Output: console-table met file-paden + status. Exit code 1 wanneer er
 * unmatched KPI-componenten zijn (CI-friendly).
 *
 * Run:
 *   node scripts/audit-kpi-actions.mjs
 *
 * Niet ge-CI'd (yet) — handmatig draaien voor periodieke audit.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()

// Scope-patronen — alleen deze paden worden gecontroleerd.
const SCOPE_PATTERNS = [
  'components/overview',
  'components/future',
  'components/mijn',
  'components/widgets',
]

// Bestanden die niet in de audit horen.
const SKIP_PATTERNS = [
  '.test.tsx',
  '.test.ts',
  '/index.tsx',
  '/index.ts',
  'page-info-button',
]

const KPI_PATTERNS = [/tabular-nums/, /font-serif/, /formatCurrency\(/]
const ACTION_PATTERNS = [
  /<Link\b/,
  /href=\{/,
  /href="/,
  /onClick=\{/,
  /onEdit=/,
  /onToggle=/,
  // Interactieve form-controls (slider, dropdown, input) tellen ook als
  // actie — de gebruiker stuurt de visualisatie ermee bij.
  /onChange=\{/,
]

/**
 * Opt-out marker: een component kan zichzelf markeren als bewust
 * info-only via een JSDoc-tag `@audit-kpi-actions skip` in de eerste
 * regels. Bedoeld voor visualisatie-banners (Sankey, geldstroom,
 * kalender) waar de PARENT view de actie biedt.
 */
const SKIP_MARKER = '@audit-kpi-actions skip'

function walk(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      out.push(...walk(full))
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

function shouldSkip(file) {
  return SKIP_PATTERNS.some((p) => file.includes(p))
}

function matches(content, patterns) {
  return patterns.some((p) => p.test(content))
}

function audit() {
  const files = SCOPE_PATTERNS.flatMap((p) => walk(join(ROOT, p)))
  const results = []
  for (const file of files) {
    if (shouldSkip(file)) continue
    let content
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const isKpi = matches(content, KPI_PATTERNS)
    if (!isKpi) continue
    // Skip via opt-out marker — bewust info-only visualisaties.
    if (content.includes(SKIP_MARKER)) continue
    const hasAction = matches(content, ACTION_PATTERNS)
    results.push({
      file: relative(ROOT, file),
      hasAction,
    })
  }
  return results
}

const results = audit()
const unmatched = results.filter((r) => !r.hasAction)
const matched = results.filter((r) => r.hasAction)

console.log('\n── KPI-actie-audit ──────────────────────────────────────')
console.log(`Totaal KPI-componenten gescand: ${results.length}`)
console.log(`  ✓ Met actie-koppeling:  ${matched.length}`)
console.log(`  ✗ Zonder actie-koppeling: ${unmatched.length}`)

if (unmatched.length > 0) {
  console.log('\n── Ontbreekt actie ──────────────────────────────────────')
  for (const r of unmatched) {
    console.log(`  · ${r.file}`)
  }
  console.log(
    '\nPlan T-2: koppel een href/onClick aan elke KPI, of verwijder de KPI.',
  )
}

if (process.argv.includes('--ci') && unmatched.length > 0) {
  process.exit(1)
}
