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
 * (`pension_shortfall`/`anchor_shortfall`/`stop_now_shortfall` blijven reachable — het
 * stopmoment ligt vast, alleen de dekking ontbreekt; ADR 0129 K1 garandeert dat
 * `unreachable` onder een vast anker nooit valt); bij onbereikbaar zijn beide
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
import {
  jaarBlokEindMaand,
  laatsteJaarBlok,
  startNettoVermogen,
  // Alias: binnen `buildRow` heet de LOKALE stand `startNettoLiquide` (shorthand naar
  // het gelijknamige rijveld), dus de t=0-functie krijgt hier een eigen naam.
  startNettoLiquide as startNettoLiquideT0,
} from './jaarrand'
import { computeEs, type EindstrategieCode } from './tables/es'
import type { GebPostHelpers } from './tables/geb'
import { inflationIndex } from './scaffold'
import { depletionMonth } from './runway'
import type { AssetCategorie, KernelInput, KernelStopAnker } from './types'
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

/** Index van de kern-categorie 'Pensioen' binnen `ASSET_ORDER` (= Verdeling-volgorde). */
const PENSIOEN_CAT_INDEX = ASSET_ORDER.indexOf('Pensioen')

// ── Geb-rijtoewijzing voor de Box 1-stromen (structuur.md / tables/geb.ts) ──────
/** Geb rij 14 — AOW (netto binnengekomen; `NL_AOW_MONTHLY` is een netto SVB-bedrag). */
const GEB_ROW_AOW = 14
/** Geb rij 15-20 — pensioen-multipot (bruto, in de kernel-cashflow onbelast geboekt). */
const GEB_ROW_PENSIOEN_FIRST = 15
const GEB_ROW_PENSIOEN_LAST = 20

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

/**
 * ES-eindstrategie-code → app-`FireEndStrategy`.
 *
 * De drie EIND-VORMEN mappen 1-op-1. `pensioen`/`nu` zijn geen eind-vormen maar de
 * twee oude, in de enum ingebakken ANKERS (ADR 0129): ze bestaan hier nog omdat het
 * oracle-pad en de legacy-selector ze nog kunnen leveren. F4 verwijdert beide.
 */
const CODE_TO_STRATEGY: Record<EindstrategieCode, FireEndStrategy> = {
  deplete: 'deplete',
  legacy: 'legacy',
  perpetual: 'perpetual',
  pensioen: 'pensioen',
  nu: 'nu-stoppen',
}

/**
 * `SimResult.strategy` — de LEGACY-label die ~60 oppervlakken op /toekomst nog als
 * ANKER lezen (`isPensioenMode`/`isNuStoppenMode`).
 *
 * Sinds F2 stuurt de adapter de EIND-VORM als selector plus een los `stopAnker`-blok,
 * dus `CODE_TO_STRATEGY[code]` alleen zou voor een pensioen-plan ineens `'deplete'`
 * teruggeven en die zestig takken in één klap stil uitzetten. Tot F3a die takken op
 * `stopAnker`/`isFixedAnchor(plan)` overzet, projecteert de bridge het anker daarom
 * terug op de oude label. Het `age`-anker heeft geen legacy-label (en geen UI vóór
 * F3b) en valt op de eind-vorm terug.
 *
 * Dit is een BEWUSTE compat-projectie, geen tweede waarheid: de canonieke feiten zijn
 * `stopAnker` (welk anker) en `displayEndAge`/`targetEndPortfolio` (welke eind-vorm).
 * F3a maakt de lezers anker-bewust, F4 verwijdert deze functie.
 */
function resolveLegacyStrategy(input: KernelInput, code: EindstrategieCode): FireEndStrategy {
  const soort = input.stopAnker?.soort
  if (soort === 'aow') return 'pensioen'
  if (soort === 'nu') return 'nu-stoppen'
  return CODE_TO_STRATEGY[code]
}

/**
 * F2-compat voor de STATUS, spiegel van `resolveLegacyStrategy` hierboven.
 *
 * DE REGRESSIE (live 3–5 sep 2026). F2 stuurt voor een pensioen-rij de eind-vorm
 * als selector, dus de solver komt niet meer op interne code 'pensioen' uit en
 * zet bij een tekort `anchor_shortfall` in plaats van `pension_shortfall`. Het
 * statusblok op /toekomst matcht letterlijk op `kernelStatus === 'pension_shortfall'`
 * en er bestond geen blok voor `anchor_shortfall`. Een pensioen-gebruiker met een
 * tekort-lening zag de grafiek die wél tekenen, maar las er niets over.
 *
 * Wat pijnlijk was: dezelfde commit hield `stop_now_shortfall` juist WÉL in stand
 * met precies deze motivering — en paste die gedachte niet toe op het aow-anker.
 * Deze functie herstelt het gedrag van vóór F2 exact; het leeftijd-anker blijft
 * `anchor_shortfall`, want daar wachtte nog geen oud blok op. F3b bouwt het
 * generieke blok, F4 verwijdert deze vertaling samen met `resolveLegacyStrategy`.
 * Bewaakt door `bridge.status-compat.test.ts`.
 */
