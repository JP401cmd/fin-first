/**
 * Horizon-kernel adapter — app-bezittingen/-schulden → kern-potten.
 *
 * FASE 3, snede 1. Vertaalt `Asset[]`/`Debt[]` (Supabase-shape) naar de domein-vrije
 * `AssetPot[]`/`DebtPot[]` die de kern verwacht. De kern kent géén app-begrippen; de
 * mapping (categorie, Box 3-type, investering-vlag, getypte rollen) gebeurt HIER.
 *
 * ## Getypte rollen i.p.v. posities (contract)
 * De kern lokaliseert het eigen huis, de hypotheek en de tekort-lening via
 * `pot.rol` (niet via een vaste positie) — zie `engine.ts`/`tables/*`. Maar de
 * fysieke `slot`-index is wél betekenisdragend: `Bez` schrijft `slots[pot.slot]` en
 * `S` leest `potBySlot(slot)`. De adapter kent daarom vaste fysieke slots toe die het
 * Excel-contract spiegelen (`Controle!K8/K9`): huis = slot 2, hypotheek = slot 0,
 * opeethypotheek = slot 3 (gereserveerd), tekort-lening = slot 6.
 *
 * ## Fysieke slot-capaciteit (snede 2b: ontgrensd)
 * Bezittingen zijn effectief **onbeperkt**: `Bez` adresseert per `pot.slot` en sommeert
 * over `input.assetPotten`, dus extra slots (≥ 10) breiden de JS-array uit. Schulden
 * waren tot snede 2b **fysiek begrensd op 7 slots**; sinds de dynamische schuld-slots
 * (`debtSlotCount`, `computeS` loopt tot de hoogste bezette slot met `S_PHYSICAL_SLOTS`
 * als vloer) en de getypte-rol-lokalisatie van de tekort-lening (niet meer hardcoded
 * slot 6) worden óók schulden op slot 7+ correct geëvolueerd. De gereserveerde slots
 * (0 hypotheek, 3 opeet, 6 tekort) blijven contract; reguliere schulden vullen 1,2,4,5
 * en daarna 7,8,… De tekort-lening staat in dit model nog altijd op slot 6.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import { type Debt, type DebtType, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { classifyAsset, classifyDebt, type Box3Category } from '@/lib/box3-data'
import { parseSaleConfig } from '@/lib/sale-config'
import type {
  AssetBox3Type,
  AssetCategorie,
  AssetPot,
  AssetRol,
  DebtBox3Type,
  DebtCategorie,
  DebtPot,
  DebtRol,
  PotLiquidatie,
} from '../types'
import { HORIZON_MONTHS } from '../types'
import type { EventMappingNotice } from './events'

// ── Gereserveerde fysieke slots (spiegel Excel-contract) ─────────────────────────
const HOUSE_SLOT = 2 // bens rij 6 — eigen huis (rol 'eigenHuis')
const HYPOTHEEK_SLOT = 0 // bens rij 17 — hypotheek (rol 'hypotheek')
const OPEET_SLOT = 3 // bens rij 20 — opeethypotheek (gereserveerd, niet in deze snede gevuld)
const TEKORT_SLOT = 6 // bens rij 23 — tekort-lening (rol 'tekortLening', altijd aanwezig)

// ── Categorie-mapping (compile-time totaal-dekkend via Record) ────────────────────

/**
 * Asset-type → Excel-bezittingscategorie. Bewust NIET identiek aan `WEALTH_GROUPS`
 * (`lib/wealth-composition.ts`): daar valt `eigen_huis` samen met `real_estate` in
 * 'vastgoed', terwijl de kern het eigen huis als aparte categorie 'Eigen huis' voert
 * (eigen woningblok + niet-liquide-vlag). De kern-categorie stuurt Box 3-grondslag,
 * waterval-prio's en de scenarioband — niet de weergave-groepering.
 *
 * Afwijkingen t.o.v. de display-groepen, per type gemotiveerd:
 *  - `crypto` → **Beleggingen** (i.p.v. display-'overig'): crypto is een volatiel
 *    beleggingsbezit dat mee moet schuiven met de scenarioband/MC → categorie met
 *    investering-vlag.
 *  - `levensverzekering` → **Pensioen**: opbouw-achtige polis (spiegelt display
 *    'pensioen'); Box 3-type blijft belegging via `classifyAsset`.
 *  - `eigen_huis` → **Eigen huis** (eigen kern-categorie, niet 'Vastgoed').
 */
