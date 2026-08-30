// lib/server-data/tx-aggregates.ts
//
// TRANSACTIE-MAANDAGGREGAAT (FASE 2 · Task 2.2)
// ───────────────────────────────────────────────────────────────────────────
// Consumeer de SQL-functie `public.tx_month_aggregate` (migratie
// 20260719131916) i.p.v. duizenden ruwe transactie-rijen op te halen om er in
// JS een SUM/GROUP-BY op te draaien. Dat lost tegelijk een STILLE REKENFOUT op:
// PostgREST kapt elk antwoord af op `max_rows` (config.toml = 1000) — óók als de
// client een hogere `.limit()` vraagt — waardoor 12-/6-maands sommen (inkomen-
// extrapolatie, spaarquote, dagtarief) voor tx-rijke gebruikers STIL te laag
// werden. Een aggregaat levert per definitie enkele rijen en kan niet afkappen.
//
// PARITY-CONTRACT
//   • De functie geeft één rij per (maand 'YYYY-MM', budget_id, transaction_type)
//     met de som van de positieve en de negatieve bedragen + de telling.
//   • De transfer-filter (`isRealTx`) blijft in JS en verschilt PER LOADER:
//     dashboard/lever filteren transfers eruit, horizon telt ze bewust mee. De
//     reducers hieronder nemen daarom een expliciete `realOnly`-vlag — nooit een
//     verborgen default die één loader stilzwijgend verandert.
//   • `buildMonthAggregatesFromRows` reproduceert de SQL in TS zodat de
//     parity-test kan bewijzen: oude JS-reductie(ruwe rijen) ==
//     nieuwe reductie(aggregaat) — inclusief een >1000-rijen-getuige.
//
// RLS/BEVEILIGING: de functie is SECURITY INVOKER; ze MOET met de anon/
// authenticated RLS-client (createClient uit lib/supabase/server.ts) worden
// aangeroepen — nooit met getServiceClient(). `ownOnly` beperkt tot de eigen
// rijen (excl. gedeeld huishouden), voor loaders die vroeger `.eq('user_id')`
// deden (lever-scores).
//
// ÉÉN UITZONDERING (migratie 20260811180000, ADR 0103): een service-role-aanroeper
// mag de RPC gebruiken MITS hij een expliciete `scope` meegeeft (zie
// TxAggregateScope). Die scope is in SQL een puur restrictief AND-filter dat de
// SELECT-policy naspeelt — hij verruimt niets en is dus geen RLS-bypass, maar hij
// is op het service-role-pad wél de ENIGE afbakening. Ontbreekt hij daar, dan
// aggregeert de functie over álle gebruikers.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isExpenseDirectionBudget,
  isIncomeDirectionBudget,
} from '@/lib/budget-spending'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'

/** Één aggregaat-rij zoals `tx_month_aggregate` teruggeeft. */
export interface TxMonthAggregateRow {
  /** Kalendermaand als 'YYYY-MM'. */
  month: string
  budget_id: string | null
  transaction_type: string | null
  /** Som van de positieve bedragen in de groep (≥ 0). */
  sum_positief: number | string
  /** Som van de negatieve bedragen in de groep (≤ 0). */
  sum_negatief: number | string
  /** Aantal transacties in de groep. */
  count: number | string
}

const TRANSFER_TYPES = new Set(['transfer', 'joint_transfer'])

/** Spiegelt `isRealTx`: alles behalve (joint_)transfer telt als echte transactie. */
export function isRealAggRow(row: { transaction_type?: string | null }): boolean {
  return !TRANSFER_TYPES.has(row.transaction_type ?? '')
}

interface ReduceOpts {
  /** Sluit (joint_)transfer-rijen uit (dashboard/lever); false = alles (horizon). */
  realOnly?: boolean
  /** Ondergrens 'YYYY-MM' (inclusief) voor een sub-venster (bv. 6-maands). */
  sinceMonth?: string
  /**
   * Bovengrens 'YYYY-MM' (EXCLUSIEF) — de eerste maand die NIET meer meetelt.
   *
   * Bestaat voor vensters die de LOPENDE, nog onvolledige kalendermaand buiten
   * de meting moeten houden (de canonieke spaarquote, zie `savingsRateWindow` in
   * lib/savings-source.ts). Zonder deze grens telt een halfvolle maand — vaste
   * lasten al afgeschreven, salaris nog niet binnen — als volwaardige maand mee.
   * Weglaten = ongewijzigd gedrag: geen bovengrens.
   */
  beforeMonth?: string
  /** Beperk tot deze budget-ids (bv. spaarbudget-correctie). */
  budgetIds?: Set<string>
}