function resolveLegacyStatus(input: KernelInput, status: SolverStatus): SolverStatus {
  if (status === 'anchor_shortfall' && input.stopAnker?.soort === 'aow') return 'pension_shortfall'
  return status
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

/**
 * Kernel-verkoopmoment van de eigen woning (weergave/marker-contract): de eerste
 * maand met een Bez!AZ-verkoopopbrengst > 0. De tijdlijn op de kernel-tak hoort DIT
 * moment te tonen (de server-virtuele v2-`verkoop_eigen_woning`-events zijn op de
 * kernel-tak stale — zie `use-horizon-fire-sim`).
 */
export interface KernelHousingSale {
  /** Maandindex m (0 = eerste prognose-maand). */
  readonly month: number
  /** Leeftijd op het verkoopmoment: afgeronde startleeftijd + m/12 (as van de rijen). */
  readonly age: number
  /** Netto verkoopopbrengst (Bez!AZ) in die maand. */
  readonly proceeds: number
}

/**
 * Pensioenpot-weergave (read-only WEERGAVEVELD, feature #876). De jaar-rijen
 * dragen pensioen-uitkeringen alleen geaggregeerd (CF!H → `grossIncome`, zie
 * `buildRow`), dus een per-pot EINDE is uit de rijen niet af te leiden. Deze
 * view spiegelt de statische Auto-gebeurtenissen-afleiding (rij 26-31, J-M):
 * ingang/duur/maandbedrag per actieve pot. Consument:
 * `derivePensionPotEndFromRows` (lib/horizon/kernel-strategy-moments.ts).
 * Puur weergave — GEEN rekeninput, GEEN kern-wijziging.
 */
export interface KernelPensionPotView {
  /** Kolom A — naam van de pot (alleen actieve potten; A26-gate). */
  readonly naam: string
  /** Kolom C — ingangsleeftijd (null = onbekend). */
  readonly ingangsLeeftijd: number | null
  /** Kolom L — eind-leeftijd = ingang + duur-model (J). */
  readonly eindLeeftijd: number
  /** Kolom K — bruto maandbedrag (PMT-annuïtisering of directe invoer). */
  readonly maandbedrag: number
  /** True voor levenslange typen (`bedrijf`/`lijfrente_levenslang`, J = 100−C). */
  readonly levenslang: boolean
}

/** `UnifiedProjectionResult` + de solver-doorvoer (V12; nog niet geconsumeerd). */
export interface KernelUnifiedResult extends UnifiedProjectionResult {
  /** P!B93/B100 — solver-status (doorvoer, V12). */
  readonly kernelStatus: SolverStatus
  /** P!B96 — €/mnd-extra-sparen-hint. */
  readonly kernelMaandHint: number
  /** Verkoopmoment eigen woning binnen de horizon; `null` = geen verkoop. */
  readonly kernelHousingSale: KernelHousingSale | null
  /** Pensioenpot-weergave per actieve pot (weergaveveld; leeg = geen potten). */
  readonly kernelPensionPots: readonly KernelPensionPotView[]
  /**
   * Eerste AANHOUDENDE maand (maandindex vanaf nu, maand 0 = startleeftijd) waarin het
   * liquide vermogen Prognose!J op is, of `null` (ADR 0126). Gelezen door
   * `depletionMonth` (runway.ts) op DEZE projectie: `round(J) ≤ 0`, waarbij een dip
   * die binnen `MAX_TRANSIENT_SPAN_MONTHS` bewezen herstelt (huisverkoop-bruggetje)
   * niet telt. Op een geforceerde stop-nu-run (`evaluateFireAt` op de startleeftijd)
   * ís dit de runway; op de hoofdrun of een stop-kaart de uitputtingsmaand van dát
   * pad. Doorgeven, niet herrekenen: de kop op /overzicht, de stop-nu-scenariokaart
   * en de eindstrategie lezen alle drie dit ene veld uit dezelfde run.
   */
  readonly kernelDepletionMonth: number | null
  /**
   * Echo van `KernelInput.stopAnker` (ADR 0129 D3) — het stop-anker waarmee DEZE run
   * gerekend heeft, of `null` wanneer de solver het stopmoment zelf heeft gezocht.
   *
   * DOORGEVEN, niet afleiden: elk oppervlak dat wil weten of het stopmoment vastligt
   * leest dit veld (F3a vervangt er `isPensioenMode`/`isNuStoppenMode` mee), zodat er
   * niet opnieuw twee predicaten voor één feit ontstaan.
   */
  readonly stopAnker: KernelStopAnker | null
  /**
   * De maandindex van het stopmoment van DEZE RUN (maand 0 = vandaag) —
   * `round((solve.vastStopLeeftijd − startLeeftijd)·12)` — of `null` wanneer de
   * bisectie het stopmoment zocht (incl. de horizon-parkeerstand).
   *
   * Contract-ronde K3 (ADR 0129 D5): voor de plan-run is dit het plan-anker; voor
   * een geforceerde run (`evaluateFireAt` via `bridgeForcedStop`) de geforceerde
   * maand — de stop-nu-runway heeft 0, een scenariokaart "stop op 58" heeft
   * (58 − start)·12, óók als het plan zelf op `aow` staat. `stopAnker` echoot
   * daarnaast onveranderd het PLAN-anker; de twee velden beantwoorden dus
   * verschillende vragen ("waarmee is deze run gerekend" vs. "wat is het plan").
   *
   * Voedt de dekking (`computeRunwayCoveragePct`, D5): die meet hoe ver het geld
   * reikt NÁ het stopmoment, niet vanaf vandaag. Onder het `nu`-anker is dit 0 en
   * valt de formule samen met de ADR 0126/0127-vorm.
   *
   * Kan NEGATIEF zijn: een AOW-anker bij iemand die de AOW al voorbij is. De dekking
   * behandelt dat als "stopmoment is gepasseerd" (noemer krimpt niet verder).
   */
  readonly ankerMaand: number | null
  /**
   * Het stopmoment van DEZE RUN als LEEFTIJD (fractioneel) — `solve.vastStopLeeftijd`,
   * doorgegeven zonder afronding. Bewust náást `fireAge` (= `ceil(fireAgeFractional)`):
   * een gekozen 58,5 werd als "jouw stopmoment" 59 zodra een oppervlak `fireAge` las
   * (bevinding 11, Fable-review). Onder een vast anker is dít het getal voor "jij stopt
   * op …"; `null` wanneer de bisectie het stopmoment zocht (ADR 0129 F3a).
   */
  readonly vastStopLeeftijd: number | null
  /**
   * `true` ⇒ het stopmoment ligt VAST, dus `requiredFirePortfolio`/
   * `requiredFireNetWorth` zijn de GEPROJECTEERDE stand op het anker en géén
   * "benodigd vermogen" (ADR 0129 D4). De kernel bisecteert onder een vast anker op
   * TIJD, niet op kapitaal — het doelvermogen is dan betekenisloos, ongeacht wélk
   * anker het is.
   *
   * Generalisatie van `requiredFireIsStartPortfolio` (ADR 0127 D4, alleen geldig op
   * FIRE-maand 0). Beide velden staan er tijdens de overgang naast elkaar: de oude
   * blijft exact zijn huidige waarde houden zodat F2 gedragsbehoudend is; F3a zet de
   * lezers over op dit veld en F4 verwijdert de oude. De grep op de oude naam is de
   * voortgangsmeter van F3a.
   */
  readonly requiredFireIsAnchorPortfolio: boolean
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

/**
 * Prognose!J(m) — netto LIQUIDE vermogen; ontbrekend/voorbij-horizon → 0.
 * Exacte spiegel van `prognoseNetWorth` (zelfde guard), alleen een andere kolom.
 */
function prognoseNettoLiquide(proj: KernelProjection, m: number): number {
  const row = proj.prognose[m]
  if (row === undefined || row.beyondHorizon) return 0
  return row.nettoLiquide
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
  /**
   * Slots waarvan de kern-categorie in TS!H als **niet-liquide** is gevlagd — d.w.z.
   * de categorieën die `Prognose!J` (= I − (L − M)) uit het besteedbare vermogen
   * knipt. Vandaag is dat uitsluitend 'Eigen huis', en alléén bij een niet-meetellen-
   * woonstrategie (`adapter/prio-overgang.ts`); bij 'Meerekenen' is de set leeg.
   * Bron = dezelfde `input.ts.bezitCategorien[].nietLiquide`-vlag die `prognose.ts`
   * gebruikt — geen tweede, driftende afleiding uit de woning-selector.
   */
  readonly nietLiquideSlots: ReadonlySet<number>
  /** Fysiek slot → app-`AssetType` (meta-first, anders categorie-rep-type). */
  typeOfSlot(slot: number): AssetType
  /** ASSET_ORDER-index van een categorie. */
  catIndex(cat: AssetCategorie): number
}

function buildSlotGroups(ctx: KernelBridgeContext): SlotGroups {
  const { input } = ctx
  const metaBySlot = new Map<number, AssetType>()
  for (const m of ctx.assetSlotMeta ?? []) metaBySlot.set(m.slot, m.assetType)

  // TS!H per bezit-categorie (op de `categorie`-sleutel, niet op array-positie —
  // zelfde uitkomst als de index-uitlijning in `prognose.ts`, maar drift-vrij).
  const nietLiquideCategorien = new Set<AssetCategorie>()
  for (const c of input.ts.bezitCategorien) if (c.nietLiquide) nietLiquideCategorien.add(c.categorie)

  const catOfSlot = new Map<number, AssetCategorie>()
  const slotsByCategorie: number[][] = ASSET_ORDER.map(() => [])
  const spaarSlots: number[] = []
  const investSlots: number[] = []
  const assetSlots: number[] = []
  const nietLiquideSlots = new Set<number>()
  for (const pot of input.assetPotten) {
    assetSlots.push(pot.slot)
    catOfSlot.set(pot.slot, pot.categorie)
    slotsByCategorie[ASSET_ORDER.indexOf(pot.categorie)].push(pot.slot)
    if (pot.box3Type === 'Box 3 spaar') spaarSlots.push(pot.slot)
    else if (pot.box3Type === 'Box 3 investering') investSlots.push(pot.slot)
    if (nietLiquideCategorien.has(pot.categorie)) nietLiquideSlots.add(pot.slot)
  }

  return {
    assetSlots,
    slotsByCategorie,
    spaarSlots,
    investSlots,
    nietLiquideSlots,
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

// ── Box 1-stroom-posten (weergave; één keer per bridge-run verzameld) ────────

/**
 * De Geb-posten die CF!H voedt, gesplitst naar AOW (rij 14) en pensioen
 * (rij 15-20). Puur een SUB-SELECTIE van dezelfde posten-verzameling die
 * `engine.ts#buildGebPosten` aan CF meegeeft — geen tweede afleiding: de
 * bedragen/vensters komen ongewijzigd uit `proj.gebAutoRows` en worden met exact
 * de CF!H-conditie (`bedrag > 0 && sIdx ≤ m ≤ eIdx`) en dezelfde inflatie-index
 * verbruikt. Alleen weergave; geen rekeninput.
 */
interface Box1GebPosts {
  readonly aow: readonly GebPostHelpers[]
  readonly pensioen: readonly GebPostHelpers[]
}

function collectBox1GebPosts(proj: KernelProjection): Box1GebPosts {
  const aow: GebPostHelpers[] = []
  const pensioen: GebPostHelpers[] = []
  for (const row of proj.gebAutoRows) {
    const target =
      row.gebRow === GEB_ROW_AOW
        ? aow
        : row.gebRow >= GEB_ROW_PENSIOEN_FIRST && row.gebRow <= GEB_ROW_PENSIOEN_LAST
          ? pensioen
          : null
    if (target === null) continue
    // CF!H telt alléén de POSITIEVE posten (baten); negatieve posten zijn kosten
    // en lopen via Af!D. Lege posten dragen bn=0 en vallen hier dus ook af.
    for (const h of row.helpers) if (h.bn > 0) target.push(h)
  }
  return { aow, pensioen }
}

/**
 * Σ koopkracht-nu-bedrag van de in maand m ACTIEVE posten — de CF!H-conditie
 * (`sIdx ≤ m ≤ eIdx`) vóór de ×idx-indexatie. Optellen-dan-indexeren spiegelt
 * de volgorde in `computeCF` (`baten` opgeteld, daarna `× idx`).
 */
function activeGebSum(posts: readonly GebPostHelpers[], m: number): number {
  let sum = 0
  for (const p of posts) if (p.sIdx <= m && m <= p.eIdx) sum += p.bn
  return sum
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
  box1Posts: Box1GebPosts,
): UnifiedProjectionRow {
  const { input } = ctx
  const startAge = Math.round(input.startLeeftijd)
  const monthStart = 12 * k
  // Blok-rand uit de gedeelde bemonsteringsregel (`jaarrand.ts`) — dezelfde regel
  // die de Monte-Carlo-marktcheck per verstoorde run gebruikt, zodat band en
  // hoofdlijn per constructie op dezelfde leeftijdsas liggen.
  const monthEnd = jaarBlokEindMaand(k, lastInHorizonMonth)

  const assetBuckets: Partial<Record<AssetType, AssetBucketDetail>> = {}
  const withdrawalByType: Partial<Record<AssetType, number>> = {}
  const debtBalances: Record<string, DebtBalanceDetail> = {}

  // ── Standen (Prognose op blok-randen) ──────────────────────────────────────
  // startNetWorth: Prognose!I(12k−1); k=0 → beginwaarden uit de potten.
  const startNetWorth =
    k === 0 ? startNettoVermogen(input) : prognoseNetWorth(proj, monthStart - 1)
  // startNettoLiquide: Prognose!J(12k−1); k=0 → beginwaarden uit de potten, gefilterd
  // op dezelfde TS!H-niet-liquide-vlag die Prognose!L/M gebruikt. De J-spiegel van
  // startNetWorth — nooit met elkaar mengen op één as (zie het veld-doccommentaar).
  const startNettoLiquide =
    k === 0 ? startNettoLiquideT0(input) : prognoseNettoLiquide(proj, monthStart - 1)

  const endProg = proj.prognose[monthEnd]
  const totalAssets = endProg && !endProg.beyondHorizon ? endProg.totaalBezittingen : 0
  const totalDebts = endProg && !endProg.beyondHorizon ? endProg.totaalSchulden : 0
  const netWorth = endProg && !endProg.beyondHorizon ? endProg.nettoVermogen : 0
  // Prognose!J op dezelfde blok-eindmaand als netWorth (Prognose!I) — de LIQUIDE
  // grondslag die `requiredFirePortfolio` (= J@FIRE) ook gebruikt. Doorgeleid, niet
  // herberekend: geen eigen "netto vermogen − niet-liquide"-som in een consument.
  const nettoLiquide = endProg && !endProg.beyondHorizon ? endProg.nettoLiquide : 0

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
  // Rendement van de NIET-LIQUIDE slots (Prognose!J-grondslag; zie
  // `SlotGroups.nietLiquideSlots`). Wordt onder de loop van `totalGrowth`
  // afgetrokken tot `totalGrowthLiquide` — het deel van het rendement dat
  // daadwerkelijk besteedbaar is. `totalGrowth` zelf blijft het canonieke,
  // ongewijzigde totaal-anker (Σ Bez!totaalRendement).
  let growthNietLiquide = 0
  let totalBox3 = 0
  // grossIncome-splitsing (read-only weergaveveld): CF!D resp. CF!H apart. De
  // jaar-`grossIncome` wordt uit deze twee opgeteld → `salaris + gebeurtenisBaten
  // === grossIncome` geldt float-exact.
  let incomeSalaris = 0
  let incomeGebeurtenisBaten = 0
  let cashflowNet = 0
  let oneTimeNet = 0
  // Onttrekkings-behoefte-decompositie (read-only weergaveveld): de ONGECAPTE
  // Ont!D-termen per in-horizon, post-FIRE maand. Rauwe jaar-sommen (alle ≥ 0);
  // de Ont!D-tekens komen pas in de reconciliatie (zie na de loop). Alleen gezet
  // wanneer totaalNeed > 0 zodat de rij-vorm in accumulatie-jaren identiek blijft.
  let needUitgaveTerm = 0
  let needHuur = 0
  let needHyplast = 0
  let needBox3 = 0
  let needPartner = 0
  let needTotaal = 0
  // Opeet-weergavevelden (feature #876): jaarsom Bez!BE + max Bez!BD. Alleen
  // gezet in opeet-modus zodat de rij-shape in alle andere modi identiek blijft.
  const opeetMode = input.woning.selector === 'Opeethypotheek'
  let opeetOpname = 0
  let opeetCap = 0
  // Box 1-stromen (read-only weergaveveld, spread-gated): de deelstromen waaruit
  // een Box 1-RAPPORTAGE NAAST de projectie haar grondslag opbouwt. Jaar-sommen,
  // nominaal. AOW/pensioen komen uit dezelfde Geb-posten × idx die CF!H optelt;
  // de pensioen-onttrekking uit de Verdeling-eindtoewijzing op categorie
  // 'Pensioen'; de partner-baten uit PT!K. GEEN van deze vier voedt een pot-
  // mutatie — de kern-trajectorie is onaangeroerd (oracle-parity intact).
  let box1AowNetto = 0
  let box1PensioenUitkeringBruto = 0
  let box1PensioenOnttrekkingBruto = 0
  let box1PartnerBatenNetto = 0

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
      if (groups.nietLiquideSlots.has(slot)) growthNietLiquide += cell.rendement
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
        // Box 1-weergave: de onttrekking uit de kern-categorie 'Pensioen' is de
        // enige onttrekkings-tak die (bruto) Box 1-inkomen vormt; hier direct
        // afgetakt zodat de consument 'm niet uit `withdrawalByType` (app-type-
        // gesleuteld, meta-afhankelijk) hoeft te reconstrueren.
        if (i === PENSIOEN_CAT_INDEX) box1PensioenOnttrekkingBruto += bedrag
        distributeWithdrawal(withdrawalByType, groups, proj, m, ASSET_ORDER[i], bedrag)
      }
    }

    // Kasstroom-toewijzing (elke euro precies één keer):
    //  grossIncome  = CF!D (salaris+partner+werk) + CF!H (Geb-baten incl. AOW/pensioen).
    //  oneTimeNet   = Bez!AZ (eenmalige woningverkoop-opbrengst).
    //  cashflowNet  = Bez!BE (opeethypotheek-opname) − Af!D (gebeurtenis-kosten).
    //
    // POST-FIRE-SALARIS-GATE (rapportage-fix, GEEN kern-wijziging). CF!D bundelt
    // user-basissalaris `(nettoJaarinkomen/12)·idx` (= `cf.basissalaris`, single-
    // sourced in cf.ts) + partnerbijdrage PT!K (`proj.pt[m].totaal`) + werk-
    // strategie-delta. Vanaf de FIRE-maand is het user-basissalaris een PHANTOM:
    // CF!F (sparen) = 0 ná FIRE en Ont!D trekt dit "inkomen" NIET van de
    // onttrekkingsbehoefte af — de kern-trajectorie (potten/netWorth) draagt het
    // dus niet, maar als vaste-inkomsten-bron zou het de brugjaren-dekking
    // (coverage-strip / dekkingsradar / income-breakdown) kunstmatig op ≥100%
    // houden, óók bij een stopleeftijd ruim vóór de veilige marge. Verwijder daarom
    // ALLEEN het user-basissalaris voor m ≥ fireMonth; partnerinkomen (partner werkt
    // legitiem door) én de werk-delta (al kern-FIRE-gegate op 0 ná FIRE) blijven
    // behouden via `cf.inkomen −`. Consumeert `cf.basissalaris` i.p.v. de term zelf
    // te herberekenen (single-source by construction). Puur rapportage: dit veld
    // voedt geen enkele pot-mutatie, dus de netWorth-/rij-trajectorie is ONgewijzigd.
    if (cf !== undefined && !cf.beyondHorizon) {
      incomeSalaris += cf.inkomen - (m >= fireMonth ? cf.basissalaris : 0)
      incomeGebeurtenisBaten += cf.gebeurtenisBaten
      // Box 1-deelstromen uit exact dezelfde CF!H-optelling (zelfde conditie,
      // zelfde `inflationIndex`, zelfde horizon-guard) — geen tweede afleiding
      // van AOW/pensioen uit het profiel (ADR 0086).
      const aowBn = activeGebSum(box1Posts.aow, m)
      const pensioenBn = activeGebSum(box1Posts.pensioen, m)
      if (aowBn !== 0 || pensioenBn !== 0) {
        const gebIdx = inflationIndex(input, m)
        box1AowNetto += aowBn * gebIdx
        box1PensioenUitkeringBruto += pensioenBn * gebIdx
      }
      // PT!K — dezelfde bron die CF!D via `cf.inkomen` al meetelt.
      box1PartnerBatenNetto += proj.pt[m]?.totaal ?? 0
    }
    oneTimeNet += bez.woning.verkoopopbrengst
    cashflowNet += bez.woning.opeetOpname - (af !== undefined ? af.totaalAfname : 0)
    if (opeetMode) {
      opeetOpname += bez.woning.opeetOpname
      if (bez.woning.opeetCap > opeetCap) opeetCap = bez.woning.opeetCap
    }

    // Onttrekkings-behoefte-decompositie: reconstrueer de ONGECAPTE Ont!D-termen
    // uit de al-aanwezige kernel-tabellen. Alléén post-FIRE (m ≥ fireMonth): vóór
    // FIRE is Ont!D=0 (D-gate), dus die maanden dragen niet bij aan de behoefte.
    // De uitgave-term reconstrueert exact wat computeOnt gebruikte: (uitgave-na-
    // pensioen/12)·inflatie-idx·Ont!I (de profielfactor grijpt ALLEEN hierop). BA/BB
    // = Bez-woningblok, box3 = CF!K (= Bel!N(m−1), identiek aan Ont's box3-term),
    // partner = PT!K. `needTotaal` telt de gecapte Ont!D (na MAX(0,·) per maand).
    const ont = proj.ont[m]
    if (m >= fireMonth && ont !== undefined && !ont.beyondHorizon) {
      const idx = Math.pow(1 + input.inflatie, m / 12)
      needUitgaveTerm +=
        (input.inkomenUitgaven.uitgaveNaPensioenPerJaar / 12) * idx * ont.actieveFactor
      needHuur += bez.woning.huurPerMaand
      needHyplast += bez.woning.vervallenHypotheeklast
      needBox3 += cf !== undefined && !cf.beyondHorizon ? cf.box3VorigeMaand : 0
      needPartner += proj.pt[m]?.totaal ?? 0
      needTotaal += ont.onttrekking
    }
  }

  // ── Schulden per app-debt-id (+ tekort-lening zodra aangesproken) ──────────
  const debtMetaBySlot = new Map<number, string>()
  for (const dm of ctx.debtSlotMeta ?? []) debtMetaBySlot.set(dm.slot, dm.debtId)
  for (const pot of input.schuldPotten) {
    const slot = pot.slot
    const endBalance = sSlotSaldo(proj, monthEnd, slot)
    if (pot.rol === 'tekortLening' || pot.rol === 'opeethypotheek') {
      // Synthetische potten (géén app-`Debt`, dus geen `debtSlotMeta`-id): alleen tonen
      // zodra ze zijn aangesproken (saldo > 0). V7 voor de tekort-lening; identiek voor
      // de opeethypotheek, die pas vanaf de opname-startleeftijd een saldo krijgt.
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
        : pot.rol === 'opeethypotheek'
          ? 'opeethypotheek'
          : debtMetaBySlot.get(slot) ?? `slot-${slot}`
    debtBalances[key] = { startBalance, interestPaid, principalPaid, endBalance }
  }

  const phase: UnifiedProjectionRow['phase'] =
    12 * k >= fireMonth ? 'withdrawal' : 'accumulation'

  // grossIncome uit de splitsing opgeteld → `salaris + gebeurtenisBaten ===
  // grossIncome` is float-exact (dezelfde IEEE-optelling).
  const grossIncome = incomeSalaris + incomeGebeurtenisBaten

  // Behoefte-reconciliatie: rauwe Ont!D-som met de kern-tekens; restMaandClamp
  // vangt de per-maand-MAX(0,·)-opwaartse correctie zodat de vijf termen +
  // restMaandClamp float-exact tot totaalNeed sommeren (zie WithdrawalNeedBreakdown).
  const needRawInner = needUitgaveTerm + needHuur - needHyplast + needBox3 - needPartner
  const needRestMaandClamp = needTotaal - needRawInner

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
    nettoLiquide,
    startNettoLiquide,
    grossIncome,
    savings,
    withdrawal,
    withdrawalByType,
    cashflowNet,
    oneTimeNet,
    totalGrowth,
    totalGrowthLiquide: totalGrowth - growthNietLiquide,
    totalBox3,
    cumulativeBox3: cumBox3Prev + totalBox3,
    inflationFactor: Math.pow(1 + input.inflatie, k),
    ...(opeetMode ? { opeetOpname, opeetCap } : {}),
    ...(needTotaal > 0
      ? {
          withdrawalNeed: {
            uitgaveTerm: needUitgaveTerm,
            huurNaVerkoop: needHuur,
            vervallenHypotheeklast: needHyplast,
            box3: needBox3,
            partnerBijdrage: needPartner,
            totaalNeed: needTotaal,
            restMaandClamp: needRestMaandClamp,
            nietGedekt: Math.max(0, needTotaal - withdrawal),
          },
        }
      : {}),
    ...(incomeSalaris !== 0 || incomeGebeurtenisBaten !== 0
      ? {
          grossIncomeBySource: {
            salaris: incomeSalaris,
            gebeurtenisBaten: incomeGebeurtenisBaten,
          },
        }
      : {}),
    ...(box1AowNetto !== 0 ||
    box1PensioenUitkeringBruto !== 0 ||
    box1PensioenOnttrekkingBruto !== 0 ||
    box1PartnerBatenNetto !== 0
      ? {
          box1Streams: {
            aowNetto: box1AowNetto,
            pensioenUitkeringBruto: box1PensioenUitkeringBruto,
            pensioenOnttrekkingBruto: box1PensioenOnttrekkingBruto,
            partnerBatenNetto: box1PartnerBatenNetto,
          },
        }
      : {}),
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
  const kLast = laatsteJaarBlok(lastInHorizonMonth)
  const rows: UnifiedProjectionRow[] = []
  const box1Posts = collectBox1GebPosts(proj)
  let cumBox3 = 0
  for (let k = 0; k <= kLast; k++) {
    const row = buildRow(proj, groups, ctx, k, lastInHorizonMonth, fireMonth, cumBox3, box1Posts)
    cumBox3 = row.cumulativeBox3
    rows.push(row)
  }

  // ── FIRE-uitkomsten ────────────────────────────────────────────────────────
  // F2-compat: het aow-anker spreekt tegen de UI nog de pensioen-taal (zie
  // `resolveLegacyStatus`). `fireReachable` leest de VERTAALDE status; dat is
  // equivalent aan de kernel-status, want de vertaling raakt alleen
  // `anchor_shortfall` → `pension_shortfall` en nooit `unreachable_within_horizon`.
  const status = resolveLegacyStatus(ctx.input, solve.status)
  const fireReachable = status !== 'unreachable_within_horizon'
  const fireAgeFractional = fireReachable ? solve.fireAge : null
  const fireAge = fireAgeFractional !== null ? Math.ceil(fireAgeFractional) : null

  // requiredFirePortfolio = firePortfolioAtFire = Prognose!J@FIRE (nominaal),
  // null-fallback → J op de laatste in-horizon-maand (zie module-doc).
  //
  // M6 — DE TERUGVAL IS EEN ANDERE GROOTHEID. Zonder een echte "bij FIRE"-waarde
  // is dit de GEPROJECTEERDE eindstand op de horizon (leeftijd ~100), niet
  // "benodigd vermogen om vrij te zijn". Bij een structureel tekort is die stand
  // fors NEGATIEF — en werd zo ongefilterd als "Doelbedrag … benodigd" getoond.
  // De bridge blijft de waarde doorgeven (geen stille correctie in de rekenkern),
  // maar MARKEERT hem nu, zodat de weergavelaag er een gegevensmelding van kan
  // maken i.p.v. een bedrag. Zie `lib/horizon/outcome-guard.ts`.
  const requiredFireIsEndOfHorizonFallback = summary.nettoLiquideBijFire == null
  // ADR 0127 D4 — FIRE-maand 0 (eindstrategie 'Nu stoppen'): "requiredFirePortfolio"
  // is dan J(0) ≈ het huidige liquide vermogen. Dat is geen "benodigd vermogen" — de
  // kernel bisecteert op TIJD, niet op kapitaal — dus de weergavelaag toont er geen
  // doelbedrag voor (`guardFireTarget` → 'geen-doelvermogen'; loaders zetten
  // `simRequiredPortfolio`/`simRequiredNetWorth` op null). Spiegel van de
  // eind-horizon-vlag hierboven: markeren, niet stil corrigeren.
  const requiredFireIsStartPortfolio = fireMonth === 0
  // ADR 0129 D4 — hetzelfde feit, generiek over elk VAST anker: J op het anker is een
  // geprojecteerde pot, geen benodigd vermogen. Staat naast (niet in plaats van) de
  // ADR 0127-vlag hierboven, zodat F2 gedragsbehoudend blijft; F3a zet de lezers over.
  const requiredFireIsAnchorPortfolio = input.stopAnker !== undefined
  const requiredFirePortfolio = summary.nettoLiquideBijFire ?? summary.eindNettoLiquide
  const firePortfolioAtFire = requiredFirePortfolio

  // requiredFireNetWorth = Prognose!I@FIRE (nominaal) = TOTAAL netto vermogen bij FIRE
  // INCL. eigen woning. Spiegelt requiredFirePortfolio (= Prognose!J@FIRE, liquide) met
  // dezelfde null-fallback → I op de laatste in-horizon-maand. Puur DOORGELEID,
  // parity-gedekt summary-veld (engine.ts#nettoVermogenBijFire) — GEEN nieuwe berekening.
  // Identiteit: I = J + (niet-liquide bezit − niet-liquide schuld) ⇒ met overwaarde ≥ 0
  // geldt requiredFireNetWorth ≥ requiredFirePortfolio.
  const requiredFireNetWorth = summary.nettoVermogenBijFire ?? summary.eindNettoVermogen

  // implicitWithdrawalRate: reële jaaruitgave geïndexeerd naar de FIRE-maand /
  // benodigde (nominale) portefeuille — spiegelt de v2-adapter-optie.
  const portfolioMonth = summary.nettoLiquideBijFire != null ? fireMonth : lastInHorizonMonth
  const fireInflationFactor = Math.pow(1 + input.inflatie, portfolioMonth / 12)
  const yearlyExpensesNominal = (ctx.yearlyExpenses ?? 0) * fireInflationFactor
  const implicitWithdrawalRate =
    requiredFirePortfolio > 0 && ctx.yearlyExpenses
      ? yearlyExpensesNominal / requiredFirePortfolio
      : 0

  const es = computeEs(input)
  const strategy = resolveLegacyStrategy(input, es.interneCode)
  // Het stopmoment van DEZE RUN als maandindex (ADR 0129 D5, contract-ronde K3) — uit
  // `solve.vastStopLeeftijd`, niet uit het plan-anker. Vóór K3 kwam dit uit
  // `resolveVastAnker(input)`: correct voor de plan-run, maar op een GEFORCEERDE run
  // (`evaluateFireAt` via `bridgeForcedStop`: de stop-nu-runway, de scenariokaarten)
  // het verkeerde getal — een aow-gebruiker van 47 kreeg op de /overzicht-runway
  // (stop nu, maand 0) een `ankerMaand` van 240, waarmee `computeRunwayCoveragePct`
  // een runway van 20 jaar als 0% dekking zou lezen ("uitputting vóór het
  // stopmoment"). De solver weet als enige of het stopmoment vastlag (anker,
  // oracle-pensioen-kortsluiting of geforceerd) of gezocht werd (bisectie → null).
  const stopAnker = input.stopAnker ?? null
  const ankerMaand =
    solve.vastStopLeeftijd === null
      ? null
      : Math.round((solve.vastStopLeeftijd - input.startLeeftijd) * 12)

  // ── Verkoopmoment eigen woning (marker-contract) ───────────────────────────
  // Eerste in-horizon-maand met Bez!AZ-opbrengst > 0; leeftijd op dezelfde as als
  // de rijen (afgeronde startleeftijd + m/12, vgl. `buildRow`).
  let kernelHousingSale: KernelHousingSale | null = null
  for (let m = 0; m <= lastInHorizonMonth; m++) {
    const bez = proj.bez[m]
    if (bez === undefined || bez.beyondHorizon) continue
    const proceeds = bez.woning.verkoopopbrengst
    if (proceeds > 0) {
      kernelHousingSale = {
        month: m,
        age: Math.round(input.startLeeftijd) + m / 12,
        proceeds,
      }
      break
    }
  }

  // ── Pensioenpot-weergave (feature #876) ────────────────────────────────────
  // Spiegelt de statische Auto-gebeurtenissen-afleiding (rij 26-31, J-M): per
  // actieve pot de eind-leeftijd (L) + het maandbedrag (K). De jaar-rijen dragen
  // pensioen alleen geaggregeerd (CF!H), dus dit is het per-pot weergaveveld.
  const kernelPensionPots: KernelPensionPotView[] = []
  for (const pot of input.autoGebeurtenissen.pensioenPotten) {
    if (pot.naam === null) continue // A26-gate: inactief slot
    const row = proj.autoGebeurtenissen.pensioenRows[pot.slot]
    if (row === undefined) continue
    const eind = row.eindLeeftijd
    const maand = row.maandbedrag
    if (typeof eind !== 'number' || typeof maand !== 'number') continue
    kernelPensionPots.push({
      naam: pot.naam,
      ingangsLeeftijd: pot.ingangsLeeftijd,
      eindLeeftijd: eind,
      maandbedrag: maand,
      levenslang: pot.type === 'bedrijf' || pot.type === 'lijfrente_levenslang',
    })
  }

  return {
    rows,
    fireAge,
    fireAgeFractional,
    fireReachable,
    firePortfolioAtFire,
    requiredFirePortfolio,
    requiredFireNetWorth,
    requiredFireIsEndOfHorizonFallback,
    requiredFireIsStartPortfolio,
    requiredFireIsAnchorPortfolio,
    stopAnker,
    ankerMaand,
    vastStopLeeftijd: solve.vastStopLeeftijd,
    implicitWithdrawalRate,
    strategy,
    targetEndPortfolio: solve.doelbedrag,
    displayEndAge: solve.eindleeftijd,
    kernelStatus: status,
    kernelMaandHint: solve.maandHint,
    kernelHousingSale,
    kernelPensionPots,
    // Runway-lezer op dezelfde projectie (ADR 0126) — doorgeven, niet herrekenen.
    kernelDepletionMonth: depletionMonth(proj),
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
 * Tweede consumer: de scalar-router (`scalar-router.ts#computeScalarFireProjection`)
 * past sinds 2026-08-05 exact dezelfde regel toe op zijn reached_now-mapping (met
 * `kernelInput.startLeeftijd` als startAge) — verplaats/wijzig deze helper dus niet
 * als bridge-intern detail.
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
