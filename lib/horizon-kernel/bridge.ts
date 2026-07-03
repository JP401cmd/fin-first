/**
 * Horizon-kernel — **app-zijdige bridge**: kernel-uitvoer → consumer-contract.
 *
 * FASE 5, stap 1 (ADR 0032 §8; plan §7 V14). Zet de kernel-uitvoer
 * (`SolveFireResult` + `KernelProjection`, maandbasis, **nominaal**) om naar het
 * bestaande consumer-contract `UnifiedProjectionResult` — exact dezelfde vorm die
 * de v2-adapter (`lib/horizon-engine/adapter.ts#ledgerToUnifiedResult`) levert.
 * Daarmee kunnen de bestaande grafiek-/tabel-/freedomPct-consumenten de rekenkern
 * consumeren zónder UI-wijziging.
 *
 * ## App-zijde, NIET via de kernel-barrel
 * Deze module mag app-types importeren (`@/lib/unified-projection`, `@/lib/asset-data`,
 * `@/lib/fire-strategy`) en wordt BEWUST NIET via `lib/horizon-kernel/index.ts`
 * geëxporteerd — dezelfde regel als de adapter (`adapter/`): de kern blijft puur en
 * domein-vrij; app-koppelingen leven aan de rand.
 *
 * ## Nominaal + inflatiefactor (V14)
 * De kernel is al **nominaal**; alle bedragen gaan ONGEWIJZIGD door (géén reëel→
 * nominaal ×(1+inflatie)^jaar zoals de v2-adapter, want de kernel deflateert niet).
 * Per rij dragen we `inflationFactor = (1 + inflatie)^k` mee zodat het bestaande
 * reëel-weergave-contract (deflate = bedrag/factor: sim-chart `targetInflationFactors`,
 * phase-detail-table `deflate()`) intact blijft.
 *
 * ## Sampling — jaar-rij k aggregeert de kernel-maanden [12k .. 12k+11]
 * Alleen in-horizon-maanden tellen; `year = k`; `age = round(startLeeftijd) + k`
 * (`buildPersoonTijdas` levert een geheel-jaren `startLeeftijd` via `ageAtDate`, dus
 * `round` is defensief). STANDEN: `startNetWorth` = Prognose!I begin blok (m = 12k−1;
 * k=0 → beginwaarden uit de potten), `netWorth`/`totalAssets`/`totalDebts` =
 * Prognose!I/D/E op de laatste in-horizon-maand van het blok. STROMEN (savings/
 * withdrawal/growth/box3/grossIncome/cashflowNet/oneTimeNet) = sommen over de
 * (in-horizon) maanden van het blok; het laatste (partiële) blok aggregeert de rest.
 *
 * ## requiredFirePortfolio (redenering)
 * = Prognose!J op de gevonden FIRE-maand (nominaal; = `summary.nettoLiquideBijFire`,
 * null-fallback → J op `lastInHorizonMonth`). P!B36 (doelbedrag) is het EIND-doel op
 * de eindleeftijd (deplete → 0 — zou freedomPct breken), NIET de FIRE-behoefte; in de
 * maand-bisectie is J@FIRE per constructie de minimaal-toereikende portefeuille → dit
 * is het V_nodig(FIRE)-equivalent. `firePortfolioAtFire` deelt dezelfde bron: in de
 * kernel vallen "portefeuille bij FIRE" en "benodigde portefeuille bij FIRE" samen
 * (de bisectie stopt op de eerste maand waar J toereikend is). `targetEndPortfolio`
 * = `solve.doelbedrag` (B36); `displayEndAge` = `solve.eindleeftijd` (B35).
 *
 * ## fase & fireAge
 * De kernel kent geen 'overbrugging' — er zijn dus GEEN 'transition'-rijen: `phase`
 * = 'accumulation' zolang het blok vóór de FIRE-maand start (`12k < fireMonth`),
 * anders 'withdrawal'. Dat tilt de per-maand-regel (m < fireMonth = opbouw) naar de
 * jaar-rij via de blok-startmaand en valt exact samen met de integer-FIRE-leeftijd-
 * overgang. `fireAgeFractional = solve.fireAge` (maand-resolutie); de integer
 * `fireAge = ceil(fireAgeFractional)` — exact de v2-relatie (v2: `fireAge − 1 ≤
 * fireAgeFractional ≤ fireAge`), en gelijk aan `fireAgeFractional` wanneer FIRE op een
 * heel jaar landt. `fireReachable = status !== 'unreachable_within_horizon'`
 * (`pension_shortfall` blijft reachable — AOW-verankerd); bij onbereikbaar zijn beide
 * fireAge-velden `null` (contract: "null als niet bereikbaar", spiegel v2).
 *
 * Pure functie, geen fs/Supabase/Date.now/Math.random.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type {
  AssetBucketDetail,
  DebtBalanceDetail,
  UnifiedProjectionResult,
  UnifiedProjectionRow,
} from '@/lib/unified-projection'
import type { SolveFireResult, SolverStatus } from './solver'
import type { KernelProjection } from './engine'
import { computeEs, type EindstrategieCode } from './tables/es'
import type { AssetCategorie, KernelInput } from './types'
import { assignAssetSlots, assignDebtSlots } from './adapter/potten'

// ── Bez-categorie-volgorde (identiek aan engine.ts `ASSET_ORDER` + Verdeling) ────
const ASSET_ORDER: readonly AssetCategorie[] = [
  'Spaargeld',
  'Beleggingen',
  'Pensioen',
  'Vastgoed',
  'Eigen huis',
  'Overig',
]

/**
 * Representatief app-`AssetType` per kern-categorie — de INVERSE van
 * `adapter/potten.ts#ASSET_TYPE_TO_CATEGORIE` (bewust niet bijectief: meerdere
 * app-typen mappen op één kern-categorie). Alléén gebruikt als er GEEN
 * `assetSlotMeta` is meegegeven (bv. de fixture-route zonder app-`Asset[]`); met
 * meta wint het echte app-type per slot.
 */
