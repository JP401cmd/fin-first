// lib/portfolio-value-history.ts
// ---------------------------------------------------------------------------
// Rekenmotor: historische waarde van de effectenportefeuille, afgeleid uit de
// transactiehistorie.
//
// Het principe is dat van elke portefeuilletracker: de transacties bepalen
// hoeveel je op een moment bezat, de koers van dát moment bepaalt wat het waard
// was. Nooit een rechte lijn tussen twee transacties trekken — dat suggereert
// koersbeweging die er niet was, of verzwijgt beweging die er wel was.
//
// PRIJSLADDER — de enige plek waar we beslissen wat een positie op een peildatum
// waard was. In volgorde van betrouwbaarheid:
//
//   1. `market`      — een echte slotkoers uit `investment_holding_prices` met
//                      datum ≤ peildatum (dichtstbijzijnde). De cron vult die
//                      dagelijks; `backfillHoldingPrices` haalt historie op.
//   2. `transaction` — de laatst bekende transactieprijs ≤ peildatum. Nodig
//                      omdat een groot deel van een echte portefeuille niet
//                      noteert bij Yahoo: turbo's, sprinters, gedelistte namen
//                      en ADR's dragen als "ticker" de brokeromschrijving
//                      ("AEX 485.9SPSOPENG"). Zonder deze trap zouden precies
//                      de gesloten posities uit de historie verdwijnen en zou de
//                      curve structureel te laag liggen.
//   3. `cost`        — de gemiddelde kostprijs. Laatste redmiddel; komt alleen
//                      voor bij een positie zonder enige prijsobservatie.
//
// Trap 2 en 3 zijn géén marktkoers en doen ook niet alsof: elk punt draagt
// `pricedFromMarket` (het aandeel van de waarde dat op trap 1 rust), zodat de UI
// eerlijk kan tonen hoe hard de lijn is. Dat cijfer is onderdeel van het
// contract, geen extraatje.
//
// CONSUME, DON'T RECOMPUTE: de units/kostprijs per positie komen uit
// `computePositionFromTransactions` (lib/holdings-aggregation.ts) — dezelfde
// engine die de holdings-lijst, de detail-pane en de import gebruiken. Deze
// module voegt daar alleen de tijd-as en de prijsladder aan toe.
// ---------------------------------------------------------------------------

import {
  computePositionFromTransactions,
  type PositionTransaction,
} from '@/lib/holdings-aggregation'
import { roundCents } from '@/lib/format'

// ── Invoer ─────────────────────────────────────────────────────

/** Eén transactieregel, over alle posities heen. */
export interface PortfolioTransaction extends PositionTransaction {
  holding_id: string
}

/** Eén koersobservatie uit `*_holding_prices`. */
export interface PriceObservation {
  holding_id: string
  /** ISO-datum `YYYY-MM-DD`. */
  date: string
  close_price: number | string
  /**
   * Hoe hard deze observatie is. Standaard `market` — rijen uit
   * `investment_holding_prices` komen van een koersbron.
   *
   * De uitzondering waarvoor dit veld bestaat: de aanroeper mag de actuele
   * `investment_holdings.current_price` als slotobservatie meegeven, zodat het
   * laatste punt van de curve gelijk is aan de marktwaarde-KPI op hetzelfde
   * scherm. Is die prijs nooit door een koersvernieuwing gezet
   * (`last_price_update IS NULL` — handmatig ingevoerd of een import-placeholder),
   * dan hoort 'ie op `transaction`: de app kent 'm, de markt bevestigde 'm niet.
   */
  tier?: Exclude<PriceTier, 'cost'>
}

// ── Uitvoer ────────────────────────────────────────────────────

/** Welke trap van de prijsladder een positie op een peildatum waardeerde. */
export type PriceTier = 'market' | 'transaction' | 'cost'

export interface PortfolioValuePoint {
  /** Peildatum, `YYYY-MM-DD` — de 1e van de maand, of vandaag voor het slotpunt. */
  date: string
  /** Marktwaarde van alle open posities op die datum. */
  marketValue: number
  /** Kostbasis (inleg) van diezelfde posities — de tweede lijn in de grafiek. */
  costBasis: number
  /** Aantal posities met een positief aantal eenheden op die datum. */
  openPositions: number
  /**
   * Aandeel van `marketValue` dat op een echte slotkoers rust (0–1). 1 = elke
   * positie had een marktkoers; 0,6 = 40% van de waarde is gewaardeerd op de
   * laatst bekende transactieprijs of kostprijs.
   */
  pricedFromMarket: number
}

