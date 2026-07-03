/**
 * EventPane-preview-projectie (FASE 6 stap 5A — kernel-only) — pure helper.
 *
 * De EventPane-delta-previews (`event-pane-view.tsx` / `event-pane-edit.tsx`) draaien twee
 * projecties (mét en zónder het bewerkte event) en tekenen daarvan de RIJEN + FIRE-leeftijd.
 * Deze helper routeert diezelfde run via DEZELFDE motorschakelaar als de hoofdgrafiek-hook
 * (`computeConvergentieProjection`), zodat previews en grafiek op één pagina nooit
 * verschillende motoren spreken — alleen levert deze helper de VOLLEDIGE `SimResult` (de
 * panes hebben de rijen nodig voor de impact-chart). Bij een kern-fout: een lege `SimResult`.
 *
 * Pure functie — geen React/Supabase/Date.now.
 */

import { type SimResult } from '@/lib/fire-simulation'
import { toSimResult } from '@/lib/unified-projection'
import { previewProjection, type PreviewBaseline } from '@/lib/strategy-preview'
import type { LifeEvent } from '@/lib/horizon-data'

/**
 * Lege `SimResult` bij een kern-fout óf zonder kernel-baseline (de panes tonen dan hun
 * lege staat — geen doorrekening beschikbaar). Geëxporteerd zodat de EventPanes dezelfde
 * degradatie kunnen tonen wanneer er geen `previewBaseline` (kernel-context) is.
 */
export const EMPTY_SIM_RESULT: SimResult = {
  rows: [],
  fireAge: null,
  fireAgeFractional: null,
  firePortfolioAtFire: 0,
  requiredFirePortfolio: 0,
  fireReachable: false,
  implicitWithdrawalRate: 0,
  classic25xTarget: 0,
  strategy: 'deplete',
  targetEndPortfolio: 0,
  displayEndAge: 0,
}

/**
 * Draai één EventPane-preview-projectie voor de gegeven events via de convergentie-router en
 * geef de volledige `SimResult` terug (rijen + FIRE-leeftijd).
 *
 * @param baseline de preview-baseline (rauwe kernel-context) uit horizon-client.
 * @param events   de event-set van deze run (baseline = zonder het bewerkte event; draft = mét).
 */
export function previewSimResult(baseline: PreviewBaseline, events: LifeEvent[]): SimResult {
  const result = previewProjection(baseline, events)
  return result ? toSimResult(result) : EMPTY_SIM_RESULT
}
