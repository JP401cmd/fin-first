// Verplaatst uit components/app/horizon/horizon-client.tsx r6508–6538 @ c1b4849eb (fase 1, ADR 0179).
'use client'

import { AlertTriangle } from 'lucide-react'

/**
 * Blok H — de profielfout-melding onder de KPI-rij: de profielquery mislukte en de
 * grafiek draait op standaardwaarden.
 *
 * Fase 2 (spec §4.8/§4.9, één signaal op de plek waar de melding woont): de actie
 * "Vul profiel aan" naar /mijn/profiel is hier weg. Ontbrekende gegevens meldt het
 * meldingenslot van katern Instellingen (`instellingen-gegevens`, met de actie naar
 * je profiel); de KPI-tegels houden hun waarde "We missen gegevens", want dat is de
 * weergave van de waarde zelf.
 */
export interface PlanGegevensmeldingProps {
  simError: string | null // horizon-client r1253
}

export function PlanGegevensmelding({ simError }: PlanGegevensmeldingProps) {
  if (!simError) return null
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="font-sans text-[12px] text-amber-700">
        Je profielgegevens konden niet worden geladen — de grafiek toont standaardwaarden. Probeer de pagina te verversen.
      </p>
    </div>
  )
}