export interface PortfolioValueHistory {
  points: PortfolioValuePoint[]
  /** Posities die nooit een marktkoers hadden — de kandidaten voor een backfill. */
  holdingsWithoutMarketPrice: string[]
  /**
   * Posities die aan de curve MEEDOEN (die gedateerde transacties hebben).
   *
   * Dit is bewust de noemer bij `holdingsWithoutMarketPrice`, en niet het totale
   * aantal holdings van de gebruiker: die twee tellen niet hetzelfde. Met 116
   * holdings waarvan er 40 een transactieboek hebben, zou "12 van de 116 missen
   * een koers" structureel te gunstig lezen.
   */
  holdingsWithHistory: number
  /** Ongewogen gemiddelde van `pricedFromMarket` over alle punten met waarde. */
  averagePricedFromMarket: number
}

export interface BuildPortfolioValueHistoryInput {
  transactions: readonly PortfolioTransaction[]
  prices: readonly PriceObservation[]
  /** Peildatum van "nu", `YYYY-MM-DD`. Expliciet zodat de motor puur blijft. */
  today: string
  /** Vroegste peildatum; standaard de eerste transactie. */
  from?: string
}

// ── Datumhulpjes (string-gebaseerd, geen tijdzone-effecten) ────

/** De 1e van de maand ná `date`. `2025-03-14` → `2025-04-01`. */
function nextMonthAnchor(date: string): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}

/**
 * Elke 1e van de maand ná `from`, tot en met de laatste die vóór `today` valt.
 * Het startpunt is bewust de eerste maandgrens ná de eerste transactie: op de
 * grens dáárvoor was de portefeuille nog leeg en zou een nulpunt de grafiek
 * alleen maar uitrekken.
 */
function monthAnchors(from: string, today: string): string[] {
  const anchors: string[] = []
  let cursor = nextMonthAnchor(from)
  // Bovengrens tegen een onverwacht ver weg liggende `today` (corrupte datum).
  while (cursor < today && anchors.length < 1200) {
    anchors.push(cursor)
    cursor = nextMonthAnchor(cursor)
  }
  return anchors
}

// ── Motor ──────────────────────────────────────────────────────

/**
 * Bouwt de maandelijkse waardecurve van de hele portefeuille.
 *
 * Per peildatum en per positie: het aantal eenheden volgt uit de transacties tot
 * en met die datum (canonieke engine), de prijs uit de prijsladder hierboven.
 * Een positie met 0 of minder eenheden telt niet mee — een negatief saldo is
 * geen short maar een gat in de historie (zie `holdings-sync.ts`).
 */
