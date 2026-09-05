#!/usr/bin/env node
/**
 * check-overlay-standard — lint-gate voor de ShellOverlay-driewegregel (ADR 0039).
 *
 * CLAUDE.md schrijft al jaren voor: "Nieuwe overlays lopen verplicht via
 * `<ShellOverlay>` (kind pane/sheet/confirm) — niet direct `BottomSheet`/
 * `SlideInPane` en geen hand-rolled `fixed inset-0`." Er stond alleen nooit iets
 * tegenover. Resultaat op het moment dat deze gate werd geschreven: 59 bestanden
 * via `<ShellOverlay>`, 64 met een DIRECTE `<BottomSheet>` en 20 handgerolde
 * overlays. Een regel zonder gate is een suggestie.
 *
 * Drie regels:
 *
 *  1. DIRECTE BOTTOMSHEET/SLIDEINPANE (allowlistbaar). Een bestand dat
 *     `BottomSheet` of `SlideInPane` rechtstreeks importeert i.p.v.
 *     `ShellOverlay`. De bestaande consumenten staan op de grandfather-
 *     ALLOWLIST; alleen NIEUWE blokkeren.
 *
 *  2. HANDGEROLDE OVERLAY (allowlistbaar). Een `'use client'`-bestand met een
 *     eigen full-screen laag (`fixed inset-0` + een z-index-klasse). Die mist
 *     per definitie de focus-trap, scroll-lock, het overlay-signaal voor de
 *     nav-pill, het swipe-gebaar en sinds deze ronde ook de pull-to-refresh-
 *     onderdrukking en de back-knop-integratie.
 *
 *  3. SCRIM-TOKEN (NIET allowlistbaar). Een overlay-laag (`fixed`/`absolute
 *     inset-0`) die zijn scrim met een rauwe kleur zet (`bg-black/40`,
 *     `bg-[var(--ink)]/30`, `rgba(0,0,0,…)`) i.p.v. `var(--scrim)`. Deze regel
 *     staat bewust LOS van de allowlist: de allowlist grandfathert een BESTAND,
 *     terwijl dit over één className gaat. Er liepen zeven verschillende scrims
 *     rond; ze zijn allemaal met de hand gevonden, precies omdat de compiler
 *     `bg-black/30` en `bg-black/50` even goed vindt.
 *
 * Exit 0 = geen nieuwe overtredingen. Exit 1 = nieuw en buiten de allowlist.
 *
 * Draai met `--list` om de huidige stand te zien zonder exit-code.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'components', 'lib']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git'])

/**
 * De overlay-infrastructuur zelf. Deze bestanden MOGEN BottomSheet/SlideInPane
 * gebruiken en een eigen laag renderen — zij zíjn de standaard.
 */
const INFRASTRUCTURE = new Set([
  'components/app/bottom-sheet.tsx',
  'components/app/shell/shell-overlay.tsx',
  'components/app/shell/slide-in-pane.tsx',
])

/**
 * Regel 3 kent één gedocumenteerde uitzondering: `toekomst-overlay.tsx` legt
 * geen modale scrim maar een gedeeltelijke vervaag-band over de bovenkant van
 * de pagina (`--ink`/15 + blur) als onderdeel van de immersieve Toekomst-modus.
 * Dat is een visueel effect, geen "de pagina donker achter een modal".
 */
const SCRIM_RULE_EXEMPT = new Set([
  'components/app/horizon/toekomst-overlay.tsx',
])

/**
 * ── Grandfather-allowlist (regels 1 en 2) ────────────────────────────────────
 * Bevroren op de stand van 26 aug 2026. Deze lijst mag alleen KRIMPEN: een
 * bestand dat naar `<ShellOverlay>` is omgebouwd hoort hier weg. Iets toevoegen
 * is precies de overtreding die deze gate hoort te vangen — doe dat niet zonder
 * expliciete motivering in de PR.
 */
