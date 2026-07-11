/**
 * Wat-als-scenario — pure rekenlaag (stap 1 van de /toekomst-scenariolaag).
 *
 * Pure, isomorfe module: GEEN `'use client'`, geen Supabase, geen `Date.now()`.
 * Levert de helpers waarmee de scenario-projectie (2e lijn op /toekomst) wordt
 * gevoed ZONDER de basislijn te muteren. De scenario-run zelf draait via
 * `computeConvergentieProjection` met exact dezelfde `ConvergentieRawContext` als
 * de hoofdlijn; deze module levert enkel:
 *   - de pref-parser (`parseToekomstScenarioPrefs`) voor de server-side JSONB-pref —
 *     normaliseert v1 én v2 ALTIJD naar de v2-shape (met optioneel vastgelegd `doel`-blok);
 *   - de pure concept-detectie (`isDoelConceptGewijzigd`) voor de "je draait aan je doel"-banner;
 *   - de categorie→asset_type rendement-delta-expansie voor `applyReturnDeltasToAssets`;
 *   - de gewogen baseline-rendementen per bezeten categorie voor de Marktbias-UI;
 *   - de som van de scenario-bestedingsdelta (guardrail-kompas).
 *
 * Eén bron voor de categorie-mapping: `ASSET_TYPE_TO_CATEGORIE` uit de kernel-adapter
 * (`adapter/potten.ts`) — géén tweede afleiding.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import { ASSET_TYPE_TO_CATEGORIE } from '@/lib/horizon-kernel/adapter/potten'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import type { AssetGroupReturn } from '@/components/app/horizon/whatif-market-assumptions'

// ── Ranges / whitelist (spiegelen de bestaande sliders — één bron voor de clamps) ──

/**
 * De échte min/max van de vier scenario-sliders (`whatif-sliders.tsx`). De pref-parser
 * clampt hier defensief op zodat een verouderde/vervuilde pref nooit buiten bereik landt.
 * Sleutels = de pref-veldnamen (`extraInleg` camelCase), niet de kernel-`SliderKey`
 * (`extra_inleg`) — de UI-consument (stap 5) mapt tussen beide.
 */
const SLIDER_RANGES = {
  income: { min: 0, max: 15_000 },
  workdays: { min: 1, max: 5 },
  savings: { min: 0, max: 80 },
  extraInleg: { min: 0, max: 5_000 },
} as const

/** Rendement-delta-bereik (decimaal) — spiegelt de Marktbias-slider (`whatif-market-assumptions.tsx`, ±0,05 = ±5 pp). */
const RETURN_DELTA_MIN = -0.05
const RETURN_DELTA_MAX = 0.05

/** Stopleeftijd-clamps (integer, jaren). */
const STOP_AGE_MIN = 18
const STOP_AGE_MAX = 100

/** Vastgehouden koppel-marge-clamps (jaren t.o.v. de verwacht-FIRE). */
const STOP_MARGE_MIN = -30
const STOP_MARGE_MAX = 30

/** De zes kern-categorieën (bens kolom E) — whitelist voor de rendement-delta-keys. */
const VALID_CATEGORIES: readonly AssetCategorie[] = [
  'Spaargeld',
  'Beleggingen',
  'Pensioen',
  'Vastgoed',
  'Eigen huis',
  'Overig',
]

// ── Pref-shape (v2) ──────────────────────────────────────────────────────────

/** De vier promoveerbare parameter-doelen die één doelscenario kan genereren. */
export const DOEL_PARAMETERS = ['spaarquote', 'salaris', 'rendement', 'fire'] as const
export type DoelParameter = (typeof DOEL_PARAMETERS)[number]

/**
 * De GOAL-RELEVANTE subset van de pref: exact dezelfde velden/clamps als de hoofdvelden,
 * maar ZONDER `v` en `showScenarioLine` (die laatste is een pure weergavevlag, geen doel).
 * Twee toepassingen:
 *   - als vastgelegde KOPIE in `doel.stand` (voedt "herstel mijn doel" + concept-detectie);
 *   - als vergelijkingsvorm voor `isDoelConceptGewijzigd(live, stand)`.
 * Eén set veldnamen zodat de client één bouwer kan hergebruiken (géén tweede vorm).
 */
