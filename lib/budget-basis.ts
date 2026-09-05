// lib/budget-basis.ts
//
// DE BUDGETGRONDSLAG — de enige plek waar een budgetsom een grondslag wordt
// ───────────────────────────────────────────────────────────────────────────
// ADR 0103 maakt de grondslag van "geschat inkomen" en "geschatte uitgaven" een
// expliciete keuze: budgetten, transacties of een eigen bedrag. Deze module doet
// precies één ding: uit de budgetrijen van een gebruiker het JAARBEDRAG per kant
// (income/expense) afleiden, plus de lijst selecteerbare posten waarop de
// gebruiker zijn uitsluitingen zet.
//
// PUUR. Geen I/O, geen Supabase-import, geen datum-afhankelijkheid. De rijen
// komen van de caller (loader/route); die kent de RLS-scoping.
//
// WAT HIER NIET GEBEURT:
//  • Geen eigen jaarconversie — `annualAmount` uit lib/budget-utils.ts is de ENIGE
//    toegestane monthly ×12 / quarterly ×4 / yearly ×1-regel.
//  • Geen eigen type-erfregel — `buildBudgetTypeMap` uit lib/budget-utils.ts
//    bepaalt dat een kind het type van zijn parent erft.
//  • Geen precedentie tussen budget/transactie/handmatig — dat is
//    `resolveAmountWithBasis` in lib/effective-financials.ts.

import { annualAmount, buildBudgetTypeMap } from '@/lib/budget-utils'
import {
  EMPTY_REALIZED_WINDOW,
  REALIZED_WINDOW_MONTHS,
  type BudgetRealizedWindow,
} from '@/lib/budget-realized'

/**
 * De KEUZE die op `profiles.income_source` / `profiles.expenses_source` staat.
 * `'auto'` is geen vierde optie in de interface maar de waarde die een rij draagt
 * zolang de gebruiker nooit koos ("kies voor mij") — zie ADR 0103.
 */
export type BasisSource = 'auto' | 'budget' | 'transaction' | 'manual' | 'estimate'

/**
 * De UITKOMST van de grondslagbeslissing. Bevat bewust GEEN `'auto'`: dat is een
 * resolutiestrategie, geen grondslag. De resolver geeft altijd één van deze
 * concrete uitspraken terug, zodat elk oppervlak kan benoemen waar zijn getal
 * vandaan komt.
 *
 * DRIE STATEN (ADR 0131, eigenaarbesluit 5 sep 2026): een bedrag is
 *   • GEMETEN/OPGEGEVEN — `budget` | `transaction` | `manual` | `profile`;
 *   • GESCHAT — `estimate`: de app heeft het zelf geraden ("Schat het voor me",
 *     CBS-leeftijdsband). Voedt score en briefing wél, maar draagt zijn label
 *     mee tot de gebruiker het vervangt;
 *   • ONBEKEND — `unknown`: er is niets — geen keuze, geen meting, geen
 *     profielbedrag > 0. Het bedrag in de rekenketen is dan 0, maar dat is géén
 *     meting: oppervlakken geven er geen oordeel over (geen score, geen
 *     "0 %", geen advies op de nul), maar één zin en één knop.
 *
 * Vóór ADR 0131 verdween "nooit ingevuld" stil in de `profile`-terugval met
 * bedrag 0, en las elke consument dat als een echte nul.
 */
export type ResolvedBasis = 'budget' | 'transaction' | 'manual' | 'profile' | 'estimate' | 'unknown'

/**
 * De bronwaarden die een GEBRUIKER mag kiezen. `'estimate'` staat er bewust
 * NIET in: die zet alleen de app zelf (onboarding, "Schat het voor me") en
 * `sanitizeCashSettingsInput` weigert 'm daarom van de client — een schatting
 * is een placeholder, geen keuze.
 */
export const BASIS_SOURCES: readonly BasisSource[] = ['auto', 'budget', 'transaction', 'manual']

