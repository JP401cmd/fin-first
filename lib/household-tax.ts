// lib/household-tax.ts
//
// Perspectief-bewuste Box 3-databron (plan Onderdeel 5 — Belasting).
//
// Dit is de ENIGE plek waar de Box 3-belasting voor het huishouden wordt
// samengesteld uit het fundament (`loadPerspectiveData`). De pure rekenkern —
// `calculateBox3` + `optimizePartnerAllocation` (lib/box3-data.ts) — blijft
// ONGEWIJZIGD; wij voeden hem alleen de juiste vermogensunie:
//
//   household-view  →  mijn-persoonlijk ∪ partner-persoonlijk ∪ gedeeld
//                      (gedeeld telt ÉÉN keer — niet per partner-aandeel).
//   personal-view   →  mijn-persoonlijk ∪ mijn aandeel van gedeeld.
//   partner-view    →  partner-persoonlijk ∪ partner-aandeel van gedeeld.
//
// Privacy is door de loader al server-side toegepast: een partner met
// privacy='totals' levert ÉÉN aggregaatrij (`_aggregated:true`) per categorie.
// Box 3 heeft minimaal totalen-per-categorie nodig (spaargeld / beleggingen /
// schulden); `aggregatePartnerBox3Totals` haalt die uit zowel itemized als
// aggregaat-rijen. Partner volledig 'hidden' (geen partner-vermogen) →
// GRACEFUL DEGRADATION: val terug op single-person (`hasPartner:false`) +
// melding "Vraag je partner om totalen te delen". Nooit stil `hasPartner:true`
// zonder partner-vermogen.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  calculateBox3,
  optimizePartnerAllocation,
  classifyAsset,
  classifyDebt,
  type Box3Result,
  type PartnerAllocation,
  type TaxYear,
} from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  loadPerspectiveData,
  type PerspectiveItem,
} from '@/lib/household/perspective-loader'
import {
  getRecentDailyExpenseRate,
  type RecentDailyExpenseRate,
} from '@/lib/expense-rate'
import { type Perspective } from '@/lib/household-data'

// ── Partner-totalen per Box 3-categorie ──────────────────────────

export interface PartnerBox3Totals {
  spaargeld: number
  beleggingen: number
  schulden: number
  /** Of er daadwerkelijk partner-vermogen is meegeteld (false bij 'hidden'). */
  hasData: boolean
  /** True wanneer de partner via privacy='totals' één aggregaatrij leverde. */
  isAggregated: boolean
}

/**
 * Vat de Box 3-relevante partner-vermogensbestanddelen samen tot drie
 * categorie-totalen (spaargeld / beleggingen / schulden).
 *
 * Werkt voor beide privacy-niveaus:
 *   • 'full'   → itemized partner-rijen; we classificeren elke asset/schuld via
 *                de ONGEWIJZIGDE `classifyAsset`/`classifyDebt`.
 *   • 'totals' → één aggregaatrij per categorie (`_aggregated:true`). Een
 *                aggregaat-vermogensrij kan spaargeld én beleggingen mengen;
 *                zonder per-item-detail kunnen we niet splitsen, dus boeken we
 *                de hele som conservatief op 'beleggingen' (hoogste forfait) —
 *                dit overschat de heffing nooit ten gunste van de gebruiker.
 *
 * Lege input (partner privacy='hidden' → geen rijen) → `hasData:false`.
 *
 * @param partnerAssets Partner-persoonlijke assets uit `loadPerspectiveData`.
 * @param partnerDebts  Partner-persoonlijke debts uit `loadPerspectiveData`.
 */
export function aggregatePartnerBox3Totals(
  partnerAssets: PerspectiveItem[],
  partnerDebts: PerspectiveItem[],
): PartnerBox3Totals {
  let spaargeld = 0
  let beleggingen = 0
  let schulden = 0
  let isAggregated = false

  for (const item of partnerAssets) {
    const value = Number(item.current_value) || 0
    if (value === 0) continue
    if (item._aggregated) {
      // Geen per-item classificatie mogelijk → conservatief als beleggingen.
      beleggingen += value
      isAggregated = true
      continue
    }
    const { category } = classifyAsset(item as unknown as Asset)
    if (category === 'spaargeld') spaargeld += value
    else if (category === 'beleggingen') beleggingen += value
    // category === null → uitgesloten (Box 1/2), telt niet mee in Box 3.
  }

  for (const item of partnerDebts) {
    const balance = Number(item.current_balance) || 0
    if (balance === 0) continue
    if (item._aggregated) {
      schulden += balance
      isAggregated = true
      continue
    }
    // Zonder de eigen-huis-asset-set van de partner kunnen we hypotheek-
    // uitsluiting niet zeker bepalen; classifyDebt met lege set telt de schuld
    // mee tenzij het een eigen-woning-hypotheek is — die herkennen we hier niet
    // (conservatief meetellen overschat de aftrek niet).
    const { inBox3 } = classifyDebt(item as unknown as Debt, new Set<string>())
    if (inBox3) schulden += balance
  }

  const hasData = spaargeld > 0 || beleggingen > 0 || schulden > 0
  return { spaargeld, beleggingen, schulden, hasData, isAggregated }
}

