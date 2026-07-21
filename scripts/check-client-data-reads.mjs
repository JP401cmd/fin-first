#!/usr/bin/env node
/**
 * check-client-data-reads — lint-gate voor de datapad-conventie (ADR 0058).
 *
 * Regel: weergavedata lees je via een server-loader/bundel, niet met de
 * browser-client in een 'use client'-bestand. Dit script flagt NIEUWE
 * read-for-display-queries (`.from(...).select(...)`) in client-code die niet
 * op de grandfather-allowlist staan. Mirror van de allowlist-gedachte uit de
 * e-mail-allowlist (ADR 0047-stijl).
 *
 * Detectie ("reader"):
 *  - bestand heeft een `'use client'`-directive,
 *  - importeert `lib/supabase/client` (de browser-client),
 *  - bevat minstens één `.from(<x>) … .select(` waarbij de keten TUSSEN
 *    `.from(` en `.select(` GEEN `insert/update/upsert/delete` bevat.
 *    → `.insert().select('id')` returning is GEEN read-for-display en telt niet.
 *
 * Uitzonderingen (binnen de conventie — horen NIET in de allowlist als reader,
 * maar worden hoe dan ook niet geflagd omdat ze geen display-read doen):
 *  - eigen-rij preferences (own-row RMW, spiegel app/api/appearance),
 *  - auth (supabase.auth.*),
 *  - realtime (.channel()/postgres_changes) — initiële load blijft via loader/API.
 * Bestanden die naast prefs/auth/realtime tóch een display-read doen, staan als
 * grandfather op de allowlist tot Fase b ze uitfaseert.
 *
 * Exit 0 = geen nieuwe overtredingen. Exit 1 = nieuwe reader buiten de allowlist.
 *
 * Run:  npm run check:client-reads   (of: node scripts/check-client-data-reads.mjs)
 * Flags: --list  print de huidige reader-set (om de allowlist te herijken).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks']

const USE_CLIENT = /^\s*['"]use client['"]/m
const CLIENT_IMPORT = /from\s+['"][^'"]*lib\/supabase\/client['"]/
// .from(<args>) … (max 500 tekens keten) … .select(
const READ_RE = /\.from\(([^)]*)\)([\s\S]{0,500}?)\.select\(/g
const MUTATION_IN_CHAIN = /\.(insert|update|upsert|delete)\(/

/**
 * Grandfather-allowlist (ADR 0058, gemeten op HEAD 2026-07-21).
 * Deze bestanden lazen op het moment van vastleggen al direct met de
 * browser-client. Ze blijven toegestaan tot Fase b ze per domein uitfaseert.
 * Voeg hier NIETS nieuws aan toe zonder motivatie — dat is precies de
 * overtreding die deze gate hoort te vangen. Verwijder entries zodra een
 * domein-slice ze heeft gemigreerd.
 *
 * Enkele entries vallen conceptueel binnen de conventie (prefs/realtime) maar
 * doen tóch een display-read bij de initiële load; ze zijn gemarkeerd en
 * worden bij Fase b naar loader/API getild.
 */