const CATEGORIE_REP_TYPE: Record<AssetCategorie, AssetType> = {
  Spaargeld: 'cash',
  Beleggingen: 'investment',
  Pensioen: 'retirement',
  Vastgoed: 'real_estate',
  'Eigen huis': 'eigen_huis',
  Overig: 'other',
}

/** ES-eindstrategie-code → app-`FireEndStrategy` (1-op-1; 'pensioen' bestaat in beide). */
const CODE_TO_STRATEGY: Record<EindstrategieCode, FireEndStrategy> = {
  deplete: 'deplete',
  legacy: 'legacy',
  perpetual: 'perpetual',
  pensioen: 'pensioen',
}

/** Per-slot app-koppeling (asset): fysiek kern-slot → app-`AssetType` + app-id. */
export interface AssetSlotMeta {
  readonly slot: number
  readonly assetType: AssetType
  readonly assetId: string
}

/** Per-slot app-koppeling (schuld): fysiek kern-slot → app-debt-id. */
export interface DebtSlotMeta {
  readonly slot: number
  readonly debtId: string
}

/** Context voor de bridge: de kern-invoer + optionele weergave-/app-koppelingen. */
export interface KernelBridgeContext {
  /** De `KernelInput` waarmee `solveFire` draaide (categorie/box3-type per slot). */
  readonly input: KernelInput
  /** Jaaruitgaven (reëel/koopkracht-nu) voor de `implicitWithdrawalRate` (zoals v2-adapter-opts). */
  readonly yearlyExpenses?: number
  /** Fysiek asset-slot → app-`AssetType`/id (uit `assignAssetSlots`); afwezig → categorie-rep-type. */
  readonly assetSlotMeta?: ReadonlyArray<AssetSlotMeta>
  /** Fysiek schuld-slot → app-debt-id (uit `assignDebtSlots`); afwezig → sleutel `slot-<n>`. */
  readonly debtSlotMeta?: ReadonlyArray<DebtSlotMeta>
}

/** `UnifiedProjectionResult` + de solver-doorvoer (V12; nog niet geconsumeerd). */
export interface KernelUnifiedResult extends UnifiedProjectionResult {
  /** P!B93/B100 — solver-status (doorvoer, V12). */
  readonly kernelStatus: SolverStatus
  /** P!B96 — €/mnd-extra-sparen-hint. */
  readonly kernelMaandHint: number
}

