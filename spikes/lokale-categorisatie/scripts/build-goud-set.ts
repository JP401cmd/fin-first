// Bouwt de GOUDEN TESTSET(s) (fase-0-POC, lokale transactie-categorisatie) uit
// de stage-1-residustaart van één, door de eigenaar aangewezen bron-account
// (user-id via env GOUD_USER_ID). Leest RUWE (niet-geanonimiseerde) exports uit de
// scratchpad — NOOIT uit de repo — en schrijft uitsluitend GEANONIMISEERDE
// output naar dataset/goud-set.json, dataset/goud-set-replay.json en
// dataset/goud-budgets.json.
//
// Twee residu-definities, ÉÉN script:
//
//  1. "Vandaag"-residu (goud-set.json): wat computeAutoCategorization met de
//     HUIDIGE context (alle correcties, freqMap over de volle geschiedenis)
//     niet zelf oplost. Bleek in de praktijk extreem dun (7 tx) — bijna elke
//     manual/ai-gelabelde tx wordt vandaag alsnog via correcties/frequentie
//     opgelost, want die zijn er juist UIT voortgekomen (circulair).
//
//  2. Tijdreis-replay (goud-set-replay.json): per kandidaat-tx wordt de
//     AutoCatContext gereconstrueerd met UITSLUITEND informatie die vóór die
//     transactie bestond (freqMap uit eerdere tx, correcties met created_at
//     vóór die tx) — een eerlijke cold-start-simulatie, zonder de circulaire
//     hindsight van optie 1. Dit is de methodologisch zuivere variant.
//
// Draai met: npm run build:goud  (Node 24 native TS-stripping, zelfde patroon
// als scripts/check-dataset.ts en scripts/smoke-run.ts).
//
// Optioneel CLI-arg 1: pad naar de map met de ruwe scratchpad-exports
// (transactions.json, budgets.json, corrections.json, own-ibans.json,
// bank-accounts.json). Default hieronder wijst naar de scratchpad van de
// sessie waarin deze set gebouwd is.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { computeAutoCategorization, type AutoCatContext, type AutoCatTx } from '../../../lib/auto-categorize.ts'
import { buildFrequencyMap, type CategoryCorrection } from '../../../lib/parsers/categorize.ts'
import { buildOwnAccountIdentifiers } from '../../../lib/own-accounts.ts'
import { resolveEigenRekeningBudgetId, type Budget } from '../../../lib/budget-data.ts'
import { buildBudgetOptions, type BudgetRow } from '../../../app/api/ai/categorize/budget-options.ts'
import type { CategorizeBudgetOption } from '../../../lib/ai/categorize-system-prompt.ts'
import { sanitizeForAI } from '../../../lib/ai/sanitize.ts'

const here = dirname(fileURLToPath(import.meta.url))

// Ruwe (niet-geanonimiseerde) exports leven UITSLUITEND in de scratchpad —
// nooit in de repo. Pad is bewust een absolute, sessie-gebonden scratchpad-
// locatie; override via CLI-arg 1 voor een andere sessie/machine.
const RAW_DIR =
  process.argv[2] ??
  'C:/Users/Admin/AppData/Local/Temp/claude/c--Users-Admin-fin-fin-first/1213d645-e0d7-4228-bccc-c3f7231f02cb/scratchpad/raw'

const OUT_SET = resolve(here, '../dataset/goud-set.json')
const OUT_SET_REPLAY = resolve(here, '../dataset/goud-set-replay.json')
const OUT_BUDGETS = resolve(here, '../dataset/goud-budgets.json')

// Bron-account via env — geen hardcoded user-id/e-mail in het repo (security-
// review jul 2026): `GOUD_USER_ID=<uuid> npm run build:goud`. Fail-fast zodat
// een vergeten env-var niet stilletjes een lege set bouwt.
const USER_ID = process.env.GOUD_USER_ID ?? ''
if (!USER_ID) {
  console.error('GOUD_USER_ID ontbreekt — zet de user-uuid van het bron-account als env-var.')
  process.exit(1)
}
const MIN_TARGET = 150
const MAX_TARGET = 250
const DEDUPE_CAP = 3

