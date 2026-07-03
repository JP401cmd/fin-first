/**
 * EventPane-preview-projectie (FASE 6, stap 1) — pure helper.
 *
 * De EventPane-delta-previews (`event-pane-view.tsx` / `event-pane-edit.tsx`)
 * draaien twee projecties (mét en zónder het bewerkte event) en tekenen daarvan
 * de RIJEN + FIRE-leeftijd. Historisch riepen ze `runSelectedProjection` los aan.
 * Deze helper routeert diezelfde run via DEZELFDE motorschakelaar als de
 * hoofdgrafiek-hook (`computeConvergentieProjection`), zodat previews en grafiek
 * op één pagina nooit verschillende motoren spreken.
 *
 * ## Byte-identiteit (harde eis)
 * Wanneer de kernel-vlag uit is (of er geen rauwe context is), draait de
 * convergentie-router LETTERLIJK `runSelectedProjection(input, useV2,
 * strategyOptions)` — byte-identiek aan het oude preview-pad. Vlag aan + context
 * aanwezig → de horizon-kernel met de events van deze preview-aanroep, exact zoals
 * `previewFireAge` (strategy-preview.ts) dat doet — alleen levert deze helper de
 * VOLLEDIGE `SimResult` (de panes hebben de rijen nodig voor de impact-chart).
 *
 * Pure functie — geen React/Supabase/Date.now.
 */

import { lifeEventsToCashflows, type SimResult } from '@/lib/fire-simulation'
import { toSimResult, type UnifiedProjectionInput } from '@/lib/unified-projection'
import { computeConvergentieProjection } from '@/lib/horizon-kernel/convergentie-router'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { LifeEvent } from '@/lib/horizon-data'

/**
 * Draai één EventPane-preview-projectie voor de gegeven events via de
 * convergentie-router en geef de volledige `SimResult` terug (rijen + FIRE-leeftijd).
 *
 * @param baseline de preview-baseline (incl. optionele kernel-context) uit horizon-client.
 * @param events   de event-set van deze run (baseline = zonder het bewerkte event; draft = mét).
 */
export function previewSimResult(baseline: PreviewBaseline, events: LifeEvent[]): SimResult {
  const input: UnifiedProjectionInput = {
    ...baseline.input,
    cashflows: lifeEventsToCashflows(events),
  }
  // Zelfde vlag-beslissing als de hoofdgrafiek-hook: alleen een letterlijke true
  // (én een aanwezige rauwe context) laat de preview via de kernel lopen.
  const kernelEnabled = baseline.kernelEnabled === true && !!baseline.kernelRawContext
  const outcome = computeConvergentieProjection({
    builtInput: input,
    strategyOptions: baseline.strategyOptions,
    v2FlagArg: baseline.useV2,
    kernelEnabled,
    rawContext: baseline.kernelRawContext
      ? {
          ...baseline.kernelRawContext,
          lifeEvents: events,
          yearlyExpenses: baseline.input.yearlyExpenses,
        }
      : undefined,
  })
  return toSimResult(outcome.result)
}