/**
 * Menselijk label per grondslag — het harde acceptatiecriterium uit ADR 0103:
 * elke kaart benoemt waar zijn getal vandaan komt. Een grondslag die kan
 * schuiven zonder zich bekend te maken is een tweede waarheid met vertraging.
 *
 * Woonde tot 31 aug 2026 in `components/overview/cashflow-instellingen-blok.tsx`
 * en is hierheen verhuisd toen de spaarquote app-breed op de EFFECTIEVE
 * grondslag kwam te staan: het instellingenblok, de forecast-kaart en de
 * spaarquote-widget benoemen sindsdien dezelfde grondslag, en drie kopieën van
 * dezelfde vier woorden zijn drie kansen op afwijkende copy. Het blok
 * her-exporteert 'm, zodat bestaande imports blijven werken.
 */
export const BASIS_LABEL: Record<ResolvedBasis, string> = {
  budget: 'uit je budgetten',
  transaction: 'uit je transacties',
  manual: 'eigen invoer',
  profile: 'uit je profiel',
  estimate: 'geschat op je leeftijd',
  unknown: 'nog niet bekend',
}

/**
 * Dezelfde grondslag, maar als ZINSDEEL — met voorzetsel, zodat hij in een lopende
 * zin past.
 *
 * `BASIS_LABEL` is een LOSSE aanduiding onder een cijfer ("uit je budgetten") en
 * werkt daar prima. Ingeplakt in een zin loopt hij alleen goed af voor de
 * budget- en transactievariant: "Van je inkomen uit je budgetten hou je 30 %
 * over" leest nog, maar `manual` gaf "Van je inkomen eigen invoer hou je 30 %
 * over" en de gemengde variant "Van je inkomen gemengde grondslag …". Twee van de
 * vijf mogelijke waarden waren dus kapot, en de één die getest werd was toevallig
 * de één die leest.
 *
 * Vandaar twee vormen naast elkaar in plaats van één dubbelgebruikte: een kaart
 * kiest het label, een zin kiest de frase.
 */
export const BASIS_PHRASE: Record<ResolvedBasis, string> = {
  budget: 'volgens je budgetten',
  transaction: 'volgens je transacties',
  manual: 'volgens je eigen invoer',
  profile: 'volgens je profiel',
  estimate: 'volgens een schatting op je leeftijd',
  // Een zin over een onbekende grondslag hoort niet te bestaan — oppervlakken
  // toetsen eerst `isUnknownBasis` en tonen dan geen zin. Dit is het vangnet.
  unknown: 'zonder bekende grondslag',
}

/**
 * Is er voor deze kant helemaal niets bekend? De ENE toets (ADR 0131), zodat
 * geen oppervlak zelf `=== 'unknown'` hoeft te schrijven.
 */
export function isUnknownBasis(basis: ResolvedBasis | null | undefined): boolean {
  return basis === 'unknown'
}

/** De zinsvorm bij een GEMENGDE grondslag (inkomen en uitgaven verschillen). */
export const BASIS_PHRASE_MIXED = 'volgens een gemengde grondslag'

/**
 * Het grondslag-label bij de SPAARQUOTE. De quote volgt twee grondslagen
 * (inkomen én uitgaven, ADR 0103); vallen die samen, dan draagt de kaart dat ene
 * label, anders is het eerlijker om te zeggen dát het gemengd is dan één van de
 * twee te noemen.
 */
export function savingsRateBasisLabel(
  incomeBasis: ResolvedBasis,
  expensesBasis: ResolvedBasis,
): string {
  // Ontbreekt één kant, dan is de quote niet te bepalen — "gemengde grondslag"
  // zou dat gat verstoppen achter een label dat een bestaande meting suggereert.
  if (isUnknownBasis(incomeBasis) || isUnknownBasis(expensesBasis)) return BASIS_LABEL.unknown
  return incomeBasis === expensesBasis ? BASIS_LABEL[incomeBasis] : 'gemengde grondslag'
}

/**
 * Dezelfde uitspraak als `savingsRateBasisLabel`, maar als zinsdeel met
 * voorzetsel — voor de plekken waar de grondslag in een lopende zin staat
 * (bv. de Eenvoudig-tekst op de forecast-pagina). Zie `BASIS_PHRASE`.
 */
export function savingsRateBasisPhrase(
  incomeBasis: ResolvedBasis,
  expensesBasis: ResolvedBasis,
): string {
  if (isUnknownBasis(incomeBasis) || isUnknownBasis(expensesBasis)) return BASIS_PHRASE.unknown
  return incomeBasis === expensesBasis ? BASIS_PHRASE[incomeBasis] : BASIS_PHRASE_MIXED
}

