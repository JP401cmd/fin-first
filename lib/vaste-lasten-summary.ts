// lib/vaste-lasten-summary.ts
// Gedeelde bron-van-waarheid voor de vaste-lasten-samenvatting: confirmed
// recurring_transactions (amount < 0, niet 'excluded') + auto-detectie over de
// laatste 12 maanden transacties. Geëxtraheerd uit app/api/subscriptions/route.ts
// zodat zowel die API (de Vaste-lasten-pagina) als de cashflow-landingskaart
// EXACT hetzelfde totaal tonen — voorheen telde de kaart alleen confirmed rows
// en miste auto-gedetecteerde vaste lasten.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  detectRecurringTransactions,
  detectCategory,
  CATEGORY_LABELS,
  type RecurringCategory,
} from '@/lib/recurring-detection'
import { isRecurringExpired } from '@/lib/recurring-data'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import { roundCents } from '@/lib/format'
import { getCachedUser } from '@/lib/supabase/cached-user'
import {
  vasteLastenFingerprint,
  readVasteLastenCache,
  writeVasteLastenCache,
} from '@/lib/vaste-lasten-cache'

/** De bevestigde vaste lasten zoals de samenvatting ze leest. */
type RecurringRow = {
  id: string
  counterparty_name: string | null
  amount: number | string | null
  name: string
  frequency: string | null
  category_override: string | null
  end_date: string | null
}

/** Kolomset die `detectRecurringTransactions` nodig heeft (getrimd). */
type RecurringTxRow = {
  id: string
  date: string
  amount: number | string
  description: string | null
  counterparty_name: string | null
  is_income: boolean | null
  budget_id: string | null
  transaction_type: string | null
}

/**
 * Haal ALLE 12-maands transactie-rijen op via KEYSET-paginatie op (date, id).
 * PostgREST kapt elk antwoord af op `max_rows` (config.toml = 1000) — een enkele
 * `.limit(n)` boven die grens is een NO-OP. Voor recurring-detectie moeten we
 * élke transactie zien, anders mist de detectie (en dus het vaste-lasten-totaal)
 * transacties bij tx-rijke gebruikers.
 *
 * WAAROM KEYSET EN NIET `.range()` (T3.2): met OFFSET moest de database voor elke
 * volgende pagina het hele venster opnieuw opbouwen en sorteren om er de eerste
 * `from` rijen van weg te gooien. De huishouden-OR in de RLS-policy dwingt boven-
 * dien een BitmapOr af, en een bitmapscan levert geen gesorteerde uitvoer — dus
 * die sortering is er écht, elke pagina opnieuw. De cursor hieronder tilt in
 * plaats daarvan de ondergrens van het venster mee op: elke volgende pagina leest
 * strikt minder dan de vorige.
 *
 * WAAROM (date, id) EN NIET ALLEEN `id`: de primaire sleutel is een random UUID.
 * Ordenen op `id` laat de planner de samengestelde (user_id, date)-index los en
 * de PK-index in willekeurige heap-volgorde aflopen, met datum én RLS als filter
 * — hij gooit dan een veelvoud weg van wat hij teruggeeft. Gemeten met EXPLAIN
 * (ANALYZE, BUFFERS) op productie was die vorm duurder in zowel gelezen buffers
 * als tijd dan de OFFSET-variant die hij moest vervangen; met de samengestelde
 * cursor is het juist duidelijk goedkoper. LET OP bij hermeten: die plannen liepen
 * als tabel-eigenaar, dus ZONDER de RLS-predicaten. De verhouding tussen de drie
 * vormen is structureel (een random-UUID-ordening kan de (user_id, date)-index
 * per definitie niet gebruiken) en de huishouden-OR maakt de OFFSET-variant onder
 * RLS juist duurder, niet goedkoper — maar de absolute getallen zijn niet wat een
 * gebruiker ziet. (Meetwaarden staan in het taakrapport, buiten deze repo.)
 *
 * GEDRAGSNEUTRAAL: de rijen komen in exact dezelfde volgorde binnen als hiervoor,
 * want de sorteersleutel (date, id) is ongewijzigd — alleen de manier waarop we
 * de pagina's afbakenen verandert. Dat is niet louter cosmetisch: de detectie
 * sorteert per groep zelf op datum (`lib/recurring-detection.ts`, `sortedTx`),
 * maar `getMostCommon` breekt gelijkspel op de VOLGORDE VAN BINNENKOMST, en de
 * eindsortering op (confidence, bedrag) doet dat ook — via een stabiele sort, dus
 * op de volgorde waarin de groepen zijn ontdekt. Twee even vaak voorkomende
 * omschrijvingen, of twee vaste lasten met hetzelfde bedrag en dezelfde
 * betrouwbaarheid, zouden bij een andere aanlevervolgorde dus stil kunnen
 * omwisselen. Door (date, id) te behouden is dat geen open eind maar een
 * uitgesloten geval — vastgelegd in lib/vaste-lasten-summary.keyset.test.ts.
 *
 * GEEN expliciete `.eq('user_id', ...)`: die zou de planner weliswaar een
 * geordende Index Scan gunnen, maar de SELECT-policy op `transactions` is
 * huishouden-inclusief (eigen rijen OF `ownership = 'shared'` binnen het
 * huishouden). Vastpinnen op de eigen user_id laat de gedeelde partnerrijen stil
 * wegvallen uit het vaste-lastentotaal — een gedragswijziging, geen optimalisatie.
 *
 * `complete` MELDT OF DE OPHAAL HEEL IS. Een paginafout wordt hier al sinds jaar
 * en dag geslikt: we geven terug wat we tot dan toe hadden, en het volgende
 * verzoek probeerde het gewoon opnieuw. Met de vingerafdruk-cache (T3.3) erachter
 * is dat niet meer onschuldig — de vingerafdrukronde is dan wél geslaagd, dus een
 * afgekapte uitkomst zou onder een GELDIGE vingerafdruk worden vastgepind en tot
 * de volgende datawijziging of het einde van de TTL geserveerd. Bij een fout op
 * de eerste pagina is dat het ergst: nul rijen betekent dat de detectie helemaal
 * wordt overgeslagen, en dan zou één storing de automatisch gedetecteerde vaste
 * lasten een half uur lang laten verdwijnen. De aanroeper onthoudt daarom alleen
 * een HELE uitkomst.
 */