// ── Perspectief-bewuste Box 3-loader ─────────────────────────────

export interface PerspectiveBox3Partner {
  isCurrentUser: boolean
  fullName: string
  result: Box3Result
}

export interface PerspectiveBox3Data {
  perspective: Perspective
  hasHousehold: boolean
  year: TaxYear
  /**
   * CANONIEK dagtarief (€/dag) uit `lib/expense-rate.ts` — 12-mnd rolling
   * GEREALISEERDE uitgaven ×12/365, exact dezelfde keten als
   * `DashboardData.dailyExpenseRate` en `HorizonRawData.dailyExpenseRate`.
   *
   * Was: de som van budget-LIMIETEN gedeeld door 30, met een verzonnen terugval
   * van €100/dag. Andere teller (limieten i.p.v. gerealiseerd) én andere noemer
   * (30 i.p.v. 365/12) — op productie gemeten −68% tot +441% t.o.v. het
   * canonieke tarief, waardoor dezelfde Box 3-heffing op de subpagina een ander
   * aantal vrijheidsdagen droeg dan op de hub, de widget en de optimizer (M22).
   *
   * 0 = GEEN EERLIJKE DAGBASIS (geen transacties én geen schatting). Dan hoort
   * er géén tijdregel te staan; `calculateBox3` levert bij 0 vanzelf
   * `freedomDays: 0` en elk oppervlak guard't daarop.
   */
  dailyExpenses: number
  /**
   * Herkomst van `dailyExpenses`, één-op-één `RecentDailyExpenseRate.source`.
   * De voetnoot bij een vrijheidsdagen-getal benoemt hiermee zijn grondslag —
   * zonder die vermelding is een tarief dat kan schuiven een tweede waarheid
   * met vertraging (zelfde regel als ADR 0103).
   */
  dailyExpensesSource: 'transactions' | 'estimate' | 'none'
  /**
   * Het perspectief waarop `dailyExpenses` staat — vandaag ALTIJD 'personal',
   * ook in huishoud-/partnerweergave.
   *
   * Bewuste grens, geërfd van ADR 0107: de uitgavenkant blijft persoonlijk
   * omdat er geen partner-TRANSACTIES bereikbaar zijn (de perspectief-loader
   * dekt assets/debts/budgets, niet transacties; een huishoud-dagtarief vraagt
   * een eigen SECURITY DEFINER-RPC + privacy-besluit). De oude budget-limiet-
   * afleiding wás perspectief-bewust, maar op een grondslag die met de
   * werkelijkheid niets te maken had — liever een eerlijk persoonlijk tarief
   * dat zich als zodanig BEKENDMAAKT dan een huishoud-ogend verzonnen getal
   * (exact de afweging die ADR 0107 bij `fireRowsComplete` maakte).
   */
  dailyExpensesPerspective: 'personal'
  currentUserName: string
  partnerName: string | null
  /** Het privé/eigen resultaat (single → personal; household → eigen partner). */
  personal: Box3Result
  /** Household: per-partner resultaten (eigen + partner). */
  partners?: PerspectiveBox3Partner[]
  /** Household: gecombineerd resultaat (fiscaal partners). */
  combined?: Box3Result
  /** Household: beste belasting-efficiënte verdeling. */
  optimalAllocation?: PartnerAllocation
  /**
   * Graceful degradation: in household/partner-view wilde de gebruiker het
   * huishouden zien, maar de partner deelt geen vermogen ('hidden'). We vallen
   * terug op single-person en zetten dit zodat de UI een melding kan tonen
   * ("Vraag je partner om totalen te delen").
   */
  partnerDataHidden: boolean
}

