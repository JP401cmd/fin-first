#!/usr/bin/env node
/**
 * check-tap-targets — lint-gate voor de 44×44-raakdrempel (bevinding M19).
 *
 * De ui-ux-skill schrijft al lang voor: "Tap-target minimaal 44×44px, minimaal
 * 8px spatie ertussen." Er stond alleen nooit iets tegenover. Het onafhankelijke
 * UX-testpanel mat op mobiel zeven icoonknoppen eronder, in VIER verschillende
 * ad-hoc maten (20×20, 24×24, 32×32, 36×36) — inclusief een bewust gebouwde
 * "gedeelde" IconButton die de maat zelf verkeerd inschatte. Een regel zonder
 * gate is een suggestie.
 *
 * De regel: een interactief element (`<button>` / `<Link>` / `<a>`) dat zijn
 * doos vastzet op een KLEINE hoogte én breedte (< 44px, dus `h-10`/`w-10` of
 * kleiner, of een expliciete `h-[Npx]` onder 44) moet aantoonbaar een
 * raakgebied van 44×44 hebben. Aantoonbaar = een van deze markers in dezelfde
 * openings-tag:
 *
 *   - `touch-target`            (de utility in app/globals.css — reserveert 44×44)
 *   - `min-h-[44px]` / `min-h-11` / `min-w-[44px]` / `min-w-11`
 *   - `TapTarget` / `tapTargetClass` / `TAP_TARGET_*`
 *     (components/editorial/tap-target.tsx — de gedeelde primitive)
 *
 * Variant-geprefixte maten tellen NIET als bewijs: `md:h-11` maakt de knop
 * alleen op desktop groot, terwijl tap-precisie juist een mobiel probleem is.
 * Precies die omgekeerde responsive-richting stond in `privacy-toggle.tsx`.
 *
 * Exit 0 = geen nieuwe overtredingen. Exit 1 = nieuw en buiten de allowlist.
 * Draai met `--list` om de huidige stand te zien zonder exit-code.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git'])

/** De primitive zelf mag over raakgebieden praten zonder er zelf een te zijn. */
const INFRASTRUCTURE = new Set(['components/editorial/tap-target.tsx'])

/**
 * ── Grandfather-allowlist ────────────────────────────────────────────────────
 * Bevroren op de stand van 28 aug 2026, ná de M19-fixes. Deze lijst mag alleen
 * KRIMPEN: een bestand dat zijn icoonknoppen op de primitive heeft gezet hoort
 * hier weg. Iets toevoegen is precies de overtreding die deze gate hoort te
 * vangen — doe dat niet zonder expliciete motivering in de PR.
 *
 * Twee categorieën staan er BEWUST op, vastgelegd in de ui-ux-skill:
 *  - de pagina-header-controls (`page-info-button.tsx`, `insight-toggle-button.tsx`,
 *    `page-status-dot.tsx`) op 28×28 — besluit eigenaar 26-08-2026;
 *  - de mobiele TopBar-utility-cluster op 36px breed (verticaal wél 44).
 */
