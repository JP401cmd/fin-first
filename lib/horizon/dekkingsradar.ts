/**
 * Dekkingsradar — vijf-assige "haalbaarheid van je plan"-radar voor /toekomst (ronde 3).
 *
 * PURE consume-laag: leest UITSLUITEND bestaande, elders berekende grootheden (de
 * unified-projection-rijen uit de horizon-kernel-bridge, de Monte-Carlo-percentielen,
 * het kernel-verkoopmoment, de FIRE-uitkomsten) en zet ze om naar vijf assen met een
 * dekkings-% + stoplichtstatus. GEEN eigen rekenmotor, GEEN financiële constanten —
 * de veilige-onttrekking/belegbaar-per-rij-grondslag komt single-sourced uit
 * `lib/horizon/coverage-strip.ts` (`spendablePortfolio` / `coveragePctForRow`).
 *
 * "Grove eerste versie" (bewust): de wonen- en eindstrategie-assen zijn eerste,
 * expliciet gedocumenteerde definities (zie de per-as JSDoc). De i-teksten in de UI
 * benoemen dat. Een as die niet bepaalbaar is levert `pct: null` (+ `status: null`) met
 * een `detail` dat uitlegt waarom.
 */

import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { MonteCarloResult } from '@/lib/horizon-data'
import type { HousingStrategyConfig, HousingStrategyTrigger } from '@/lib/housing-strategy'
import type { KernelHousingSale } from '@/lib/horizon-kernel/bridge'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import { spendablePortfolio, coveragePctForRow } from '@/lib/horizon/coverage-strip'

// ── Presentatiedrempels (GEEN financiële aannames) ──────────────────────────
// Spiegelt de dekkingsgraad-strook (coverage-strip.ts): volledig gedekt (≥100) /
// krappe marge (90–99) / tekort (<90). Puur de stoplicht-indeling.
const RADAR_STATUS_GROEN_MIN_PCT = 100
const RADAR_STATUS_AMBER_MIN_PCT = 90

/**
 * Wonen-as vaste scores (grove eerste versie, presentatie — GEEN financiële aanname):
 *  - geborgd zonder verkoop → 100
 *  - geplande downsize (vaste leeftijd) → 95 (leunt op een keuze, niet op nood)
 *  - noodverkoop (wanneer-nodig, verkoop vindt plaats) → 85 (afgedwongen door de stand)
 */
const WONEN_GEEN_VERKOOP_PCT = 100
const WONEN_GEPLANDE_VERKOOP_PCT = 95
const WONEN_NOODVERKOOP_PCT = 85

/** Eindstrategie-as: clamp-bovengrens en bonus/malus per jaar restbesteding (presentatie). */
const EINDSTRATEGIE_PCT_MAX = 200
const EINDSTRATEGIE_DEPLETE_PUNTEN_PER_JAAR = 10

/** Assleutel van de radar. */
export type RadarAsKey =
  | 'brug-tot-aow'
  | 'pensioeninkomen'
  | 'wonen'
  | 'marktrisico'
  | 'eindstrategie'

/** Eén as van de dekkingsradar. */
export interface RadarAs {
  key: RadarAsKey
  label: string
  /** Dekkings-% (ruw, niet altijd geclampt — zie per-as); `null` = niet bepaalbaar. */
  pct: number | null
  /** Stoplichtstatus afgeleid van `pct`; `null` wanneer `pct === null`. */
  status: 'rood' | 'amber' | 'groen' | null
  /** Nederlandse één-regel-uitleg (voedt de i-tekst). */
  detail: string
}

