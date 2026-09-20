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
 *   - de pure concept-detectie (`isDoelConceptGewijzigd`) voor de opslaan-balk van het
 *     doelscenario (ADR 0170; voorheen de "je draait aan je doel"-banner);
 *   - de categorie→asset_type rendement-delta-expansie voor `applyReturnDeltasToAssets`;
 *   - de gewogen baseline-rendementen per bezeten categorie voor de Marktbias-UI;
 *   - de som van de scenario-bestedingsdelta (dekkingsradar), met
 *     dezelfde slider-werk-gate als de motor (`isSliderWorkEvent`).
 *
 * Eén bron voor de categorie-mapping: `ASSET_TYPE_TO_CATEGORIE` uit de kernel-adapter
 * (`adapter/potten.ts`) — géén tweede afleiding. Idem voor de slider-werk-herkenning:
 * `isSliderWorkEvent` uit `adapter/guard.ts`.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import { ASSET_TYPE_TO_CATEGORIE, potRendement } from '@/lib/horizon-kernel/adapter/potten'
import { isSliderWorkEvent } from '@/lib/horizon-kernel/adapter/guard'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import type { AssetGroupReturn } from '@/lib/types/horizon-whatif'
// Stopleeftijd-clamps (integer, jaren) — ÉÉN bron met de schrijftoets van de routes
// en de plan-vragen (lib/fire-strategy), geen lokale 18/100 meer.
import { STOP_AGE_MAX, STOP_AGE_MIN } from '@/lib/fire-strategy'

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
  // Negatief = een salarisverlaging verkennen (knop "Meer salaris", ±30% — 15 sep 2026).
  extraInleg: { min: -5_000, max: 5_000 },
} as const

/** Rendement-delta-bereik (decimaal) — spiegelt de Marktbias-slider (`whatif-market-assumptions.tsx`, ±0,05 = ±5 pp). */
const RETURN_DELTA_MIN = -0.05
const RETURN_DELTA_MAX = 0.05

/**
 * Bovengrens van de knop "Uitgave na pensioen" in de pref (€/jaar). Ruim boven het
 * sliderbereik (`uitgaveNaPensioenRange`: ±40% rond de plan-waarde) — dit is een
 * vervuilings-clamp, geen UI-grens.
 */
const UITGAVE_NA_PENSIOEN_MAX = 1_000_000

/**
 * Bovengrens van de knop "Nalatenschap" in de pref (€ 10 mld, nominaal). Zelfde waarde als
 * de zod-grens op het eindvermogen-doelbedrag (`app/api/toekomst-doel/schema.ts` importeert
 * 'm hier): een eigen rij, dus geen lek, maar onzin (1e300) hoort er niet in.
 */
export const DOELWAARDE_BEDRAG_MAX = 1e10

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

/**
 * De parameters die het lab als doel kan vastleggen. `salaris` verviel op 15 sep 2026
 * (spec lab-haalbaarheid §2): een salarisverhoging is rekenkundig dezelfde hefboom als
 * extra inleg. Bestaande `salary`-doelrijen blijven bestaan (LEGACY_PARAMETER_GOAL_TYPES
 * in toekomst-doel.ts); de pref-parser leest `sliders.income` tolerant en negeert 'm.
 * `fire` (vrijheidsleeftijd) is het uitkomstdoel onder `solved`; `dekking` ("Plan
 * gedekt", ADR 0145) is de spiegel daarvan onder een vast stopmoment (aow/age). De
 * route bepaalt server-side welke van de twee bij het anker hoort — de client kiest
 * dat nooit. `eindvermogen` (ADR 0145 D12, 15 sep 2026) is het uitkomstdoel onder een vast
 * stopmoment wanneer het plan GEDEKT is: dekking en bereik bewegen dan niet meer, wat er op
 * je eindleeftijd over is wél. Ook die vereist een vast anker (de route weigert 'm onder
 * `solved`).
 */
export const DOEL_PARAMETERS = ['spaarquote', 'rendement', 'fire', 'dekking', 'eindvermogen'] as const
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
    /** Legacy (knop vervallen, spec §2 15 sep 2026): tolerant gelezen, nooit meer geschreven. */
    income?: number
    /** Legacy (knop vervallen, ADR 0170): tolerant gelezen, nooit meer geschreven. */
    workdays?: number
    savings?: number
    extraInleg?: number
  }
  returnDeltaByCategorie?: Partial<Record<AssetCategorie, number>>
  stopAge?: number | null
  /** Knop "Uitgave na pensioen" (€/jaar, ADR 0160 × 0170); afwezig = wat het plan rekent. */
  uitgaveNaPensioen?: number
  /** Knop "Nalatenschap" (€, ADR 0170); afwezig = wat het plan rekent. */
  nalatenschap?: number
}