/** Filter een PerspectiveItem-lijst op partner-herkomst. */
function partnerItems(items: PerspectiveItem[]): PerspectiveItem[] {
  return items.filter((i) => i._provenance === 'partner')
}

/** Filter op gedeelde (gezamenlijke) herkomst. */
function sharedItems(items: PerspectiveItem[]): PerspectiveItem[] {
  return items.filter((i) => i._provenance === 'gezamenlijk')
}

/** Filter op eigen (persoonlijke) herkomst. */
function ownItems(items: PerspectiveItem[]): PerspectiveItem[] {
  return items.filter((i) => i._provenance === 'eigen')
}

/**
 * Bouw één `calculateBox3`-input uit een set PerspectiveItems. De pure engine
 * leest `current_value`/`current_balance` op vol bedrag (Box 3-vermogen wordt
 * fiscaal NIET fractioneel toegekend — het hoort bij de juridische eigenaar of
 * wordt tussen fiscaal partners verdeeld). Wij selecteren dus de juiste items
 * en voeden hun VOLLEDIGE waarde; de share-fractie speelt hier geen rol.
 */
function box3Input(
  assets: PerspectiveItem[],
  debts: PerspectiveItem[],
  hasPartner: boolean,
  dailyExpenses: number,
  year: TaxYear,
) {
  return {
    assets: assets as unknown as Asset[],
    debts: debts as unknown as Debt[],
    hasPartner,
    dailyExpenses,
    year,
  }
}

/**
 * Het canonieke dagtarief voor dit oppervlak, mét dezelfde schatting-terugval
 * die de dashboard- en core-bundel hanteren.
 *
 * GEEN eigen som — puur de gedeelde bron (`lib/expense-rate.ts`) plus het
 * profielbedrag als `fallbackMonthlyExpenses`. Die terugval telt alléén wanneer
 * er nul uitgaven-transacties in het venster staan; dan ís de profielschatting
 * de enige eerlijke basis (en anders blijft hij ongebruikt, dus hij kan het
 * transactie-tarief niet vertroebelen).
 *
 * Bewust één kolom-scoped eigen-rij-query i.p.v. `resolveEffectiveIncomeExpenses`:
 * die resolver kiest tussen transactie- en profielgrondslag, en precies die
 * keuze maakt `recentDailyExpenseRateFromRows` hier al — hem er nog eens
 * overheen leggen zou de beslissing verdubbelen.
 *
 * Dual-use: alleen `.from`/`.auth`, dus werkt met de server- én de browser-
 * client (net als de rest van dit bestand).
 */
async function resolveCanonicalDailyExpenses(
  supabase: SupabaseClient,
): Promise<RecentDailyExpenseRate> {
  let fallbackMonthly = 0
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('estimated_monthly_expenses')
        .eq('id', user.id)
        .maybeSingle()
      fallbackMonthly = Math.max(Number(profile?.estimated_monthly_expenses ?? 0) || 0, 0)
    }
  } catch {
    /* geen profiel-schatting → alleen de transactiebasis (of 0) */
  }
  return getRecentDailyExpenseRate(supabase, new Date(), fallbackMonthly)
}

/**
 * Laad de Box 3-belasting voor het gevraagde perspectief uit het fundament.
 *
 * Server-only: geef de SERVER-client door in een server-component, of de
 * BROWSER-client bij een in-sessie perspectief-wissel (de loader werkt met
 * beide). Privacy + provenance zijn door `loadPerspectiveData` al gestempeld.
 */