type RawTx = {
  id: string
  description: string | null
  counterparty_name: string | null
  counterparty_iban: string | null
  amount: number
  reference: string | null
  date: string
  account_id: string | null
  budget_id: string | null
  category_source: string | null
}

/** category_corrections + created_at (extra t.o.v. CategoryCorrection — alleen
 *  nodig voor de tijdreis-replay om te bepalen wat "toen al bestond"). */
type RawCorrection = CategoryCorrection & { created_at: string | null }

type OwnIbanRow = { match_type: string | null; match_value: string | null; iban: string | null }
type BankAccountRow = { iban: string | null }

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

function loadRaw() {
  return {
    transactions: readJson<RawTx[]>(`${RAW_DIR}/transactions.json`),
    budgets: readJson<Budget[]>(`${RAW_DIR}/budgets.json`),
    corrections: readJson<RawCorrection[]>(`${RAW_DIR}/corrections.json`),
    ownIbanRows: readJson<OwnIbanRow[]>(`${RAW_DIR}/own-ibans.json`),
    bankAccounts: readJson<BankAccountRow[]>(`${RAW_DIR}/bank-accounts.json`),
  }
}

type RawBundle = ReturnType<typeof loadRaw>

function toAutoCatTx(t: RawTx): AutoCatTx {
  return {
    id: t.id,
    description: t.description ?? '',
    counterparty_name: t.counterparty_name,
    counterparty_iban: t.counterparty_iban,
    amount: t.amount,
    date: t.date,
    account_id: t.account_id,
  }
}

/**
 * Gettrouwe stub van de Supabase-fluent-chain die `buildFrequencyMap` gebruikt
 * (`from().select().eq().not().not()`) — zodat de ECHTE productiefunctie
 * draait i.p.v. een herimplementatie die uit de pas kan lopen met de bron.
 * Filtert exact zoals de productiequery: budget_id IS NOT NULL EN
 * counterparty_name IS NOT NULL.
 */