const ALLOWLIST_ENTRIES = [
  'app/(app)/beheer/aow-leeftijd/page.tsx',
  'app/(app)/beheer/briefing/page.tsx',
  'app/(app)/beheer/fiscale-kerngetallen/fire-assumptions-editor.tsx',
  'app/(app)/beheer/testdata/page.tsx',
  'app/(app)/beheer/widget-presets/page.tsx',
  'app/(app)/core/belasting/page.tsx',
  'app/(app)/mijn/notificaties/page.tsx',
  'components/aangifte/manual-wizard.tsx',
  'components/aangifte/review-primitives.tsx',
  'components/app/action-card.tsx',
  'components/app/budget-detail-pane.tsx',
  'components/app/budget-form.tsx',
  'components/app/budget-icon-picker.tsx',
  'components/app/budget-plan-editor-sheet.tsx',
  'components/app/budget-tree.tsx',
  'components/app/budgets-client.tsx',
  'components/app/cash-account-view.tsx',
  'components/app/categorize-row.tsx',
  'components/app/core/assets/asset-pane.tsx',
  'components/app/core/debts/debt-pane.tsx',
  'components/app/goal-form.tsx',
  'components/app/horizon/deficit-notice-provider.tsx',
  'components/app/horizon/event-chat-pane.tsx',
  'components/app/horizon/event-pane-edit.tsx',
  'components/app/horizon/horizon-year-details-sheet.tsx',
  'components/app/horizon/phase-analysis/onttrekken/huis-verkopen.tsx',
  'components/app/horizon/phase-analysis/opbouw/hypotheek-vs-beleggen-opbouw.tsx',
  'components/app/horizon/toekomst-overlay.tsx',
  'components/app/horizon/toekomst-welcome.tsx',
  'components/app/horizon/whatif-chat.tsx',
  'components/app/horizon/whatif-events.tsx',
  'components/app/horizon/whatif-scenarios.tsx',
  'components/app/horizon/whatif-suggestion-cards.tsx',
  'components/app/household-fire-section.tsx',
  'components/app/milestone-celebration.tsx',
  'components/app/own-accounts-sheet.tsx',
  'components/app/page-status-dot.tsx',
  'components/app/perspective-switcher.tsx',
  'components/app/shell/euro-view-badge.tsx',
  'components/app/shell/sidebar.tsx',
  'components/app/sleepmodus/sleepmodus-bollen.tsx',
  'components/command-palette/command-palette.tsx',
  'components/core/category-history-chart.tsx',
  'components/core/deepenings/crypto-holdings/crypto-holding-pane.tsx',
  'components/core/deepenings/hypotheekplanner/waardestijging-slider.tsx',
  'components/core/deepenings/verhuurrendement/box3-comparison.tsx',
  'components/core/holdings/investment-holding-pane.tsx',
  'components/core/vermogen-card-action-button.tsx',
  'components/editorial/chart-tips.tsx',
  'components/editorial/info-icon-tooltip.tsx',
  'components/editorial/inline-info-disclosure.tsx',
  'components/editorial/insight-toggle-button.tsx',
  'components/editorial/page-info-button.tsx',
  'components/future/doelen-view.tsx',
  'components/future/rekenhulp-view.tsx',
  'components/future/report-sheet.tsx',
  'components/future/scenario-bibliotheek.tsx',
  'components/holdings/holding-favorite-button.tsx',
  'components/landing/header.tsx',
  'components/onboarding/onboarding-horizon.tsx',
  'components/overview/checkin-banner.tsx',
  'components/overview/compound-insight-card.tsx',
  'components/overview/fee-impact-card.tsx',
  'components/overview/hero-widget-rail.tsx',
  'components/overview/inflation-impact-card.tsx',
  'components/overview/leverage-card.tsx',
  'components/overview/print-overzicht-button.tsx',
  'components/overview/transacties/bulk/bulk-resultaten.tsx',
  'components/overview/transacties/bulk/bulk-uitkomst.tsx',
  'components/overview/transacties/spend-limits-section.tsx',
  'components/overview/transacties/transactie-tijdlijn.tsx',
  'components/overview/welcome-guide-banner.tsx',
  'components/sync/global-sync-button.tsx',
  'components/widgets/draggable-widget-grid.tsx',
]

const ALLOWLIST = new Set(ALLOWLIST_ENTRIES)

// ── Scan ────────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(name) && !/\.(test|spec)\.tsx$/.test(name)) out.push(full)
  }
  return out
}

/**
 * Haal de openings-tags van interactieve elementen op. Bewust een kleine
 * bracket-/quote-bewuste scanner in plaats van één regex: JSX-attributen
 * bevatten `=>` en generics, dus `<button[^>]*>` knipt op de verkeerde plek.
 */
function findInteractiveTags(src) {
  const tags = []
  const re = /<(button|Link|a)(?=[\s/>])/g
  let m
  while ((m = re.exec(src))) {
    const start = m.index
    let i = re.lastIndex
    let depth = 0
    let quote = null
    while (i < src.length) {
      const c = src[i]
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = null
      } else if (c === '"' || c === "'" || c === '`') {
        quote = c
      } else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
      i++
    }
    tags.push({ text: src.slice(start, i + 1), start })
  }
  return tags
}