// ── m-accessors (guard voorbij-horizon / lege cellen → 0) ────────────────────

/** Coerce een S-cel (getal of "") naar getal (leeg → 0). */
function numCell(v: number | ''): number {
  return typeof v === 'number' ? v : 0
}

/** Bez-slotwaarde(m) van een fysiek slot; ontbrekend/voorbij-horizon → 0. */
function bezSlotWaarde(proj: KernelProjection, m: number, slot: number): number {
  const row = proj.bez[m]
  if (row === undefined || row.beyondHorizon) return 0
  return row.slots[slot]?.waarde ?? 0
}

/** S-slotsaldo(m) van een fysiek slot; ontbrekend/"" → 0. */
function sSlotSaldo(proj: KernelProjection, m: number, slot: number): number {
  const row = proj.s[m]
  if (row === undefined) return 0
  return numCell(row.slots[slot]?.saldo ?? 0)
}

/** Prognose!I(m) — netto vermogen; ontbrekend/voorbij-horizon → 0. */
function prognoseNetWorth(proj: KernelProjection, m: number): number {
  const row = proj.prognose[m]
  if (row === undefined || row.beyondHorizon) return 0
  return row.nettoVermogen
}

// ── Slot-groepering per bridge-run (één keer opgebouwd) ──────────────────────

/** Voorbewerkte slot-indexen per categorie/box3-type + de type-resolver. */
interface SlotGroups {
  /** Alle bezette bezitting-slots (fysieke index). */
  readonly assetSlots: readonly number[]
  /** Bezitting-slots per categorie (ASSET_ORDER-index → slots). */
  readonly slotsByCategorie: ReadonlyArray<readonly number[]>
  /** Box 3-spaar-slots resp. -investering-slots (voor de box3Drag-apportionering). */
  readonly spaarSlots: readonly number[]
  readonly investSlots: readonly number[]
  /** Fysiek slot → app-`AssetType` (meta-first, anders categorie-rep-type). */
  typeOfSlot(slot: number): AssetType
  /** ASSET_ORDER-index van een categorie. */
  catIndex(cat: AssetCategorie): number
}

function buildSlotGroups(ctx: KernelBridgeContext): SlotGroups {
  const { input } = ctx
  const metaBySlot = new Map<number, AssetType>()
  for (const m of ctx.assetSlotMeta ?? []) metaBySlot.set(m.slot, m.assetType)

  const catOfSlot = new Map<number, AssetCategorie>()
  const slotsByCategorie: number[][] = ASSET_ORDER.map(() => [])
  const spaarSlots: number[] = []
  const investSlots: number[] = []
  const assetSlots: number[] = []
  for (const pot of input.assetPotten) {
    assetSlots.push(pot.slot)
    catOfSlot.set(pot.slot, pot.categorie)
    slotsByCategorie[ASSET_ORDER.indexOf(pot.categorie)].push(pot.slot)
    if (pot.box3Type === 'Box 3 spaar') spaarSlots.push(pot.slot)
    else if (pot.box3Type === 'Box 3 investering') investSlots.push(pot.slot)
  }

  return {
    assetSlots,
    slotsByCategorie,
    spaarSlots,
    investSlots,
    typeOfSlot(slot: number): AssetType {
      const t = metaBySlot.get(slot)
      if (t !== undefined) return t
      const cat = catOfSlot.get(slot)
      return cat !== undefined ? CATEGORIE_REP_TYPE[cat] : 'other'
    },
    catIndex(cat: AssetCategorie): number {
      return ASSET_ORDER.indexOf(cat)
    },
  }
}

// ── Per-blok aggregatie ──────────────────────────────────────────────────────

/** Voeg een deel-bedrag toe aan de bucket van `type` (maakt de bucket zo nodig aan). */
function addBucket(
  buckets: Partial<Record<AssetType, AssetBucketDetail>>,
  type: AssetType,
  field: keyof AssetBucketDetail,
  amount: number,
): void {
  const b =
    buckets[type] ?? { startValue: 0, growth: 0, contributions: 0, box3Drag: 0, endValue: 0 }
  b[field] += amount
  buckets[type] = b
}