function makeFrequencySupabaseStub(rows: RawTx[]) {
  const filtered = rows
    .filter((r) => r.budget_id != null && r.counterparty_name != null)
    .map((r) => ({
      counterparty_name: r.counterparty_name,
      counterparty_iban: r.counterparty_iban,
      budget_id: r.budget_id as string,
    }))
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                not(_col1: string, _op: string, _val1: unknown) {
                  return {
                    not(_col2: string, _op2: string, _val2: unknown) {
                      return Promise.resolve({ data: filtered, error: null })
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

/** Statische onderdelen van de context — in beide flows (vandaag én replay)
 *  bewust NIET tijdreis-gescoped. Aanname, expliciet: rekeningstructuur
 *  (eigen IBANs/naam-patronen/eigen-rekening-budget) is stabiel verondersteld
 *  over de hele accountgeschiedenis; idem de (huidige) volledige platte
 *  budgetlijst — hetzelfde `ctx.budgets` als productie doorgeeft aan
 *  computeAutoCategorization (alle types, geen filter), niet de assignable/
 *  leaf-subset (die blijft uitsluitend de labelruimte, zie buildLabelSpace). */
function buildStaticContextParts(raw: RawBundle) {
  const ids = buildOwnAccountIdentifiers(
    raw.ownIbanRows,
    raw.bankAccounts.map((b) => b.iban),
  )
  return {
    budgets: raw.budgets,
    ownIbans: ids.ibans,
    ownNamePatterns: ids.namePatterns,
    eigenRekeningBudgetId: resolveEigenRekeningBudgetId(raw.budgets),
  }
}

/** "Vandaag"-context: freqMap + correcties over de VOLLE geschiedenis. */
async function buildTodayContext(raw: RawBundle, staticParts: ReturnType<typeof buildStaticContextParts>): Promise<AutoCatContext> {
  const freqMap = await buildFrequencyMap(USER_ID, makeFrequencySupabaseStub(raw.transactions))
  return {
    budgets: staticParts.budgets,
    corrections: raw.corrections,
    freqMap,
    ownIbans: staticParts.ownIbans,
    ownNamePatterns: staticParts.ownNamePatterns,
    eigenRekeningBudgetId: staticParts.eigenRekeningBudgetId,
  }
}

/** Toewijsbare (leaf, niet-archief) budgetlijst — dit IS de labelruimte voor
 *  beide datasets (goud-budgets.json). */
function buildLabelSpace(raw: RawBundle) {
  const activeBudgetRows: BudgetRow[] = raw.budgets
    .filter((b) => (b as unknown as { is_archived?: boolean }).is_archived === false)
    .map((b) => ({
      id: b.id,
      parent_id: b.parent_id,
      name: b.name,
      slug: b.slug,
      budget_type: b.budget_type,
      description: b.description,
      ownership: b.ownership,
    }))
  const { options: budgetOptions, slugToId } = buildBudgetOptions(activeBudgetRows)
  const idToSlug = new Map<string, string>()
  for (const [slug, id] of slugToId) idToSlug.set(id, slug)
  return { budgetOptions, idToSlug }
}

type ResidueRow = { tx: RawTx; source: 'manual' | 'ai'; slug: string }

function dedupeKey(t: RawTx): string {
  return `${(t.description ?? '').trim().toLowerCase()}|${(t.counterparty_name ?? '').trim().toLowerCase()}|${t.amount}`
}

/** Dedupe (cap DEDUPE_CAP/triple, manual voor binnen een groep) + selectie
 *  (manual eerst, dan ai tot MAX_TARGET). Gedeeld door beide datasets. */
function selectFinal(pool: ResidueRow[]) {
  const sortedPool = [...pool].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'manual' ? -1 : 1
    return a.tx.date < b.tx.date ? -1 : a.tx.date > b.tx.date ? 1 : 0
  })
  const groupCounts = new Map<string, number>()
  const deduped: ResidueRow[] = []
  let dedupeDropped = 0
  for (const row of sortedPool) {
    const key = dedupeKey(row.tx)
    const count = groupCounts.get(key) ?? 0
    if (count >= DEDUPE_CAP) {
      dedupeDropped++
      continue
    }
    groupCounts.set(key, count + 1)
    deduped.push(row)
  }

  const manualDeduped = deduped.filter((r) => r.source === 'manual')
  const aiDeduped = deduped.filter((r) => r.source === 'ai')
  let selected = manualDeduped.slice(0, MAX_TARGET)
  if (selected.length < MAX_TARGET) {
    selected = selected.concat(aiDeduped.slice(0, MAX_TARGET - selected.length))
  }
  selected.sort((a, b) => (a.tx.date < b.tx.date ? -1 : a.tx.date > b.tx.date ? 1 : 0))

  return { deduped, dedupeDropped, manualDeduped, aiDeduped, selected }
}

function toGoldOutput(selected: ResidueRow[], idPrefix: string) {
  return selected.map((row, i) => {
    const t = row.tx
    return {
      id: `${idPrefix}${i + 1}`,
      description: sanitizeForAI(t.description ?? ''),
      counterparty_name: t.counterparty_name ? sanitizeForAI(t.counterparty_name) : null,
      amount: t.amount,
      reference: t.reference ? sanitizeForAI(t.reference) : null,
      date: t.date,
      label_slug: row.slug,
      bron: row.source,
      edge_case: false as const,
    }
  })
}

function writeDataset(path: string, version: string, note: string, transactions: ReturnType<typeof toGoldOutput>) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ version, note, transactions }, null, 2))
}

