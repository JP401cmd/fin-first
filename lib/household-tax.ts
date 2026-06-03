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
import { dailyExpensesByPerspective, type Perspective } from '@/lib/household-data'

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
  dailyExpenses: number
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
 * Maandelijkse uitgaven (perspectief-correct) afgeleid uit budgetten.
 * Spiegelt /api/household/box3: som van 'expense'-budgetten; valt terug op
 * €3000/maand zodat vrijheidsdagen nooit door 0 delen.
 *
 * In household-view tellen we alle expense-budgetten (eigen + gedeeld +
 * partner via de loader); in personal/partner-view het perspectief-deel.
 */
function monthlyExpensesFromBudgets(budgets: PerspectiveItem[]): number {
  const total = budgets
    .filter((b) => b.budget_type === 'expense')
    .reduce((sum, b) => sum + (Number(b.default_limit) || 0), 0)
  return total
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
): Promise<PerspectiveBox3Data> {
  // We hebben in ELKE view de volledige unie nodig om per perspectief zelf te
  // kunnen splitsen/combineren, dus laden we altijd op 'household'-breedte en
  // filteren via provenance. Veilig voor solo: de loader negeert dan het
  // perspectief en levert exact de eigen + gedeelde set (geen partner-rijen).
  const { context, assets, debts, budgets } = await loadPerspectiveData(
    supabase,
    'household',
  )

  const hasHousehold = context.hasHousehold
  const partnerName = context.partnerName

  // Perspectief-correcte dag-uitgaven. We benaderen partner-uitgaven als
  // household − personal wanneer geen expliciete partner-waarde bestaat.
  const householdMonthly = monthlyExpensesFromBudgets(budgets)
  const ownMonthly = monthlyExpensesFromBudgets(ownItems(budgets).concat(sharedItems(budgets)))
  const dailyExpenses = (() => {
    const d = dailyExpensesByPerspective(
      { personal: ownMonthly, household: householdMonthly },
      perspective,
    )
    return d > 0 ? d : 100
  })()

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