async function fetchAllRecurringTx(
  supabase: SupabaseClient,
  startDateStr: string,
): Promise<{ rows: RecurringTxRow[]; complete: boolean }> {
  const PAGE = 1000
  const rows: RecurringTxRow[] = []
  let cursor: { date: string; id: string } | null = null
  for (;;) {
    // De cursorwaarden komen uit een DATE- en een UUID-kolom, dus uit een
    // vastliggende tekenset — ze kunnen de PostgREST-filtergrammatica hieronder
    // niet breken.
    const base = supabase
      .from('transactions')
      .select('id, date, amount, description, counterparty_name, is_income, budget_id, transaction_type')
      .gte('date', cursor ? cursor.date : startDateStr)
    const scoped = cursor
      ? base.or(`date.gt.${cursor.date},and(date.eq.${cursor.date},id.gt.${cursor.id})`)
      : base
    const { data, error } = await scoped
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE)
    if (error) return { rows, complete: false }
    const batch = (data ?? []) as RecurringTxRow[]
    rows.push(...batch)
    if (batch.length < PAGE) break
    const last = batch[batch.length - 1]
    // De cursor schuift altijd strikt op: de OR sluit de cursorrij zelf uit.
    cursor = { date: last.date, id: last.id }
  }
  return { rows, complete: true }
}

const SUBSCRIPTION_CATEGORIES: RecurringCategory[] = ['subscription']
const VASTE_KOSTEN_CATEGORIES: RecurringCategory[] = [
  'rent', 'mortgage', 'utility', 'insurance', 'transport', 'taxes',
  'childcare', 'housing_other', 'healthcare', 'donation', 'loan',
]

export interface VasteLastenItem {
  id: string
  name: string
  averageAmount: number
  monthlyAmount: number
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  nextDate: string | null
  confidence: 'low' | 'medium' | 'high'
  isVariableAmount: boolean
  occurrences: number | null
  alreadyConfirmed: boolean
  category: RecurringCategory
  categoryLabel: string
  categoryOverride: string | null
}

export interface VasteLastenSummary {
  subscriptions: VasteLastenItem[]
  vasteKosten: VasteLastenItem[]
  totalMonthlySubscriptions: number
  totalMonthlyVasteKosten: number
  totalMonthly: number
  count: number
}

const EMPTY: VasteLastenSummary = {
  subscriptions: [],
  vasteKosten: [],
  totalMonthlySubscriptions: 0,
  totalMonthlyVasteKosten: 0,
  totalMonthly: 0,
  count: 0,
}