/** Voeg een deel-onttrekking toe aan het type (maakt de key zo nodig aan). */
function addWithdrawal(
  by: Partial<Record<AssetType, number>>,
  type: AssetType,
  amount: number,
): void {
  by[type] = (by[type] ?? 0) + amount
}

/**
 * Bouw één jaar-rij k uit de kernel-maanden [12k .. min(12k+11, lastInHorizonMonth)].
 * `cumBox3Prev` is de cumulatieve Box 3 t/m rij k−1 (lopende som).
 */
function buildRow(
  proj: KernelProjection,
  groups: SlotGroups,
  ctx: KernelBridgeContext,
  k: number,
  lastInHorizonMonth: number,
  fireMonth: number,
  cumBox3Prev: number,
): UnifiedProjectionRow {
  const { input } = ctx
  const startAge = Math.round(input.startLeeftijd)
  const monthStart = 12 * k
  const monthEnd = Math.min(12 * k + 11, lastInHorizonMonth)

  const assetBuckets: Partial<Record<AssetType, AssetBucketDetail>> = {}
  const withdrawalByType: Partial<Record<AssetType, number>> = {}
  const debtBalances: Record<string, DebtBalanceDetail> = {}

  // ── Standen (Prognose op blok-randen) ──────────────────────────────────────
  // startNetWorth: Prognose!I(12k−1); k=0 → beginwaarden uit de potten.
  const startNetWorth =
    k === 0
      ? input.assetPotten.reduce((s, p) => s + p.startwaarde, 0) -
        input.schuldPotten.reduce((s, p) => s + p.startwaarde, 0)
      : prognoseNetWorth(proj, monthStart - 1)

  const endProg = proj.prognose[monthEnd]
  const totalAssets = endProg && !endProg.beyondHorizon ? endProg.totaalBezittingen : 0
  const totalDebts = endProg && !endProg.beyondHorizon ? endProg.totaalSchulden : 0
  const netWorth = endProg && !endProg.beyondHorizon ? endProg.nettoVermogen : 0

  // ── Per-bucket start/end (waarde op blok-randen) ───────────────────────────
  for (const slot of groups.assetSlots) {
    const type = groups.typeOfSlot(slot)
    const startValue =
      k === 0
        ? input.assetPotten.find((p) => p.slot === slot)?.startwaarde ?? 0
        : bezSlotWaarde(proj, monthStart - 1, slot)
    addBucket(assetBuckets, type, 'startValue', startValue)
    addBucket(assetBuckets, type, 'endValue', bezSlotWaarde(proj, monthEnd, slot))
  }

  // ── Stromen: som over de in-horizon-maanden van het blok ───────────────────
  let savings = 0
  let withdrawal = 0
  let totalGrowth = 0
  let totalBox3 = 0
  let grossIncome = 0
  let cashflowNet = 0
  let oneTimeNet = 0

  for (let m = monthStart; m <= monthEnd; m++) {
    const bez = proj.bez[m]
    const bel = proj.bel[m]
    const cf = proj.cf[m]
    const af = proj.af[m]
    const verdeling = proj.verdeling[m]
    if (bez === undefined || bez.beyondHorizon) continue

    // Per-slot rendement/inleg → bucket growth/contributions.
    for (const slot of groups.assetSlots) {
      const cell = bez.slots[slot]
      if (cell === undefined) continue
      const type = groups.typeOfSlot(slot)
      addBucket(assetBuckets, type, 'growth', cell.rendement)
      addBucket(assetBuckets, type, 'contributions', cell.inleg)
    }
    totalGrowth += bez.totaalRendement
    savings += bez.totaalInleg

    // Box 3 (Bel!N, canoniek) — jaarsom + display-apportionering per Box 3-tak.
    const belN = bel !== undefined && !bel.beyondHorizon ? bel.canoniek : 0
    totalBox3 += belN
    apportionBox3(assetBuckets, groups, bez, belN)

    // Onttrekking (Verdeling-eindtoewijzing = de capaciteits-begrensde werkelijke
    // onttrekking die de potten muteert; NIET Ont!D = de ongeknipte behoefte).
    if (verdeling !== undefined) {
      for (let i = 0; i < ASSET_ORDER.length; i++) {
        const bedrag = verdeling.onttrekking.eind[i] ?? 0
        if (bedrag <= 0) continue
        withdrawal += bedrag
        distributeWithdrawal(withdrawalByType, groups, proj, m, ASSET_ORDER[i], bedrag)
      }
    }

    // Kasstroom-toewijzing (elke euro precies één keer):
    //  grossIncome  = CF!D (salaris+partner+werk) + CF!H (Geb-baten incl. AOW/pensioen).
    //  oneTimeNet   = Bez!AZ (eenmalige woningverkoop-opbrengst).
    //  cashflowNet  = Bez!BE (opeethypotheek-opname) − Af!D (gebeurtenis-kosten).
    if (cf !== undefined && !cf.beyondHorizon) {
      grossIncome += cf.inkomen + cf.gebeurtenisBaten
    }
    oneTimeNet += bez.woning.verkoopopbrengst
    cashflowNet += bez.woning.opeetOpname - (af !== undefined ? af.totaalAfname : 0)
  }

  // ── Schulden per app-debt-id (+ tekort-lening zodra aangesproken) ──────────
  const debtMetaBySlot = new Map<number, string>()
  for (const dm of ctx.debtSlotMeta ?? []) debtMetaBySlot.set(dm.slot, dm.debtId)
  for (const pot of input.schuldPotten) {
    const slot = pot.slot
    const endBalance = sSlotSaldo(proj, monthEnd, slot)
    if (pot.rol === 'tekortLening') {
      // V7: alleen tonen zodra de tekort-lening is aangesproken (saldo > 0).
      if (endBalance <= 0) continue
    }
    const startBalance =
      k === 0 ? pot.startwaarde : sSlotSaldo(proj, monthStart - 1, slot)
    let interestPaid = 0
    let principalPaid = 0
    for (let m = monthStart; m <= monthEnd; m++) {
      const row = proj.s[m]
      if (row === undefined) continue
      const cell = row.slots[slot]
      if (cell === undefined) continue
      interestPaid += numCell(cell.rente)
      principalPaid += numCell(cell.aflossing) + numCell(cell.extra)
    }
    const key =
      pot.rol === 'tekortLening'
        ? 'tekort-lening'
        : debtMetaBySlot.get(slot) ?? `slot-${slot}`
    debtBalances[key] = { startBalance, interestPaid, principalPaid, endBalance }
  }

  const phase: UnifiedProjectionRow['phase'] =
    12 * k >= fireMonth ? 'withdrawal' : 'accumulation'

  return {
    year: k,
    age: startAge + k,
    phase,
    assetBuckets,
    debtBalances,
    totalAssets,
    totalDebts,
    netWorth,
    startNetWorth,
    grossIncome,
    savings,
    withdrawal,
    withdrawalByType,
    cashflowNet,
    oneTimeNet,
    totalGrowth,
    totalBox3,
    cumulativeBox3: cumBox3Prev + totalBox3,
    inflationFactor: Math.pow(1 + input.inflatie, k),
  }
}

