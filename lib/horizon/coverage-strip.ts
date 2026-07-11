/**
 * Dekkingsgraad-strook voor de "levensinkomenstrook" op de Toekomst-pagina.
 *
 * PURE afleiding uit het bestaande per-jaar UnifiedProjectionRow-contract
 * (lib/unified-projection.ts, gevuld door de horizon-kernel-bridge) — GEEN
 * eigen rekenmotor, geen financiële constanten. Voor elk gesampled leeftijdsjaar
 * wordt bepaald welk deel van de behoefte (`withdrawalNeed.totaalNeed`) gedekt
 * wordt door inkomen (`grossIncomeBySource`) + de gerealiseerde onttrekking
 * (`withdrawal`).
 */

import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { NL_SWR } from '@/lib/constants'

/** Eén knoop in de dekkingsgraad-strook. */
export interface CoverageNode {
  /** Leeftijd van deze knoop (van de dichtstbijzijnde geprojecteerde rij). */
  age: number
  /**
   * Dekkingspercentage — RUWE afronding (Math.round), niet geclampt. In
   * accumulatie-jaren altijd 100 (inkomen dekt + er wordt gespaard, geen
   * onttrekkingsbehoefte). Consumenten die de weergave willen begrenzen
   * (bv. 0–120 voor een balkje) doen dat zelf op basis van deze ruwe waarde.
   */
  coveragePct: number
  /** Stoplichtstatus, afgeleid van coveragePct (zie COVERAGE_STATUS_*-drempels). */
  status: 'green' | 'amber' | 'red'
}

/**
 * Presentatiedrempels voor de dekkingsgraad-stoplichtkleur. Dit zijn GEEN
 * financiële aannames (geen SWR/rendement/inflatie) — puur de indeling
 * volledig gedekt (≥100%) / krappe marge (90–99%) / tekort (<90%).
 */
const COVERAGE_STATUS_GREEN_MIN_PCT = 100
const COVERAGE_STATUS_AMBER_MIN_PCT = 90

/**
 * Standaard sample-stap in jaren tussen de getoonde dekkingsgraad-knopen.
 * Presentatiekeuze (grofheid van de strook), geen financiële constante.
 */
const DEFAULT_SAMPLE_EVERY_YEARS = 5

function coverageStatus(coveragePct: number): CoverageNode['status'] {
  if (coveragePct >= COVERAGE_STATUS_GREEN_MIN_PCT) return 'green'
  if (coveragePct >= COVERAGE_STATUS_AMBER_MIN_PCT) return 'amber'
  return 'red'
}