function toMonthly(amount: number, frequency: string): number {
  const abs = Math.abs(amount)
  switch (frequency) {
    case 'weekly':
      return (abs * 52) / 12
    case 'quarterly':
      return abs / 3
    case 'yearly':
      return abs / 12
    default:
      return abs // monthly
  }
}

/**
 * Eén goedkope ronde die de vingerafdruk van het detectie-invoermateriaal
 * ophaalt: één telling plus drie maxima over het transactievenster, en de
 * (kleine, begrensde) actieve recurring-rijen — die laatste hebben we op een miss
 * tóch nodig, dus ze kosten geen extra roundtrip. Alles parallel: de latency is
 * er één, niet vijf.
 *
 * De vensterafbakening is identiek aan die van de ophaal (`.gte('date', ...)`) en
 * loopt door dezelfde RLS-policy, dus de vingerafdruk meet exact de rijenset die
 * de detectie straks te zien krijgt — inclusief de gedeelde huishoudrijen.
 *
 * `error` op welk onderdeel dan ook levert `null` op: de aanroeper slaat de cache
 * dan volledig over. Een half gevulde vingerafdruk zou anders stabiel genoeg
 * kunnen lijken om een verkeerde samenvatting op vast te pinnen.
 */
async function loadFingerprintRound(
  supabase: SupabaseClient,
  startDateStr: string,
): Promise<{ fingerprint: string | null; recurring: RecurringRow[] }> {
  // `order(kolom desc).limit(1)` is de PostgREST-vorm van `max(kolom)`: één rij,
  // één kolom, geen payload van betekenis.
  const maxOf = async (column: 'date' | 'created_at' | 'updated_at') => {
    const { data, error } = await supabase
      .from('transactions')
      .select(column)
      .gte('date', startDateStr)
      .order(column, { ascending: false })
      .limit(1)
    const row = (data ?? [])[0] as Record<string, string | null> | undefined
    return { value: row?.[column] ?? null, error }
  }

  const [countResult, transferCount, maxDate, maxCreated, maxUpdated, recurringResult] =
    await Promise.all([
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .gte('date', startDateStr),
      // Het aantal rijen dat de detectie WEGGOOIT (`transaction_type` is
      // 'transfer'/'joint_transfer'). Zonder deze telling ziet de vingerafdruk
      // niet dat iemand een boeking als overboeking markeert: het totale aantal
      // rijen blijft gelijk, de datums ook, en géén van de paden die dit doen
      // schrijft `updated_at` mee — dus ook dat signaal zwijgt. Dat is een
      // bewuste gebruikersactie met een zichtbaar gevolg voor het
      // vaste-lastentotaal, dus die hoort niet in een TTL-venster te blijven
      // hangen.
      //
      // Minstens VIER update-paden zetten dit veld om op een bestaande rij:
      // app/api/own-accounts/reclassify (batch), transfer-confirm-sheet (per
      // boeking), lib/category-rules.ts (directe toewijzing én de retro-set) en
      // ai-categorize-sheet.tsx (bulk-toewijzing én handleSave). Daarnaast zijn
      // er insert-paden (manual-transfer-sheet.tsx) die `txCount` sowieso al
      // bewegen.
      //
      // Tel die lijst NIET na als je hier iets wijzigt: deze telling meet
      // DB-STAAT, niet schrijvers. De dekking volgt uit de gemeten staat en niet
      // uit een inventarisatie, dus elk toekomstig pad dat `transaction_type`
      // omzet is er per constructie al door gedekt. (ADR 0078.)
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .gte('date', startDateStr)
        .in('transaction_type', ['transfer', 'joint_transfer']),
      maxOf('date'),
      maxOf('created_at'),
      maxOf('updated_at'),
      supabase
        .from('recurring_transactions')
        .select('id, counterparty_name, amount, name, frequency, category_override, end_date')
        .eq('is_active', true),
    ])

  const recurring = (recurringResult.data ?? []) as RecurringRow[]
  const failed =
    countResult.error ||
    transferCount.error ||
    maxDate.error ||
    maxCreated.error ||
    maxUpdated.error ||
    recurringResult.error
  if (failed) return { fingerprint: null, recurring }

  return {
    fingerprint: vasteLastenFingerprint({
      windowStart: startDateStr,
      txCount: countResult.count ?? null,
      txTransferCount: transferCount.count ?? null,
      txMaxDate: maxDate.value,
      txMaxCreatedAt: maxCreated.value,
      txMaxUpdatedAt: maxUpdated.value,
      recurring,
    }),
    recurring,
  }
}

