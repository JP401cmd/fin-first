#!/usr/bin/env node
/**
 * check-heading-levels — lint-gate voor het koppencontract (bevinding M28, ADR 0110).
 *
 * Het contract: binnen de app-shell draagt de SHELL de enige `<h1>` — de
 * sr-only paginanaam in `components/app/shell/mobile-stack-shell.tsx`. De
 * pagina-aanhef (`PageOpening`) is een `<h2>`, secties zijn `<h2>`, kaarten/
 * widgets/overlay-titels zijn `<h3>`. Pagina's en componenten renderen dus
 * NOOIT zelf een `<h1>`.
 *
 * Waarom een gate: het UX-testpanel mat twee `<h1>`'s per pagina. Dat was geen
 * incident op twee routes maar een gedeeld contract — `PageOpening` alleen al
 * staat op 30 call-sites. Een regel zonder gate is een suggestie; dit is
 * dezelfde les als bij de raakdrempel (M19) en de ShellOverlay-driewegregel.
 *
 * ── Wat deze gate WEL bewijst ───────────────────────────────────────────────
 *   Regel 1: geen literale `<h1` in `app/(app)/**` of `components/**`, buiten
 *            de aangewezen drager en de oppervlakken die buiten de app-shell
 *            renderen (landing/onboarding/check — die dragen terecht een eigen h1).
 *   Regel 2: geen `level="h1"` / `level={'h1'}` op een editorial-component.
 *            Redundant zolang het union-type van `EditorialHeadline` op
 *            'h2' | 'h3' staat — bewust dubbel, want een type kan later per
 *            ongeluk verruimd worden en dan is dit de enige vangrail.
 *
 * ── Wat deze gate NIET bewijst (lees dit vóór je 'm uitbreidt) ──────────────
 * Koppen komen pas in de DOM samen uit drie bomen: de shell, de pagina, en
 * portals/overlays. Een statische scan over losse `.tsx`-bronnen kan daarom
 * NIET bewijzen:
 *   - dat de gerenderde koppenVOLGORDE per route klopt;
 *   - dat er per route precies één h1 is (shell en pagina staan in verschillende
 *     bestanden zonder statisch verband);
 *   - dat een h2→h3-stap geen gat heeft — `{cond && <h3>}` is runtime;
 *   - dat een `<h4>` fout is: die nest vaak correct onder de `<h3>` die een
 *     overlay in een ÁNDER bestand rendert (`bottom-sheet.tsx`, `slide-in-pane.tsx`).
 *     Een "sprong-detector" per bestand zou daar structureel vals alarm slaan;
 *     die is daarom bewust NIET gebouwd.
 * De echte volgorde-toets hoort in de DOM: een axe-`heading-order`-assertie over
 * een handvol representatieve routes in de playwright/UAT-laag (fase 3).
 *
 * Exit 0 = geen nieuwe overtredingen. Exit 1 = nieuw, of een RESIDUE-entry die
 * is opgelost maar nog in de lijst staat. Draai met `--list` voor de stand.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app/(app)', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git'])

/**
 * ── De drager ───────────────────────────────────────────────────────────────
 * Precies één bestand mag een `<h1>` renderen binnen de app-shell. Groeit deze
 * set, dan is het contract gebroken — niet de lijst.
 */
const CARRIERS = new Set(['components/app/shell/mobile-stack-shell.tsx'])

/**
 * ── Buiten de app-shell ─────────────────────────────────────────────────────
 * Deze oppervlakken renderen NIET binnen `app/(app)/layout.tsx` en hebben dus
 * geen shell-h1. Ze dragen terecht hun eigen `<h1>`: de landingpagina, de
 * onboarding-flow en de /check-funnel (allemaal buiten de `(app)`-groep).
 * Permanente, positieve uitzondering — mag groeien, mét motivering.
 */
const OUTSIDE_SHELL_PREFIXES = [
  'components/landing/',
  'components/onboarding/',
  'components/check/',
]

