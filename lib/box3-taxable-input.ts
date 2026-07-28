// lib/box3-taxable-input.ts
//
// Single source of truth voor het Box 3-belast-vermogen-signaal dat zowel de
// sidebar-status-dot (Box 3 onder Belasting) als de Belasting-landingskaart
// (Box 3) voeden. Twee pure helpers, géén 'use client', zodat server-layout én
// server-page beide importeren:
//
//   1. computeBox3TaxableInput(assets, debts, householdType)
//        → { box3TaxableAboveThreshold, hasBox3Assets, householdType }
//      Encapsuleert de BOX3_TYPES-filter + vrijstelling die voorheen INLINE in
//      app/(app)/layout.tsx stond. Door dit één plek te geven kunnen de drempel
//      en de type-set nooit meer divergeren tussen sidebar en kaart.
//
//   2. box3TaxStatus(input) → LeverageStatus
//      De exacte tax-lever-statuslogica die ook `computeLeverScores` (lever-
//      scores.ts) gebruikt. Levert good/warn/bad/neutral. De Belasting-kaart
//      consumeerde voorheen een verwijderde gezondheids-pillar (tax_optimization,
//      ADR 0010) → ALTIJD neutral. Nu deelt de kaart deze canonieke bron met de
//      sidebar, dus kaart-status == sidebar-status, beide betekenisvol.
//
// "Consume, don't recompute": niemand mag de BOX3_TYPES-set of de drempels
// dupliceren — importeer deze helpers.

import type { LeverageStatus } from '@/lib/leverage-status'
import { hasPartner as deriveHasPartner } from '@/lib/household-type'
import { BOX3_PARAMS, CURRENT_TAX_YEAR, classifyDebt } from '@/lib/box3-data'
import type { Debt } from '@/lib/debt-data'

/**
 * Box 3-belastbare asset-typen. Pension, eigen_huis, vehicle, physical en
 * levensverzekering zijn vrijgesteld. `other` telt mee (conservatief: meestal
 * wel box3-relevant). Identiek aan de set die voorheen inline in layout.tsx
 * stond.
 */
export const BOX3_ASSET_TYPES: ReadonlySet<string> = new Set([
  'cash',
  'savings',
  'investment',
  'crypto',
  'real_estate',
  'deelneming',
  'vordering',
  'other',
])

/**
 * Box 3-heffingsvrij vermogen (alleenstaande) voor het lopende belastingjaar —
 * afgeleid uit de canonieke jaartabel BOX3_PARAMS[CURRENT_TAX_YEAR]
 * (lib/box3-data.ts), niet los hardcoded. Bewust een eigen export voor dít
 * drempel-signaal (sidebar-dot + Belasting-kaart): het is de heffingsvrije voet,
 * geen volledige Box 3-aangiftewaarde. Het bedrag is jaargebonden (het "wettelijk
 * vast"-comment was fout: het wijzigt jaarlijks) en schuift mee met de jaartabel
 * (2026: € 59.357).
 */
export const BOX3_VRIJSTELLING_SINGLE = BOX3_PARAMS[CURRENT_TAX_YEAR].heffingsvrijSingle

export interface Box3TaxableInput {
  /** Totaal box3-belast vermogen boven de heffingsvrije voet (≥ 0). */
  box3TaxableAboveThreshold: number
  /** Of de gebruiker überhaupt box3-belastbare assets bezit (anders: neutral). */
  hasBox3Assets: boolean
  /** Huishoudtype ('solo' | 'samen' | 'gezin' | …) — partner verdubbelt vrijstelling-kans. */
  householdType?: string
}

/** Minimale asset-shape die de helper nodig heeft (zowel layout-rows als Asset). */
interface Box3AssetLike {
  /** Nodig om de eigen-woning-asset-set te bouwen voor de hypotheek-uitsluiting. */
  id?: string | null
  asset_type?: string | null
  current_value: number | string
  net_worth_inclusion_pct?: number | null
}

/** Minimale debt-shape die de helper nodig heeft (zowel layout-rows als Debt). */
interface Box3DebtLike {
  current_balance: number | string
  net_worth_inclusion_pct?: number | null
  /** Voor de canonieke Box 3-classificatie: eigen-woning-hypotheek → Box 1. */
  debt_type?: string | null
  linked_asset_id?: string | null
  is_tax_deductible?: boolean | null
}