/**
 * Is de getoonde (effectieve) spaarquote IDENTIEK aan de gemeten 6-maands
 * transactiequote? Alleen dán zeggen `savingsRateIsEstimate` en de
 * transactie-kassabon iets over het getal op het scherm — bij elke andere
 * grondslag-combinatie komt de quote uit een keuze van de gebruiker en is een
 * "geschat"-markering onjuist (zie `resolveSavingsSource`).
 */
export function savingsRateFollowsTransactions(
  incomeBasis: ResolvedBasis,
  expensesBasis: ResolvedBasis,
): boolean {
  return incomeBasis === 'transaction' && expensesBasis === 'transaction'
}

/**
 * DRAGENDE INVARIANT (ADR 0103), geen filterkeuze:
 * de uitgavengrondslag bestaat UITSLUITEND uit `budget_type = 'expense'`.
 *
 * `savings`- en `debt`-budgetten vallen er per constructie buiten, en dáárop
 * steunt lib/savings-source.ts: de spaarbudget-/aflossingscorrectie die het
 * transactiepad nodig heeft (omdat een rúwe transactiesom spaarstortingen en
 * aflossing ten onrechte als uitgave meetelt) mag op de budgetgrondslag NIET
 * worden toegepast — het geld is er nooit afgehaald. Zou de grondslag ooit "alle
 * budgetten" gaan betekenen, dan wordt die correctie weer noodzakelijk en klopt
 * ADR 0103 niet meer. Vergrendeld in lib/budget-basis.test.ts.
 */
export const BASIS_BUDGET_TYPE: Readonly<Record<'income' | 'expense', string>> = {
  income: 'income',
  expense: 'expense',
}

/** Bovengrens op het aantal posten dat we teruggeven (degeneratie-vangnet). */
export const MAX_BASIS_ENTRIES = 500

/**
 * Budgetrij zoals de loaders 'm uit `select('*')` (of een expliciete kolomlijst)
 * krijgen. `default_limit` mag string|number|null zijn — PostgREST levert NUMERIC
 * als string.
 */
export interface BudgetBasisRow {
  id: string
  parent_id: string | null
  budget_type: string
  name: string
  default_limit: number | string | null
  interval: string | null
  is_archived?: boolean | null
  merged_into?: string | null
  /**
   * 'personal' | 'shared'. Wordt door `computeBudgetBasis` ZELF niet gelezen —
   * de deelfractie komt binnen via `opts.shareFractionById`, zodat deze module
   * puur blijft en niets van huishoudens hoeft te weten. Het veld staat hier
   * omdat de callers dezelfde rijen aan `budgetShareFractionById`
   * (lib/household/budget-share.ts) doorgeven en de kolom anders door de cast
   * uit het type zou vallen.
   */
  ownership?: string | null
  /**
   * Aanmaakmoment (`budgets.created_at`, NOT NULL DEFAULT now()). Anker voor de
   * extrapolatie-deler; zie `resolveDenominatorMonths`. Optioneel getypt zodat
   * een rij zonder de kolom niet breekt — dan vervalt de extrapolatie.
   */
  created_at?: string | null
}

/**
 * Waar het bedrag van één post vandaan komt.
 *
 * `'realized'` = de gemeten transacties over het venster (de norm sinds de
 * correctie van 11 aug 2026), `'planned'` = de ingestelde limiet, gebruikt als
 * TERUGVAL wanneer er in het venster niets op dit budget is geboekt.
 */
export type BudgetAmountSource = 'realized' | 'planned'

/** Eén selecteerbare post zoals de UI 'm toont (ook de uitgesloten). */
export interface BudgetBasisEntry {
  id: string
  name: string
  interval: string
  /** Jaarbedrag NA de deelfractie; 0 wanneer er geen limiet én geen realisatie is. */
  annualAmount: number
  excluded: boolean
  /** Waar `annualAmount` van deze post vandaan komt. */
  source: BudgetAmountSource
  /**
   * Het meetvenster van deze post in maanden (0 = geen transactiedata → de post
   * staat op `'planned'`). Zie `BudgetRealizedEntry.coveredMonths`: dit is de
   * spanwijdte vanaf de eerste boeking, niet het aantal maanden mét een boeking.
   */
  realizedMonths: number
  /**
   * De GEPLANDE jaarlimiet (na deelfractie), OOK wanneer `source='realized'`.
   * Zo kan de UI plan naast realisatie zetten zonder de limiet apart te halen.
   */
  plannedAnnualAmount: number
}