const ALLOWLIST = new Set([
  // — Fase b, slice 1: assets —
  'components/core/assets-client.tsx',
  'components/core/asset-detail-flow.tsx',
  'components/app/core/assets/asset-pane.tsx',
  'components/core/rebalancing-settings-section.tsx',
  'app/(app)/core/assets/revalue/page.tsx',
  'components/app/app-setup/configs/aandelen-holdings.config.tsx',
  'components/app/app-setup/configs/crypto-holdings.config.tsx',
  'components/app/app-setup/configs/verhuurrendement.config.tsx',
  'components/app/app-setup/configs/hypotheekplanner.config.tsx',
  'components/core/deepenings/hypotheekplanner-tab.tsx',
  'components/core/deepenings/verhuurrendement-tab.tsx',
  // — Fase b, slice 2: budgets —
  'components/app/budgets-client.tsx',
  'components/app/budget-form.tsx',
  'components/app/app-setup/configs/budgetteren.config.tsx',
  // — Fase b, slice 3: cash —
  'components/app/cash-overview.tsx',
  'components/app/cash-account-view.tsx',
  'components/app/transaction-form.tsx',
  'components/app/transfer-confirm-sheet.tsx',
  'components/app/manual-transfer-sheet.tsx',
  'components/app/category-rules-sheet.tsx',
  'components/app/ai-categorize-sheet.tsx',
  'components/app/account-form-modal.tsx',
  'components/app/counterparty-analysis-panel.tsx',
  'components/overview/transacties/transacties-analyse.tsx',
  'app/(app)/core/cash/import/page.tsx',
  'app/(app)/core/cash/connect/success/page.tsx',
  // — Fase b, slice 4: horizon / toekomst —
  'components/app/horizon/horizon-client.tsx',
  'components/app/horizon/strategie-modal.tsx',
  'components/app/fin/goal-detail-modal.tsx',
  'components/future/doel-toevoegen-sheet.tsx',
  'components/future/doel-bewerken-sheet.tsx',
  'app/(app)/horizon/whatif/whatif-page-client.tsx',
  // — Fase b, slice 5: debts + belasting —
  'app/(app)/core/debts/debts-client.tsx',
  'components/core/debt-category-page.tsx',
  'components/app/core/debts/belasting-section.tsx',
  'components/aangifte/review-step.tsx',
  // — Fase b, slice 6: beheer / rapportages / onboarding / checkin / overig —
  'app/(app)/beheer/integraties/integraties-shell.tsx',
  'app/(app)/beheer/testdata/page.tsx',
  'app/(app)/rapportages/page.tsx',
  'app/(app)/core/checkin/page.tsx',
  'app/(onboarding)/onboarding/page.tsx',
  'components/app/module-activation-modal.tsx',
  'components/app/app-setup/use-is-setup-completed.tsx',
  'app/(app)/mijn/profiel/page.tsx',
  // — Binnen de conventie (prefs/realtime), grandfathered vanwege initiële display-read —
  'components/mijn/ai-privacy-settings.tsx', // eigen-rij prefs (profiles) — legit, verplaatst mee bij Fase b indien nodig
  'components/mijn/local-categorization-settings.tsx', // eigen-rij prefs — legit
  'app/(app)/mijn/notificaties/page.tsx', // realtime; initiële load nog client-side → Fase b naar API
])

function walk(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    let s
    try {
      s = statSync(p)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === '__tests__') continue
      out.push(...walk(p))
    } else if (/\.(tsx|ts)$/.test(name) && !/\.test\.(tsx|ts)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

function hasDisplayRead(src) {
  READ_RE.lastIndex = 0
  let m
  while ((m = READ_RE.exec(src))) {
    if (MUTATION_IN_CHAIN.test(m[2])) continue // returning-select, geen display-read
    return true
  }
  return false
}

function collectReaders() {
  const readers = []
  for (const d of SCAN_DIRS) {
    for (const file of walk(join(ROOT, d))) {
      const src = readFileSync(file, 'utf8')
      if (!USE_CLIENT.test(src)) continue
      if (!CLIENT_IMPORT.test(src)) continue
      if (!hasDisplayRead(src)) continue
      readers.push(relative(ROOT, file).split('\\').join('/'))
    }
  }
  readers.sort()
  return readers
}

const readers = collectReaders()

if (process.argv.includes('--list')) {
  console.log(`${readers.length} client display-readers:`)
  console.log(readers.map((r) => `  ${r}`).join('\n'))
  process.exit(0)
}

const violations = readers.filter((r) => !ALLOWLIST.has(r))
const stale = [...ALLOWLIST].filter((a) => !readers.includes(a)).sort()

if (stale.length > 0) {
  console.log('ℹ  Allowlist-entries die geen display-read meer doen (Fase b-voortgang — mag opgeruimd):')
  console.log(stale.map((s) => `   - ${s}`).join('\n'))
  console.log('')
}

if (violations.length > 0) {
  console.error('✗ Datapad-conventie (ADR 0058): nieuwe directe client-read(s) voor weergavedata gevonden.')
  console.error('')
  for (const v of violations) console.error(`   ${v}`)
  console.error('')
  console.error('Weergavedata hoort via een server-loader/bundel (lib/*-data-loader.ts → DashboardData → props),')
  console.error('of on-demand via een API-route (fetch). Zie docs/adr/0058-*.md en de CLAUDE.md-sectie "Datapad-conventie".')
  console.error('Is dit een legitieme uitzondering (eigen-rij pref / auth / realtime)? Dan hoort er geen display-read te staan;')
  console.error('anders motiveer + zet het bestand bewust op de ALLOWLIST in dit script.')
  process.exit(1)
}

console.log(`✓ Datapad-conventie: ${readers.length} bekende client-readers, 0 nieuwe overtredingen (allowlist dekt de bestaande).`)
process.exit(0)
