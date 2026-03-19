/**
 * Goedkopere alternatieven database — fund-alternatives.ts
 *
 * Statische mapping van veelvoorkomende (dure) Nederlandse fondsen
 * naar goedkopere alternatieven. Geen externe API — handmatig onderhouden.
 *
 * Focus: ABN AMRO, ING, Rabobank fondsen → Vanguard, iShares, Northern Trust alternatieven.
 */

// ── Types ────────────────────────────────────────────────────

export interface Alternative {
  /** ISIN van het alternatief */
  isin: string
  /** Fondsnaam */
  name: string
  /** Total Expense Ratio (percentage, bijv. 0.20 = 0.20%) */
  ter: number
  /** Aanbieder / fondshuis */
  provider: string
  /** Korte toelichting of bron-notitie */
  note: string
}

export interface FundMapping {
  /** ISIN van het originele (dure) fonds */
  isin: string
  /** Ticker symbool (indien beschikbaar) */
  ticker?: string
  /** Volledige fondsnaam */
  name: string
  /** Total Expense Ratio van het originele fonds (percentage) */
  ter: number
  /** Categorie van het fonds */
  category: FundCategory
  /** Goedkopere alternatieven, gesorteerd op TER (laagste eerst) */
  alternatives: Alternative[]
}

export type FundCategory =
  | 'wereld-aandelen'
  | 'europa-aandelen'
  | 'nederland-aandelen'
  | 'obligaties'
  | 'vastgoed'
  | 'opkomende-markten'
  | 'duurzaam'
  | 'mixed'

// ── Datum & Disclaimer ───────────────────────────────────────

/** Datum waarop de data voor het laatst is bijgewerkt */
export const LAATST_BIJGEWERKT = '2026-03-01'

/** Disclaimer tekst voor gebruik in de UI */
export const FUND_ALTERNATIVES_DISCLAIMER =
  'Deze informatie is indicatief en geen beleggingsadvies. TER-percentages kunnen wijzigen. ' +
  'Controleer altijd de actuele kosten bij je broker of fondsaanbieder. ' +
  'Overstappen naar een ander fonds kan fiscale gevolgen hebben (box 3 peildatum, transactiekosten). ' +
  `Laatst bijgewerkt: ${LAATST_BIJGEWERKT}.`

// ── Fund Database ────────────────────────────────────────────