export interface BudgetBasisResult {
  /** Som van de NIET-uitgesloten posten, na deelfractie. */
  annualTotal: number
  /** `annualTotal / 12`. */
  monthlyTotal: number
  /** ALLE selecteerbare posten (ook de uitgesloten), voor de UI. */
  entries: BudgetBasisEntry[]
  /** Zijn er überhaupt bruikbare budgetten van dit type? */
  hasBudgets: boolean
  /** Er zijn posten, maar de gebruiker heeft ze allemaal uitgesloten. */
  allExcluded: boolean
  /** Breedte van het realisatie-meetvenster in maanden (12). */
  realizedWindowMonths: number
  /** Kanarie uit het aggregaat: een chunk kwam op exact de PostgREST-cap terug. */
  truncationSuspected: boolean
}

const EMPTY: BudgetBasisResult = {
  annualTotal: 0,
  monthlyTotal: 0,
  entries: [],
  hasBudgets: false,
  allExcluded: false,
  realizedWindowMonths: REALIZED_WINDOW_MONTHS,
  truncationSuspected: false,
}

/** `default_limit` defensief: PostgREST levert NUMERIC als string; null/undefined → 0. */
function limitOf(row: BudgetBasisRow): number {
  return Number(row.default_limit) || 0
}

/** Aantal maanden van `created_at` t/m `windowEndMonth`, beide inclusief. */
function monthsSinceCreation(createdAt: unknown, windowEndMonth: string): number | null {
  if (typeof createdAt !== 'string' || !windowEndMonth) return null
  const created = createdAt.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(created) || !/^\d{4}-\d{2}$/.test(windowEndMonth)) return null
  const [cy, cm] = created.split('-').map(Number)
  const [wy, wm] = windowEndMonth.split('-').map(Number)
  return (wy - cy) * 12 + (wm - cm) + 1
}

/**
 * DE DELER waarmee de realisatie naar een jaarbedrag wordt geschaald.
 *
 * = clamp( max(leeftijd van het budget, spanwijdte van de boekingen), 1, 12 )
 *
 * WAAROM DE LEEFTIJD EN NIET DE SPANWIJDTE. De realisatie is een METING over een
 * vast venster — "wat is er de afgelopen twaalf maanden op dit budget gebeurd" —
 * en niet een run-rate. Het antwoord op die vraag is de som; delen door twaalf is
 * dan de maandwaarde. Extrapolatie bestaat UITSLUITEND om te compenseren dat een
 * budget nog geen heel jaar bestaat, dus de deler hoort de leeftijd van het
 * budget te zijn.
 *
 * Ankeren op de spanwijdte van de boekingen (de eerste versie hiervan) is fout
 * aan de BOVENkant: een jaarlijkse gemeentebelasting die in de lopende maand is
 * afgeschreven heeft spanwijdte 1, en (€800 / 1) × 12 = €9.600 — twaalf keer te
 * hoog, en maandelijks golvend omdat de spanwijdte met het venster meeschuift.
 * Dat is dezelfde over-extrapolatie-fout-klasse die ADR 0050 voor het inkomen
 * opruimde (`extrapolateAnnualIncome` ankert daarom op de ALL-TIME vroegste
 * datum, niet op een venster-slice).
 *
 * BEWUSTE KEERZIJDE, afgewogen: een OUD budget dat pas sinds kort gebruikt wordt
 * (bv. een nieuw abonnement onder een bestaande categorie) wordt niet
 * opgeschaald — €200 in twee maanden telt als €200 per jaar, niet €1.200. Dat is
 * geen onderschatting maar het juiste antwoord op de vraag die deze grondslag
 * stelt: er ís het afgelopen jaar €200 uitgegeven. Blijft de gebruiker uitgeven,
 * dan groeit het getal vanzelf mee terwijl het venster opschuift. Het alternatief
 * zou een volatiele run-rate zijn die bij elke jaarpost ontspoort — en voor
 * uitgaven is te HOOG schatten net zo schadelijk (te late FIRE-datum) als te
 * laag. Van de twee fouten is deze de kleinste, de stabielste en de best
 * uitlegbare.
 *
 * `coveredMonths` blijft de ONDERGRENS: zijn er boekingen ouder dan `created_at`
 * (data-import, samengevoegd budget), dan is de leeftijd niet te vertrouwen en
 * dekt de data aantoonbaar meer maanden.
 *
 * Ontbrekende/onleesbare `created_at` → geen extrapolatie (deler = het volle
 * venster). Conservatief: liever niet opschalen dan ten onrechte ×12.
 */