/**
 * ── Afbouwlijst (RESIDUE) ───────────────────────────────────────────────────
 * Bevroren op de stand van 28 aug 2026, ná fase 1 van ADR 0110 (contract +
 * drager + gate). Dit zijn de in-shell bestanden die nog een eigen `<h1>`
 * renderen; fase 2+ zet ze om naar `<h2>` (of naar `PageOpening`).
 *
 * Deze lijst MAG ALLEEN KRIMPEN. Een entry die geen overtreding meer is maakt
 * de gate HARD ROOD — anders blijft een afbouwschema stilstaan zonder dat
 * iemand het merkt. Dat is bewust anders dan de allowlist van
 * `check-tap-targets.mjs` (die is permanent bedoeld en meldt stale entries
 * vriendelijk); hier is het doel nul, dus spiegelen we `COLUMN_RULE_RESIDUE`
 * uit `check-client-data-reads.mjs`.
 *
 * Iets TOEVOEGEN is precies de overtreding die deze gate hoort te vangen.
 */
const RESIDUE_ENTRIES = [
  'app/(app)/beheer/blueprints/[type]/page.tsx',
  'app/(app)/beheer/blueprints/_components/preview-budgetteren.tsx',
  'app/(app)/beheer/blueprints/_components/previews-1-3.tsx',
  'app/(app)/beheer/blueprints/_components/previews-4-7.tsx',
  'app/(app)/beheer/blueprints/_components/previews-8-10.tsx',
  'app/(app)/beheer/blueprints/page.tsx',
  'app/(app)/beheer/grafiek-werking/page.tsx',
  'app/(app)/beheer/horizon-kernel/horizon-kernel-client.tsx',
  'app/(app)/beheer/horizon-tabellen-mij/page.tsx',
  'app/(app)/beheer/integraties/page.tsx',
  'app/(app)/beheer/layout.tsx',
  'app/(app)/core/assets/[type]/page.tsx',
  'app/(app)/core/assets/crypto/[holdingId]/page.tsx',
  'app/(app)/core/assets/holdings/[id]/not-found.tsx',
  'app/(app)/core/assets/holdings/[id]/page.tsx',
  'app/(app)/core/assets/investment/[holdingId]/page.tsx',
  'app/(app)/core/belasting/page.tsx',
  'app/(app)/core/cash/connect/page.tsx',
  'app/(app)/core/cash/connect/success/page.tsx',
  'app/(app)/core/debts/[type]/page.tsx',
  'app/(app)/core/page.tsx',
  'app/(app)/rapportages/[id]/components/report-masthead.tsx',
  'app/(app)/rapportages/balans/page.tsx',
  'app/(app)/rapportages/benchmark/page.tsx',
  'app/(app)/rapportages/budget/page.tsx',
  'app/(app)/rapportages/persoonlijk-plan/page.tsx',
  'app/(app)/rapportages/totaalplan/page.tsx',
  'app/(app)/rapportages/vermogen/page.tsx',
  'components/app/cash-account-view.tsx',
  'components/app/horizon/horizon-client.tsx',
  'components/app/horizon/whatif-header.tsx',
  'components/berichten/masthead.tsx',
  'components/core/core-landing.tsx',
  'components/mijn/local-chat-panel.tsx',
]

const RESIDUE = new Set(RESIDUE_ENTRIES)

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
 * Blank commentaar uit vóór het scannen — met behoud van lengte en newlines,
 * zodat regelnummers blijven kloppen.
 *
 * Nodig, niet cosmetisch: dit contract wórdt uitgelegd in commentaar ("bewust
 * een <p>, géén <h1>"), en zonder deze strip zou élke correcte toelichting de
 * gate rood maken — precies het tegenovergestelde van wat je wilt belonen.
 *
 * Gestript worden `/* … *\/`-blokken (dekt JSDoc `/** … *\/` én JSX
 * `{/* … *\/}`) en regels die na trimmen met `//` beginnen. Bewust géén
 * volledige quote-state-machine: JSX-tekst zit vol losse apostrofs ("don't")
 * en die zou een naïeve scanner uit de rails laten lopen. De prijs is dat een
 * letterlijke `/*` ín een string het scannen kortsluit; dat komt in .tsx niet
 * voor en levert hoogstens een gemist geval op, nooit vals alarm.
 */
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  out = out
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? ' '.repeat(line.length) : line))
    .join('\n')
  return out
}

/** Literale `<h1>`-opening: `<h1` gevolgd door whitespace, `>` of `/`. */
const H1_TAG = /<h1(?=[\s/>])/g

