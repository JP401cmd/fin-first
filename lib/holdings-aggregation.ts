// ---------------------------------------------------------------------------
// Holdings-aggregatie — de canonieke afleiding van een huidige positie uit de
// transactiehistorie. SINGLE SOURCE OF TRUTH: de transacties bepalen het
// huidige bezit, niet andersom.
//
// Waarom hier centraal: zowel de import (welk aantal sla ik op de holding op?)
// als de holding-detailpagina (welk aantal + winst/verlies toon ik?) moeten
// hetzelfde getal produceren. Elke eigen som elders is toekomstige drift —
// consume, don't recompute.
//
// Methode: gewogen gemiddelde kostprijs (average-cost). Een koop verhoogt het
// aantal en middelt de kostprijs; een verkoop verlaagt het aantal, realiseert
// winst/verlies t.o.v. de gemiddelde kostprijs op dat moment, en laat de
// kostprijs ongemoeid. Voor een volledig gesloten positie is de gerealiseerde
// winst gelijk aan (opbrengst verkopen − inleg aankopen + dividend − kosten) —
// methode-onafhankelijk; average-cost bepaalt alleen de split tussen
// gerealiseerd en ongerealiseerd bij een deels-open positie.
// ---------------------------------------------------------------------------

/**
 * Bovengrens op de transactie-fetch die de holdings-aggregatie voedt. Ruim
 * boven elke realistische per-positie historie (zelfs jaren dagtrading /
 * CSV-imports), zodat pane, full-page én lijst over dezelfde — feitelijk
 * volledige — set aggregeren. Bewust een grote cap i.p.v. ongelimiteerd:
 * één corrupte holding kan zo geen onbegrensde fetch triggeren.
 */
export const HOLDINGS_TX_AGG_LIMIT = 5000

export interface PositionTransaction {
  /** 'buy' | 'sell' | 'dividend' | 'split' (case-insensitief). Onbekend = genegeerd. */
  type: string
  /** Aantal eenheden (absoluut; het teken volgt uit `type`). */
  units: number | string
  /** Prijs per eenheid in EUR. */
  price_per_unit: number | string
  /** Bruto transactiebedrag in EUR (optioneel; gebruikt voor dividend-inkomsten). */
  total_amount?: number | string | null
  /** Transactiekosten in EUR (optioneel; verlagen het nettoresultaat). */
  fees?: number | string | null
  /** ISO-datum; bepaalt de chronologische volgorde van de average-cost-loop. */
  date?: string | null
}

export interface PositionAggregate {
  /** Huidig aantal eenheden = Σ gekocht − Σ verkocht (geklemd op 0 bij ~0). */
  netUnits: number
  /** Gewogen gemiddelde kostprijs per resterende eenheid (EUR); 0 bij gesloten positie. */
  avgCost: number
  /** Totaal gekochte / verkochte eenheden over de hele historie. */
  totalBoughtUnits: number
  totalSoldUnits: number
  /** Bruto inleg (Σ aankoopbedragen) en opbrengst (Σ verkoopbedragen) in EUR. */
  totalInvested: number
  totalProceeds: number
  /** Som van dividend-uitkeringen (EUR). */
  dividends: number
  /** Som van transactiekosten (EUR). */
  totalFees: number
  /** Gerealiseerde winst/verlies (average-cost), incl. dividend, minus kosten. */
  realizedPnL: number
  /** Of de positie volledig gesloten is (netUnits === 0). */
  isClosed: boolean
}

export interface PositionValuation extends PositionAggregate {
  /** Huidige marktwaarde van de resterende positie (netUnits × currentPrice). */
  currentValue: number
  /** Ongerealiseerde winst/verlies op de resterende positie. */
  unrealizedPnL: number
  /** Totale winst/verlies = gerealiseerd + ongerealiseerd. */
  totalPnL: number
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

const EPSILON = 1e-9

/**
 * Leidt de huidige positie af uit de transactiehistorie via average-cost.
 * Sorteert zelf op datum (oplopend) zodat de aanroeper de volgorde niet hoeft
 * te garanderen.
 */
export function computePositionFromTransactions(
  txs: readonly PositionTransaction[],
): PositionAggregate {
  const ordered = [...txs].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  let units = 0
  let avgCost = 0
  let bought = 0
  let sold = 0
  let invested = 0
  let proceeds = 0
  let dividends = 0
  let fees = 0
  let realized = 0

  for (const tx of ordered) {
    const type = (tx.type ?? '').toLowerCase()
    const u = Math.abs(num(tx.units))
    const px = Math.abs(num(tx.price_per_unit))
    const fee = Math.abs(num(tx.fees))
    fees += fee

    if (type === 'buy') {
      const newUnits = units + u
      avgCost = newUnits > EPSILON ? (units * avgCost + u * px) / newUnits : 0
      units = newUnits
      bought += u
      invested += u * px
    } else if (type === 'sell') {
      // Realiseer t.o.v. de gemiddelde kostprijs op dit moment; kostprijs blijft.
      realized += u * (px - avgCost)
      units -= u
      sold += u
      proceeds += u * px
    } else if (type === 'dividend') {
      const div = num(tx.total_amount) || u * px
      dividends += div
      realized += div
    }
    // 'split' e.d.: bewust genegeerd (geen unit-aanpassing) tot er een echt
    // splitsformaat is; documenteer drift liever dan te gokken.
  }

  // Kosten drukken het nettoresultaat van een gerealiseerde/gesloten positie.
  realized -= fees

  const netUnits = Math.abs(units) < EPSILON ? 0 : units

  return {
    netUnits,
    avgCost: netUnits > 0 ? avgCost : 0,
    totalBoughtUnits: bought,
    totalSoldUnits: sold,
    totalInvested: invested,
    totalProceeds: proceeds,
    dividends,
    totalFees: fees,
    realizedPnL: realized,
    isClosed: netUnits === 0,
  }
}

/**
 * Verrijkt de positie met een marktwaardering bij een gegeven huidige prijs.
 * `currentPrice == null` → waardering op 0 (onbekende prijs), ongerealiseerd 0.
 */
export function valuePosition(
  agg: PositionAggregate,
  currentPrice: number | null | undefined,
): PositionValuation {
  const price = currentPrice != null && Number.isFinite(currentPrice) ? currentPrice : null
  const currentValue = price != null ? agg.netUnits * price : 0
  const unrealizedPnL = price != null ? (price - agg.avgCost) * agg.netUnits : 0
  return {
    ...agg,
    currentValue,
    unrealizedPnL,
    totalPnL: agg.realizedPnL + unrealizedPnL,
  }
}