/**
 * Detecteert vaste lasten uit de laatste 12 maanden transactie-historie +
 * confirmed recurring_transactions. Queries zijn RLS-gescoped op de ingelogde
 * gebruiker. `cache()` dedupt per request.
 *
 * De auth-check loopt via `getCachedUser` (óók `cache()`-gewrapt): op de
 * cashflow-hub draait deze loader naast de dashboard-/cashflow-loaders, die
 * dezelfde helper gebruiken. Een rauwe `auth.getUser()` zou hier een extra,
 * BLOKKERENDE `/auth/v1/user`-roundtrip vóór de `Promise.all` hieronder zetten.
 *
 * VINGERAFDRUK-CACHE (T3.3, lib/vaste-lasten-cache.ts): vóór het dure pad draait
 * één goedkope ronde die vaststelt óf het invoermateriaal veranderd is. Zo niet,
 * dan komt de vorige samenvatting terug en blijven zowel de meerpagina-download
 * als de regex-zware detectie staan. React `cache()` blijft eronder liggen voor
 * de deduplicatie BINNEN één request; deze cache overbrugt requests. Op een miss
 * kost de vingerafdrukronde één extra, seriële roundtrip vóór de zware fetch —
 * bewust geaccepteerd: die roundtrip is aggregaten zonder payload, de download
 * erna is megabytes.
 */
