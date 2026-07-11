/**
 * Laagste belegbare buffer over een projectie — pure afleiding voor de /toekomst-
 * "laagste buffer"-indicator (ronde 3).
 *
 * PURE consume-laag: leest UITSLUITEND `spendablePortfolio(row)` (de canonieke
 * "belegbaar/duurzaam-opneembaar per rij"-grondslag uit `lib/horizon/coverage-strip.ts`)
 * over de gegeven jaarrijen en levert het dieptepunt + de leeftijd waar dat valt.
 * Geen eigen rekenmotor, geen financiële constanten — dezelfde grondslag als de
 * dekkingsradar en de levensinkomenstrook.
 */

import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { spendablePortfolio } from '@/lib/horizon/coverage-strip'

/** Het dieptepunt van het belegbaar vermogen over de projectie. */
export interface LaagsteBuffer {
  /** Laagste waarde van `spendablePortfolio` over de rijen (€). */
  bedrag: number
  /** Leeftijd van de rij waar dat minimum valt. */
  age: number
}

/**
 * Minimum van `spendablePortfolio` over alle rijen + de leeftijd waar het valt.
 * Bij gelijke minima wint de EERSTE (laagste leeftijd) — het vroegste dieptepunt is
 * het relevante risicomoment. Lege `rows` → `null`.
 */
export function computeLaagsteBuffer(rows: readonly UnifiedProjectionRow[]): LaagsteBuffer | null {
  if (rows.length === 0) return null

  let bedrag = spendablePortfolio(rows[0])
  let age = rows[0].age
  for (let i = 1; i < rows.length; i++) {
    const v = spendablePortfolio(rows[i])
    if (v < bedrag) {
      bedrag = v
      age = rows[i].age
    }
  }
  return { bedrag, age }
}