function resolveDenominatorMonths(
  row: BudgetBasisRow,
  realizedEntry: { coveredMonths: number },
  realized: BudgetRealizedWindow,
): number {
  const windowMonths = Math.max(1, realized.windowMonths)
  const age = monthsSinceCreation(row.created_at, realized.windowEndMonth)
  const base = age != null && age > 0 ? age : windowMonths
  return Math.max(1, Math.min(windowMonths, Math.max(base, realizedEntry.coveredMonths)))
}

/**
 * De budgetgrondslag voor één kant (inkomen of uitgaven).
 *
 * SELECTEERBARE POSTEN — bewuste keuze van niveau:
 *   parents ZONDER kinderen  +  kinderen van parents die kinderen HEBBEN.
 * Dat is het niveau waarop het bedrag ontstaat. Een parent mét kinderen is zelf
 * géén post: zijn `default_limit` is dan een kop boven zijn kinderen en zou het
 * bedrag dubbel tellen. Zo kan de gebruiker ook precies uitsluiten wat hij
 * bedoelt ("niet de belastingteruggaaf, wél de vakantietoeslag") in plaats van
 * een hele groep in één klap.
 *
 * KIND-OPROL: elk kind telt met zijn EIGEN interval; ontbreekt dat, dan het
 * interval van de parent. Dit spiegelt `computeYearlyMustExpenses` en NIET de
 * constructie in `deriveBudgetTotals` (lib/cashflow-kpis.ts): die telt de
 * kinderlimieten rauw op en normaliseert de som met het PARENT-interval, waardoor
 * een maandkind onder een jaarouder 12× te laag telt. Zie het gelijknamige
 * aandachtspunt in lib/architecture/archimate-concerns.ts.
 *
 * UITSLUITEN, drie gronden, in deze volgorde:
 *   1. `is_archived === true` of `merged_into != null` → de rij bestaat niet meer
 *      als grondslag (en verdwijnt óók als parent, waardoor zijn kinderen als
 *      wees hun type verliezen — zie `buildBudgetTypeMap`);
 *   2. het type past niet (`BASIS_BUDGET_TYPE`, met de parent-erfregel);
 *   3. het id staat in `excludedIds` — dan blijft de post wél in `entries`
 *      staan (de UI moet 'm kunnen aanvinken), maar telt hij niet mee.
 * Een id in `excludedIds` dat nergens meer bestaat is betekenisloos en wordt
 * genegeerd, NOOIT een fout (ADR 0103: uitsluitlijst, geen insluitlijst).
 *
 * DEELFRACTIE: `opts.shareFractionById` laat een huishoud-gedeeld budget op het
 * eigen aandeel meetellen in het persoonlijke perspectief. Ontbreekt een id, dan
 * fractie 1 (= het huidige gedrag van elke andere budgetsom in de app).
 */