/**
 * Verdeel de canonieke maandheffing Bel!N over de bezitting-buckets (LOAD-BEARING
 * voor de phase-modal-opbouw / phase-detail-table). Split pro-rata grondslag over de
 * twee Box 3-takken (spaar/investering) en binnen elke tak pro-rata pot-waarde(m).
 *
 * NB: in de kernel loopt Box 3 via de cashflow (netto = bruto), dus de bucket-
 * `endValue` is NIET met `box3Drag` verminderd — dit veld is puur weergave-
 * apportionering; de v2-bucket-identiteit (eind = start + groei + inleg − box3) geldt
 * hier NIET (wél zonder box3: eind ≈ start + groei + inleg).
 */
function apportionBox3(
  buckets: Partial<Record<AssetType, AssetBucketDetail>>,
  groups: SlotGroups,
  bez: Extract<KernelProjection['bez'][number], { beyondHorizon: false }>,
  belN: number,
): void {
  if (belN === 0) return
  const spaarBase = bez.totaalBox3Spaar
  const investBase = bez.totaalBox3Investering
  const base = spaarBase + investBase
  if (base <= 0) return // geen grondslag → geen apportionering (belN ≈ 0)

  const spaarHeffing = (belN * spaarBase) / base
  const investHeffing = belN - spaarHeffing // sluit exact op belN (float-veilig)

  if (spaarBase > 0) {
    for (const slot of groups.spaarSlots) {
      const w = bez.slots[slot]?.waarde ?? 0
      if (w <= 0) continue
      addBucket(buckets, groups.typeOfSlot(slot), 'box3Drag', (spaarHeffing * w) / spaarBase)
    }
  }
  if (investBase > 0) {
    for (const slot of groups.investSlots) {
      const w = bez.slots[slot]?.waarde ?? 0
      if (w <= 0) continue
      addBucket(buckets, groups.typeOfSlot(slot), 'box3Drag', (investHeffing * w) / investBase)
    }
  }
}

