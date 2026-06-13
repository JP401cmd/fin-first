'use client'

import { useRouter } from 'next/navigation'
import { HousingStrategySection } from '@/components/identity/instellingen/housing-strategy-section'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { ManagedStrategy } from '@/lib/strategy-events'
import type { LifeEvent } from '@/lib/horizon-data'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { HousingPreviewData } from '@/lib/housing-trigger'
import { StrategieModalShell } from './strategie-modal-shell'
import { AowStrategieEditor } from './aow-strategie-editor'
import { PensioenStrategieEditor } from './pensioen-strategie-editor'

export interface StrategieEditorsData {
  baseline: PreviewBaseline | null
  dailyExpenses: number
  aowRows: AowLeeftijdRow[]
  dateOfBirth: string | null
  grossYearlyIncome: number
  /** Basis voor de live preview in de Huis-strategie-modal (null = geen preview). */
  housingPreview: HousingPreviewData | null
}

/**
 * Mount-switch voor de drie levensstrategie-editors. Rendert telkens precies
 * één editor (alleen wanneer geopend), elk met zijn eigen StrategieModalShell.
 */
export function StrategieEditors({
  open,
  onClose,
  events,
  data,
  readOnly,
}: {
  open: ManagedStrategy | null
  onClose: () => void
  events: LifeEvent[]
  data: StrategieEditorsData
  readOnly?: boolean
}) {
  const router = useRouter()

  if (open === 'aow') {
    const aowEvent = events.find((e) => e.event_type === 'aow') ?? null
    return (
      <AowStrategieEditor
        event={aowEvent}
        allEvents={events}
        baseline={data.baseline}
        dailyExpenses={data.dailyExpenses}
        aowRows={data.aowRows}
        dateOfBirth={data.dateOfBirth}
        onClose={onClose}
        readOnly={readOnly}
      />
    )
  }

  if (open === 'pensioen') {
    const pensionEvents = events.filter((e) => e.event_type === 'pension')
    const aowAge = Math.ceil(lookupAowAge(data.aowRows, data.dateOfBirth).fractional)
    return (
      <PensioenStrategieEditor
        pensionEvents={pensionEvents}
        allEvents={events}
        baseline={data.baseline}
        dailyExpenses={data.dailyExpenses}
        aowAge={aowAge}
        grossYearlyIncome={data.grossYearlyIncome}
        onClose={onClose}
        readOnly={readOnly}
      />
    )
  }

  if (open === 'huis') {
    return (
      <StrategieModalShell
        open
        onClose={onClose}
        title="Huis-strategie"
        intro="Bepaal hoe je eigen woning meedoet in de FIRE-berekening. Een huis is geen liquide vermogen — je kunt er pas uit putten door te verkopen of een opeethypotheek af te sluiten."
      >
        <HousingStrategySection
          showHeader={false}
          preview={data.housingPreview}
          onSaved={() => {
            onClose()
            router.refresh()
          }}
        />
      </StrategieModalShell>
    )
  }

  return null
}