export const FUND_MAPPINGS: FundMapping[] = [
  // ─── Wereld-aandelen ─────────────────────────────────────

  {
    isin: 'NL0006311771',
    name: 'ABN AMRO Wereld Aandelen Fonds',
    ter: 1.15,
    category: 'wereld-aandelen',
    alternatives: [
      {
        isin: 'NL0011225305',
        name: 'Northern Trust World Custom ESG Equity Index Fund',
        ter: 0.15,
        provider: 'Northern Trust',
        note: 'Beschikbaar via ABN AMRO Zelf Beleggen Basis',
      },
      {
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Beschikbaar bij alle grote brokers',
      },
      {
        isin: 'IE00BK5BQT80',
        name: 'Vanguard FTSE All-World UCITS ETF (Acc)',
        ter: 0.22,
        provider: 'Vanguard',
        note: 'Brede wereldwijde spreiding inclusief opkomende markten',
      },
    ],
  },
  {
    isin: 'NL0012192750',
    name: 'ING Wereldwijd Indexfonds',
    ter: 0.68,
    category: 'wereld-aandelen',
    alternatives: [
      {
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Beschikbaar bij alle grote brokers',
      },
      {
        isin: 'IE00BK5BQT80',
        name: 'Vanguard FTSE All-World UCITS ETF (Acc)',
        ter: 0.22,
        provider: 'Vanguard',
        note: 'Brede wereldwijde spreiding inclusief opkomende markten',
      },
    ],
  },
  {
    isin: 'NL0006294130',
    name: 'Rabobank Global Mix Fund',
    ter: 0.85,
    category: 'wereld-aandelen',
    alternatives: [
      {
        isin: 'NL0011225305',
        name: 'Northern Trust World Custom ESG Equity Index Fund',
        ter: 0.15,
        provider: 'Northern Trust',
        note: 'Beschikbaar via grote banken en brokers',
      },
      {
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Beschikbaar bij alle grote brokers',
      },
    ],
  },
  {
    isin: 'NL0006311813',
    name: 'ABN AMRO Profielfonds 5',
    ter: 1.20,
    category: 'wereld-aandelen',
    alternatives: [
      {
        isin: 'NL0011225305',
        name: 'Northern Trust World Custom ESG Equity Index Fund',
        ter: 0.15,
        provider: 'Northern Trust',
        note: 'Puur aandelen — combineer eventueel met obligatie-ETF',
      },
      {
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Beschikbaar bij alle grote brokers',
      },
    ],
  },
  {
    isin: 'NL0006311789',
    name: 'ABN AMRO Profielfonds 3',
    ter: 1.10,
    category: 'mixed',
    alternatives: [
      {
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Combineer met obligatie-ETF voor vergelijkbaar risicoprofiel',
      },
      {
        isin: 'IE00BK5BQT80',
        name: 'Vanguard FTSE All-World UCITS ETF (Acc)',
        ter: 0.22,
        provider: 'Vanguard',
        note: 'Mix zelf met obligatie-ETF naar gewenste verhouding',
      },
    ],
  },

  // ─── Europa-aandelen ─────────────────────────────────────

  {
    isin: 'NL0006311797',
    name: 'ABN AMRO Europa Aandelen Fonds',
    ter: 1.20,
    category: 'europa-aandelen',
    alternatives: [
      {
        isin: 'NL0011515424',
        name: 'Northern Trust Europe Custom ESG Equity Index Fund',
        ter: 0.15,
        provider: 'Northern Trust',
        note: 'Beschikbaar via ABN AMRO Zelf Beleggen Basis',
      },
      {
        isin: 'IE00B4K48X80',
        name: 'iShares Core MSCI Europe UCITS ETF',
        ter: 0.12,
        provider: 'iShares',
        note: 'Breed Europees, beschikbaar bij alle grote brokers',
      },
      {
        isin: 'IE00BKX55S42',
        name: 'Vanguard FTSE Developed Europe UCITS ETF',
        ter: 0.10,
        provider: 'Vanguard',
        note: 'Laagste TER optie voor Europese aandelen',
      },
    ],
  },
  {
    isin: 'NL0000292324',
    name: 'ING Europa Index Fonds',
    ter: 0.65,
    category: 'europa-aandelen',
    alternatives: [
      {
        isin: 'IE00BKX55S42',
        name: 'Vanguard FTSE Developed Europe UCITS ETF',
        ter: 0.10,
        provider: 'Vanguard',
        note: 'Laagste TER voor Europese aandelen',
      },
      {
        isin: 'IE00B4K48X80',
        name: 'iShares Core MSCI Europe UCITS ETF',
        ter: 0.12,
        provider: 'iShares',
        note: 'Breed Europees, beschikbaar bij alle grote brokers',
      },
    ],
  },

  // ─── Nederland-aandelen ──────────────────────────────────

  {
    isin: 'NL0006311763',
    name: 'ABN AMRO Nederland Fonds',
    ter: 1.10,
    category: 'nederland-aandelen',
    alternatives: [
      {
        isin: 'NL0009272749',
        name: 'Think AEX UCITS ETF',
        ter: 0.30,
        provider: 'Think ETFs (VanEck)',
        note: 'Volgt de AEX-index, beschikbaar bij alle grote brokers',
      },
      {
        isin: 'IE00BZ0PKS76',
        name: 'iShares AEX UCITS ETF',
        ter: 0.30,
        provider: 'iShares',
        note: 'AEX-tracker, beschikbaar op Euronext Amsterdam',
      },
    ],
  },
  {
    isin: 'NL0000289783',
    name: 'ING Dutch Fund',
    ter: 0.75,
    category: 'nederland-aandelen',
    alternatives: [
      {
        isin: 'NL0009272749',
        name: 'Think AEX UCITS ETF',
        ter: 0.30,
        provider: 'Think ETFs (VanEck)',
        note: 'Volgt de AEX-index, beschikbaar bij alle grote brokers',
      },
    ],
  },

  // ─── Obligaties ──────────────────────────────────────────

  {
    isin: 'NL0006311821',
    name: 'ABN AMRO Obligatie Fonds',
    ter: 0.85,
    category: 'obligaties',
    alternatives: [
      {
        isin: 'IE00B4WXJJ64',
        name: 'iShares Core Euro Government Bond UCITS ETF',
        ter: 0.09,
        provider: 'iShares',
        note: 'Euro-staatsobligaties, zeer lage kosten',
      },
      {
        isin: 'IE00BZ163H91',
        name: 'Vanguard EUR Eurozone Government Bond UCITS ETF',
        ter: 0.07,
        provider: 'Vanguard',
        note: 'Laagste TER voor euro-staatsobligaties',
      },
    ],
  },
  {
    isin: 'NL0000292316',
    name: 'ING Euro Obligatie Fonds',
    ter: 0.60,
    category: 'obligaties',
    alternatives: [
      {
        isin: 'IE00BZ163H91',
        name: 'Vanguard EUR Eurozone Government Bond UCITS ETF',
        ter: 0.07,
        provider: 'Vanguard',
        note: 'Laagste TER voor euro-staatsobligaties',
      },
      {
        isin: 'IE00B4WXJJ64',
        name: 'iShares Core Euro Government Bond UCITS ETF',
        ter: 0.09,
        provider: 'iShares',
        note: 'Euro-staatsobligaties, breed gespreid',
      },
    ],
  },
  {
    isin: 'LU0703244715',
    name: 'Rabobank Obligatiefonds Euro',
    ter: 0.55,
    category: 'obligaties',
    alternatives: [
      {
        isin: 'IE00BZ163H91',
        name: 'Vanguard EUR Eurozone Government Bond UCITS ETF',
        ter: 0.07,
        provider: 'Vanguard',
        note: 'Laagste TER voor euro-staatsobligaties',
      },
      {
        isin: 'IE00B3VTML14',
        name: 'iShares Core Euro Corporate Bond UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Bedrijfsobligaties euro, iets hoger rendement',
      },
    ],
  },
  {
    isin: 'NL0006311839',
    name: 'ABN AMRO Euro Bedrijfsobligatie Fonds',
    ter: 0.90,
    category: 'obligaties',
    alternatives: [
      {
        isin: 'IE00B3VTML14',
        name: 'iShares Core Euro Corporate Bond UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Euro bedrijfsobligaties, lage kosten',
      },
    ],
  },

  // ─── Vastgoed ────────────────────────────────────────────

  {
    isin: 'NL0006311847',
    name: 'ABN AMRO Vastgoed Aandelen Fonds',
    ter: 1.25,
    category: 'vastgoed',
    alternatives: [
      {
        isin: 'NL0009690239',
        name: 'Think Global Real Estate UCITS ETF',
        ter: 0.40,
        provider: 'Think ETFs (VanEck)',
        note: 'Wereldwijd vastgoed, beursgenoteerd op Euronext',
      },
      {
        isin: 'IE00B1FZS350',
        name: 'iShares Developed Markets Property Yield UCITS ETF',
        ter: 0.59,
        provider: 'iShares',
        note: 'Breed gespreid vastgoed ontwikkelde markten',
      },
    ],
  },
  {
    isin: 'NL0000292332',
    name: 'ING Vastgoed Aandelen Fonds',
    ter: 0.80,
    category: 'vastgoed',
    alternatives: [
      {
        isin: 'NL0009690239',
        name: 'Think Global Real Estate UCITS ETF',
        ter: 0.40,
        provider: 'Think ETFs (VanEck)',
        note: 'Wereldwijd vastgoed, beursgenoteerd op Euronext',
      },
      {
        isin: 'IE00B1FZS350',
        name: 'iShares Developed Markets Property Yield UCITS ETF',
        ter: 0.59,
        provider: 'iShares',
        note: 'Breed gespreid vastgoed ontwikkelde markten',
      },
    ],
  },
  {
    isin: 'NL0000290468',
    name: 'Rabobank Vastgoedfonds',
    ter: 0.70,
    category: 'vastgoed',
    alternatives: [
      {
        isin: 'NL0009690239',
        name: 'Think Global Real Estate UCITS ETF',
        ter: 0.40,
        provider: 'Think ETFs (VanEck)',
        note: 'Wereldwijd vastgoed, beursgenoteerd op Euronext',
      },
    ],
  },

  // ─── Opkomende Markten ───────────────────────────────────

  {
    isin: 'NL0006311854',
    name: 'ABN AMRO Opkomende Markten Aandelen Fonds',
    ter: 1.40,
    category: 'opkomende-markten',
    alternatives: [
      {
        isin: 'NL0011515440',
        name: 'Northern Trust Emerging Markets Custom ESG Equity Index Fund',
        ter: 0.25,
        provider: 'Northern Trust',
        note: 'Beschikbaar via ABN AMRO Zelf Beleggen Basis',
      },
      {
        isin: 'IE00BKM4GZ66',
        name: 'iShares Core MSCI EM IMI UCITS ETF',
        ter: 0.18,
        provider: 'iShares',
        note: 'Inclusief small-caps, breed gespreid, laagste TER',
      },
      {
        isin: 'IE00BK5BR733',
        name: 'Vanguard FTSE Emerging Markets UCITS ETF',
        ter: 0.22,
        provider: 'Vanguard',
        note: 'Beschikbaar bij alle grote brokers',
      },
    ],
  },
  {
    isin: 'NL0000292340',
    name: 'ING Emerging Markets Fonds',
    ter: 0.95,
    category: 'opkomende-markten',
    alternatives: [
      {
        isin: 'IE00BKM4GZ66',
        name: 'iShares Core MSCI EM IMI UCITS ETF',
        ter: 0.18,
        provider: 'iShares',
        note: 'Laagste TER voor opkomende markten',
      },
      {
        isin: 'IE00BK5BR733',
        name: 'Vanguard FTSE Emerging Markets UCITS ETF',
        ter: 0.22,
        provider: 'Vanguard',
        note: 'Beschikbaar bij alle grote brokers',
      },
    ],
  },
  {
    isin: 'LU0703244806',
    name: 'Rabobank Emerging Markets Equities',
    ter: 1.05,
    category: 'opkomende-markten',
    alternatives: [
      {
        isin: 'IE00BKM4GZ66',
        name: 'iShares Core MSCI EM IMI UCITS ETF',
        ter: 0.18,
        provider: 'iShares',
        note: 'Laagste TER voor opkomende markten',
      },
      {
        isin: 'NL0011515440',
        name: 'Northern Trust Emerging Markets Custom ESG Equity Index Fund',
        ter: 0.25,
        provider: 'Northern Trust',
        note: 'ESG-variant, beschikbaar via grote banken',
      },
    ],
  },

  // ─── Duurzaam ────────────────────────────────────────────

  {
    isin: 'NL0006311862',
    name: 'ABN AMRO Duurzaam Wereld Aandelen Fonds',
    ter: 1.30,
    category: 'duurzaam',
    alternatives: [
      {
        isin: 'NL0011225305',
        name: 'Northern Trust World Custom ESG Equity Index Fund',
        ter: 0.15,
        provider: 'Northern Trust',
        note: 'Al ESG-gefilterd, beschikbaar via ABN AMRO',
      },
      {
        isin: 'IE00BYX2JD69',
        name: 'iShares MSCI World SRI UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'SRI-filter (strenger dan ESG), beschikbaar bij alle grote brokers',
      },
    ],
  },
  {
    isin: 'NL0010408242',
    name: 'ING Duurzaam Rendement Fonds',
    ter: 0.78,
    category: 'duurzaam',
    alternatives: [
      {
        isin: 'IE00BYX2JD69',
        name: 'iShares MSCI World SRI UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'SRI-filter, beschikbaar bij alle grote brokers',
      },
      {
        isin: 'NL0011225305',
        name: 'Northern Trust World Custom ESG Equity Index Fund',
        ter: 0.15,
        provider: 'Northern Trust',
        note: 'ESG-gefilterd, beschikbaar via grote banken',
      },
    ],
  },
  {
    isin: 'NL0012287515',
    name: 'Meesman Wereldwijd Totaal',
    ter: 0.50,
    category: 'wereld-aandelen',
    alternatives: [
      {
        isin: 'NL0011225305',
        name: 'Northern Trust World Custom ESG Equity Index Fund',
        ter: 0.15,
        provider: 'Northern Trust',
        note: 'Zelfde onderliggende fondsen, lagere kosten als je zelf koopt',
      },
      {
        isin: 'IE00BK5BQT80',
        name: 'Vanguard FTSE All-World UCITS ETF (Acc)',
        ter: 0.22,
        provider: 'Vanguard',
        note: 'All-world ETF, vereist zelf-beleggen account',
      },
    ],
  },

  // ─── Mixed / Profielfondsen ──────────────────────────────

  {
    isin: 'NL0006311805',
    name: 'ABN AMRO Profielfonds 4',
    ter: 1.15,
    category: 'mixed',
    alternatives: [
      {
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Combineer 60% aandelen + 40% obligatie-ETF voor vergelijkbaar profiel',
      },
      {
        isin: 'IE00BK5BQT80',
        name: 'Vanguard FTSE All-World UCITS ETF (Acc)',
        ter: 0.22,
        provider: 'Vanguard',
        note: 'Mix zelf naar gewenste aandelen/obligatie verhouding',
      },
    ],
  },
  {
    isin: 'LU0703245019',
    name: 'Rabobank Beheerd Beleggen Groei',
    ter: 0.95,
    category: 'mixed',
    alternatives: [
      {
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Zelf samenstellen bespaart 0.75% per jaar',
      },
      {
        isin: 'IE00BK5BQT80',
        name: 'Vanguard FTSE All-World UCITS ETF (Acc)',
        ter: 0.22,
        provider: 'Vanguard',
        note: 'Breed gespreid, lage kosten',
      },
    ],
  },
  {
    isin: 'LU0703244988',
    name: 'Rabobank Beheerd Beleggen Neutraal',
    ter: 0.90,
    category: 'mixed',
    alternatives: [
      {
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Combineer 50/50 met obligatie-ETF voor neutraal profiel',
      },
    ],
  },
  {
    isin: 'NL0000293314',
    name: 'ING Global Index Portfolio Neutraal',
    ter: 0.65,
    category: 'mixed',
    alternatives: [
      {
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        ter: 0.20,
        provider: 'iShares',
        note: 'Combineer met obligatie-ETF naar gewenste risicoverhouding',
      },
      {
        isin: 'IE00BZ163H91',
        name: 'Vanguard EUR Eurozone Government Bond UCITS ETF',
        ter: 0.07,
        provider: 'Vanguard',
        note: 'Obligatiedeel — combineer met aandelen-ETF',
      },
    ],
  },
]