export interface ToekomstScenarioStand {
  sliders?: {
    income?: number
    workdays?: number
    savings?: number
    extraInleg?: number
  }
  returnDeltaByCategorie?: Partial<Record<AssetCategorie, number>>
  stopAge?: number | null
  stopKoppel?: boolean
  stopMarge?: number
}

/**
 * Vastgelegd doelscenario ("verkennen wordt richten"): de actuele lab-stand is gepromoveerd
 * tot een persistent doel dat parameter-doelen genereert (spaarquote/salaris/rendement/fire).
 */
export interface ToekomstScenarioDoel {
  /** ISO-tijdstip van vastleggen. Moet als datum parseren, anders valt het doel-blok weg. */
  gezetOp: string
  /** Welke parameters bij vastleggen zijn aangevinkt. Alleen bekende keys met waarde `true`. */
  parameters: Partial<Record<DoelParameter, true>>
  /** De vastgelegde KOPIE van de lab-stand (voedt herstel + concept-detectie). */
  stand: ToekomstScenarioStand
  /**
   * Cache van de gegenereerde goals-rij-id's per parameter — GEEN waarheid: de goals-tabel
   * is leidend. Enkel een hint zodat de client de rijen kan terugvinden zonder her-query;
   * een ontbrekende/stale id mag nooit tot een crash leiden (tolerante lezers).
   */
  goalIds?: Partial<Record<DoelParameter, string>>
}

/**
 * Server-side bewaarde scenario-voorkeuren (JSONB op `profiles`). Versioned zodat een
 * shape-wijziging via het versieveld te onderscheiden is. De parser normaliseert v1 én v2
 * ALTIJD naar deze v2-shape; onbekende versies (≠ 1 en ≠ 2) → `null`.
 */
export interface ToekomstScenarioPrefs {
  v: 2
  /** Slider-standen; ontbrekend = op de baseline (geen event). */
  sliders?: {
    income?: number
    workdays?: number
    savings?: number
    extraInleg?: number
  }
  /** Per-categorie rendement-delta (decimaal, ±0,05). Alleen bezeten categorieën zetten iets. */
  returnDeltaByCategorie?: Partial<Record<AssetCategorie, number>>
  /** Gekozen stopleeftijd (marge-marker); null = niet gezet. */
  stopAge?: number | null
  /** Stopkeuze schuift mee met de verwacht-streep (marge blijft constant). Pure vlag — geen logica hier. */
  stopKoppel?: boolean
  /**
   * De vastgehouden marge (jaren t.o.v. de verwacht-FIRE) wanneer `stopKoppel` aan staat.
   * DIT is bij koppelmodus de bewaarde waarheid ("dan blijft je marge gelijk") — de
   * stopleeftijd zelf is dan afgeleid. Zonder gepersisteerde marge zou de client de marge
   * na herlaad moeten herleiden uit een nog niet bezonken scenario-run (twee-fasen-
   * hydratie: rendement-delta's direct, slider-events async) — dat joeg de stopleeftijd weg.
   */
  stopMarge?: number
  /** Toont de gestippelde 2e (wat-als)lijn in de grafiek. */
  showScenarioLine?: boolean
  /** Vastgelegd doelscenario (ronde 4). Ontbreekt zolang de gebruiker niets promoveerde. */
  doel?: ToekomstScenarioDoel
}

// ── Parser ───────────────────────────────────────────────────────────────────