export function buildPortfolioValueHistory(
  input: BuildPortfolioValueHistoryInput,
): PortfolioValueHistory {
  const { transactions, prices, today } = input

  const dated = transactions
    .filter((t): t is PortfolioTransaction & { date: string } => Boolean(t.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  if (dated.length === 0) {
    return {
      points: [],
      holdingsWithoutMarketPrice: [],
      holdingsWithHistory: 0,
      averagePricedFromMarket: 0,
    }
  }

  // Transacties per positie, chronologisch.
  const txByHolding = new Map<string, Array<PortfolioTransaction & { date: string }>>()
  for (const tx of dated) {
    const list = txByHolding.get(tx.holding_id) ?? []
    list.push(tx)
    txByHolding.set(tx.holding_id, list)
  }

  // Koersen per positie, chronologisch — later doorlopen we ze met een cursor
  // per peildatum, zodat we niet per punt de hele reeks aflopen.
  const pricesByHolding = new Map<string, Array<{ date: string; close: number; tier: Exclude<PriceTier, 'cost'> }>>()
  for (const p of prices) {
    const close = Number(p.close_price)
    if (!Number.isFinite(close) || close <= 0) continue
    const list = pricesByHolding.get(p.holding_id) ?? []
    list.push({ date: p.date, close, tier: p.tier ?? 'market' })
    pricesByHolding.set(p.holding_id, list)
  }
  for (const list of pricesByHolding.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date))
  }

  // Nooit vóór de eerste transactie beginnen, ook niet als de aanroeper een
  // ruimer venster vraagt: die maanden leveren alleen nulpunten op, die de
  // grafiek platdrukken en de payload opblazen zonder iets te vertellen.
  const firstTx = dated[0].date
  const from = input.from && input.from > firstTx ? input.from : firstTx
  const anchors = [...monthAnchors(from, today), today]

  // Cursors die met de peildatum meelopen (de reeksen zijn gesorteerd).
  const txCursor = new Map<string, number>()
  const priceCursor = new Map<string, number>()
  /** Laatste koersobservatie per positie, tot aan de huidige peildatum. */
  const lastObserved = new Map<string, { close: number; tier: Exclude<PriceTier, 'cost'> }>()
  /** Laatst gebruikte transactieprijs per positie, tot aan de huidige peildatum. */
  const lastTxPrice = new Map<string, number>()
  /** Transacties tot en met de huidige peildatum, per positie. */
  const seenTx = new Map<string, PositionTransaction[]>()

  const holdingsWithMarketPrice = new Set<string>()
  const holdingIds = new Set(txByHolding.keys())

  const points: PortfolioValuePoint[] = []

  for (const anchor of anchors) {
    let marketValue = 0
    let costBasis = 0
    let valueFromMarket = 0
    let openPositions = 0

    for (const holdingId of holdingIds) {
      // 1. Transacties tot en met de peildatum bijwerken.
      const txs = txByHolding.get(holdingId) ?? []
      let ti = txCursor.get(holdingId) ?? 0
      const seen = seenTx.get(holdingId) ?? []
      while (ti < txs.length && txs[ti].date <= anchor) {
        const row = txs[ti]
        seen.push(row)
        const type = String(row.type ?? '').toLowerCase()
        const px = Number(row.price_per_unit)

        if (type === 'buy' || type === 'sell') {
          // Alleen een koop of verkoop draagt een KOERS. Een dividendregel
          // draagt het dividend per aandeel (Trading 212 vult "Price / share"
          // ook daar; eToro leidt 'm af uit bedrag ÷ stuks). Die als koers
          // gebruiken zet een positie van €9.000 op €25.
          if (Number.isFinite(px) && px > 0) lastTxPrice.set(holdingId, px)
        } else if (type === 'split') {
          // De engine vermenigvuldigt de units met de splitfactor en deelt de
          // kostprijs erdoor. Een prijs van vóór de split moet dezelfde deling
          // ondergaan, anders verdubbelt de waarde bij een 2-voor-1 split uit
          // het niets — en de grafiek schrijft dat aan rendement toe.
          // (Trap 1 heeft dit niet nodig: Yahoo levert split-gecorrigeerde
          // historie.)
          const factor = Math.abs(Number(row.units))
          const previous = lastTxPrice.get(holdingId)
          if (previous !== undefined && Number.isFinite(factor) && factor > 0) {
            lastTxPrice.set(holdingId, previous / factor)
          }
        }
        ti++
      }
      txCursor.set(holdingId, ti)
      seenTx.set(holdingId, seen)
      if (seen.length === 0) continue

      // 2. Koersobservaties tot en met de peildatum bijwerken.
      const priceList = pricesByHolding.get(holdingId) ?? []
      let pi = priceCursor.get(holdingId) ?? 0
      while (pi < priceList.length && priceList[pi].date <= anchor) {
        lastObserved.set(holdingId, { close: priceList[pi].close, tier: priceList[pi].tier })
        if (priceList[pi].tier === 'market') holdingsWithMarketPrice.add(holdingId)
        pi++
      }
      priceCursor.set(holdingId, pi)

      // 3. Positie op de peildatum via de canonieke engine.
      const agg = computePositionFromTransactions(seen)
      if (agg.netUnits <= 0) continue

      // 4. Prijsladder.
      const observed = lastObserved.get(holdingId)
      const txPrice = lastTxPrice.get(holdingId)
      let price: number
      let tier: PriceTier
      if (observed !== undefined) {
        price = observed.close
        tier = observed.tier
      } else if (txPrice !== undefined) {
        price = txPrice
        tier = 'transaction'
      } else {
        price = agg.avgCost
        tier = 'cost'
      }

      const value = agg.netUnits * price
      marketValue += value
      costBasis += agg.netUnits * agg.avgCost
      if (tier === 'market') valueFromMarket += value
      openPositions++
    }

    points.push({
      date: anchor,
      marketValue: roundCents(marketValue),
      costBasis: roundCents(costBasis),
      openPositions,
      pricedFromMarket: marketValue > 0 ? valueFromMarket / marketValue : 0,
    })
  }

  const withValue = points.filter((p) => p.marketValue > 0)
  const averagePricedFromMarket = withValue.length > 0
    ? withValue.reduce((s, p) => s + p.pricedFromMarket, 0) / withValue.length
    : 0

  return {
    points,
    holdingsWithoutMarketPrice: [...holdingIds].filter((id) => !holdingsWithMarketPrice.has(id)),
    holdingsWithHistory: holdingIds.size,
    averagePricedFromMarket,
  }
}