function logSelectionSummary(label: string, pool: ResidueRow[], sel: ReturnType<typeof selectFinal>) {
  console.log(`  waarvan bron manual/ai (ground-truth-pool): ${pool.length}`)
  console.log(`  Bron-mix pool: manual=${pool.filter((r) => r.source === 'manual').length}, ai=${pool.filter((r) => r.source === 'ai').length}`)
  console.log(`  Na dedupe (cap ${DEDUPE_CAP}/triple): ${sel.deduped.length} (${sel.dedupeDropped} gedropt)`)
  console.log(`  manual gededupt: ${sel.manualDeduped.length}, ai gededupt: ${sel.aiDeduped.length}`)
  console.log(
    `  Finale ${label}-set: ${sel.selected.length} tx (manual=${sel.selected.filter((r) => r.source === 'manual').length}, ai=${sel.selected.filter((r) => r.source === 'ai').length})`,
  )
  if (sel.selected.length < MIN_TARGET) {
    console.warn(`  ⚠ Minimumdoel (${MIN_TARGET}) NIET gehaald voor ${label}: ${sel.selected.length} tx beschikbaar.`)
  }
}

function logTopSlugs(transactions: ReturnType<typeof toGoldOutput>, totalSlugSpace: number) {
  const uniqueSlugs = new Set(transactions.map((t) => t.label_slug))
  const bySlug = new Map<string, number>()
  for (const t of transactions) bySlug.set(t.label_slug, (bySlug.get(t.label_slug) ?? 0) + 1)
  const top10 = [...bySlug.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log(`  Unieke label-slugs: ${uniqueSlugs.size} (van ${totalSlugSpace} toewijsbare slugs totaal)`)
  console.log('  Top-10 label-slugs:')
  for (const [slug, count] of top10) console.log(`    ${slug}: ${count}`)
}

// ── Flow 1: "vandaag"-residu ────────────────────────────────────────────────

async function buildTodaySet(raw: RawBundle, staticParts: ReturnType<typeof buildStaticContextParts>, idToSlug: Map<string, string>) {
  const ctx = await buildTodayContext(raw, staticParts)
  const stage1 = computeAutoCategorization(raw.transactions.map(toAutoCatTx), ctx)
  const resolvedIds = new Set(stage1.assignments.map((a) => a.id))
  const residue = raw.transactions.filter((t) => !resolvedIds.has(t.id))

  const pool: ResidueRow[] = []
  let residueWithBudgetCount = 0
  let residueOtherSourceCount = 0
  let residueBudgetNotAssignable = 0
  for (const t of residue) {
    if (!t.budget_id) continue
    residueWithBudgetCount++
    const slug = idToSlug.get(t.budget_id)
    if (!slug) {
      residueBudgetNotAssignable++
      continue
    }
    if (t.category_source === 'manual' || t.category_source === 'ai') {
      pool.push({ tx: t, source: t.category_source, slug })
    } else {
      residueOtherSourceCount++
    }
  }

  const sel = selectFinal(pool)
  const transactions = toGoldOutput(sel.selected, 'g')

  writeDataset(
    OUT_SET,
    'goud-set-v1',
    'Gouden testset (fase-0 POC, lokale transactie-categorisatie) — "vandaag"-residu: échte, door de gebruiker ' +
      'bevestigde transacties die computeAutoCategorization MET DE HUIDIGE CONTEXT (volle geschiedenis: alle ' +
      'correcties + freqMap over alle tx) niet zelf oplost, geanonimiseerd via sanitizeForAI (lib/ai/sanitize.ts). ' +
      'Bleek in de praktijk zeer dun (circulair: correcties/frequentie zijn juist UIT deze labels voortgekomen) — ' +
      'zie dataset/goud-set-replay.json voor de methodologisch zuivere tijdreis-variant. label_slug = het budget ' +
      'dat de gebruiker destijds bevestigde (bron: manual = category_corrections/handmatig, ai = AI-categorisatie). ' +
      '"edge_case" is hier altijd false — geen synthetisch gemarkeerde randgevallen zoals in dev-set-v1.',
    transactions,
  )

  console.log('── Flow 1: "vandaag"-residu (goud-set.json) ──')
  console.log(`Totaal transacties (account):         ${raw.transactions.length}`)
  console.log(`Stage-1 opgelost:                     ${resolvedIds.size}`)
  console.log(`Residu (niet opgelost door stage 1):  ${residue.length}`)
  console.log(`  waarvan met budget_id:              ${residueWithBudgetCount}`)
  console.log(`  waarvan budget niet-toewijsbaar:     ${residueBudgetNotAssignable} (uitgesloten)`)
  console.log(`  waarvan bron anders (uitgesloten):   ${residueOtherSourceCount}`)
  logSelectionSummary('vandaag', pool, sel)

  return { transactions, sel }
}

// ── Flow 2: tijdreis-replay ─────────────────────────────────────────────────

function chronoCompare(a: RawTx, b: RawTx): number {
  // Secundaire sortering op id (string-vergelijking) — enige beschikbare
  // stabiele tie-break, `date` is een DATE-kolom zonder tijdcomponent. Zelfde
  // conventie als detectTransferPairs in lib/auto-categorize.ts.
  if (a.date < b.date) return -1
  if (a.date > b.date) return 1
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/** Kwartaal-index sinds account-start (dag 0 = eerste transactiedatum). */
function quarterIndex(date: string, accountStart: string): number {
  const ms = new Date(date + 'T00:00:00').getTime() - new Date(accountStart + 'T00:00:00').getTime()
  const days = ms / 86_400_000
  return Math.max(0, Math.floor(days / 91))
}

async function buildReplaySet(raw: RawBundle, staticParts: ReturnType<typeof buildStaticContextParts>, idToSlug: Map<string, string>) {
  const allSorted = [...raw.transactions].sort(chronoCompare)
  const accountStart = allSorted[0]?.date ?? '1970-01-01'

  type Candidate = { tx: RawTx; index: number; slug: string; source: 'manual' | 'ai' }
  const candidates: Candidate[] = []
  allSorted.forEach((t, index) => {
    if (!t.budget_id) return
    const slug = idToSlug.get(t.budget_id)
    if (!slug) return // niet-toewijsbaar budget → uitgesloten, zelfde als flow 1
    if (t.category_source === 'manual' || t.category_source === 'ai') {
      candidates.push({ tx: t, index, slug, source: t.category_source })
    }
  })

  let missingCreatedAt = 0
  const pool: ResidueRow[] = []
  const poolAgeBuckets = new Map<number, { manual: number; ai: number }>()
  // Kandidaten (niet alleen residu) per kwartaal + bron — nodig om "cold-start-
  // moeilijkheid" (hoog residu-aandeel) te onderscheiden van "feature bestond
  // toen simpelweg nog niet" (weinig/geen ai-kandidaten in vroege kwartalen).
  const candidateAgeBuckets = new Map<number, { manual: number; ai: number }>()
  const bump = (map: Map<number, { manual: number; ai: number }>, q: number, source: 'manual' | 'ai') => {
    const cur = map.get(q) ?? { manual: 0, ai: 0 }
    cur[source]++
    map.set(q, cur)
  }

  let done = 0
  for (const c of candidates) {
    bump(candidateAgeBuckets, quarterIndex(c.tx.date, accountStart), c.source)
    const prefix = allSorted.slice(0, c.index) // strikt vóór deze tx, in dezelfde totale orde
    const freqMap = await buildFrequencyMap(USER_ID, makeFrequencySupabaseStub(prefix))

    const cutoff = new Date(c.tx.date + 'T00:00:00')
    const correctionsAsOf = raw.corrections.filter((corr) => {
      if (!corr.created_at) {
        missingCreatedAt++
        return false // conservatief: zonder timestamp nooit "al bestaand" veronderstellen
      }
      return new Date(corr.created_at) < cutoff
    })

    const asOfCtx: AutoCatContext = {
      budgets: staticParts.budgets,
      corrections: correctionsAsOf,
      freqMap,
      ownIbans: staticParts.ownIbans,
      ownNamePatterns: staticParts.ownNamePatterns,
      eigenRekeningBudgetId: staticParts.eigenRekeningBudgetId,
    }

    const result = computeAutoCategorization([toAutoCatTx(c.tx)], asOfCtx)
    const resolvedAtThatTime = result.assignments.length > 0
    if (!resolvedAtThatTime) {
      pool.push({ tx: c.tx, source: c.source, slug: c.slug })
      bump(poolAgeBuckets, quarterIndex(c.tx.date, accountStart), c.source)
    }

    done++
    if (done % 200 === 0) console.log(`  … replay-voortgang: ${done}/${candidates.length} kandidaten verwerkt`)
  }

  const sel = selectFinal(pool)
  const transactions = toGoldOutput(sel.selected, 'r')

  writeDataset(
    OUT_SET_REPLAY,
    'goud-set-replay-v1',
    'Gouden testset (fase-0 POC, lokale transactie-categorisatie) — TIJDREIS-REPLAY: per transactie is de ' +
      'AutoCatContext gereconstrueerd met uitsluitend informatie die vóór die transactie bestond (freqMap uit ' +
      'eerdere transacties, category_corrections met created_at vóór die transactie), zodat computeAutoCategorization ' +
      'de cold-start-situatie van dat moment simuleert i.p.v. de huidige (circulaire) volledige geschiedenis. ' +
      'Aannames (expliciet): (1) rekeningstructuur — eigen IBANs/naam-patronen/eigen-rekening-budget — is stabiel ' +
      'verondersteld over de hele geschiedenis; (2) de budgetstructuur (ctx.budgets) is de huidige volledige platte ' +
      'lijst, niet tijdreis-gereconstrueerd; (3) correcties zonder created_at tellen als "nog niet bestaand" ' +
      '(conservatief — kwam in deze export niet voor); (4) "vóór" een transactie = strikt eerder in de chronologische ' +
      'volgorde (boekdatum, secundair op transactie-id, aflopend string-vergelijk) — transacties op dezelfde ' +
      'kalenderdag als een correctie tellen die correctie NIET mee (geen tijdcomponent beschikbaar). Geanonimiseerd ' +
      'via sanitizeForAI (lib/ai/sanitize.ts). label_slug = het budget dat later definitief werd bevestigd ' +
      '(bron: manual/ai). "edge_case" is hier altijd false.',
    transactions,
  )

  console.log('\n── Flow 2: tijdreis-replay (goud-set-replay.json) ──')
  console.log(`Account-startdatum:                   ${accountStart}`)
  console.log(`Kandidaten (budget_id, bron manual/ai, toewijsbaar): ${candidates.length}`)
  console.log(`Ontbrekende created_at op correcties (conservatief genegeerd): ${missingCreatedAt}`)
  console.log(`Replay-residu (onopgelost op moment van binnenkomst): ${pool.length}`)
  logSelectionSummary('replay', pool, sel)

  console.log('\n  Replay-residu naar accountleeftijd (kwartaal sinds account-start) — residu/kandidaten per bron,')
  console.log('  zodat "cold-start-moeilijkheid" (hoog aandeel) te onderscheiden is van "feature bestond nog niet"')
  console.log('  (weinig/geen ai-kandidaten in vroege kwartalen — ai-categorisatie is een latere product-feature):')
  const maxQ = Math.max(0, ...candidateAgeBuckets.keys())
  for (let q = 0; q <= maxQ; q++) {
    const cand = candidateAgeBuckets.get(q) ?? { manual: 0, ai: 0 }
    const res = poolAgeBuckets.get(q) ?? { manual: 0, ai: 0 }
    if (cand.manual === 0 && cand.ai === 0) continue
    const rate = (r: number, c: number) => (c === 0 ? '–' : `${r}/${c}`)
    console.log(
      `    Q${q} (~${q * 3}-${(q + 1) * 3} mnd): manual ${rate(res.manual, cand.manual)}, ai ${rate(res.ai, cand.ai)}`,
    )
  }

  return { transactions, sel }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const raw = loadRaw()
  const staticParts = buildStaticContextParts(raw)
  const { budgetOptions, idToSlug } = buildLabelSpace(raw)

  writeFileSync(OUT_BUDGETS, JSON.stringify(budgetOptions satisfies CategorizeBudgetOption[], null, 2))

  const today = await buildTodaySet(raw, staticParts, idToSlug)
  console.log('')
  logTopSlugs(today.transactions, budgetOptions.length)

  const replay = await buildReplaySet(raw, staticParts, idToSlug)
  console.log('')
  logTopSlugs(replay.transactions, budgetOptions.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