/** Clamp een onbekende waarde naar [min, max]; niet-eindig → undefined (wordt genegeerd). */
function clampNumber(raw: unknown, min: number, max: number): number | undefined {
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  return Math.min(max, Math.max(min, n))
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Parseert de GOAL-RELEVANTE scenario-basisvelden (sliders, per-categorie rendement-delta,
 * stopAge, stopMarge, stopKoppel) uit een rauw object naar `out`. Gedeeld door de top-level
 * pref én `doel.stand` zodat er ÉÉN set clamps/whitelists is (géén tweede implementatie).
 * Neemt alleen bekende velden over; ongeldige/niet-eindige waarden worden stil overgeslagen.
 */
function parseScenarioBaseFields(raw: Record<string, unknown>, out: ToekomstScenarioStand): void {
  // ── Sliders (clamp op de echte ranges; alleen bekende keys) ──
  if (isPlainObject(raw.sliders)) {
    const src = raw.sliders
    const sliders: NonNullable<ToekomstScenarioStand['sliders']> = {}
    for (const key of ['income', 'workdays', 'savings', 'extraInleg'] as const) {
      const clamped = clampNumber(src[key], SLIDER_RANGES[key].min, SLIDER_RANGES[key].max)
      if (clamped !== undefined) sliders[key] = clamped
    }
    if (Object.keys(sliders).length > 0) out.sliders = sliders
  }

  // ── Rendement-delta per categorie (whitelist + clamp) ──
  if (isPlainObject(raw.returnDeltaByCategorie)) {
    const src = raw.returnDeltaByCategorie
    const deltas: Partial<Record<AssetCategorie, number>> = {}
    for (const cat of VALID_CATEGORIES) {
      if (!(cat in src)) continue
      const clamped = clampNumber(src[cat], RETURN_DELTA_MIN, RETURN_DELTA_MAX)
      // Nul-delta's overslaan (spiegelt de component-semantiek die nul-keys delete't):
      // een legacy-pref `{Spaargeld: 0}` mag `hasScenario` niet activeren zonder effect.
      if (clamped !== undefined && Math.abs(clamped) >= 1e-9) deltas[cat] = clamped
    }
    if (Object.keys(deltas).length > 0) out.returnDeltaByCategorie = deltas
  }

  // ── Stopleeftijd (null bewaard; anders clamp naar integer 18–100) ──
  if (raw.stopAge === null) {
    out.stopAge = null
  } else if (raw.stopAge !== undefined) {
    const clamped = clampNumber(raw.stopAge, STOP_AGE_MIN, STOP_AGE_MAX)
    if (clamped !== undefined) out.stopAge = Math.round(clamped)
  }

  // ── Vastgehouden koppel-marge (jaren; clamp ±30) ──
  if (raw.stopMarge !== undefined && raw.stopMarge !== null) {
    const clamped = clampNumber(raw.stopMarge, STOP_MARGE_MIN, STOP_MARGE_MAX)
    if (clamped !== undefined) out.stopMarge = clamped
  }

  // ── Koppel-boolean ──
  if (typeof raw.stopKoppel === 'boolean') out.stopKoppel = raw.stopKoppel
}

/**
 * Parseert het optionele `doel`-blok (v2). Een VERVUILD doel-blok laat alléén het doel
 * vallen (de rest van de pref blijft). Voorwaarden voor een geldig doel:
 *   - `gezetOp` is een string die als datum parseert (anders → doel weg);
 *   - `parameters` bevat minstens één van de vier bekende keys met waarde `true`
 *     (leeg parameters-object → doel weg: een doel zonder parameters is betekenisloos);
 *   - `stand` is een plain object dat naar minstens één geldig veld parseert
 *     (ontbrekende/lege/ongeldige stand → doel weg: een doel zonder stand is betekenisloos).
 * `goalIds` is een pure cache (niet-lege strings, bekende keys) en beïnvloedt de geldigheid niet.
 */
function parseDoel(raw: Record<string, unknown>): ToekomstScenarioDoel | null {
  if (typeof raw.gezetOp !== 'string' || Number.isNaN(Date.parse(raw.gezetOp))) return null

  if (!isPlainObject(raw.parameters)) return null
  const parameters: Partial<Record<DoelParameter, true>> = {}
  for (const key of DOEL_PARAMETERS) {
    if (raw.parameters[key] === true) parameters[key] = true
  }
  if (Object.keys(parameters).length === 0) return null

  if (!isPlainObject(raw.stand)) return null
  const stand: ToekomstScenarioStand = {}
  parseScenarioBaseFields(raw.stand, stand)
  if (Object.keys(stand).length === 0) return null

  const doel: ToekomstScenarioDoel = { gezetOp: raw.gezetOp, parameters, stand }

  if (isPlainObject(raw.goalIds)) {
    const goalIds: Partial<Record<DoelParameter, string>> = {}
    for (const key of DOEL_PARAMETERS) {
      const val = raw.goalIds[key]
      if (typeof val === 'string' && val.length > 0) goalIds[key] = val
    }
    if (Object.keys(goalIds).length > 0) doel.goalIds = goalIds
  }

  return doel
}

/**
 * Defensieve parser voor de rauwe JSONB-pref. Accepteert v1 én v2 en NORMALISEERT ALTIJD
 * naar v2 (v1-input krijgt dezelfde velden, `v: 2`, en géén doel — v1 kende geen doel).
 * Neemt ALLEEN bekende velden over, clampt sliderwaarden op de échte sliderranges, whitelist
 * de categorie-keys tegen `AssetCategorie`, clampt de rendement-delta op het Marktbias-bereik
 * en de stopleeftijd op 18–100 (integer). Een vervuild `doel`-blok laat alléén het doel vallen
 * (de rest blijft). Geen object of onbekende versie (≠ 1 en ≠ 2) → `null` (consument valt op
 * de defaults terug). Normalisatie is transparant voor de schrijfpoort/loader (zelfde velden).
 */
export function parseToekomstScenarioPrefs(raw: unknown): ToekomstScenarioPrefs | null {
  if (!isPlainObject(raw)) return null
  if (raw.v !== 1 && raw.v !== 2) return null

  const out: ToekomstScenarioPrefs = { v: 2 }
  parseScenarioBaseFields(raw, out)

  // ── Weergavevlag (geen onderdeel van de goal-stand) ──
  if (typeof raw.showScenarioLine === 'boolean') out.showScenarioLine = raw.showScenarioLine

  // ── Doel-blok (alleen bij v2-input; v1 draagt per definitie geen doel) ──
  if (raw.v === 2 && isPlainObject(raw.doel)) {
    const doel = parseDoel(raw.doel)
    if (doel) out.doel = doel
  }

  return out
}

// ── Concept-detectie (doel gewijzigd?) ───────────────────────────────────────

/** Rond af als aanwezig; `undefined` blijft `undefined` (spiegelt de persist Math.round-inclusie). */
function roundOrUndef(v: number | undefined): number | undefined {
  return v === undefined ? undefined : Math.round(v)
}

/** stopAge-default = null; `undefined` en `null` zijn beide "geen stop" (gelijk). */
function normStopAge(v: number | null | undefined): number | null {
  return v === undefined || v === null ? null : v
}

/** Twee getallen gelijk binnen 1e-9 (of beide afwezig ⇒ gelijk). */
function numGelijk(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  return Math.abs(a - b) < 1e-9
}

/** Sliders gelijk volgens de persist-effect-regels (income/savings afgerond, workdays/extraInleg exact). */
function slidersGelijk(
  a: ToekomstScenarioStand['sliders'],
  b: ToekomstScenarioStand['sliders'],
): boolean {
  // income & savings: het persist-effect bepaalt inclusie via `Math.round` — spiegel dat, zodat
  // een sub-euro drag-en-terug (rondt naar hetzelfde geheel getal) géén "gewijzigd" oplevert.
  if (roundOrUndef(a?.income) !== roundOrUndef(b?.income)) return false
  if (roundOrUndef(a?.savings) !== roundOrUndef(b?.savings)) return false
  // workdays & extraInleg: het persist-effect vergelijkt exact (`!==` resp. `!== 0`) — spiegel exact.
  if (a?.workdays !== b?.workdays) return false
  if (a?.extraInleg !== b?.extraInleg) return false
  return true
}

/** Per-categorie rendement-delta gelijk (zelfde effectieve key-set; waarden binnen 1e-9). */
function deltaMapGelijk(
  a: Partial<Record<AssetCategorie, number>> | undefined,
  b: Partial<Record<AssetCategorie, number>> | undefined,
): boolean {
  for (const cat of VALID_CATEGORIES) {
    if (!numGelijk(a?.[cat], b?.[cat])) return false
  }
  return true
}

/**
 * Pure concept-detectie: wijkt de LIVE goal-relevante stand af van de vastgelegde `doel.stand`?
 * Voedt de "je draait aan je doel"-banner (stap 5). Spiegelt de afronding/normalisatie van het
 * persist-effect in horizon-client zodat een no-op géén valse "gewijzigd" geeft. Vergelijkingsregel
 * per veld:
 *   - `sliders.income` / `sliders.savings` : AFGEROND vergeleken (persist bepaalt inclusie via
 *     `Math.round(x) !== Math.round(baseline)`); een sub-euro drag-en-terug telt dus als gelijk.
 *   - `sliders.workdays` / `sliders.extraInleg` : EXACT (persist vergelijkt exact).
 *   - `returnDeltaByCategorie` : per-categorie binnen 1e-9, zelfde effectieve key-set (de parser
 *     dropt sub-1e-9/nul-delta's al, dus dit spiegelt wat er zou worden weggeschreven).
 *   - stop (koppel-bewust): `stopKoppel` verschilt ⇒ gewijzigd. Anders — koppel AAN in beide ⇒
 *     vergelijk `stopMarge` (bij koppel is de marge de bewaarde waarheid; de stopAge is afgeleid
 *     en schuift met de sim, dus die niet vergelijken). Koppel UIT in beide ⇒ vergelijk de
 *     absolute `stopAge` (undefined ≡ null; beide "geen stop").
 * Ontbrekende `stand` (geen doel) ⇒ `false` (er is niets om van af te wijken).
 */
export function isDoelConceptGewijzigd(
  live: ToekomstScenarioStand,
  stand: ToekomstScenarioStand | null | undefined,
): boolean {
  if (!stand) return false

  if (!slidersGelijk(live.sliders, stand.sliders)) return true
  if (!deltaMapGelijk(live.returnDeltaByCategorie, stand.returnDeltaByCategorie)) return true

  const koppelLive = live.stopKoppel ?? false
  const koppelStand = stand.stopKoppel ?? false
  if (koppelLive !== koppelStand) return true
  if (koppelStand) {
    // Koppel aan in beide: marge is de bewaarde waarheid; de afgeleide stopAge negeren.
    if (!numGelijk(live.stopMarge, stand.stopMarge)) return true
  } else {
    // Koppel uit in beide: de absolute stopAge is de waarheid.
    if (normStopAge(live.stopAge) !== normStopAge(stand.stopAge)) return true
  }

  return false
}

// ── Categorie → asset_type rendement-delta-expansie ──────────────────────────

/**
 * Expandeer per-categorie rendement-delta's naar per-`asset_type`-delta's voor
 * `applyReturnDeltasToAssets`. ALLEEN voor asset_types die daadwerkelijk in `assets`
 * voorkomen (meerdere types kunnen op dezelfde categorie mappen — bv. `cash`/`savings`
 * → Spaargeld — en krijgen dan dezelfde delta). Categorie-mapping via de canonieke
 * `ASSET_TYPE_TO_CATEGORIE` met de `'Overig'`-fallback (spiegel potten.ts:199). Nul/
 * ontbrekende delta's worden overgeslagen (spiegel `applyReturnDeltasToAssets`, dat 0
 * behandelt als geen-verschuiving). Lege/ontbrekende input → `{}`.
 */
export function expandCategorieReturnDeltas(
  deltaByCategorie: Partial<Record<AssetCategorie, number>> | undefined,
  assets: readonly Asset[],
): Record<string, number> {
  const out: Record<string, number> = {}
  if (!deltaByCategorie) return out

  const seen = new Set<string>()
  for (const a of assets) {
    const assetType = a.asset_type as AssetType
    if (seen.has(assetType)) continue
    seen.add(assetType)
    const categorie = ASSET_TYPE_TO_CATEGORIE[assetType] ?? 'Overig'
    const delta = deltaByCategorie[categorie]
    if (delta !== undefined && delta !== 0) out[assetType] = delta
  }
  return out
}

// ── Gewogen baseline-rendement per bezeten categorie (Marktbias-UI) ──────────

/**
 * Gewogen baseline-rendement per BEZETEN categorie, in het `AssetGroupReturn`-formaat
 * dat `WhatIfMarketAssumptions` (Marktbias) ongewijzigd consumeert — maar dan per
 * kern-categorie (Nederlandse labels) i.p.v. per asset_type. Alleen actieve assets met
 * waarde > 0 (inclusion-gewogen) tellen mee; categorieën zonder waarde verschijnen niet.
 *
 * NUL-BASIS (bewuste keuze): het baseline-rendement is `expected_return/100` ZONDER de
 * `userGrossReturn`-fallback die de whatif-pagina-preview gebruikt. Dit spiegelt exact
 * wat de kernel toepast (`buildAssetPotten`: `expected_return/100`, nul-basis) én wat de
 * delta raakt (`applyReturnDeltasToAssets`: `0 + delta` op een 0%-asset — zie
 * whatif-varianten.ts module-doc punt 2). Een grossReturn-fallback zou een display-vs-
 * effect-drift introduceren (baseline 7% getoond, maar +2 pp landt op 0+2 in de kernel).
 *
 * `assetType` draagt hier de CATEGORIE-naam (bv. `'Beleggingen'`), zodat de Marktbias-
 * `value`-record op `returnDeltaByCategorie` gekeyed is; `label` = dezelfde Nederlandse
 * categorie-naam. Uitvoer in de canonieke categorie-volgorde (stabiele UI).
 */
export function buildCategorieReturnGroups(assets: readonly Asset[]): AssetGroupReturn[] {
  const acc = new Map<AssetCategorie, { totalValue: number; weightedReturnSum: number }>()

  for (const a of assets) {
    if (a.is_active === false) continue
    const inclFactor = Number(a.net_worth_inclusion_pct ?? 100) / 100
    const value = Number(a.current_value ?? 0) * (Number.isFinite(inclFactor) ? inclFactor : 1)
    if (!(value > 0)) continue

    const categorie = ASSET_TYPE_TO_CATEGORIE[a.asset_type as AssetType] ?? 'Overig'
    const ret = Number(a.expected_return ?? 0) / 100
    const safeRet = Number.isFinite(ret) ? ret : 0

    const existing = acc.get(categorie)
    if (existing) {
      existing.totalValue += value
      existing.weightedReturnSum += value * safeRet
    } else {
      acc.set(categorie, { totalValue: value, weightedReturnSum: value * safeRet })
    }
  }

  const groups: AssetGroupReturn[] = []
  for (const categorie of VALID_CATEGORIES) {
    const data = acc.get(categorie)
    if (!data || data.totalValue <= 0) continue
    groups.push({
      assetType: categorie,
      label: categorie,
      weightedReturn: data.weightedReturnSum / data.totalValue,
    })
  }
  return groups
}

// ── Scenario-bestedingsdelta (guardrail-kompas) ──────────────────────────────

/**
 * Som van de maandelijkse bestedingsdelta's (`monthly_cost_change`) van de scenario-
 * events. De spaarquote-slider maakt een `lifestyle_adjustment`-event met een
 * bestedingsdelta (`scenario-events.ts`); de andere sliders (income/workdays/extra_inleg)
 * werken via `monthly_income_change` en dragen hier per definitie 0 bij. Voedt
 * `computeGuardrailBounds` via `activeMonthlySpend = monthlyExpenses + delta`. Uitgezette
 * events (`whatIfDisabled`/`is_active === false`) tellen niet mee.
 */
export function scenarioMonthlySpendDelta(events: readonly WhatIfEvent[]): number {
  let total = 0
  for (const e of events) {
    if (e.whatIfDisabled === true) continue
    if (e.is_active === false) continue
    const delta = Number(e.monthly_cost_change)
    if (Number.isFinite(delta)) total += delta
  }
  return total
}