export const loadVasteLastenSummary = cache(
  async (supabase: SupabaseClient): Promise<VasteLastenSummary> => {
    const user = await getCachedUser(supabase)
    if (!user) return EMPTY

    const now = new Date()
    // 12-maands ondergrens, tijdzone-veilig (nooit toISOString() — dat schuift de
    // grens in NL een dag terug).
    const startDateStr = localMonthStartMonthsAgo(now, 11)

    const { fingerprint, recurring: existingRecurrings } = await loadFingerprintRound(
      supabase,
      startDateStr,
    )
    if (fingerprint) {
      const cached = readVasteLastenCache(user.id, fingerprint)
      if (cached.hit) return cached.summary
    }

    const [txFetch, budgetResult] = await Promise.all([
      fetchAllRecurringTx(supabase, startDateStr),
      supabase
        .from('budgets')
        .select('id, name, parent_id, budget_type')
        .order('sort_order', { ascending: true }),
    ])
    const transactions = txFetch.rows
    const budgets = budgetResult.data ?? []

    /**
     * Legt de uitkomst vast onder de zojuist gemeten vingerafdruk — maar alléén
     * als de ophaal HEEL was. Een afgekapte ophaal levert een te laag totaal (of,
     * bij een fout op pagina 1, helemaal geen detectie), en dát een half uur
     * vastpinnen onder een geldige vingerafdruk maakt één storing zichtbaar veel
     * erger dan hij is. Dezelfde faaldiscipline als in `loadFingerprintRound`:
     * gedegradeerde invoer wordt niet onthouden.
     *
     * Een fout op `budgets` telt hier bewust NIET mee: die lijst kan de uitkomst
     * niet beïnvloeden (zie ADR 0078 — `detectRecurringTransactions` leest de
     * parameter niet en `VasteLastenItem` draagt geen budget-afgeleid veld).
     */
    const remember = (summary: VasteLastenSummary): VasteLastenSummary => {
      if (fingerprint && txFetch.complete) writeVasteLastenCache(user.id, fingerprint, summary)
      return summary
    }

    // Confirmed recurring items uit DB (alleen uitgaven: amount < 0), exclusief
    // door de gebruiker als 'excluded' gemarkeerde items.
    const confirmedItems: VasteLastenItem[] = existingRecurrings
      .filter(
        (r) =>
          Number(r.amount) < 0 &&
          r.category_override !== 'excluded' &&
          !isRecurringExpired({ end_date: r.end_date ?? null }),
      )
      .map((r) => {
        const name = r.name || r.counterparty_name || 'Onbekend'
        const autoCategory = detectCategory(r.counterparty_name ?? '', name, false)
        const category: RecurringCategory = r.category_override === 'subscription'
          ? 'subscription'
          : r.category_override === 'vaste_kosten'
            ? 'other_expense'
            : autoCategory
        return {
          id: r.id,
          name,
          averageAmount: Math.abs(Number(r.amount)),
          monthlyAmount: toMonthly(Number(r.amount), r.frequency ?? 'monthly'),
          frequency: (r.frequency ?? 'monthly') as VasteLastenItem['frequency'],
          nextDate: null,
          confidence: 'high',
          isVariableAmount: false,
          occurrences: null,
          alreadyConfirmed: true,
          category,
          categoryLabel: CATEGORY_LABELS[category],
          categoryOverride: r.category_override ?? null,
        }
      })

    if (transactions.length < 3) {
      const subs = confirmedItems.filter((i) => SUBSCRIPTION_CATEGORIES.includes(i.category))
      const vk = confirmedItems.filter(
        (i) => VASTE_KOSTEN_CATEGORIES.includes(i.category) || i.category === 'other_expense',
      )
      const totalSubs = subs.reduce((s, i) => s + i.monthlyAmount, 0)
      const totalVK = vk.reduce((s, i) => s + i.monthlyAmount, 0)
      return remember({
        subscriptions: subs,
        vasteKosten: vk,
        totalMonthlySubscriptions: roundCents(totalSubs),
        totalMonthlyVasteKosten: roundCents(totalVK),
        totalMonthly: roundCents(totalSubs + totalVK),
        count: subs.length + vk.length,
      })
    }

    const allDetected = detectRecurringTransactions(
      transactions.map((t) => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        description: t.description ?? '',
        counterparty_name: t.counterparty_name ?? null,
        is_income: t.is_income ?? false,
        budget_id: t.budget_id ?? null,
        transaction_type: t.transaction_type ?? null,
      })),
      // Exact de drie velden die de detector declareert (hij gebruikt er de
      // genormaliseerde namen-set mee); `amount` is in de DB NUMERIC en dus
      // nullable, dus hier expliciet genormaliseerd i.p.v. impliciet `any`.
      existingRecurrings.map((r) => ({
        counterparty_name: r.counterparty_name,
        amount: Number(r.amount),
        name: r.name,
      })),
      budgets,
    )

    const relevantCategories = [...SUBSCRIPTION_CATEGORIES, ...VASTE_KOSTEN_CATEGORIES]
    const detected = allDetected.filter(
      (d) =>
        relevantCategories.includes(d.suggestedCategory) &&
        !d.isIncome &&
        d.confidence !== 'low',
    )
    const detectedOther = allDetected.filter(
      (d) => d.suggestedCategory === 'other_expense' && !d.isIncome && d.confidence !== 'low',
    )

    const detectedItems: VasteLastenItem[] = [...detected, ...detectedOther].map((d) => ({
      id: d.key,
      name: d.counterpartyName || d.commonDescription,
      averageAmount: Math.abs(d.averageAmount),
      monthlyAmount: toMonthly(d.averageAmount, d.frequency),
      frequency: d.frequency,
      nextDate: null,
      confidence: d.confidence,
      isVariableAmount: d.isVariableAmount,
      occurrences: d.occurrences,
      alreadyConfirmed: d.alreadyExists,
      category: d.suggestedCategory,
      categoryLabel: CATEGORY_LABELS[d.suggestedCategory],
      categoryOverride: null,
    }))

    const newDetections = detectedItems.filter((s) => !s.alreadyConfirmed)
    const allItems = [
      ...confirmedItems.filter(
        (i) => relevantCategories.includes(i.category) || i.category === 'other_expense',
      ),
      ...newDetections,
    ]

    const subscriptions = allItems.filter(
      (i) =>
        i.categoryOverride === 'subscription' ||
        (!i.categoryOverride && SUBSCRIPTION_CATEGORIES.includes(i.category)),
    )
    const vasteKosten = allItems.filter(
      (i) =>
        i.categoryOverride === 'vaste_kosten' ||
        (!i.categoryOverride &&
          (VASTE_KOSTEN_CATEGORIES.includes(i.category) || i.category === 'other_expense')),
    )
    const totalSubs = subscriptions.reduce((s, i) => s + i.monthlyAmount, 0)
    const totalVK = vasteKosten.reduce((s, i) => s + i.monthlyAmount, 0)

    return remember({
      subscriptions,
      vasteKosten,
      totalMonthlySubscriptions: roundCents(totalSubs),
      totalMonthlyVasteKosten: roundCents(totalVK),
      totalMonthly: roundCents(totalSubs + totalVK),
      count: subscriptions.length + vasteKosten.length,
    })
  },
)