function passes(row: TxMonthAggregateRow, opts: ReduceOpts): boolean {
  if (opts.realOnly && !isRealAggRow(row)) return false
  if (opts.sinceMonth && row.month < opts.sinceMonth) return false
  if (opts.beforeMonth && row.month >= opts.beforeMonth) return false
  if (opts.budgetIds && !(row.budget_id && opts.budgetIds.has(row.budget_id))) return false
  return true
}

/** Σ positieve bedragen (bv. inkomen) over de gefilterde rijen. */
export function aggSumPositief(rows: TxMonthAggregateRow[], opts: ReduceOpts = {}): number {
  let s = 0
  for (const r of rows) if (passes(r, opts)) s += Number(r.sum_positief)
  return s
}

/** Σ |negatieve bedragen| (bv. uitgaven, absoluut) over de gefilterde rijen. */
export function aggSumNegatiefAbs(rows: TxMonthAggregateRow[], opts: ReduceOpts = {}): number {
  let s = 0
  for (const r of rows) if (passes(r, opts)) s += Math.abs(Number(r.sum_negatief))
  return s
}

/** Map maand → Σ positieve bedragen (inkomen per maand). */
export function aggIncomeByMonth(rows: TxMonthAggregateRow[], opts: ReduceOpts = {}): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!passes(r, opts)) continue
    m.set(r.month, (m.get(r.month) ?? 0) + Number(r.sum_positief))
  }
  return m
}

/** Map maand → Σ |negatieve bedragen| (uitgaven per maand, absoluut). */
export function aggExpenseByMonthAbs(rows: TxMonthAggregateRow[], opts: ReduceOpts = {}): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!passes(r, opts)) continue
    m.set(r.month, (m.get(r.month) ?? 0) + Math.abs(Number(r.sum_negatief)))
  }
  return m
}

// ── Bestedingssom op het aggregaat ───────────────────────────────────────────
//
// De canonieke besteed-som per budget woont in lib/budget-spending.ts
// (`spendingContribution`), maar die werkt per TRANSACTIE-RIJ. Het aggregaat
// levert per (maand × budget × type) alleen `sum_positief` en `sum_negatief` —
// genoeg om exact dezelfde uitkomst te reproduceren, want de canonieke regel is
// per richting lineair in die twee sommen (zie `aggSpendingContribution`).
//
// TWEE BEKENDE GRENZEN, allebei bewust:
//
//  1. SPLIT-BLIND. `tx_month_aggregate` leest uitsluitend `transactions`; de
//     bedragen in `transaction_splits` zitten er niet in, en de aggregaat-rij
//     draagt geen `is_split`-vlag om de ouder over te slaan. Waar
//     `buildBudgetSpendingMap` split-regels op hun eigen budget bijtelt en de
//     ouder overslaat, telt het aggregaat de OUDER-rij op zijn eigen budget_id.
//     Vandaag is dat LATENT: er staat één split op productie en die heeft
//     budget_id NULL, dus hij valt hoe dan ook buiten elke per-budget-som. Een
//     aggregaat-migratie (splits meenemen in de SQL-functie) is een aparte
//     wijziging en valt buiten deze convergentie.
//  2. GEEN `is_income`. De aggregaat-rij draagt de kolom niet, dus de richting
//     komt hier uitsluitend uit het TEKEN. Dat is precies de volgorde die
//     `spendingContribution` zelf voorschrijft ("TEKEN VOOR VLAG"); de
//     combinatie is_income=true met een negatief bedrag komt op productie 0×
//     voor, dus de uitkomst is er gelijk aan.

