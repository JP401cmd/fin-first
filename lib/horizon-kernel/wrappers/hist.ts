/**
 * Horizon-kernel · wrapper **backtest (Hist)** — bewust een *stub*.
 *
 * In `Core calc v5.xlsm` is de Hist-tab **scaffolding zonder data**: `Hist!B2 = 0`
 * (backtest uit) en de jaarrendement-reeks `Hist!B4:B99` is **leeg** in alle 19
 * fixtures (`docs/horizon-oracle/structuur.md` §Hist; `verificatie.md`: "Backtest
 * (Hist) is scaffolding: reeks 1928-2023 zonder data, B2=0"). De Bez-rendement-
 * formule leest de reeks alleen als `AND(Hist!B2=1, ISNUMBER(hist))` — met een lege
 * reeks valt die tak altijd terug op het basisrendement. Er is dus **niets te
 * porten**: elk in het model doorgerekend pad negeert Hist.
 *
 * De echte historische backtest blijft **app-zijdig** (gap-besluit V11 in
 * `docs/horizon-excel-oracle-plan.md`: de app houdt zijn eigen rendementreeksen;
 * de Excel-Hist is bewust leeg). Deze module bouwt daarom géén dode simulatie-
 * logica — ze rapporteert alleen de inerte toestand van de Hist-invoer, zodat de
 * latere adapter/beheer-laag expliciet kan zien dat het oracle-model geen
 * backtest-data draagt.
 *
 * Pure functie: geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput } from '../types'

/** De (inerte) toestand van de Hist-backtest-invoer in het oracle-model. */
export interface HistBacktestState {
  /** Hist!B2 — backtest actief (in het model altijd `false`). */
  readonly actief: boolean
  /** Of de jaarrendement-reeks Hist!B4:B99 numerieke waarden bevat (in het model niet). */
  readonly reeksAanwezig: boolean
  /** Aantal gevulde jaarrendement-cellen (0 in het model). */
  readonly aantalJaren: number
}

/**
 * Inspecteer de Hist-invoer. Bewust géén simulatie: het oracle-model draagt geen
 * backtest-data, dus er valt niets te berekenen. Wanneer een toekomstige versie
 * de reeks wél vult (of `actief` aanzet) maakt deze functie dat expliciet
 * zichtbaar — dan pas is een echte backtest-port aan de orde.
 */
export function inspectHistBacktest(input: KernelInput): HistBacktestState {
  const reeks = input.onzekerheid.hist.rendementReeks
  const gevuld = reeks.filter((v): v is number => typeof v === 'number')
  return {
    actief: input.onzekerheid.hist.actief,
    reeksAanwezig: gevuld.length > 0,
    aantalJaren: gevuld.length,
  }
}