/**
 * Verdeel de onttrekking van één categorie over de app-typen binnen die categorie,
 * pro-rata de pot-waarde(m−1) — exact de `share` die Bez gebruikt om de pot te
 * muteren (`waarde(m−1)/categoriesaldo(m−1)`), zodat `withdrawalByType` de werkelijke
 * pot-daling volgt en Σ = `withdrawal`. Categorie-saldo 0 kan niet: de Verdeling-cap
 * begrenst de onttrekking op het categoriesaldo(m−1) → dan is het bedrag 0.
 */
function distributeWithdrawal(
  by: Partial<Record<AssetType, number>>,
  groups: SlotGroups,
  proj: KernelProjection,
  m: number,
  cat: AssetCategorie,
  bedrag: number,
): void {
  const slots = groups.slotsByCategorie[groups.catIndex(cat)]
  let catBase = 0
  for (const slot of slots) catBase += bezSlotWaarde(proj, m - 1, slot)
  if (catBase <= 0) {
    // Degenereert alleen als het bedrag 0 zou zijn (cap = catSaldo(m−1)); val terug
    // op het representatieve type zodat de euro tóch precies één keer landt.
    addWithdrawal(by, CATEGORIE_REP_TYPE[cat], bedrag)
    return
  }
  for (const slot of slots) {
    const w = bezSlotWaarde(proj, m - 1, slot)
    if (w <= 0) continue
    addWithdrawal(by, groups.typeOfSlot(slot), (bedrag * w) / catBase)
  }
}

// ── Publieke bridge ──────────────────────────────────────────────────────────

/**
 * Zet de kernel-uitvoer om naar `UnifiedProjectionResult` (+ solver-doorvoer).
 * Sampling/mapping: zie de module-doc.
 */
export function kernelToUnifiedResult(
  solve: SolveFireResult,
  ctx: KernelBridgeContext,
): KernelUnifiedResult {
  const { input } = ctx
  const proj = solve.projection
  const summary = proj.summary
  const lastInHorizonMonth = summary.lastInHorizonMonth
  const fireMonth = summary.fireMonth
  const groups = buildSlotGroups(ctx)

  // ── Rijen: één per jaar-blok t/m de laatste in-horizon-maand ───────────────
  const kLast = Math.floor(lastInHorizonMonth / 12)
  const rows: UnifiedProjectionRow[] = []
  let cumBox3 = 0
  for (let k = 0; k <= kLast; k++) {
    const row = buildRow(proj, groups, ctx, k, lastInHorizonMonth, fireMonth, cumBox3)
    cumBox3 = row.cumulativeBox3
    rows.push(row)
  }

  // ── FIRE-uitkomsten ────────────────────────────────────────────────────────
  const status = solve.status
  const fireReachable = status !== 'unreachable_within_horizon'
  const fireAgeFractional = fireReachable ? solve.fireAge : null
  const fireAge = fireAgeFractional !== null ? Math.ceil(fireAgeFractional) : null

  // requiredFirePortfolio = firePortfolioAtFire = Prognose!J@FIRE (nominaal),
  // null-fallback → J op de laatste in-horizon-maand (zie module-doc).
  const requiredFirePortfolio = summary.nettoLiquideBijFire ?? summary.eindNettoLiquide
  const firePortfolioAtFire = requiredFirePortfolio

  // implicitWithdrawalRate: reële jaaruitgave geïndexeerd naar de FIRE-maand /
  // benodigde (nominale) portefeuille — spiegelt de v2-adapter-optie.
  const portfolioMonth = summary.nettoLiquideBijFire != null ? fireMonth : lastInHorizonMonth
  const fireInflationFactor = Math.pow(1 + input.inflatie, portfolioMonth / 12)
  const yearlyExpensesNominal = (ctx.yearlyExpenses ?? 0) * fireInflationFactor
  const implicitWithdrawalRate =
    requiredFirePortfolio > 0 && ctx.yearlyExpenses
      ? yearlyExpensesNominal / requiredFirePortfolio
      : 0

  const strategy = CODE_TO_STRATEGY[computeEs(input).interneCode]

  return {
    rows,
    fireAge,
    fireAgeFractional,
    fireReachable,
    firePortfolioAtFire,
    requiredFirePortfolio,
    implicitWithdrawalRate,
    strategy,
    targetEndPortfolio: solve.doelbedrag,
    displayEndAge: solve.eindleeftijd,
    kernelStatus: status,
    kernelMaandHint: solve.maandHint,
  }
}