/**
 * De bijdrage van ÉÉN aggregaat-rij aan de bestedingssom van zijn budget —
 * de aggregaat-vorm van `spendingContribution` (lib/budget-spending.ts).
 * Getekend: positief = besteding, negatief = geld dat terugkwam.
 *
 * Per richting is de canonieke regel lineair in de twee groepssommen, dus één
 * aggregaat-rij vervangt de lus over haar transacties zonder afrondingsverschil:
 *
 *   - expense/debt  → transfer telt niet (0); anders Σ|negatief| − Σpositief,
 *     want elke negatieve rij levert +|amount| en elke positieve −|amount|.
 *   - income/savings → transfer telt niet (0); anders Σpositief + Σnegatief,
 *     want de bijdrage IS daar het bedrag zelf (het teken klopt al).
 *   - archive/onbekend → Σpositief + Σ|negatief|, transfers INCLUIS: die post
 *     ("Eigen rekening") heeft geen richting en de transfers zijn er juist de
 *     realisatie.
 *
 * `budgetType` is VERPLICHT, met dezelfde reden als bij `spendingContribution`:
 * zonder richting zou de aftrek ook op inkomsten-, spaar- en archief-budgetten
 * slaan en daar de realisatie omkeren.
 */
export function aggSpendingContribution(
  row: Pick<TxMonthAggregateRow, 'transaction_type' | 'sum_positief' | 'sum_negatief'>,
  budgetType: string | null | undefined,
): number {
  const pos = Number(row.sum_positief) || 0
  const neg = Number(row.sum_negatief) || 0
  const isTransfer = TRANSFER_TYPES.has(row.transaction_type ?? '')

  if (isExpenseDirectionBudget(budgetType)) {
    if (isTransfer) return 0
    return Math.abs(neg) - pos
  }
  if (isIncomeDirectionBudget(budgetType)) {
    if (isTransfer) return 0
    return pos + neg
  }
  return pos + Math.abs(neg)
}

/**
 * Map maand → Σ besteed voor rijen waarvan het budget in `budgetIds` zit (bv.
 * schuld-budgetten voor de schuld-reeks van de trend-widget).
 *
 * `budgetTypes` is de canonieke type-map uit `buildBudgetTypeMap`
 * (lib/budget-utils.ts) en is VERPLICHT — dezelfde compiler-vangrail als bij
 * `buildBudgetSpendingMap`: een achtergebleven aanroep zonder richting breekt op
 * de compiler in plaats van stil de teken-blinde som te herstellen.
 *
 * Geef hier GEEN `realOnly: true` mee: de transfer-regel is richting-gescoped en
 * zit al in `aggSpendingContribution`. `realOnly` zou transfers óók van
 * archief-budgetten wegnemen, en dáár zijn ze juist de realisatie.
 *
 * Maanden met een netto-bijdrage van exact 0 krijgen geen entry (spiegelt de
 * vroegere reductie); consumers lezen met `?? 0`.
 */
export function aggSpendingByMonthForBudgets(
  rows: TxMonthAggregateRow[],
  budgetIds: Set<string>,
  budgetTypes: Map<string, string>,
  opts: ReduceOpts = {},
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!passes(r, { ...opts, budgetIds })) continue
    if (!r.budget_id) continue
    const v = aggSpendingContribution(r, budgetTypes.get(r.budget_id))
    if (v !== 0) m.set(r.month, (m.get(r.month) ?? 0) + v)
  }
  return m
}

/**
 * Map budget_id → maand → Σ besteed, voor de budget-sparklines: die tonen per
 * budget wat er in een maand besteed is, op DEZELFDE grondslag als het
 * "Besteed"-bedrag boven de grafiek. Rijen zonder budget_id vallen weg
 * (spiegelt de vroegere `if (t.budget_id)`-guard). Complement van
 * `aggSpendingByMonthForBudgets`, dat over een budget-SET platslaat; hier blijft
 * de budget-dimensie juist behouden.
 *
 * De uitkomst per maand KAN NEGATIEF ZIJN (meer inkomsten dan uitgaven op een
 * uitgaven-budget). Dat is bedoeld en wordt hier niet geklemd — weergave-lijnen
 * die een breedte/hoogte tekenen klemmen zelf, bij de aanroep.
 */
export function aggSpendingByBudgetMonth(
  rows: TxMonthAggregateRow[],
  budgetTypes: Map<string, string>,
  opts: ReduceOpts = {},
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!passes(r, opts)) continue
    if (!r.budget_id) continue
    const v = aggSpendingContribution(r, budgetTypes.get(r.budget_id))
    if (v === 0) continue
    let m = out.get(r.budget_id)
    if (!m) {
      m = new Map<string, number>()
      out.set(r.budget_id, m)
    }
    m.set(r.month, (m.get(r.month) ?? 0) + v)
  }
  return out
}