const ALLOWLIST_ENTRIES = [
  'app/(app)/beheer/aow-leeftijd/page.tsx',
  'app/(app)/beheer/blueprints/_components/previews-4-7.tsx',
  'app/(app)/beheer/fiscale-kerngetallen/fire-assumptions-editor.tsx',
  'app/(app)/beheer/testdata/page.tsx',
  'app/(app)/beheer/uat/uat-plaat-client.tsx',
  'app/(app)/beheer/vragenlijsten/page.tsx',
  'app/(app)/horizon/whatif/whatif-page-client.tsx',
  'app/(app)/rapportages/benchmark/components/metric-detail-sheet.tsx',
  'components/app/account-form-modal.tsx',
  'components/app/action-edit-modal.tsx',
  'components/app/action-list-modal.tsx',
  'components/app/ai-categorize-sheet.tsx',
  'components/app/ai-vaste-kosten-sheet.tsx',
  'components/app/beheer/mobile-preview-frame.tsx',
  'components/app/budget-koppel-nudge.tsx',
  'components/app/budget-merge-wizard.tsx',
  'components/app/budget-plan-editor-sheet.tsx',
  'components/app/cash-account-view.tsx',
  'components/app/cash-overview.tsx',
  'components/app/category-rules-sheet.tsx',
  'components/app/chat/chat-panel.tsx',
  'components/app/core/box3-partner-modal.tsx',
  'components/app/core/debts/hypotheek-vs-beleggen-modal.tsx',
  'components/app/envelope-transfer-sheet.tsx',
  'components/app/export-dropdown.tsx',
  'components/app/fin/nibud-benchmark.tsx',
  'components/app/freedom-days-animation.tsx',
  'components/app/horizon/doel-vastleg-sheet.tsx',
  'components/app/horizon/health-score-receipt.tsx',
  'components/app/horizon/horizon-client.tsx',
  'components/app/horizon/household-retirement-pane.tsx',
  'components/app/horizon/toekomst-exit-notice.tsx',
  'components/app/horizon/whatif-actions.tsx',
  'components/app/horizon/whatif-events.tsx',
  'components/app/household-section.tsx',
  'components/app/manual-transfer-sheet.tsx',
  'components/app/module-activation-modal.tsx',
  'components/app/notifications/notification-panel.tsx',
  'components/app/persona-card.tsx',
  'components/app/portfolio-allocation-chart.tsx',
  'components/app/quick-add-wizard/quick-add-wizard.tsx',
  'components/app/recurring-classify-sheet.tsx',
  'components/app/recurring-edit-sheet.tsx',
  'components/app/session-monitor.tsx',
  'components/app/share-dialog.tsx',
  'components/app/shell/nav-menu-sheet.tsx',
  'components/app/sleepmodus/sleepmodus-overlay.tsx',
  'components/app/transaction-form.tsx',
  'components/app/transfer-confirm-sheet.tsx',
  'components/command-palette/command-palette.tsx',
  'components/connections/add-broker-modal.tsx',
  'components/connections/add-exchange-modal.tsx',
  'components/connections/add-wallet-modal.tsx',
  'components/core/asset-edit-broker-section.tsx',
  'components/core/asset-edit-connection-section.tsx',
  'components/core/assets-client.tsx',
  'components/core/core-kengetallen.tsx',
  'components/core/core-landing.tsx',
  'components/core/debt-detail-sheet.tsx',
  'components/core/holdings-client.tsx',
  'components/future/doelen-view.tsx',
  'components/future/gebeurtenissen-view.tsx',
  'components/future/report-sheet.tsx',
  'components/future/scenario-bibliotheek.tsx',
  'components/future/strategie/pensioen-projectie-chart.tsx',
  'components/future/strategie/strategie-modal-shell.tsx',
  'components/mijn/account/abonnement-section.tsx',
  'components/mijn/ai-privacy-settings.tsx',
  'components/onboarding/welcome-popup.tsx',
  'components/overview/belasting/box1-gross-income-editor.tsx',
  'components/overview/overzicht-hero.tsx',
  // ADR 0130 — de rondleiding op /overzicht is een SPOTLIGHT: vier scrim-panelen
  // rond een gat waarin het uitgelichte element zichtbaar én tikbaar blijft. Een
  // ShellOverlay legt per definitie één vlak over de hele viewport en vangt dus
  // elke klik — dan zou de slotstap naar een nav-pill/Fin-knop wijzen die niet
  // meer werkt, en zou de nav-pill zichzelf bovendien verbergen op het
  // overlay-signaal. Claimt daarom bewust géén `acquireOverlay()` en geen
  // scroll-lock; de scrim gebruikt wél `var(--scrim)` (regel 3, niet
  // allowlistbaar). Zie de kop van rondleiding-overlay.tsx.
  'components/overview/rondleiding/rondleiding-overlay.tsx',
  'components/overview/transacties/transactie-tijdlijn.tsx',
  'components/overview/transacties/transacties-analyse.tsx',
  'components/sync/sync-report-modal.tsx',
  'components/widgets/auto-dashboard-wizard.tsx',
  'components/widgets/draggable-widget-grid.tsx',
  'components/widgets/fee-detail-modal.tsx',
  'components/widgets/gezondheids-score-widget.tsx',
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
    else if (/\.(tsx|ts)$/.test(name) && !/\.(test|spec)\.(tsx|ts)$/.test(name)) out.push(full)
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))

