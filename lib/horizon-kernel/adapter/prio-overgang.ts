/**
 * Horizon-kernel adapter — app-`pot_rules` → kern-TS-prio's (V5-overgangsmapping).
 *
 * FASE 3, snede 1. **TIJDELIJK** tot de echte per-categorie-prio-UI (V5-optie 2,
 * snede F4). De app kent vandaag drie pot-regels op 5 WealthGroups; de kern verwacht
 * per-categorie-prio's 1..5 per onderwerp (toename/afname/onttrekking) over 6
 * bezittings- en 6 schuld-categorieën. Deze module overbrugt dat verschil
 * deterministisch en gedocumenteerd.
 *
 * ## Mapping-regels
 *  - **Geordende regels** (`withdrawalOrderGroups` → onttrekking, `deficitOrderGroups`
 *    → afname): positie 1 = prio 1, positie 2 = prio 2, … geklemd op **prio 4** zodat
 *    alles in de actief-gewogen band (1..4) blijft en niets per ongeluk 'reserve' of
 *    'nooit' wordt.
 *  - **Reserve (prio 5)**: 'Eigen huis' — de app behandelt de eigen woning als
 *    laatste-redmiddel-buffer (uitgesloten uit de onttrekkingsvolgorde). Dit is de
 *    "categorie die de app als buffer/reserve behandelt". Andere categorieën krijgen
 *    géén automatische reserve.
 *  - **Toename** (`surplusGroup`, één bestemming): de doel-categorie → prio 1, alle
 *    andere bezittingen → prio 5 (reserve) zodat het overschot exclusief naar de
 *    voorkeurspot vloeit (spiegelt `expandSingleGroupToAssetTypes`). Bij
 *    `schuld_aflossen`: alle bezittingen reserve en de gevulde schuld-categorieën
 *    krijgen aflos-prio 1.
 *  - **Tekort-lening**: altijd aflos-prio 1 (de noodlening wordt als eerste afgelost
 *    zodra er ruimte is).
 *
 * `gevuld`/`nietLiquide` komen uit de potten zelf; niet-liquide volgt het Excel-
 * contract (`=IF(P!B57="Meerekenen","Nee","Ja")`) voor eigen huis (bezit) en woning
 * (schuld).
 */

import type { WealthGroup } from '@/lib/wealth-composition'
import type { CategoriePrios, PotRulesConfig, SurplusGroup } from '@/lib/pot-rules'
import type {
  AssetCategorie,
  AssetPot,
  DebtCategorie,
  DebtPot,
  TsBezitCategorie,
  TsParams,
  TsSchuldCategorie,
  TsSchuldCategorieLabel,
} from '../types'

// Vaste categorie-volgorde = categorie-identiteit (de kern indexeert erop — moet
// exact overeenkomen met `input-from-fixture` TS_BEZIT_ROWS/TS_SCHULD_ROWS).
const BEZIT_ORDER: readonly AssetCategorie[] = [
  'Spaargeld',
  'Beleggingen',
  'Pensioen',
  'Vastgoed',
  'Eigen huis',
  'Overig',
]
const SCHULD_ORDER: readonly TsSchuldCategorieLabel[] = [
  'Woning',
  'Consumptief',
  'Studie',
  'Zakelijk',
  'Overig',
  'Tekort-lening',
]

/** WealthGroup (5) → bezittings-categorie (Eigen huis heeft géén app-groep). */
const GROUP_TO_CATEGORIE: Record<WealthGroup, AssetCategorie> = {
  spaargeld: 'Spaargeld',
  beleggingen: 'Beleggingen',
  pensioen: 'Pensioen',
  vastgoed: 'Vastgoed',
  overig: 'Overig',
}

/** Standaard-prio's: eigen huis = 5 (reserve), rest = 4 (actief, laag). */
function basePrio(): Record<AssetCategorie, number> {
  return { Spaargeld: 4, Beleggingen: 4, Pensioen: 4, Vastgoed: 4, 'Eigen huis': 5, Overig: 4 }
}

/** Geordende groepen → prio per categorie (positie i → min(i+1, 4)); eigen huis reserve. */
function orderedGroupsToPrio(groups: readonly WealthGroup[]): Record<AssetCategorie, number> {
  const prio = basePrio()
  groups.forEach((g, i) => {
    prio[GROUP_TO_CATEGORIE[g]] = Math.min(i + 1, 4)
  })
  return prio
}

/** Toename: doel-categorie → prio 1, rest reserve (prio 5). Bij schuld_aflossen: alles reserve. */
function toenamePrio(surplus: SurplusGroup): {
  bezit: Record<AssetCategorie, number>
  schuldAflossen: boolean
} {
  const bezit: Record<AssetCategorie, number> = {
    Spaargeld: 5,
    Beleggingen: 5,
    Pensioen: 5,
    Vastgoed: 5,
    'Eigen huis': 5,
    Overig: 5,
  }
  if (surplus === 'schuld_aflossen') return { bezit, schuldAflossen: true }
  bezit[GROUP_TO_CATEGORIE[surplus]] = 1
  return { bezit, schuldAflossen: false }
}