export async function loadPerspectiveBox3(
  supabase: SupabaseClient,
  perspective: Perspective,
  year: TaxYear,
  currentUserName = 'Jij',
  canonicalDailyExpenses?: RecentDailyExpenseRate,
): Promise<PerspectiveBox3Data> {
  // We hebben in ELKE view de volledige unie nodig om per perspectief zelf te
  // kunnen splitsen/combineren, dus laden we altijd op 'household'-breedte en
  // filteren via provenance. Veilig voor solo: de loader negeert dan het
  // perspectief en levert exact de eigen + gedeelde set (geen partner-rijen).
  //
  // Het dagtarief hangt NIET van die unie af (zie hieronder) en is dus een
  // onafhankelijke tak — parallel, geen extra serieel wachtblok.
  const [{ context, assets, debts }, expenseRate] = await Promise.all([
    loadPerspectiveData(supabase, 'household'),
    canonicalDailyExpenses
      ? Promise.resolve(canonicalDailyExpenses)
      : resolveCanonicalDailyExpenses(supabase),
  ])

  const hasHousehold = context.hasHousehold
  const partnerName = context.partnerName

  // ── Dagtarief: ÉÉN noemer, app-breed ──────────────────────────────────
  // `lib/expense-rate.ts` is de enige €→vrijheidstijd-noemer op een
  // weergave-oppervlak. Geen budget-limieten (dat is een PLAN, geen uitgave),
  // geen ÷30 naast een ×12/365 elders, en geen verzonnen €100/dag-terugval:
  // 0 betekent "geen eerlijke dagbasis" en de tijdregel hoort dan weg te vallen.
  const dailyExpenses = expenseRate.dailyRate

  // ── Solo of geen huishouden: identiek aan vandaag ──────────────
  if (!hasHousehold) {
    const personal = calculateBox3(
      box3Input(
        [...ownItems(assets), ...sharedItems(assets)],
        [...ownItems(debts), ...sharedItems(debts)],
        false,
        dailyExpenses,
        year,
      ),
    )
    return {
      perspective,
      hasHousehold: false,
      year,
      dailyExpenses,
      dailyExpensesSource: expenseRate.source,
      dailyExpensesPerspective: 'personal',
      currentUserName,
      partnerName: null,
      personal,
      partnerDataHidden: false,
    }
  }

  // ── Huishouden ─────────────────────────────────────────────────
  const ownAssets = ownItems(assets)
  const ownDebts = ownItems(debts)
  const sharedA = sharedItems(assets)
  const sharedD = sharedItems(debts)
  const partnerA = partnerItems(assets)
  const partnerD = partnerItems(debts)

  const partnerTotals = aggregatePartnerBox3Totals(partnerA, partnerD)

  // GRACEFUL DEGRADATION: partner deelt geen vermogen ('hidden') → val terug op
  // single-person. We tonen alleen het eigen resultaat + een melding. Nooit
  // hasPartner:true zonder partner-vermogen (dat zou ten onrechte het dubbele
  // heffingsvrije vermogen toekennen).
  if (!partnerTotals.hasData) {
    const personal = calculateBox3(
      box3Input([...ownAssets, ...sharedA], [...ownDebts, ...sharedD], false, dailyExpenses, year),
    )
    return {
      perspective,
      hasHousehold: true,
      year,
      dailyExpenses,
      dailyExpensesSource: expenseRate.source,
      dailyExpensesPerspective: 'personal',
      currentUserName,
      partnerName,
      personal,
      partnerDataHidden: true,
    }
  }

  // Eigen privé-resultaat: eigen-persoonlijk + gedeeld, fiscaal partner.
  const ownResult = calculateBox3(
    box3Input([...ownAssets, ...sharedA], [...ownDebts, ...sharedD], true, dailyExpenses, year),
  )

  // Partner-resultaat: partner-persoonlijk + gedeeld, fiscaal partner. Bij een
  // privacy='totals'-aggregaat zit het partner-vermogen al in één rij; die
  // dragen we (mét shared) rechtstreeks in de engine.
  const partnerResult = calculateBox3(
    box3Input([...partnerA, ...sharedA], [...partnerD, ...sharedD], true, dailyExpenses, year),
  )

  // Gecombineerd: mijn-persoonlijk ∪ partner-persoonlijk ∪ gedeeld (ÉÉN keer).
  const combinedAssets = [...ownAssets, ...partnerA, ...sharedA]
  const combinedDebts = [...ownDebts, ...partnerD, ...sharedD]
  const combinedInput = box3Input(combinedAssets, combinedDebts, true, dailyExpenses, year)
  const combined = calculateBox3(combinedInput)
  const optimalAllocation = optimizePartnerAllocation(combined, combinedInput)

  // Privé-resultaat dat de subpagina toont: in personal/household-view het
  // eigen resultaat, in partner-view het partner-resultaat.
  const personal = perspective === 'partner' ? partnerResult : ownResult

  return {
    perspective,
    hasHousehold: true,
    year,
    dailyExpenses,
    dailyExpensesSource: expenseRate.source,
    dailyExpensesPerspective: 'personal',
    currentUserName,
    partnerName,
    personal,
    partners: [
      { isCurrentUser: true, fullName: currentUserName, result: ownResult },
      { isCurrentUser: false, fullName: partnerName ?? 'Partner', result: partnerResult },
    ],
    combined,
    optimalAllocation,
    partnerDataHidden: false,
  }
}