const directConsumers = []
const handRolled = []
const scrimViolations = []

const IMPORT_DIRECT = /import\s*\{[^}]*\b(BottomSheet|SlideInPane)\b[^}]*\}\s*from\s*['"]@\/components\/app\/(bottom-sheet|shell\/slide-in-pane)['"]/
const HAND_ROLLED = /className=[^\n]*\bfixed\b[^\n]*\binset-0\b[^\n]*\bz-(\[|\d)/
const RAW_SCRIM = /\b(fixed|absolute)\b[^\n"'`]*\binset-0\b[^\n"'`]*\bbg-(black\/\d+|\[var\(--ink\)\]\/\d+)/

for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (INFRASTRUCTURE.has(rel)) continue
  const src = readFileSync(file, 'utf8')

  if (IMPORT_DIRECT.test(src)) directConsumers.push(rel)
  if (/^['"]use client['"]/m.test(src) && HAND_ROLLED.test(src)) handRolled.push(rel)
  if (!SCRIM_RULE_EXEMPT.has(rel)) {
    for (const line of src.split('\n')) {
      if (RAW_SCRIM.test(line)) {
        scrimViolations.push(rel)
        break
      }
    }
  }
}

const known = [...new Set([...directConsumers, ...handRolled])].sort()

if (process.argv.includes('--list')) {
  console.log(`Directe BottomSheet/SlideInPane-consumenten: ${directConsumers.length}`)
  console.log(`Handgerolde overlays:                        ${handRolled.length}`)
  console.log(`Rauwe scrims (regel 3):                      ${scrimViolations.length}`)
  console.log('')
  console.log(JSON.stringify(known, null, 2))
  process.exit(0)
}

// ── Regel 3 — niet allowlistbaar ────────────────────────────────────────────

if (scrimViolations.length > 0) {
  console.error('✗ Scrim-token (regel 3): overlay-laag met een rauwe kleur i.p.v. var(--scrim).')
  console.error('')
  for (const v of [...new Set(scrimViolations)].sort()) console.error(`   ${v}`)
  console.error('')
  console.error('WAAROM dit hard faalt: "maak de pagina donker achter de modal" zag er per oppervlak')
  console.error('anders uit — zeven varianten (0.2/0.3/0.4/0.5/0.6, black vs. --ink, blur wel/niet).')
  console.error('Ze zijn allemaal met de hand gevonden; de compiler vindt bg-black/30 en bg-black/50')
  console.error('even goed. Gebruik `bg-[var(--scrim)]` (+ `backdrop-blur-[var(--scrim-blur)]`).')
  console.error('Deze regel staat LOS van de ALLOWLIST — een bestand daarop zetten onderdrukt hem niet.')
  process.exit(1)
}

// ── Regels 1 en 2 — allowlistbaar ───────────────────────────────────────────

const violations = known.filter((f) => !ALLOWLIST.has(f))
const stale = [...ALLOWLIST].filter((a) => !known.includes(a)).sort()

if (stale.length > 0) {
  console.log('ℹ  Allowlist-entries die de standaard inmiddels volgen (mag opgeruimd):')
  console.log(stale.map((s) => `   - ${s}`).join('\n'))
  console.log('')
}

if (violations.length > 0) {
  console.error('✗ ShellOverlay-driewegregel (ADR 0039): nieuwe overlay buiten de standaard.')
  console.error('')
  for (const v of violations) console.error(`   ${v}`)
  console.error('')
  console.error('Nieuwe overlays lopen via `<ShellOverlay kind="pane"|"sheet"|"confirm">`. Die levert')
  console.error('focus-trap, scroll-lock, het overlay-signaal voor de nav-pill, het swipe-gebaar, de')
  console.error('onderdrukking van native pull-to-refresh en de back-knop-integratie in één keer mee —')
  console.error('een handgerolde `fixed inset-0` krijgt daar niets van, en een directe <BottomSheet>')
  console.error('omzeilt de driewegkeuze. Zie CLAUDE.md §Modal-conventie en docs/adr/0039-*.md.')
  process.exit(1)
}

console.log(
  `✓ ShellOverlay-driewegregel: ${known.length} bekende afwijkingen op de allowlist, 0 nieuwe.`,
)
console.log('✓ Scrim-token: 0 overlays met een rauwe scrim-kleur.')
process.exit(0)