export const ASSET_TYPE_TO_CATEGORIE: Record<AssetType, AssetCategorie> = {
  cash: 'Spaargeld',
  savings: 'Spaargeld',
  investment: 'Beleggingen',
  crypto: 'Beleggingen',
  retirement: 'Pensioen',
  levensverzekering: 'Pensioen',
  eigen_huis: 'Eigen huis',
  real_estate: 'Vastgoed',
  vehicle: 'Overig',
  physical: 'Overig',
  deelneming: 'Overig',
  vordering: 'Overig',
  other: 'Overig',
}

/**
 * Debt-type → Excel-schuldcategorie. De categorie 'Tekort' is gereserveerd voor de
 * synthetische tekort-lening en wordt NOOIT uit een gebruikersschuld afgeleid.
 */
const DEBT_TYPE_TO_CATEGORIE: Record<DebtType, DebtCategorie> = {
  mortgage: 'Woning',
  personal_loan: 'Consumptief',
  car_loan: 'Consumptief',
  credit_card: 'Consumptief',
  revolving_credit: 'Consumptief',
  familielening: 'Consumptief',
  student_loan: 'Studie',
  dga_schuld: 'Zakelijk',
  belastingschuld: 'Overig',
  payment_plan: 'Overig',
  other: 'Overig',
}

/** Categorieën met scenarioband-/MC-gevoeligheid (bens!F = 1). */
const INVESTERING_CATEGORIEEN: ReadonlySet<AssetCategorie> = new Set<AssetCategorie>([
  'Beleggingen',
  'Vastgoed',
])

/**
 * Niet-liquide bezitting-typen die generiek geliquideerd kunnen worden (spiegel
 * `build-input.ts#LIQUIDATABLE_NON_LIQUID`; het eigen huis loopt via het woningblok
 * en staat hier bewust NIET in). Bron voor `buildPotLiquidaties`.
 */
const LIQUIDATABLE_NON_LIQUID: ReadonlySet<AssetType> = new Set<AssetType>([
  'vehicle',
  'physical',
  'other',
  'deelneming',
  'real_estate',
])

/** `classifyAsset`-categorie (`Box3Category`) → kern-`AssetBox3Type`. */
function assetBox3Type(category: Box3Category): AssetBox3Type {
  if (category === 'spaargeld') return 'Box 3 spaar'
  if (category === 'beleggingen') return 'Box 3 investering'
  return 'Geen Box 3' // null → box 1/2 (eigen woning, pensioen met fiscaal voordeel, aanmerkelijk belang)
}

/** `inclusion_pct` (0–100) → schaalfactor 0..1 (V6: schalen bij instap). */
function inclusionFactor(pct: number | null | undefined): number {
  const n = Number(pct ?? 100)
  return Number.isFinite(n) ? Math.max(0, n) / 100 : 1
}