/** Bezittings-categorie → gevuld (€ > 0 in enige pot van die categorie). */
function bezitGevuld(potten: readonly AssetPot[]): Record<AssetCategorie, boolean> {
  const gevuld: Record<AssetCategorie, boolean> = {
    Spaargeld: false,
    Beleggingen: false,
    Pensioen: false,
    Vastgoed: false,
    'Eigen huis': false,
    Overig: false,
  }
  for (const p of potten) if (p.startwaarde > 0) gevuld[p.categorie] = true
  return gevuld
}

/** `DebtCategorie` (potten) → TS-schuldlabel ('Tekort' → 'Tekort-lening'). */
function debtCatToLabel(c: DebtCategorie): TsSchuldCategorieLabel {
  return c === 'Tekort' ? 'Tekort-lening' : c
}

/** Schuld-categorie → gevuld (€ > 0). De tekort-lening (startsaldo 0) → false. */
function schuldGevuld(potten: readonly DebtPot[]): Partial<Record<TsSchuldCategorieLabel, boolean>> {
  const gevuld: Partial<Record<TsSchuldCategorieLabel, boolean>> = {}
  for (const p of potten) if (p.startwaarde > 0) gevuld[debtCatToLabel(p.categorie)] = true
  return gevuld
}

/** Set met alle geldige bezit-categorie-labels (voor de V5-overlay-validatie). */
const BEZIT_LABELS = new Set<AssetCategorie>(BEZIT_ORDER)

/**
 * V5-overlay: leg expliciete per-categorie-prio's (uit `categorie_prios[subject]`) OVER
 * de afgeleide prio-map. Alleen geldige bezit-categorie-sleutels worden toegepast; de
 * prio's zijn in `pot-rules.ts` al gevalideerd op 1..5 (5 = reserve). Afwezig subject →
 * de afgeleide map ongewijzigd (byte-identiek). Retourneert een NIEUWE map.
 */
function overlayBezitPrio(
  base: Record<AssetCategorie, number>,
  explicit: Record<string, number> | undefined,
): Record<AssetCategorie, number> {
  if (!explicit) return base
  const next = { ...base }
  for (const [cat, prio] of Object.entries(explicit)) {
    if (BEZIT_LABELS.has(cat as AssetCategorie)) next[cat as AssetCategorie] = prio
  }
  return next
}

/**
 * Bouw `TsParams` uit de pot-regels en de reeds-gebouwde potten. `woningMeerekenen`
 * = de woning-strategie-selector is 'Meerekenen' (P!B57) → stuurt de niet-liquide-vlag
 * van eigen huis (bezit) en woning (schuld), conform het Excel-contract.
 *
 * V5: wanneer `potRules.categoriePrios` aanwezig is, worden de expliciete per-categorie-
 * prio's (incl. reserve-5) OVER de orde-groep-afleiding gelegd (per bezit-categorie).
 * Afwezig → uitsluitend de orde-groep-afleiding (bestaand gedrag byte-identiek). NB: de
 * schuld-prio's blijven vooralsnog uit de bestaande mapping — schuld-per-categorie-prio's
 * uit `categorie_prios` worden nog niet geconsumeerd (open punt; wacht op oracle-fixture).
 */
export function buildTsParams(
  potRules: PotRulesConfig,
  assetPotten: readonly AssetPot[],
  schuldPotten: readonly DebtPot[],
  woningMeerekenen: boolean,
): TsParams {
  const cp: CategoriePrios | undefined = potRules.categoriePrios
  const onttrekking = overlayBezitPrio(orderedGroupsToPrio(potRules.withdrawalOrderGroups), cp?.onttrekking)
  const afname = overlayBezitPrio(orderedGroupsToPrio(potRules.deficitOrderGroups), cp?.afname)
  const { bezit: toenameBase, schuldAflossen } = toenamePrio(potRules.surplusGroup)
  const toename = overlayBezitPrio(toenameBase, cp?.toename)

  const gevuldBezit = bezitGevuld(assetPotten)
  const bezitCategorien: TsBezitCategorie[] = BEZIT_ORDER.map((categorie) => ({
    categorie,
    prioToename: toename[categorie],
    prioAfname: afname[categorie],
    prioOnttrekking: onttrekking[categorie],
    gevuld: gevuldBezit[categorie],
    nietLiquide: categorie === 'Eigen huis' ? !woningMeerekenen : false,
  }))

  const gevuldSchuld = schuldGevuld(schuldPotten)
  const schuldCategorien: TsSchuldCategorie[] = SCHULD_ORDER.map((categorie) => {
    const isTekort = categorie === 'Tekort-lening'
    const gevuld = gevuldSchuld[categorie] ?? false
    // Tekort-lening: altijd aflos-prio 1. Overige schulden: 1 bij "schuld aflossen"
    // (mits gevuld), anders geen extra-aflos-prio (de geplande amortisatie loopt
    // sowieso via de pot; null = geen surplus-gedreven extra-aflossing).
    const prioAflossing = isTekort ? 1 : schuldAflossen && gevuld ? 1 : null
    return {
      categorie,
      prioAflossing,
      gevuld,
      nietLiquide: categorie === 'Woning' ? !woningMeerekenen : false,
    }
  })

  return { bezitCategorien, schuldCategorien }
}
