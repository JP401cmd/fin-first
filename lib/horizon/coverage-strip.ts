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
   * accumulatie-jaren > 100 zodra er wordt gespaard: het inkomen dekt de
   * besteding én de inleg, dus dekking = inkomen ÷ besteding × 100 stijgt
   * boven 100 met het spaarquote-effect (1 ÷ (1 − spaarquote)). Consumenten
   * die de weergave willen begrenzen (bv. 0–120 voor een balkje) doen dat zelf
   * op basis van deze ruwe waarde.
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
 * Dekkingspercentage voor één projectierij — mockup-getrouw, op BRUTO-behoefte:
 *   dekking = (vaste inkomsten + veilige onttrekking) ÷ bruto besteding × 100.
 *
 * - accumulation: inkomen ÷ besteding × 100, met besteding = grossIncome − savings
 *   (de inleg). Omdat je in opbouwjaren spaart (savings > 0) ligt de dekking bóven
 *   100% — het spaargeld tilt 'm op (1 ÷ (1 − spaarquote)). Puur afgeleid uit het
 *   rij-contract (grossIncome/savings), geen eigen rekenmotor. Geen besteding
 *   (besteding ≤ 0: geen inleg, of inleg ≥ inkomen door externe kasstromen) → 100.
 * - transition/withdrawal: vaste inkomsten (salaris + AOW/pensioen) plus een
 *   VEILIGE onttrekking (NL_SWR × belegbaar vermogen), begrensd op de resterende
 *   behoefte zodat je niet méér "dekt" dan je uitgeeft. Bewust NIET de feitelijke
 *   `withdrawal` (die kan door liquidaties/interen ver boven de behoefte liggen →
 *   maskeert dat je vermogen opeet). In de brugjaren (geen AOW/pensioen, huis nog
 *   niet verzilverd) valt SWR×belegbaar < besteding → onder 100% (interen);
 *   ná AOW + downsizing tillen inkomen + vrijgekomen vermogen de dekking terug.
 *
 * PARTNER TELT EXACT ÉÉN KEER (bruto-semantiek). `withdrawalNeed.totaalNeed` is al
 * partner-NETTO — Ont!D trekt de partnerbijdrage (PT!K, geëxposed als
 * `withdrawalNeed.partnerBijdrage`) per maand van de behoefte af — terwijl diezelfde
 * partnerbijdrage óók als inkomen in `grossIncomeBySource.salaris` (CF!D) zit. Delen
 * door de al-genette `totaalNeed` zou de partner-euro's dus dubbel crediteren
 * (behoefte-verlagend én inkomen-verhogend). Daarom herstellen we de BRUTO-behoefte
 * (`brutoNeed = totaalNeed + partnerBijdrage`) als noemer en als basis voor `restNeed`:
 * de partner verlaagt de behoefte dan niet meer, en telt alleen nog als inkomen mee.
 * Bij `partnerBijdrage = 0` (alleenstaanden / partner-loze fixtures) is `brutoNeed`
 * identiek aan `totaalNeed` → exact dezelfde uitkomst als voorheen (non-regressie).
 * Benadering: exact in normale maanden; in maanden waar de partner de maandbehoefte
 * óverdekt (per-maand `MAX(0,·)`-clamp in Ont!D bijt) overschat `brutoNeed` de echte
 * bruto-behoefte met het `restMaandClamp`-aandeel — conservatief (grotere noemer →
 * lagere dekking), nooit inflaterend.
 *
 * - guard: brutoNeed ≤ 0 (geen bruto-behoefte: lege behoefte-decompositie, en geen
 *   partner die de netto-behoefte tot 0 drukt) → 100. Bewust op brutoNeed (de nieuwe
 *   noemer) i.p.v. totaalNeed: dekt een partner de volledige netto-behoefte af
 *   (totaalNeed = 0, partnerBijdrage > 0), dan is brutoNeed > 0 en laten we de formule
 *   spreken — die geeft dan 100 via het (partner-)inkomen, semantisch juist, i.p.v.
 *   een kortsluiting die toevallig óók 100 oplevert. Op partnerBijdrage = 0 valt de
 *   guard byte-identiek samen met de oude `totaalNeed ≤ 0`-guard. NB: via de echte
 *   bridge is (totaalNeed = 0, partnerBijdrage > 0) onbereikbaar — `withdrawalNeed`
 *   wordt alleen gespread bij totaalNeed > 0 — dus die tak is defensief/test-only;
 *   "versimpel" de guard niet op grond van dit gedachte-experiment.
 *
 * Geëxporteerd (ronde 3): de dekkingsradar (`lib/horizon/dekkingsradar.ts`) consumeert
 * deze formule voor de pensioeninkomen-as — dezelfde veilige-onttrekkings-dekkingsgraad
 * als de levensinkomenstrook, single-sourced (één home). Gedrag byte-identiek.
 */
export function coveragePctForRow(row: UnifiedProjectionRow): number {
  if (row.phase === 'accumulation') {
    // Opbouwjaren: je spaart, dus je inkomen dekt méér dan je besteding. Dekking
    // = inkomen ÷ besteding × 100, met besteding = inkomen − inleg (savings). Het
    // gespaarde deel tilt de dekking bewust boven 100% (spaarquote-effect). Geen
    // besteding (≤ 0) → 100, zodat rijen zonder inkomens-/inleg-data (bv. synthetische
    // fixtures) hun 100%-vorm houden.
    const inkomen = row.grossIncome ?? 0
    const inleg = row.savings ?? 0
    const besteding = inkomen - inleg
    if (besteding <= 0) return 100
    return Math.round((inkomen / besteding) * 100)
  }

  const totaalNeed = row.withdrawalNeed?.totaalNeed ?? 0
  const partnerBijdrage = row.withdrawalNeed?.partnerBijdrage ?? 0
  // Bruto-behoefte: draai de partner-nettering terug zodat de partner niet ook via
  // de behoefte meetelt — hij telt zo alleen nog als inkomen (exact één keer).
  const brutoNeed = totaalNeed + partnerBijdrage
  if (brutoNeed <= 0) return 100

  const salaris = row.grossIncomeBySource?.salaris ?? 0
  const gebeurtenisBaten = row.grossIncomeBySource?.gebeurtenisBaten ?? 0
  const vasteInkomsten = salaris + gebeurtenisBaten

  const restNeed = Math.max(0, brutoNeed - vasteInkomsten)
  const veiligeOnttrekking = Math.min(NL_SWR * spendablePortfolio(row), restNeed)

  return Math.round(((vasteInkomsten + veiligeOnttrekking) / brutoNeed) * 100)
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