/**
 * Vastgelegd doelscenario ("verkennen wordt richten"): de actuele lab-stand is gepromoveerd
 * tot een persistent doel dat parameter-doelen genereert (spaarquote/salaris/rendement +
 * het uitkomstdoel: fire onder `solved`, dekking onder een vast stopmoment).
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
  /** Gekozen stopleeftijd (de knop "Stopleeftijd"); null = niet gezet. */
  stopAge?: number | null
  /** Knop "Uitgave na pensioen" (€/jaar, ADR 0160 × 0170); afwezig = wat het plan rekent. */
  uitgaveNaPensioen?: number
  /** Knop "Nalatenschap" (€, ADR 0170); afwezig = wat het plan rekent. */
  nalatenschap?: number
  /** Toont de gestippelde 2e (wat-als)lijn in de grafiek. */
  showScenarioLine?: boolean
  /**
   * De vorm van de doelscenario-knoppen — één van `KNOP_WEERGAVEN` (wijzer = standaard, balk,
   * rad, harp, vijfhoek; ADR 0170 B7/B11/B12). Pure WEERGAVE, net als `showScenarioLine` — bewust GÉÉN onderdeel van
   * `ToekomstScenarioStand`: wie van vorm wisselt verandert zijn plan niet, en de opslaan-balk
   * mag daar dus niet "gewijzigd" van zeggen.
   */
  knopWeergave?: KnopWeergave
  /** Vastgelegd doelscenario (ronde 4). Ontbreekt zolang de gebruiker niets promoveerde. */
  doel?: ToekomstScenarioDoel
}

/**
 * De vormen van de doelscenario-knoppen (ADR 0170 B7/B11/B12). Eén lijst voor het type, de
 * parser en de schakelaar in de kop — een vorm die hier ontbreekt kan niet worden bewaard.
 */
export const KNOP_WEERGAVEN = ['balk', 'wijzer', 'rad', 'harp', 'vijfhoek'] as const
export type KnopWeergave = (typeof KNOP_WEERGAVEN)[number]
/**
 * De standaardvorm (B7). Eén constante voor de beginstand én de persist-poort in
 * horizon-client: die twee stonden op 'wijzer' resp. 'balk', waardoor de poort "geen
 * default-blob schrijven" voor iedereen altijd open stond.
 */
export const KNOP_WEERGAVE_STANDAARD: KnopWeergave = 'wijzer'

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

  // ── Uitgave na pensioen (€/jaar; knop 3) ──
  if (raw.uitgaveNaPensioen !== undefined && raw.uitgaveNaPensioen !== null) {
    const clamped = clampNumber(raw.uitgaveNaPensioen, 0, UITGAVE_NA_PENSIOEN_MAX)
    if (clamped !== undefined) out.uitgaveNaPensioen = clamped
  }

  // ── Nalatenschap (€; knop 4) ──
  if (raw.nalatenschap !== undefined && raw.nalatenschap !== null) {
    const clamped = clampNumber(raw.nalatenschap, 0, DOELWAARDE_BEDRAG_MAX)
    if (clamped !== undefined) out.nalatenschap = clamped
  }

  // De koppelmodus (`stopKoppel`/`stopMarge`) verviel met ADR 0170: er is geen verwacht-streep
  // meer om een marge tegen aan te houden. Oude prefs dragen die velden nog; ze worden bewust
  // NIET overgenomen (een onbekende sleutel negeert de parser al) en dus ook nooit herschreven.
}