/**
 * Bouw synthetische uitgaven-rijen ({amount ≤ 0, date = 'YYYY-MM-01'}) uit het
 * aggregaat, zodat een bestaande rij-verwachtende helper (bv.
 * `recentDailyExpenseRateFromRows`) ONGEWIJZIGD gevoed kan worden. Alleen groepen
 * met een echte negatieve som doen mee (spiegelt de vroegere `.lt('amount',0)`-
 * fetch): het totaal én de vroegste maand — de enige twee dingen die die helper
 * gebruikt — blijven daardoor byte-identiek.
 */
export function aggToExpenseRows(
  rows: TxMonthAggregateRow[],
  opts: ReduceOpts = {},
): { amount: number; date: string }[] {
  const out: { amount: number; date: string }[] = []
  for (const r of rows) {
    if (!passes(r, opts)) continue
    const neg = Number(r.sum_negatief)
    if (neg < 0) out.push({ amount: neg, date: `${r.month}-01` })
  }
  return out
}

/**
 * Expliciete afbakening voor een aanroeper die NIET op RLS kan leunen.
 *
 * Bestaat uitsluitend voor het SERVICE-ROLE-pad (de snapshot-cron). Die rol heeft
 * `rolbypassrls = true`, dus `auth.uid()` is er NULL en de RLS-scope van
 * `transactions` vervalt volledig — zonder afbakening zou de RPC daar over álle
 * gebruikers aggregeren.
 *
 * De twee velden spiegelen samen de SELECT-policy `View own or shared
 * transactions` (eigen rijen OF de als 'shared' gemarkeerde rijen van hetzelfde
 * huishouden), zodat dit pad exact dezelfde verzameling ziet als een sessie-client
 * van die gebruiker. Alleen `userId` afbakenen zou de gedeelde boekingen van de
 * partner wegsnijden en de grondslag laten driften met /overzicht.
 *
 * In SQL is dit een puur RESTRICTIEF extra AND-filter (migratie
 * 20260811180000): voor een authenticated aanroeper geldt de RLS onverkort
 * bovenop, dus een vreemd id levert daar 0 rijen op — nooit een bypass.
 */
export interface TxAggregateScope {
  /** De gebruiker wiens transacties (incl. zijn gedeelde huishoud-rijen) tellen. */
  userId: string
  /** Zijn huishouden, of null wanneer hij er geen heeft → alleen eigen rijen. */
  householdId?: string | null
}

/**
 * Haal het maandaggregaat op via de RLS-veilige RPC. `from`/`to` als lokale
 * datum-strings ('YYYY-MM-DD', `to` exclusief). Retourneert de rauwe
 * PostgREST-vorm zodat consumers `.data ?? []` / `.error` ongewijzigd houden.
 *
 * MOET met de authenticated/anon RLS-client worden aangeroepen (nooit
 * getServiceClient) — TENZIJ `scope` wordt meegegeven: de functie is SECURITY
 * INVOKER en leunt anders op de RLS van `transactions`. Zie {@link TxAggregateScope}.
 *
 * De scope-sleutels worden ALLEEN in de payload gezet wanneer er een scope is.
 * Dat is bewust: een ongescoopte aanroep houdt daarmee exact dezelfde
 * argumentenset als vóór migratie 20260811180000, zodat er niets verandert aan
 * hoe PostgREST de functie resolvet of hoe de bestaande callsites eruitzien.
 */
export async function fetchTxMonthAggregate(
  supabase: SupabaseClient,
  args: { from: string; to: string; ownOnly?: boolean; scope?: TxAggregateScope | null },
): Promise<{ data: TxMonthAggregateRow[] | null; error: unknown }> {
  const params: Record<string, unknown> = {
    p_from: args.from,
    p_to: args.to,
    p_own_only: args.ownOnly ?? false,
  }
  if (args.scope) {
    params.p_user_id = args.scope.userId
    params.p_household_id = args.scope.householdId ?? null
  }
  const { data, error } = await supabase.rpc('tx_month_aggregate', params)
  return { data: (data as TxMonthAggregateRow[] | null) ?? null, error }
}