// ── Lookup index (gebouwd bij import) ────────────────────────

const _byIsin = new Map<string, FundMapping>()
const _byTicker = new Map<string, FundMapping>()

for (const fund of FUND_MAPPINGS) {
  _byIsin.set(fund.isin.toUpperCase(), fund)
  if (fund.ticker) {
    _byTicker.set(fund.ticker.toUpperCase(), fund)
  }
}

// ── Public API ───────────────────────────────────────────────

export interface FindAlternativesResult {
  /** Het gevonden originele fonds */
  fund: FundMapping
  /** De goedkopere alternatieven */
  alternatives: Alternative[]
  /** Potentiele jaarlijkse besparing in basispunten (bps) ten opzichte van goedkoopste alternatief */
  besparingBps: number
}

/**
 * Zoek goedkopere alternatieven voor een fonds.
 *
 * Zoekstrategie:
 * 1. Exact match op ISIN (case-insensitive)
 * 2. Exact match op ticker (case-insensitive)
 * 3. Fuzzy match op naam (case-insensitive, includes)
 *
 * @returns Array van resultaten (meerdere bij fuzzy naam-match), leeg als niets gevonden.
 */
export function findAlternatives(options: {
  isin?: string
  ticker?: string
  name?: string
}): FindAlternativesResult[] {
  const { isin, ticker, name } = options

  // 1. Exact ISIN match
  if (isin) {
    const fund = _byIsin.get(isin.toUpperCase())
    if (fund) {
      return [toResult(fund)]
    }
  }

  // 2. Exact ticker match
  if (ticker) {
    const fund = _byTicker.get(ticker.toUpperCase())
    if (fund) {
      return [toResult(fund)]
    }
  }

  // 3. Fuzzy name match (case-insensitive includes)
  if (name) {
    const needle = name.toLowerCase()
    const matches = FUND_MAPPINGS.filter((f) =>
      f.name.toLowerCase().includes(needle) || needle.includes(f.name.toLowerCase()),
    )
    if (matches.length > 0) {
      return matches.map(toResult)
    }
  }

  return []
}

/**
 * Zoek alle fondsen in een bepaalde categorie.
 */
export function findByCategory(category: FundCategory): FundMapping[] {
  return FUND_MAPPINGS.filter((f) => f.category === category)
}

/**
 * Bereken de jaarlijkse besparing bij overstap naar het goedkoopste alternatief.
 *
 * @param currentTer - TER van het huidige fonds (percentage, bijv. 1.15)
 * @param portfolioValue - Belegd vermogen in EUR
 * @returns Geschatte jaarlijkse besparing in EUR
 */
export function berekenJaarlijkseBesparing(
  currentTer: number,
  cheapestAlternativeTer: number,
  portfolioValue: number,
): number {
  const verschilPct = currentTer - cheapestAlternativeTer
  if (verschilPct <= 0) return 0
  return Math.round((verschilPct / 100) * portfolioValue)
}

// ── Helpers ──────────────────────────────────────────────────

function toResult(fund: FundMapping): FindAlternativesResult {
  const cheapestTer = Math.min(...fund.alternatives.map((a) => a.ter))
  return {
    fund,
    alternatives: fund.alternatives,
    besparingBps: Math.round((fund.ter - cheapestTer) * 100),
  }
}
