/**
 * Wat-als-scenario — pure rekenlaag (stap 1 van de /toekomst-scenariolaag).
 *
 * Pure, isomorfe module: GEEN `'use client'`, geen Supabase, geen `Date.now()`.
 * Levert de helpers waarmee de scenario-projectie (2e lijn op /toekomst) wordt
 * gevoed ZONDER de basislijn te muteren. De scenario-run zelf draait via
 * `computeConvergentieProjection` met exact dezelfde `ConvergentieRawContext` als
 * de hoofdlijn; deze module levert enkel:
 *   - de pref-parser (`parseToekomstScenarioPrefs`) voor de server-side JSONB-pref;
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

// ── Pref-shape ───────────────────────────────────────────────────────────────

/**
 * Server-side bewaarde scenario-voorkeuren (JSONB op `profiles`). Versioned zodat een
 * toekomstige shape-wijziging via het versieveld te onderscheiden is (`v !== 1` → null).
 */
export interface ToekomstScenarioPrefs {
  v: 1
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
 * Defensieve parser voor de rauwe JSONB-pref. Neemt ALLEEN bekende velden over,
 * clampt sliderwaarden op de échte sliderranges, whitelist de categorie-keys tegen
 * `AssetCategorie`, clampt de rendement-delta op het Marktbias-bereik en de stopleeftijd
 * op 18–100 (integer). Onbekende velden worden weggegooid; geen object of verkeerde
 * versie → `null` (de consument valt dan op de defaults terug).
 */
export function parseToekomstScenarioPrefs(raw: unknown): ToekomstScenarioPrefs | null {
  if (!isPlainObject(raw)) return null
  if (raw.v !== 1) return null

  const out: ToekomstScenarioPrefs = { v: 1 }

  // ── Sliders (clamp op de echte ranges; alleen bekende keys) ──
  if (isPlainObject(raw.sliders)) {
    const src = raw.sliders
    const sliders: NonNullable<ToekomstScenarioPrefs['sliders']> = {}
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

  // ── Booleans ──
  if (typeof raw.stopKoppel === 'boolean') out.stopKoppel = raw.stopKoppel
  if (typeof raw.showScenarioLine === 'boolean') out.showScenarioLine = raw.showScenarioLine

  return out
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