/** Stabiele sorteervolgorde: `sort_order` oplopend, dan `id` (determinisme). */
function bySortOrderThenId(a: { sort_order: number; id: string }, b: { sort_order: number; id: string }): number {
  const sa = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 0
  const sb = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0
  if (sa !== sb) return sa - sb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Genereer vrije fysieke slots in oplopende volgorde, met overslaan van
 * gereserveerde posities. Onbeperkt (breidt voorbij de fysieke tabelgrootte uit;
 * voor bezittingen veilig, voor schulden gecapt door `computeS` — zie module-doc).
 */
function* freeSlots(reserved: ReadonlySet<number>): Generator<number> {
  for (let slot = 0; ; slot++) {
    if (!reserved.has(slot)) yield slot
  }
}

/**
 * Leid de eigen-huis-ids af: actieve bezittingen met `asset_type === 'eigen_huis'`.
 * Dé canonieke regel (kernel-API) — gebruikt door de adapter-barrel
 * (`buildKernelInputFromAppWithNotices`), `buildKernelSlotMeta`-aanroepers en de
 * engine-routers (what-if + convergentie), zodat de hypotheek→slot-0-keuze overal
 * op exact dezelfde huis-set is gebaseerd (geen tweede, driftende afleiding).
 */
export function deriveEigenHuisIds(assets: readonly Asset[]): Set<string> {
  return new Set(
    assets.filter((a) => a.is_active !== false && a.asset_type === 'eigen_huis').map((a) => a.id),
  )
}

/** Eén actieve bezitting met haar toegewezen fysieke slot. */
interface AssetSlot {
  readonly asset: Asset
  readonly slot: number
  readonly isHouse: boolean
}

/**
 * Deterministische fysieke slot-toewijzing per actieve bezitting: de eerste
 * `eigen_huis`-asset → slot 2 (contract), overige → de vrije slots (overslaan van 2)
 * in `sort_order`-dan-`id`-volgorde. Eén bron voor zowel `buildAssetPotten` als
 * `buildPotLiquidaties`, zodat de liquidatie-`slot` exact het pot-`slot` volgt.
 */
export function assignAssetSlots(assets: readonly Asset[]): AssetSlot[] {
  const active = assets.filter((a) => a.is_active !== false).sort(bySortOrderThenId)
  const houseId = active.find((a) => a.asset_type === 'eigen_huis')?.id ?? null
  const slotGen = freeSlots(new Set([HOUSE_SLOT]))
  return active.map((a) => {
    const isHouse = a.id === houseId
    return { asset: a, slot: isHouse ? HOUSE_SLOT : slotGen.next().value, isHouse }
  })
}

/**
 * Bezittingen → `AssetPot[]`. De eerste actieve `eigen_huis`-asset krijgt slot 2 +
 * rol 'eigenHuis'; overige bezittingen vullen de resterende slots deterministisch.
 * `startwaarde` = `current_value × inclusion_pct` (V6). `rendement` = `expected_return`
 * als decimaal. Box 3-type via de canonieke `classifyAsset` (consume, geen tweede
 * classificatie).
 */
export function buildAssetPotten(assets: readonly Asset[]): AssetPot[] {
  const pots: AssetPot[] = assignAssetSlots(assets).map(({ asset: a, slot, isHouse }) => {
    const rol: AssetRol | null = isHouse ? 'eigenHuis' : null
    const categorie = ASSET_TYPE_TO_CATEGORIE[a.asset_type as AssetType] ?? 'Overig'
    const rendement = Number(a.expected_return ?? 0) / 100
    return {
      slot,
      naam: a.name ?? null,
      box3Type: assetBox3Type(classifyAsset(a).category),
      categorie,
      startwaarde: Number(a.current_value ?? 0) * inclusionFactor(a.net_worth_inclusion_pct),
      rendement: Number.isFinite(rendement) ? rendement : 0,
      investering: INVESTERING_CATEGORIEEN.has(categorie),
      rol,
    }
  })
  return pots.sort((x, y) => x.slot - y.slot)
}

/** Context voor de generieke liquidatie-mapping (tijdas). */
export interface LiquidatieContext {
  /** P!B7 — startleeftijd (voor de omzetting leeftijd → MonthIndex). */
  readonly startLeeftijd: number
}

/**
 * Generieke pot-liquidaties uit `assets.sale_config` (buiten oracle-domein, snede 2b).
 * Spiegelt het patroon van `build-input.ts#buildGenericAssetLiquidations` (niet
 * gekopieerd): iedere actieve, niet-liquide (`LIQUIDATABLE_NON_LIQUID`), niet-
 * `eigen_huis`-asset wordt beoordeeld.
 *   • `niet_verkopen`  → geen entry (blijft staan).
 *   • `vast_moment` + resolvebare `triggerAge` → `PotLiquidatie` op de vaste maand;
 *     `kostenPct` = `salesCostsPct` (afwezig → 0), opbrengst → Spaargeld.
 *   • `wanneer_nodig` → info-melding: de kern kent (nog) geen dynamische liquidatie-
 *     trigger voor generieke potten (alleen het woningblok heeft "wanneer nodig").
 *
 * Buiten scope (gemeld, verfijnen in FASE 4/5): datum-triggers, `payoffDebtIds`
 * (schuld-aflossing met de opbrengst) en de prijs-fractie — de kern routeert de netto-
 * opbrengst bruto-minus-kosten naar de liquide categorie. Het huis loopt via het
 * woningblok en wordt hier nooit gemapt.
 */
export function buildPotLiquidaties(
  assets: readonly Asset[],
  ctx: LiquidatieContext,
): { liquidaties: PotLiquidatie[]; notices: EventMappingNotice[] } {
  const liquidaties: PotLiquidatie[] = []
  const notices: EventMappingNotice[] = []

  for (const { asset, slot, isHouse } of assignAssetSlots(assets)) {
    if (isHouse || asset.asset_type === 'eigen_huis') continue
    if (!LIQUIDATABLE_NON_LIQUID.has(asset.asset_type as AssetType)) continue

    const cfg = parseSaleConfig((asset as { sale_config?: unknown }).sale_config)
    if (cfg.stand === 'niet_verkopen') continue
    const naam = asset.name ?? asset.id

    if (cfg.stand === 'wanneer_nodig') {
      notices.push({
        kind: 'info',
        message: `verkoop '${naam}' staat op 'wanneer nodig' — de kern kent nog geen dynamische liquidatie-trigger voor generieke potten (snede 2b) — niet gemapt.`,
      })
      continue
    }

    // vast_moment: alleen de leeftijd-trigger wordt naar een vaste maand gemapt.
    const age = cfg.triggerAge
    if (age == null) {
      notices.push({
        kind: 'info',
        message: `verkoop '${naam}' heeft alleen een datum-trigger — nog niet naar een vaste maand gemapt (snede 2b).`,
      })
      continue
    }
    const maand = Math.round((age - ctx.startLeeftijd) * 12)
    if (maand < 0 || maand >= HORIZON_MONTHS) continue // verleden/na horizon → stille skip
    liquidaties.push({ slot, maand, kostenPct: cfg.salesCostsPct ?? 0 })
    if (cfg.payoffDebtIds && cfg.payoffDebtIds.length > 0) {
      notices.push({
        kind: 'info',
        message: `verkoop '${naam}' zou gekoppelde schulden aflossen (payoffDebtIds); de kern routeert de netto-opbrengst naar Spaargeld zónder schuld-aflossing (snede 2b) — verfijnen in FASE 4/5.`,
      })
    }
  }

  return { liquidaties, notices }
}

/**
 * Geplande maandaflossing (€) van een schuld: `custom_aflossing_amount` wint, anders
 * de uit `monthly_payment`/`repayment_type` afgeleide aflossing-component
 * (`computeRenteAflossingsSplit`, aflossingsvrij → 0). Geschaald met `inclusion_pct`
 * zodat het aflossingstempo bij de (gescaleerde) startwaarde past.
 */
function plannedMonthlyAflossing(debt: Debt): number {
  const custom = debt.custom_aflossing_amount
  if (custom != null && Number.isFinite(Number(custom)) && Number(custom) >= 0) {
    return Number(custom)
  }
  const split = computeRenteAflossingsSplit(debt)
  return split ? split.currentAflossing : 0
}

/** `classifyDebt`-uitkomst → kern-`DebtBox3Type`. */
function debtBox3Type(inBox3: boolean): DebtBox3Type {
  return inBox3 ? 'Box 3 schuld' : 'Geen Box 3 schuld'
}

/** Eén actieve schuld met haar toegewezen fysieke slot. */
export interface DebtSlot {
  readonly debt: Debt
  readonly slot: number
  readonly isHypotheek: boolean
}

/**
 * Deterministische fysieke slot-toewijzing per actieve schuld: de eerste
 * eigen-huis-gekoppelde hypotheek → slot 0 (contract), overige → de vrije slots
 * (overslaan van 0/3/6 = hypotheek/opeet/tekort) in `sort_order`-dan-`id`-volgorde.
 * Eén bron voor zowel `buildSchuldPotten` als de kernel-bridge (`debtSlotMeta`),
 * zodat een consument de pot-`slot` niet zelf hoeft te herleiden (drift-risico).
 * De altijd-aanwezige tekort-lening (slot 6) hoort NIET bij deze app-schulden en
 * wordt door `buildSchuldPotten` apart toegevoegd.
 */
export function assignDebtSlots(
  debts: readonly Debt[],
  eigenHuisIds: ReadonlySet<string>,
): DebtSlot[] {
  const active = debts.filter((d) => d.is_active !== false).sort(bySortOrderThenId)
  const firstMortgageId =
    active.find(
      (d) => d.debt_type === 'mortgage' && d.linked_asset_id != null && eigenHuisIds.has(d.linked_asset_id),
    )?.id ?? null
  // Reguliere schulden vermijden 0 (hypotheek), 3 (opeet) en 6 (tekort).
  const slotGen = freeSlots(new Set([HYPOTHEEK_SLOT, OPEET_SLOT, TEKORT_SLOT]))
  return active.map((d) => {
    const isHypotheek = d.id === firstMortgageId
    return { debt: d, slot: isHypotheek ? HYPOTHEEK_SLOT : slotGen.next().value, isHypotheek }
  })
}

/**
 * Schulden → `DebtPot[]` + de altijd-aanwezige tekort-lening. De eerste actieve
 * hypotheek die aan een eigen huis is gekoppeld (`linked_asset_id`) krijgt slot 0 +
 * rol 'hypotheek'; overige schulden vullen 1/2/4/5 (slot 3 = opeet gereserveerd,
 * 6 = tekort). De tekort-lening bestaat altijd: rol 'tekortLening', startsaldo 0,
 * rente = `tekortLeningRente` (V7). `startwaarde` = `current_balance × inclusion_pct`
 * (V6); `aflossingEur` = geplande jaaraflossing (× inclusion_pct).
 */
export function buildSchuldPotten(
  debts: readonly Debt[],
  eigenHuisIds: ReadonlySet<string>,
  tekortLeningRente: number,
): DebtPot[] {
  const pots: DebtPot[] = []
  for (const { debt: d, slot, isHypotheek } of assignDebtSlots(debts, eigenHuisIds)) {
    const rol: DebtRol | null = isHypotheek ? 'hypotheek' : null
    const factor = inclusionFactor(d.net_worth_inclusion_pct)
    const rente = Number(d.interest_rate ?? 0) / 100
    pots.push({
      slot,
      naam: d.name ?? null,
      box3Type: debtBox3Type(classifyDebt(d, new Set(eigenHuisIds)).inBox3),
      categorie: DEBT_TYPE_TO_CATEGORIE[d.debt_type as DebtType] ?? 'Overig',
      startwaarde: Number(d.current_balance ?? 0) * factor,
      aflossingPct: 0, // altijd via de €-vorm (aflossingEur) — geen dubbele bron
      aflossingEur: plannedMonthlyAflossing(d) * 12 * factor,
      rente: Number.isFinite(rente) ? rente : 0,
      liquide: false, // schulden zijn niet-liquide bezit; de kern gebruikt dit niet als toewijsdoel
      inSparenNaAflossing: mapInSparenNaAflossing(d),
      rol,
    })
  }

  // Altijd-aanwezige tekort-lening op slot 6 (contract).
  pots.push({
    slot: TEKORT_SLOT,
    naam: 'Tekort-lening',
    box3Type: 'Box 3 schuld',
    categorie: 'Tekort',
    startwaarde: 0,
    aflossingPct: 0,
    aflossingEur: 0,
    rente: tekortLeningRente,
    liquide: false,
    inSparenNaAflossing: false,
    rol: 'tekortLening',
  })

  return pots.sort((a, b) => a.slot - b.slot)
}

/**
 * `include_aflossing_in_savings` → kern-`inSparenNaAflossing` (bens!H). **BEWUST DE
 * INVERSE.** De kern-CF!G laat bij payoff de geplande maandaflossing vrijvallen als
 * `inSparenNaAflossing = true`. De app-vlag `include_aflossing_in_savings = true`
 * betekent dat die aflossing NU AL als sparen wordt geteld (ADR 0020: "aflossing zat
 * al in sparen"). Hem dan óók bij payoff laten vrijvallen zou de aflossing dubbel
 * tellen. Daarom: `inSparenNaAflossing = !include_aflossing_in_savings`.
 *
 * - `include_aflossing_in_savings = true`  → aflossing zit al in de spaarstroom →
 *   `inSparenNaAflossing = false` (geen payoff-vrijval; de waterval leidt het overschot
 *   ná payoff vanzelf naar bezittingen).
 * - `include_aflossing_in_savings = false` → aflossing is een kost (niet in sparen) →
 *   `inSparenNaAflossing = true` (het vrijgevallen bedrag wordt ná payoff sparen).
 *
 * NB: de kern-CF!G geeft de AFLOSSING vrij (`geplandeMaandAflossing`), niet enkel de
 * rente; de app-v2 gaf per ADR 0020 alléén de rente vrij. Die positieve rente-vrijval
 * reproduceert de kern niet — een bewuste, gedocumenteerde afwijking voor snede 1;
 * het doel hier is uitsluitend de dubbeltelling voorkomen.
 */
export function mapInSparenNaAflossing(debt: Debt): boolean {
  return !debt.include_aflossing_in_savings
}