/**
 * Het ROLLENDE 12-MAANDS maandaggregaat `[maandstart 11 mnd terug, maandeinde)`,
 * `cache()`-gewrapt zodat dashboard-, core- en horizon-loader binnen één request
 * ÉÉN RPC delen i.p.v. elk dezelfde te draaien. Op de cashflow-hub draaien ze
 * alle drie (`loadDashboardData`, `loadCashflowSettingsData` → `loadCoreData`,
 * en `loadDashboardData` → `computeHorizonFireSim` → `loadHorizonData`), dus dat
 * waren per request drie identieke RPC's + payloads.
 *
 * WAAROM HET VENSTER HIER BINNEN WORDT BEREKEND — en niet als argument komt.
 * React `cache()` keyt op argument-IDENTITEIT (Object.is per argument). Een
 * `cache()` om `fetchTxMonthAggregate` zelf zou dus een stille no-op zijn: elke
 * callsite bouwt een VERS `{ from, to }`-object, en twee verse objecten zijn
 * nooit identiek → altijd een miss. Het enige argument hier is daarom de
 * supabase-client, precies zoals in lib/server-data/base.ts: `createClient()`
 * (lib/supabase/server.ts) is zelf `cache()`-gewrapt → één instantie per
 * RSC-render, dus alle loaders binnen één request raken dezelfde cache-entry.
 *
 * Het venster komt uit de tijdzone-veilige helpers (lib/month-range.ts) en is
 * byte-identiek aan de twee inline `Date.UTC(jaar, maand ± n, 1).toISOString()`-
 * berekeningen die het vervangt (beide leveren altijd dag-01 op UTC-middernacht).
 * `tx-aggregates.cache.test.ts` pint die gelijkheid vast als anti-drift-getuige.
 *
 * `ownOnly` blijft weg (default false) = RLS-breed (eigen + gedeeld huishouden),
 * identiek aan alle drie de vervangen callsites. Loaders met een ANDER venster
 * houden bewust hun eigen `fetchTxMonthAggregate`-call: een ander venster is een
 * andere cache-entry (lib/lever-scores-loader.ts draait 6 maanden MÉT `ownOnly`).
 *
 * DE RIJEN ZIJN GEDEELD — behandel ze als READ-ONLY. Sinds de dedupe krijgt elke
 * consument binnen het request exact hetzelfde array-object terug, waar ze eerder
 * elk hun eigen kopie hadden. Een in-place `.sort()`/`.reverse()`/`.splice()` of
 * een veldtoekenning op een rij corrumpeert dus stil de andere loaders. Heb je een
 * eigen volgorde nodig, kopieer dan eerst (`[...rows]`); de reducers hierboven
 * muteren niets en zijn altijd veilig.
 *
 * MOET met de authenticated/anon RLS-client worden aangeroepen (nooit
 * getServiceClient) — zie `fetchTxMonthAggregate`.
 */
export const getTxAgg12m = cache(async (supabase: SupabaseClient) => {
  const now = new Date()
  return fetchTxMonthAggregate(supabase, {
    from: localMonthStartMonthsAgo(now, 11),
    to: localMonthBounds(now).end,
  })
})

// ── Test-hulp: reproduceer de SQL in TS ─────────────────────────────────────
/**
 * Bouw hetzelfde maandaggregaat als de SQL-functie uit ruwe transactie-rijen.
 * Uitsluitend voor de parity-test: bewijst dat de aggregaat-vorm genoeg
 * informatie draagt om elke oude JS-reductie byte-identiek te reproduceren.
 * `to_char(date,'YYYY-MM')` == `date.slice(0,7)` voor 'YYYY-MM-DD'-strings.
 */
export function buildMonthAggregatesFromRows(
  rawRows: { amount: number | string; date: string; budget_id?: string | null; transaction_type?: string | null }[],
): TxMonthAggregateRow[] {
  const groups = new Map<string, TxMonthAggregateRow>()
  for (const r of rawRows) {
    const month = r.date.slice(0, 7)
    const bid = r.budget_id ?? null
    const type = r.transaction_type ?? null
    const key = `${month} ${bid ?? ''} ${type ?? ''}`
    let g = groups.get(key)
    if (!g) {
      g = { month, budget_id: bid, transaction_type: type, sum_positief: 0, sum_negatief: 0, count: 0 }
      groups.set(key, g)
    }
    const amt = Number(r.amount)
    if (amt > 0) g.sum_positief = Number(g.sum_positief) + amt
    else if (amt < 0) g.sum_negatief = Number(g.sum_negatief) + amt
    g.count = Number(g.count) + 1
  }
  return [...groups.values()]
}