/**
 * Bereken het box3-belast-vermogen-signaal uit assets + debts. Weegt elke post
 * met `net_worth_inclusion_pct` (default 100%), exact zoals de sidebar-layout
 * voorheen inline deed.
 *
 * De schuld-behandeling is single-sourced op de canonieke `calculateBox3`:
 *   • Alleen ECHTE Box 3-schulden tellen — de eigen-woning-hypotheek valt in
 *     Box 1 en wordt via `classifyDebt` (box3-data.ts) uitgesloten. Voorheen trok
 *     deze helper ÁLLE schulden af (incl. de eigenwoninghypotheek), waardoor een
 *     grote hypotheek de Box 3-grondslag ten onrechte wegvaagde → status "geen
 *     belasting" terwijl de Belasting-kaart wél heffing berekende (deze bug).
 *   • Schuldendrempel (alleen schulden bóven de drempel zijn aftrekbaar) —
 *     dezelfde jaarwaarde als `calculateBox3`, zodat `box3TaxableAboveThreshold`
 *     rekenkundig gelijkloopt met `calculateBox3.grondslagSparen` (alleenstaande
 *     voet) en KPI (€) en status (band) elkaar niet meer kunnen tegenspreken.
 *     NB: die gelijkloop is exact voor een solo-gebruiker met inclusion_pct=100;
 *     deze helper weegt assets/schulden met net_worth_inclusion_pct en rekent
 *     altijd de single-voet, dus bij gedeeld bezit of een fiscaal partner is dit
 *     bewust een status-signaal, geen exacte €-pariteit.
 */
export function computeBox3TaxableInput(
  assets: readonly Box3AssetLike[],
  debts: readonly Box3DebtLike[],
  householdType?: string,
): Box3TaxableInput {
  const box3Assets = assets
    .filter((a) => a.asset_type != null && BOX3_ASSET_TYPES.has(a.asset_type))
    .reduce(
      (s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100),
      0,
    )
  // Eigen-woning-assets → de hypotheek gekoppeld aan zo'n asset valt buiten Box 3.
  const eigenHuisAssetIds = new Set(
    assets
      .filter((a) => a.asset_type === 'eigen_huis' && a.id != null)
      .map((a) => String(a.id)),
  )
  const box3Debts = debts.reduce((s, d) => {
    const { inBox3 } = classifyDebt(d as unknown as Debt, eigenHuisAssetIds)
    if (!inBox3) return s
    return s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100)
  }, 0)
  const schuldendrempel = BOX3_PARAMS[CURRENT_TAX_YEAR].schuldendrempelSingle
  const aftrekbareSchulden = Math.max(0, box3Debts - schuldendrempel)
  const box3Net = box3Assets - aftrekbareSchulden
  const box3TaxableAboveThreshold = Math.max(0, box3Net - BOX3_VRIJSTELLING_SINGLE)
  const hasBox3Assets = assets.some(
    (a) => a.asset_type != null && BOX3_ASSET_TYPES.has(a.asset_type),
  )
  return { box3TaxableAboveThreshold, hasBox3Assets, householdType }
}

/**
 * Box 3 tax-lever-status (good/warn/bad/neutral) — de canonieke statuslogica
 * die `computeLeverScores` intern hergebruikt (lever-scores.ts), zodat de
 * sidebar-dot en de Belasting-kaart gegarandeerd dezelfde uitkomst tonen.
 *
 * Drempels (identiek aan de tax-lever vóór deze extractie):
 *  - neutral: geen box3-belastbare assets → niets te beoordelen
 *  - good:    onder de vrijstelling → optimaal, geen heffing
 *  - good:    ≤ €100k boven vrijstelling mét partner → geoptimaliseerd
 *  - warn:    ≤ €100k boven vrijstelling zonder partner; of ≤ €500k mét partner
 *  - bad:     ≤ €500k boven vrijstelling zonder partner; of > €500k (elk geval)
 */
export function box3TaxStatus(input: Box3TaxableInput): LeverageStatus {
  const { box3TaxableAboveThreshold: above, hasBox3Assets, householdType } = input
  if (!hasBox3Assets) return 'neutral'
  // Single source of truth: dezelfde canonieke afleiding als de FIRE-/health-/
  // box3-engines. Was inline '=== samen || === gezin'; resultaat identiek.
  const hasPartner = deriveHasPartner(householdType)
  if (above <= 0) return 'good'
  if (above <= 100_000) return hasPartner ? 'good' : 'warn'
  if (above <= 500_000) return hasPartner ? 'warn' : 'bad'
  return 'bad'
}
