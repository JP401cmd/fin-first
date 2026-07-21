import { DEFAULT_RETURN, DEFAULT_VOLATILITY, INFLATION } from './constants'
import { CURRENT_TAX_YEAR } from './box3-data'

/**
 * FIRE-marktaannames — jaargelaagde override-laag (Optie 2: DB-override met
 * TS-fallback).
 *
 * Puur + synchroon, exact volgens het `lookupAowAge`-scheidingsprincipe:
 * de CALLER queryt de `fire_assumptions`-tabel, de RESOLVER consumeert de reeds
 * gequerierde rijen. Geen DB-toegang hier — zo blijft de functie testbaar en
 * bruikbaar in elke laag (loader, adapter, unit test).
 *
 * Bij een ontbrekende of lege jaarrij valt de resolver terug op de canonieke
 * TS-constanten in `lib/constants.ts` (`DEFAULT_RETURN` / `INFLATION` /
 * `DEFAULT_VOLATILITY`). Een lege tabel geeft dus 100% de oude waarden terug —
 * byte-identiek gedrag zolang beheer geen jaarlaag heeft gezet.
 *
 * SWR wordt hier bewust NIET geresolveerd: SWR = rendement − Box 3-drag − inflatie
 * blijft puur afgeleid via `computeEffectiveSwr` (lib/fire-params.ts) en beweegt
 * mee met alle drie. Deze resolver levert alleen de drie invoer-aannames.
 */

/**
 * Eén rij uit de `fire_assumptions`-tabel zoals PostgREST 'm teruggeeft.
 * NB: `numeric`-kolommen komen bij PostgREST als JSON-STRING terug (precisie-
 * behoud) — de resolver cast daarom expliciet met `Number(...)` vóór gebruik.
 */
export interface FireAssumptionRow {
  year: number
  expected_return: number | string
  inflation: number | string
  volatility: number | string
  source?: string | null
  is_definitive?: boolean
}

/** De geresolveerde aannames (decimalen, bv. 0.07 = 7%). */
export interface FireAssumptions {
  expectedReturn: number
  inflation: number
  volatility: number
}

/**
 * Los de FIRE-marktaannames op voor een jaar uit een reeds-gequerierde set rijen.
 * Val terug op de TS-constanten bij een ontbrekende jaarrij of een niet-eindige
 * (corrupte) waarde per veld.
 */
export function resolveFireAssumptions(
  rows: readonly FireAssumptionRow[] | null | undefined,
  year: number = CURRENT_TAX_YEAR,
): FireAssumptions {
  const fallback: FireAssumptions = {
    expectedReturn: DEFAULT_RETURN,
    inflation: INFLATION,
    volatility: DEFAULT_VOLATILITY,
  }
  if (!rows || rows.length === 0) return fallback

  const match = rows.find((r) => Number(r.year) === year)
  if (!match) return fallback

  // PostgREST levert numeric als string — cast per veld en houd de TS-fallback
  // aan wanneer een waarde ontbreekt of niet-eindig is (defensief tegen corrupte
  // rijen; nooit een NaN de projectie in laten lekken).
  const expectedReturn = Number(match.expected_return)
  const inflation = Number(match.inflation)
  const volatility = Number(match.volatility)

  return {
    expectedReturn: Number.isFinite(expectedReturn) ? expectedReturn : fallback.expectedReturn,
    inflation: Number.isFinite(inflation) ? inflation : fallback.inflation,
    volatility: Number.isFinite(volatility) ? volatility : fallback.volatility,
  }
}