/**
 * **WEERGAVE-regel** voor de B93-doel=0-quirk — GEEN rekenkern-wijziging.
 *
 * Bij eindstrategie "Vermogen opeten" (deplete) is het doelbedrag P!B36 = 0. De
 * solver-status P!B93 wordt dan per constructie ALTIJD `reached_now` (de conditie
 * `Prognose!J(0) ≥ 0` is triviaal waar), óók wanneer de maand-bisectie een echte,
 * latere FIRE-maand vond (`solve.fireAge` = bv. 89 jaar en 3 maanden). De kern blijft
 * hier bewust Excel-exact (zie `solver.ts` — "incl. de bewuste doel=0-quirk"); alleen
 * de *presentatie* mag niet misleidend "Nu al bereikt" tonen als de gevonden
 * FIRE-leeftijd in werkelijkheid later ligt.
 *
 * Deze helper beslist of de "Nu al bereikt"-taal terecht is: alléén wanneer de
 * gevonden FIRE-leeftijd ~ de startleeftijd is (≤ startleeftijd + één maand, met een
 * kleine float-epsilon). Anders hoort de `reached_at`-presentatie ("Bereikt op
 * leeftijd") getoond te worden.
 *
 * BELANGRIJK — voed de ECHTE solver-fireAge in: de `fireAgeFractional` die
 * `kernelToUnifiedResult` doorgeeft (= `solve.fireAge`, NIET op de startleeftijd
 * geclampt). Een op `currentAge` geklemde waarde maakt de conditie altijd waar en
 * laat de misleiding bestaan.
 *
 * Pure functie; `null`/`undefined`/niet-eindig → `false` (val terug op reached_at).
 */
export function isKernelReachedNowDisplay(
  fireAge: number | null | undefined,
  startAge: number | null | undefined,
): boolean {
  if (fireAge == null || startAge == null) return false
  if (!Number.isFinite(fireAge) || !Number.isFinite(startAge)) return false
  return fireAge <= startAge + 1 / 12 + 1e-9
}

/**
 * Convenience: leid `assetSlotMeta`/`debtSlotMeta` af uit app-`Asset[]`/`Debt[]` via
 * DEZELFDE slot-toewijzing als de adapter (`assignAssetSlots`/`assignDebtSlots`),
 * zodat de bridge de pot-`slot` niet zelf hoeft te herleiden (geen tweede, driftende
 * slot-toewijzing). `eigenHuisIds` bepaalt welke hypotheek slot 0 krijgt — geef
 * dezelfde set als aan `buildSchuldPotten`.
 */
export function buildKernelSlotMeta(
  assets: readonly Asset[],
  debts: readonly Debt[],
  eigenHuisIds: ReadonlySet<string>,
): { assetSlotMeta: AssetSlotMeta[]; debtSlotMeta: DebtSlotMeta[] } {
  const assetSlotMeta = assignAssetSlots(assets).map(({ asset, slot }) => ({
    slot,
    assetType: asset.asset_type as AssetType,
    assetId: asset.id,
  }))
  const debtSlotMeta = assignDebtSlots(debts, eigenHuisIds).map(({ debt, slot }) => ({
    slot,
    debtId: debt.id,
  }))
  return { assetSlotMeta, debtSlotMeta }
}