/** Ongeprefixte `h-`/`w-`-tokens in px. `md:h-11` en `min-h-[44px]` tellen niet mee. */
function boxSizes(text, axis) {
  const re = new RegExp(`(?<![\\w:-])${axis}-(\\[(\\d+)px\\]|\\d+(?:\\.\\d+)?)(?![\\w.-])`, 'g')
  const out = []
  let m
  while ((m = re.exec(text))) {
    if (m[2]) out.push(Number(m[2]))
    else if (/^\d/.test(m[1])) out.push(Number(m[1]) * 4)
  }
  return out
}

const PROOF =
  /touch-target|min-h-\[44px\]|min-w-\[44px\]|(?<![\w:-])min-[hw]-11(?![\w.-])|TapTarget|tapTargetClass|TAP_TARGET_/

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
const offenders = new Map() // rel -> [{line, snippet}]

for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (INFRASTRUCTURE.has(rel)) continue
  const src = readFileSync(file, 'utf8')

  for (const tag of findInteractiveTags(src)) {
    if (PROOF.test(tag.text)) continue
    const hs = boxSizes(tag.text, 'h')
    const ws = boxSizes(tag.text, 'w')
    if (hs.length === 0 || ws.length === 0) continue
    const h = Math.min(...hs)
    const w = Math.min(...ws)
    if (h >= 44 || w >= 44) continue
    const line = src.slice(0, tag.start).split('\n').length
    const list = offenders.get(rel) ?? []
    list.push({ line, size: `${w}×${h}` })
    offenders.set(rel, list)
  }
}

const known = [...offenders.keys()].sort()

if (process.argv.includes('--list')) {
  console.log(`Bestanden met een icoonknop onder 44×44: ${known.length}`)
  console.log('')
  if (process.argv.includes('--detail')) {
    for (const f of known) {
      console.log(`${f} — ${offenders.get(f).map((o) => `r.${o.line} (${o.size})`).join(', ')}`)
    }
    process.exit(0)
  }
  console.log(JSON.stringify(known, null, 2))
  process.exit(0)
}

const violations = known.filter((f) => !ALLOWLIST.has(f))
const stale = [...ALLOWLIST].filter((a) => !known.includes(a)).sort()

if (stale.length > 0) {
  console.log('ℹ  Allowlist-entries die de 44×44-norm inmiddels halen (mag opgeruimd):')
  console.log(stale.map((s) => `   - ${s}`).join('\n'))
  console.log('')
}

if (violations.length > 0) {
  console.error('✗ Raakdrempel (M19): nieuw bedieningselement kleiner dan 44×44.')
  console.error('')
  for (const v of violations) {
    const where = offenders.get(v).map((o) => `r.${o.line} (${o.size})`).join(', ')
    console.error(`   ${v} — ${where}`)
  }
  console.error('')
  console.error('Houd het icoon klein maar geef het raakgebied 44×44 mee — dat hoeft geen')
  console.error('visuele ruimte te kosten. Gebruik `<TapTarget>` of `tapTargetClass()` uit')
  console.error('components/editorial/tap-target.tsx:')
  console.error('   hit="reserve"       → element wordt zelf 44×44 (waar ruimte is)')
  console.error('   hit="extend"        → raakgebied groeit via ::after, layout blijft gelijk')
  console.error('   hit="extend-block"  → alleen verticaal, voor dichte horizontale balken')
  console.error('Let bij "extend" op de steek: breedte + gap moet ≥44px zijn, anders overlappen')
  console.error('de raakgebieden van buren elkaar. Zie .claude/skills/ui-ux/quality-checklist.md.')
  process.exit(1)
}

console.log(
  `✓ Raakdrempel: ${known.length} bekende afwijkingen op de allowlist, 0 nieuwe.`,
)
process.exit(0)
