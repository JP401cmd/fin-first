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
import { WerkStrategieEditor } from './werk-strategie-editor'

export interface StrategieEditorsData {
  baseline: PreviewBaseline | null
  dailyExpenses: number
  aowRows: AowLeeftijdRow[]
  dateOfBirth: string | null
  grossYearlyIncome: number
  /** Factor A (jaarlijkse pensioenaangroei uit UPO) uit de loader-bundel —
   *  voor de jaarruimte-schatting in de pensioen-editor. 0 = niet ingevuld. */
  pensioenFactorA: number
  /** Huidige leeftijd uit DOB (null = onbekend) — basis voor de Werk-strategie. */
  currentAge: number | null
  /** Huidig netto maandinkomen (prefill Werk-strategie). */
  currentNetMonthly: number
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
    // Woonsituatie voor de AOW-hoogte bij de JSON-import van mijnpensioen.nl.
    // Bron = de canonieke AOW-as: metadata.leefsituatie op het bestaande
    // aow-event (dezelfde as die de AOW-strategie-editor zet). Ontbreekt die,
    // dan default samenwonend (verreweg de meest voorkomende situatie).
    const aowEvent = events.find((e) => e.event_type === 'aow')
    const aowLeefsituatie = aowEvent?.metadata?.leefsituatie
    const samenwonend = aowLeefsituatie !== 'alleenstaand'
    return (
      <PensioenStrategieEditor
        pensionEvents={pensionEvents}
        allEvents={events}
        baseline={data.baseline}
        dailyExpenses={data.dailyExpenses}
        aowAge={aowAge}
        grossYearlyIncome={data.grossYearlyIncome}
        pensioenFactorA={data.pensioenFactorA}
        samenwonend={samenwonend}
        onClose={onClose}
        readOnly={readOnly}
      />
    )
  }

  if (open === 'werk') {
    const werkEvent = events.find((e) => e.event_type === 'werk') ?? null
    return (
      <WerkStrategieEditor
        event={werkEvent}
        allEvents={events}
        baseline={data.baseline}
        dailyExpenses={data.dailyExpenses}
        currentAge={data.currentAge}
        currentNetMonthly={data.currentNetMonthly}
        aowAge={Math.ceil(lookupAowAge(data.aowRows, data.dateOfBirth).fractional)}
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