/** Vindt de rij met de leeftijd die het dichtst bij `age` ligt. */
function nearestRow(rows: UnifiedProjectionRow[], age: number): UnifiedProjectionRow {
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

/**
 * Asset-types die NIET duurzaam opneembaar zijn om besteding te dekken en dus
 * buiten het "belegbaar vermogen" vallen: de eigen woning + tweede pand (niet te
 * verzilveren zonder verkoop → dát maakt de brugjaren krap), auto's/fysiek bezit,
 * en de pensioenpot (die voedt ál het pensioeninkomen dat als vaste inkomsten
 * meetelt — anders dubbeltelling). Verzilvert de kernel de woning (downsize),
 * dan verschuift die waarde vanzelf naar de liquide buckets in latere rijen.
 */
const NON_SPENDABLE_ASSET_TYPES = new Set<string>([
  'eigen_huis',
  'real_estate',
  'vehicle',
  'physical',
  'retirement',
])

/**
 * Belegbaar (duurzaam opneembaar) vermogen aan het eind van het jaar.
 *
 * Geëxporteerd (ronde 3): de dekkingsradar (`lib/horizon/dekkingsradar.ts`) en de
 * laagste-buffer-afleiding (`lib/horizon/laagste-buffer.ts`) CONSUMEREN deze functie —
 * zodat de "belegbaar per rij"-grondslag single-sourced blijft (één home). Gedrag
 * byte-identiek t.o.v. de module-private versie; `buildCoverageStrip` blijft de andere
 * consument.
 */
export function spendablePortfolio(row: UnifiedProjectionRow): number {
  const buckets = row.assetBuckets ?? {}
  let sum = 0
  for (const [type, detail] of Object.entries(buckets)) {
    if (NON_SPENDABLE_ASSET_TYPES.has(type)) continue
    sum += detail?.endValue ?? 0
  }
  return sum
}

/**
 * Dekkingspercentage voor één projectierij — mockup-getrouw:
 *   dekking = (vaste inkomsten + veilige onttrekking) ÷ gewenste besteding × 100.
 *
 * - accumulation: 100 (er wordt nog gespaard, geen onttrekkingsbehoefte).
 * - transition/withdrawal: vaste inkomsten (salaris + AOW/pensioen) plus een
 *   VEILIGE onttrekking (NL_SWR × belegbaar vermogen), begrensd op de resterende
 *   behoefte zodat je niet méér "dekt" dan je uitgeeft. Bewust NIET de feitelijke
 *   `withdrawal` (die kan door liquidaties/interen ver boven de behoefte liggen →
 *   maskeert dat je vermogen opeet). In de brugjaren (geen AOW/pensioen, huis nog
 *   niet verzilverd) valt SWR×belegbaar < besteding → onder 100% (interen);
 *   ná AOW + downsizing tillen inkomen + vrijgekomen vermogen de dekking terug.
 * - guard: totaalNeed ≤ 0 (geen gevulde behoefte-decompositie) → 100.
 *
 * Geëxporteerd (ronde 3): de dekkingsradar (`lib/horizon/dekkingsradar.ts`) consumeert
 * deze formule voor de pensioeninkomen-as — dezelfde veilige-onttrekkings-dekkingsgraad
 * als de levensinkomenstrook, single-sourced (één home). Gedrag byte-identiek.
 */
export function coveragePctForRow(row: UnifiedProjectionRow): number {
  if (row.phase === 'accumulation') return 100

  const totaalNeed = row.withdrawalNeed?.totaalNeed ?? 0
  if (totaalNeed <= 0) return 100

  const salaris = row.grossIncomeBySource?.salaris ?? 0
  const gebeurtenisBaten = row.grossIncomeBySource?.gebeurtenisBaten ?? 0
  const vasteInkomsten = salaris + gebeurtenisBaten

  const restNeed = Math.max(0, totaalNeed - vasteInkomsten)
  const veiligeOnttrekking = Math.min(NL_SWR * spendablePortfolio(row), restNeed)

  return Math.round(((vasteInkomsten + veiligeOnttrekking) / totaalNeed) * 100)
}

/**
 * Bouwt de dekkingsgraad-strook uit een unified-projection-rijenreeks.
 *
 * Sample-knopen: elke `sampleEveryYears` jaar (default 5) van de eerste tot
 * de laatste leeftijd in `rows`, PLUS de leeftijden aan weerszijden van elke
 * fasewisseling (accumulation → transition → withdrawal) zodat een brug-dip
 * zichtbaar blijft ook als hij tussen twee samplepunten in valt. Dedup +
 * oplopend gesorteerd.
 */
export function buildCoverageStrip(
  rows: UnifiedProjectionRow[],
  opts?: { sampleEveryYears?: number },
): CoverageNode[] {
  if (rows.length === 0) return []

  const sampleEveryYears = opts?.sampleEveryYears ?? DEFAULT_SAMPLE_EVERY_YEARS
  const firstAge = rows[0].age
  const lastAge = rows[rows.length - 1].age

  const ages = new Set<number>()
  for (let age = firstAge; age < lastAge; age += sampleEveryYears) {
    ages.add(age)
  }
  ages.add(lastAge)

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].phase !== rows[i - 1].phase) {
      ages.add(rows[i - 1].age)
      ages.add(rows[i].age)
    }
  }

  return Array.from(ages)
    .sort((a, b) => a - b)
    .map((age) => {
      const row = nearestRow(rows, age)
      const coveragePct = coveragePctForRow(row)
      return { age, coveragePct, status: coverageStatus(coveragePct) }
    })
}