/** `level="h1"` en `level={'h1'}` / `level={"h1"}`. */
const LEVEL_H1 = /level=(?:"h1"|'h1'|\{\s*['"]h1['"]\s*\})/g

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
const h1Offenders = new Map() // rel -> [line]
const levelOffenders = new Map() // rel -> [line]

for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (CARRIERS.has(rel)) continue
  const src = stripComments(readFileSync(file, 'utf8'))

  if (!OUTSIDE_SHELL_PREFIXES.some((p) => rel.startsWith(p))) {
    let m
    H1_TAG.lastIndex = 0
    while ((m = H1_TAG.exec(src))) {
      const list = h1Offenders.get(rel) ?? []
      list.push(lineOf(src, m.index))
      h1Offenders.set(rel, list)
    }
  }

  // Regel 2 geldt óók buiten de shell: `EditorialHeadline` is een in-shell
  // primitive en heeft daar sowieso niets te zoeken met level h1.
  let m2
  LEVEL_H1.lastIndex = 0
  while ((m2 = LEVEL_H1.exec(src))) {
    const list = levelOffenders.get(rel) ?? []
    list.push(lineOf(src, m2.index))
    levelOffenders.set(rel, list)
  }
}

const known = [...h1Offenders.keys()].sort()

if (process.argv.includes('--list')) {
  console.log(`In-shell bestanden met een eigen <h1>: ${known.length}`)
  console.log('')
  if (process.argv.includes('--detail')) {
    for (const f of known) {
      console.log(`${f} — ${h1Offenders.get(f).map((l) => `r.${l}`).join(', ')}`)
    }
  } else {
    console.log(JSON.stringify(known, null, 2))
  }
  console.log('')
  console.log(`level="h1"-sites: ${levelOffenders.size}`)
  for (const [f, lines] of levelOffenders) {
    console.log(`   ${f} — ${lines.map((l) => `r.${l}`).join(', ')}`)
  }
  process.exit(0)
}

let failed = false

// ── Regel 2 — niet-allowlistbaar ────────────────────────────────────────────
if (levelOffenders.size > 0) {
  console.error('✗ Koppencontract (ADR 0110): `level="h1"` op een editorial-component.')
  console.error('')
  for (const [f, lines] of levelOffenders) {
    console.error(`   ${f} — ${lines.map((l) => `r.${l}`).join(', ')}`)
  }
  console.error('')
  console.error('`EditorialHeadline` kent alleen nog h2/h3. De enige <h1> van een route is')
  console.error('de sr-only paginanaam in components/app/shell/mobile-stack-shell.tsx.')
  console.error('')
  failed = true
}

// ── Regel 1 — nieuwe overtredingen ──────────────────────────────────────────
const violations = known.filter((f) => !RESIDUE.has(f))
const solved = [...RESIDUE].filter((r) => !known.includes(r)).sort()

if (violations.length > 0) {
  console.error('✗ Koppencontract (ADR 0110): nieuwe <h1> binnen de app-shell.')
  console.error('')
  for (const v of violations) {
    console.error(`   ${v} — ${h1Offenders.get(v).map((l) => `r.${l}`).join(', ')}`)
  }
  console.error('')
  console.error('Binnen de app-shell draagt de shell de enige <h1> (de sr-only paginanaam,')
  console.error('gevoed door NavStackMeta.title → resolveRouteTitle). Een pagina-aanhef is')
  console.error('een <h2> — gebruik `<PageOpening>` uit components/editorial, of anders een')
  console.error('gewone <h2>. Zie docs/adr/0110-de-shell-draagt-de-enige-h1.md en')
  console.error('.claude/skills/ui-ux/quality-checklist.md → "Koppenhiërarchie".')
  console.error('')
  failed = true
}

if (solved.length > 0) {
  console.error('✗ RESIDUE-entries die geen <h1> meer bevatten — haal ze uit de lijst:')
  console.error('')
  for (const s of solved) console.error(`   - ${s}`)
  console.error('')
  console.error('De afbouwlijst mag alleen krimpen; een opgeloste entry moet eruit, anders')
  console.error('staat het afbouwschema stil zonder dat iemand het merkt.')
  console.error('')
  failed = true
}

if (failed) process.exit(1)

console.log(
  `✓ Koppencontract: 1 shell-drager, ${RESIDUE.size} bestanden op de afbouwlijst, 0 nieuwe.`,
)
process.exit(0)