/**
 * Parseert het optionele `doel`-blok (v2). Een VERVUILD doel-blok laat alléén het doel
 * vallen (de rest van de pref blijft). Voorwaarden voor een geldig doel:
 *   - `gezetOp` is een string die als datum parseert (anders → doel weg);
 *   - `parameters` bevat minstens één van de bekende `DOEL_PARAMETERS`-keys met waarde `true`
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

  // ── Weergavevlaggen (geen onderdeel van de goal-stand) ──
  if (typeof raw.showScenarioLine === 'boolean') out.showScenarioLine = raw.showScenarioLine
  if ((KNOP_WEERGAVEN as readonly unknown[]).includes(raw.knopWeergave)) {
    out.knopWeergave = raw.knopWeergave as KnopWeergave
  }

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

/** Sliders gelijk volgens de persist-effect-regels (savings afgerond, extraInleg exact). */
function slidersGelijk(
  a: ToekomstScenarioStand['sliders'],
  b: ToekomstScenarioStand['sliders'],
): boolean {
  // `income` (spec §2) en `workdays` (ADR 0170) tellen niet meer mee: die knoppen bestaan niet
  // meer, dus een legacy-stand die ze nog draagt mag geen eeuwige "gewijzigd" geven.
  // savings: het persist-effect bepaalt inclusie via `Math.round` — spiegel dat, zodat
  // een sub-euro drag-en-terug (rondt naar hetzelfde geheel getal) géén "gewijzigd" oplevert.
  if (roundOrUndef(a?.savings) !== roundOrUndef(b?.savings)) return false
  // extraInleg: het persist-effect vergelijkt exact (`!== 0`) — spiegel exact.
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
 * Laat de STOPKEUZE (`stopAge`) weg uit een stand. Onder een VAST stopmoment (ADR 0145 D4) is
 * de stopkeuze geen doelstand: het plan rekent met het anker, de knop is daar puur verkenning.
 * De route strips 'm vóór de pref-write (zodat een verkende stop nooit in `doel.stand` landt)
 * en de client vóór de concept-vergelijking. Generiek over de getypte stand én de rauwe
 * body-record: beide zijn plain objects met dezelfde sleutels. Geeft een KOPIE terug, muteert
 * niets. De koppelvelden (`stopKoppel`/`stopMarge`) vervielen met ADR 0170; ze worden hier nog
 * wél weggelaten, zodat een rauwe legacy-body ze niet alsnog terug in de pref schrijft.
 */
export function stripStopKeuze<T extends object>(
  stand: T,
): Omit<T, 'stopAge'> {
  const rest = { ...stand }
  delete (rest as Record<string, unknown>).stopAge
  delete (rest as Record<string, unknown>).stopKoppel
  delete (rest as Record<string, unknown>).stopMarge
  return rest as Omit<T, 'stopAge'>
}

/** Opties voor `isDoelConceptGewijzigd`. */
export interface DoelConceptOpties {
  /**
   * Telt de stopkeuze (stopAge/stopKoppel/stopMarge) mee in de vergelijking? Default
   * `true` = het bestaande gedrag onder `solved`. Onder een vast stopmoment zet de client
   * 'm op `false` (ADR 0145 D4): de slider verkent daar alleen en mag de "je draait aan
   * je doel"-banner niet laten afgaan.
   */
  stopKeuzeTelt?: boolean
}

/**
 * Pure concept-detectie: wijkt de LIVE goal-relevante stand af van de vastgelegde `doel.stand`?
 * Voedt de opslaan-balk (ADR 0170; voorheen de "je draait aan je doel"-banner). Spiegelt de
 * afronding/normalisatie van het persist-effect in horizon-client zodat een no-op géén valse
 * "gewijzigd" geeft. Vergelijkingsregel per veld:
 *   - `sliders.income`/`sliders.workdays` tellen niet meer mee (knoppen vervallen, spec §2 resp.
 *     ADR 0170) — een legacy-stand die ze nog draagt mag geen eeuwige "gewijzigd" geven.
 *   - `sliders.savings` : AFGEROND vergeleken (persist bepaalt inclusie via
 *     `Math.round(x) !== Math.round(baseline)`); een sub-euro drag-en-terug telt dus als gelijk.
 *   - `sliders.extraInleg` : EXACT (persist vergelijkt exact).
 *   - `returnDeltaByCategorie` : per-categorie binnen 1e-9, zelfde effectieve key-set (de parser
 *     dropt sub-1e-9/nul-delta's al, dus dit spiegelt wat er zou worden weggeschreven).
 *   - `uitgaveNaPensioen` / `nalatenschap` : binnen 1e-9 (afwezig ≡ "wat het plan rekent", dus
 *     afwezig-vs-waarde telt als gewijzigd).
 *   - `stopAge` : absoluut (undefined ≡ null; beide "geen stop"), alleen wanneer de stopkeuze
 *     meetelt. De koppelmodus verviel met ADR 0170.
 * Ontbrekende `stand` (geen doel) ⇒ `false` (er is niets om van af te wijken).
 * `opts.stopKeuzeTelt: false` ⇒ de stopkeuze wordt overgeslagen (vast anker, ADR 0145 D4).
 */
export function isDoelConceptGewijzigd(
  live: ToekomstScenarioStand,
  stand: ToekomstScenarioStand | null | undefined,
  opts?: DoelConceptOpties,
): boolean {
  if (!stand) return false

  if (!slidersGelijk(live.sliders, stand.sliders)) return true
  if (!deltaMapGelijk(live.returnDeltaByCategorie, stand.returnDeltaByCategorie)) return true
  if (!numGelijk(live.uitgaveNaPensioen, stand.uitgaveNaPensioen)) return true
  if (!numGelijk(live.nalatenschap, stand.nalatenschap)) return true

  if (opts?.stopKeuzeTelt === false) return false

  return normStopAge(live.stopAge) !== normStopAge(stand.stopAge)
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
 * DEZELFDE KETTING ALS DE KERNEL (bewuste keuze): het baseline-rendement per bezitting
 * is `potRendement(expected_return, terugvalRendement)` — een ingevulde waarde (ook een
 * bewuste 0) telt letterlijk, alleen een ONTBREKEND rendement valt terug op het
 * meegegeven profielrendement (TPR-02). Dat spiegelt exact wat de kernel toepast
 * (`buildAssetPotten`) én wat de delta raakt (`applyReturnDeltasToAssets`). Vóór TPR-02
 * was dit een pure nul-basis; de v2-achtige `||`-backfill die van een bewuste 0 een 7%
 * maakte blijft bewust afwezig — die zou een display-vs-effect-drift geven (baseline 7%
 * getoond, maar +2 pp landt op 0+2 in de kernel). `terugvalRendement` (decimaal)
 * weggelaten → 0 (byte-identiek aan de oude nul-basis).
 *
 * `assetType` draagt hier de CATEGORIE-naam (bv. `'Beleggingen'`), zodat de Marktbias-
 * `value`-record op `returnDeltaByCategorie` gekeyed is; `label` = dezelfde Nederlandse
 * categorie-naam. Uitvoer in de canonieke categorie-volgorde (stabiele UI).
 */
export function buildCategorieReturnGroups(
  assets: readonly Asset[],
  terugvalRendement = 0,
): AssetGroupReturn[] {
  const acc = new Map<AssetCategorie, { totalValue: number; weightedReturnSum: number }>()

  for (const a of assets) {
    if (a.is_active === false) continue
    const inclFactor = Number(a.net_worth_inclusion_pct ?? 100) / 100
    const value = Number(a.current_value ?? 0) * (Number.isFinite(inclFactor) ? inclFactor : 1)
    if (!(value > 0)) continue

    const categorie = ASSET_TYPE_TO_CATEGORIE[a.asset_type as AssetType] ?? 'Overig'
    const safeRet = potRendement(a.expected_return, terugvalRendement)

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

// ── Scenario-bestedingsdelta (dekkingsradar) ─────────────────────────────────

/**
 * Som van de maandelijkse bestedingsdelta's (`monthly_cost_change`) van de scenario-
 * events. Voedt `jaarBesteding = activeMonthlySpend × 12` (dekkingsradar) — een
 * ONTTREKKINGS-grootheid ("hoeveel kun je veilig uitgeven?"). Uitgezette events
 * (`whatIfDisabled`/`is_active === false`) tellen niet mee.
 *
 * **SLIDER-WERK-GATE (29-jul, één grondslag over alle oppervlakken).** Events die de
 * adapter-guard naar het FIRE-gegate salaris-kanaal routeert (`isSliderWorkEvent` —
 * o.a. de spaarquote-slider) tellen hier NIET mee. Reden: sinds het eigenaarsbesluit
 * verlaagt de spaarquote-slider de uitgave-ná-FIRE niet meer in de motor (het
 * FIRE-doelbedrag blijft gelijk), dus mag hij de onttrekkings-bestedingsgrenzen hier
 * evenmin verlagen — anders zou de radar een lagere veilige besteding meten dan het
 * doelbedrag waarop de motor solvet. Zelfde predicaat als de motor, géén tweede
 * afleiding. Presets (`preset:*`) en échte `lifestyle_adjustment`-events dragen géén
 * slider-origin en tellen dus gewoon mee — precies zoals ze in de motor een permanente
 * Geb-rij blijven. NB: de /toekomst-call-site voert vandaag uitsluitend slider-events
 * aan (delta ⇒ 0, radar op de baseline); de preset-/lifestyle-tak is forward-looking
 * voor het moment dat /toekomst ook DB-/preset-events in de scenario-set meegeeft.
 */
export function scenarioMonthlySpendDelta(events: readonly WhatIfEvent[]): number {
  let total = 0
  for (const e of events) {
    if (e.whatIfDisabled === true) continue
    if (e.is_active === false) continue
    if (isSliderWorkEvent(e)) continue
    const delta = Number(e.monthly_cost_change)
    if (Number.isFinite(delta)) total += delta
  }
  return total
}