/** Invoer voor `computeDekkingsradar` — allemaal elders berekende grootheden. */
export interface DekkingsradarInput {
  rows: readonly UnifiedProjectionRow[]
  mcResult?: MonteCarloResult | null
  currentAge: number
  fireAgeFractional: number | null
  aowAgeFractional: number
  requiredFirePortfolio: number
  targetEndPortfolio: number | null
  endStrategy: FireEndStrategy
  housingStrategy: HousingStrategyConfig
  hasEigenHuis: boolean
  kernelHousingSale: KernelHousingSale | null
  /** Jaarlijkse besteding (reëel/koopkracht-nu) — schaal voor de eindstrategie-as. */
  jaarBesteding: number
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Stoplichtstatus uit een dekkings-% (null-safe). */
function statusFromPct(pct: number | null): RadarAs['status'] {
  if (pct === null) return null
  if (pct >= RADAR_STATUS_GROEN_MIN_PCT) return 'groen'
  if (pct >= RADAR_STATUS_AMBER_MIN_PCT) return 'amber'
  return 'rood'
}

/** Rij met de leeftijd het dichtst bij `age` (rows niet leeg). */
function nearestRow(rows: readonly UnifiedProjectionRow[], age: number): UnifiedProjectionRow {
  let best = rows[0]
  let bestDiff = Math.abs(rows[0].age - age)
  for (const row of rows) {
    const diff = Math.abs(row.age - age)
    if (diff < bestDiff) {
      best = row
      bestDiff = diff
    }
  }
  return best
}

/** Verkoop-trigger van de woonstrategie (alleen downsize/opeethypotheek hebben er één). */
function housingTrigger(config: HousingStrategyConfig): HousingStrategyTrigger | null {
  if (config.mode === 'downsize' || config.mode === 'reverse_mortgage') return config.trigger
  return null
}

const round = (n: number) => Math.round(n)

/** Bouwt een as met de afgeleide status. */
function as(key: RadarAsKey, label: string, pct: number | null, detail: string): RadarAs {
  return { key, label, pct: pct === null ? null : round(pct), status: statusFromPct(pct), detail }
}

/**
 * As 1 — BRUG TOT AOW: kan het belegbare vermogen op de FIRE-rij de volledige
 * bestedingsbehoefte (Σ `withdrawalNeed.totaalNeed`) tijdens de brugjaren FIRE→AOW
 * overbruggen? pct = belegbaar@FIRE ÷ Σ-behoefte-brug × 100. Geen brug (FIRE ≥ AOW) → null.
 */
function axisBrugTotAow(input: DekkingsradarInput): RadarAs {
  const label = 'Brug tot AOW'
  if (input.fireAgeFractional === null) {
    return as('brug-tot-aow', label, null, 'FIRE niet bereikbaar — geen brugperiode te bepalen.')
  }
  if (input.rows.length === 0) {
    return as('brug-tot-aow', label, null, 'Geen projectierijen beschikbaar.')
  }
  if (input.fireAgeFractional >= input.aowAgeFractional) {
    return as('brug-tot-aow', label, null, 'Geen brug — je bereikt vrijheid op of na je AOW-leeftijd.')
  }
  const pot = spendablePortfolio(nearestRow(input.rows, input.fireAgeFractional))
  let sumNeed = 0
  for (const row of input.rows) {
    if (row.age >= input.fireAgeFractional && row.age < input.aowAgeFractional) {
      sumNeed += row.withdrawalNeed?.totaalNeed ?? 0
    }
  }
  if (sumNeed <= 0) {
    return as('brug-tot-aow', label, null, 'Geen gedefinieerde brug-behoefte in de jaren tot je AOW.')
  }
  const pct = (pot / sumNeed) * 100
  return as(
    'brug-tot-aow',
    label,
    pct,
    `Belegbaar bij vrijheid €${round(pot)} moet de brugjaren tot AOW (behoefte €${round(sumNeed)}) dekken.`,
  )
}

/**
 * As 2 — PENSIOENINKOMEN: hoe goed dekt je vaste inkomen (AOW/pensioen) + een veilige
 * onttrekking je besteding ná de AOW-leeftijd? Gemiddelde `coveragePctForRow` over de
 * post-AOW-rijen (dezelfde dekkingsgraad-formule als de levensinkomenstrook).
 */
function axisPensioeninkomen(input: DekkingsradarInput): RadarAs {
  const label = 'Pensioeninkomen'
  const postAow = input.rows.filter((r) => r.age >= input.aowAgeFractional)
  if (postAow.length === 0) {
    return as('pensioeninkomen', label, null, 'Geen jaren ná je AOW-leeftijd in de projectie.')
  }
  const avg = postAow.reduce((s, r) => s + coveragePctForRow(r), 0) / postAow.length
  return as(
    'pensioeninkomen',
    label,
    avg,
    `Gemiddeld dekt je pensioeninkomen ${round(avg)}% van je besteding ná je AOW-leeftijd.`,
  )
}

/**
 * As 3 — WONEN (GROVE EERSTE VERSIE, expliciet gedocumenteerd): steunt het plan op je
 * woning, en hoe stevig? Geen eigen huis → n.v.t. (null). Wél een huis en géén verkoop
 * binnen de horizon → 100 (woonlast geborgd zonder verzilveren). Geplande downsize
 * (`fixed_age`, verkoop vindt plaats) → 95. Noodverkoop (`on_depletion`, verkoop vindt
 * plaats) → 85 (de liquide stand dwingt de verkoop af). Dit is een RUWE inschatting op
 * basis van het verkoopmoment/-type, geen doorgerekende woonlast-dekking — de i-tekst
 * benoemt dat.
 */
function axisWonen(input: DekkingsradarInput): RadarAs {
  const label = 'Wonen'
  if (!input.hasEigenHuis) {
    return as('wonen', label, null, 'Geen eigen woning — deze as is niet van toepassing.')
  }
  if (input.kernelHousingSale === null) {
    return as('wonen', label, WONEN_GEEN_VERKOOP_PCT, 'Woonlast geborgd zonder je woning te hoeven verkopen binnen de horizon.')
  }
  const saleAge = round(input.kernelHousingSale.age)
  if (housingTrigger(input.housingStrategy) === 'on_depletion') {
    return as(
      'wonen',
      label,
      WONEN_NOODVERKOOP_PCT,
      `Verkoop wordt afgedwongen door de liquide stand (rond leeftijd ${saleAge}).`,
    )
  }
  return as(
    'wonen',
    label,
    WONEN_GEPLANDE_VERKOOP_PCT,
    `Leunt op een geplande downsize op leeftijd ${saleAge}.`,
  )
}

/**
 * As 4 — MARKTRISICO: houdt het plan stand bij tegenwind? p10 (10e-percentiel-vermogen)
 * op de FIRE-leeftijd ÷ benodigd FIRE-vermogen × 100. Zonder Monte-Carlo-overlay niet
 * bepaalbaar (null) — de UI-laag regelt een eigen lichte MC-run; deze helper blijft puur.
 */
function axisMarktrisico(input: DekkingsradarInput): RadarAs {
  const label = 'Marktrisico'
  if (!input.mcResult) {
    return as('marktrisico', label, null, 'Zet de Monte-Carlo-overlay aan om het marktrisico te meten.')
  }
  if (input.fireAgeFractional === null) {
    return as('marktrisico', label, null, 'FIRE-leeftijd onbekend — marktrisico niet te plaatsen.')
  }
  if (input.requiredFirePortfolio <= 0) {
    return as('marktrisico', label, null, 'Geen benodigd FIRE-vermogen bekend.')
  }
  const p10 = input.mcResult.percentiles.p10
  if (p10.length === 0) {
    return as('marktrisico', label, null, 'Monte-Carlo-percentielen ontbreken.')
  }
  const rawIdx = Math.round(input.fireAgeFractional - input.currentAge)
  const clamped = rawIdx < 0 || rawIdx > p10.length - 1
  const idx = clamp(rawIdx, 0, p10.length - 1)
  const p10AtFire = p10[idx] ?? 0
  const pct = (p10AtFire / input.requiredFirePortfolio) * 100
  const rand = clamped ? ' (FIRE-leeftijd buiten de Monte-Carlo-horizon — geklemd op de rand.)' : ''
  return as(
    'marktrisico',
    label,
    pct,
    `Bij tegenwind (10e-percentiel) is er op je vrijheidsleeftijd €${round(p10AtFire)} t.o.v. het doel van €${round(input.requiredFirePortfolio)}.${rand}`,
  )
}

/**
 * As 5 — EINDSTRATEGIE (GROVE EERSTE VERSIE): haalt het plan zijn eind-doel?
 *  - `deplete` (opeten): eindvermogen ≥ 0 → 100+ (bonus naar rato van resterende jaren
 *    besteding); tekort → <100 naar rato van het tekort (±10 punten per jaar besteding).
 *  - anders (legacy/perpetual/pensioen): eindvermogen ÷ doel-eindvermogen × 100; zonder
 *    positief doel (perpetual/behoud) t.o.v. de FIRE-pot als schaal.
 *  Clamp 0–200. `eindvermogen` = het VOLLEDIGE geprojecteerde netto vermogen van de
 *  laatste rij (incl. niet-liquide bezit zoals een niet-verkocht huis) — een bewuste
 *  vereenvoudiging; de i-tekst benoemt dat.
 */
function axisEindstrategie(input: DekkingsradarInput): RadarAs {
  const label = 'Eindstrategie'
  if (input.rows.length === 0) {
    return as('eindstrategie', label, null, 'Geen projectierijen beschikbaar.')
  }
  const eind = input.rows[input.rows.length - 1].netWorth

  if (input.endStrategy === 'deplete') {
    const base = Math.max(input.jaarBesteding, 1)
    const jarenOver = eind / base
    const pct = clamp(100 + jarenOver * EINDSTRATEGIE_DEPLETE_PUNTEN_PER_JAAR, 0, EINDSTRATEGIE_PCT_MAX)
    const detail =
      eind >= 0
        ? `Opeten-strategie: aan het eind blijft €${round(eind)} over (≈ ${jarenOver.toFixed(1)} jaar besteding).`
        : `Opeten-strategie: aan het eind een tekort van €${round(-eind)} (≈ ${(-jarenOver).toFixed(1)} jaar besteding te kort).`
    return as('eindstrategie', label, pct, detail)
  }

  if (input.targetEndPortfolio != null && input.targetEndPortfolio > 0) {
    const pct = clamp((eind / input.targetEndPortfolio) * 100, 0, EINDSTRATEGIE_PCT_MAX)
    return as(
      'eindstrategie',
      label,
      pct,
      `Doel-eindvermogen €${round(input.targetEndPortfolio)}; verwacht €${round(eind)}.`,
    )
  }

  // Perpetual/behoud (of geen positief doel): pot moet behouden blijven.
  const base = Math.max(input.requiredFirePortfolio, 1)
  const pct = clamp((eind / base) * 100, 0, EINDSTRATEGIE_PCT_MAX)
  return as(
    'eindstrategie',
    label,
    pct,
    `Behoud-strategie: eindvermogen €${round(eind)} t.o.v. de FIRE-pot €${round(input.requiredFirePortfolio)}.`,
  )
}

/**
 * Bouwt de vijf-assige dekkingsradar. Vaste as-volgorde (stabiele UI):
 * brug-tot-aow · pensioeninkomen · wonen · marktrisico · eindstrategie.
 */
export function computeDekkingsradar(input: DekkingsradarInput): RadarAs[] {
  return [
    axisBrugTotAow(input),
    axisPensioeninkomen(input),
    axisWonen(input),
    axisMarktrisico(input),
    axisEindstrategie(input),
  ]
}
