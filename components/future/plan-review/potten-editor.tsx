'use client'

/**
 * Stap 5 "Hoe je potten werken" inline in de plan-review (TPR-15).
 *
 * Deze stap dekt vier bestaande regels van /toekomst/voorkeuren: het onttrekkingsprofiel
 * en de drie pot-regels. Hier kies je welke je aanpast; daaronder rendert de BESTAANDE
 * body uit `REGEL_BODIES` — dezelfde component, dezelfde schrijfroute
 * (`/api/withdrawal-strategy` of `/api/pot-rules`) en hetzelfde host-contract als in
 * `RegelBewerkenPane`. Eén regel tegelijk, zoals daar: wisselen laat een niet-opgeslagen
 * concept van de vorige regel vallen.
 */

import { useState } from 'react'
import { REGEL_META, type RegelId } from '@/lib/future/regel-registry'
import { REGEL_BODIES } from '@/components/future/regels'
import type { PlanReviewEditorProps } from './editors'

/** De regels van stap 5, in de volgorde van de Voorkeuren-pagina. */
export const POTTEN_REGELS = [
  'onttrekkingsstrategie',
  'verdeling-toename',
  'onttrekkingsvolgorde',
  'onttrekking-afname',
] as const satisfies readonly RegelId[]

type PottenRegel = (typeof POTTEN_REGELS)[number]

/** De wizard sluit niet bij opslaan: de host beslist wat er daarna gebeurt. */
const blijfOpen = () => {}

export function PottenEditor({ context, onActionsChange, onSaved }: PlanReviewEditorProps) {
  const [regel, setRegel] = useState<PottenRegel>('onttrekkingsstrategie')
  const Body = REGEL_BODIES[regel]

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Welke regel pas je aan" className="flex flex-wrap gap-1.5">
        {POTTEN_REGELS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setRegel(id)}
            aria-pressed={regel === id}
            className={`inline-flex min-h-[44px] items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
              regel === id
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:text-[var(--ink)]'
            }`}
          >
            {REGEL_META[id].title}
          </button>
        ))}
      </div>

      <Body
        key={regel}
        onActionsChange={onActionsChange}
        onClose={blijfOpen}
        onSaved={onSaved}
        simSnapshot={context.snapshot}
        fireStrategy={context.snapshot?.fireStrategy}
        firePlan={context.firePlan}
        withdrawalStrategy={context.snapshot?.withdrawalStrategy}
        potRules={context.potRules ?? undefined}
        potBalances={context.potBalances ?? undefined}
      />
    </div>
  )
}