export function computeBudgetBasis(
  budgets: BudgetBasisRow[],
  type: 'income' | 'expense',
  excludedIds: string[],
  opts?: { shareFractionById?: Record<string, number>; realized?: BudgetRealizedWindow },
): BudgetBasisResult {
  if (!Array.isArray(budgets) || budgets.length === 0) return EMPTY

  // 1. Levende rijen: gearchiveerd of weggemerged telt nergens mee.
  const live = budgets.filter(b => b?.is_archived !== true && (b?.merged_into ?? null) === null)
  if (live.length === 0) return EMPTY

  // 2. Type per budget — de parent-erfregel is gedeeld (buildBudgetTypeMap).
  const typeMap = buildBudgetTypeMap(
    live.map(b => ({ id: b.id, parent_id: b.parent_id ?? null, budget_type: b.budget_type })),
  )
  const wanted = BASIS_BUDGET_TYPE[type]

  const parents = live.filter(b => (b.parent_id ?? null) === null)
  const childrenByParent = new Map<string, BudgetBasisRow[]>()
  for (const c of live) {
    const pid = c.parent_id ?? null
    if (pid === null) continue
    const list = childrenByParent.get(pid)
    if (list) list.push(c)
    else childrenByParent.set(pid, [c])
  }

  // 3. Posten op het niveau waar het bedrag ontstaat.
  const excluded = new Set(excludedIds ?? [])
  const shares = opts?.shareFractionById
  const realized = opts?.realized ?? EMPTY_REALIZED_WINDOW
  const entries: BudgetBasisEntry[] = []

  /**
   * Het GEREALISEERDE jaarbedrag van één budget, of null wanneer er in het
   * venster niets op geboekt is.
   *
   * RICHTING PER TYPE: een inkomstenbudget leest de positieve som, een
   * uitgavenbudget de absolute negatieve som — dezelfde splitsing die
   * `aggSumPositief` / `aggSumNegatiefAbs` in de loaders maken. Een negatief
   * bedrag op een inkomstenbudget (terugboeking) verlaagt zo niet stil het
   * inkomen, en andersom.
   *
   * EXTRAPOLATIE: zie `resolveDenominatorMonths` — de deler is de LEEFTIJD van
   * het budget binnen het venster, niet de spanwijdte van zijn boekingen.
   */
  const realizedAnnualOf = (row: BudgetBasisRow): { annual: number; months: number } | null => {
    const r = realized.byBudgetId[row.id]
    if (!r) return null
    const gross = type === 'income' ? r.incoming : r.outgoing
    if (!(gross > 0)) return null
    const months = resolveDenominatorMonths(row, r, realized)
    return { annual: (gross / months) * 12, months }
  }

  const push = (row: BudgetBasisRow, fallbackInterval: string | null, plannedZero = false) => {
    if (entries.length >= MAX_BASIS_ENTRIES) return
    const interval = row.interval ?? fallbackInterval ?? 'monthly'
    const fraction = shares?.[row.id]
    const share = typeof fraction === 'number' && Number.isFinite(fraction) ? fraction : 1

    // De geplande limiet blijft altijd beschikbaar — als terugval én als
    // vergelijkingswaarde naast de realisatie.
    const planned = (plannedZero ? 0 : annualAmount(limitOf(row), interval)) * share
    const hit = realizedAnnualOf(row)

    entries.push({
      id: row.id,
      name: row.name ?? 'Onbekend budget',
      interval,
      annualAmount: hit ? hit.annual * share : planned,
      excluded: excluded.has(row.id),
      source: hit ? 'realized' : 'planned',
      realizedMonths: hit ? hit.months : 0,
      plannedAnnualAmount: planned,
    })
  }

  for (const parent of parents) {
    if (typeMap.get(parent.id) !== wanted) continue
    const kids = childrenByParent.get(parent.id) ?? []
    if (kids.length > 0) {
      for (const kid of kids) push(kid, parent.interval)
      // KIND-OPROL bij realisatie. Transacties hangen aan het budget waarop ze
      // geboekt zijn; de kinderen zijn de posten en dekken hun eigen boekingen.
      // Een transactie die RECHTSTREEKS op de parent staat heeft daardoor geen
      // post — en die mag niet verdampen (dan telt het inkomen/de uitgave stil
      // te laag). De parent wordt daarom een EXTRA post, maar UITSLUITEND als er
      // echt op hem geboekt is. Zijn geplande limiet telt daarbij als 0: die is
      // een kop boven zijn kinderen en zou anders dubbel tellen met hun
      // limieten. Zo wordt elk budget_id precies één keer geteld, op zijn eigen
      // niveau, en verschijnt er geen lege extra vinkregel voor parents zonder
      // eigen boekingen.
      if (realizedAnnualOf(parent)) push(parent, null, true)
    } else {
      push(parent, null)
    }
  }

  if (entries.length === 0) return EMPTY

  const annualTotal = entries.reduce((s, e) => (e.excluded ? s : s + e.annualAmount), 0)
  return {
    annualTotal,
    monthlyTotal: annualTotal / 12,
    entries,
    hasBudgets: true,
    allExcluded: entries.every(e => e.excluded),
    realizedWindowMonths: realized.windowMonths,
    truncationSuspected: realized.truncationSuspected,
  }
}
