'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HousingStrategySection } from '@/components/future/strategie/housing-strategy-section'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { ManagedStrategy } from '@/lib/strategy-events'
import type { LifeEvent } from '@/lib/horizon-data'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { HousingPreviewData } from '@/lib/housing-trigger'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { StrategieModalShell, StrategieFooter } from './strategie-modal-shell'
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
  /** Huidige leeftijd uit DOB (null = onbekend) — basis voor de Werk-strategie
   *  én het indexatie-anker van de pensioen-projectiegrafiek. */
  currentAge: number | null
  /** Inflatievoet uit resolveFireParams (fractie, bv. 0.02) — indexatie van de
   *  pensioen-projectiegrafiek. Geen hardcoded percentage in de UI. */
  inflationRate: number
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
  autoOpenJaarruimte,
  snapshot = null,
}: {
  open: ManagedStrategy | null
  onClose: () => void
  events: LifeEvent[]
  data: StrategieEditorsData
  readOnly?: boolean
  /** S6 — geopend via `?strategie=pensioen` vanaf de factor-A-verwijzing op
   *  Box 1: dan staat de jaarruimte-/factor-A-uitvraag meteen open. */
  autoOpenJaarruimte?: boolean
  /**
   * ADR 0179 fase 3 (§7.7) — client-veilige snapshot. Gezet = elke editor toont de
   * verschilregel uit de kern-run in zijn footer (AOW/Werk/Pensioen via een
   * `lifeEvent`-override, Huis via `housingStrategyConfig`) — dezelfde runs als de wizard.
   */
  snapshot?: RegelSimSnapshot | null
}) {

  if (open === 'aow') {
    const aowEvent = events.find((e) => e.event_type === 'aow') ?? null
    return (
      <AowStrategieEditor
        snapshot={snapshot}
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
        snapshot={snapshot}
        pensionEvents={pensionEvents}
        allEvents={events}
        baseline={data.baseline}
        dailyExpenses={data.dailyExpenses}
        aowAge={aowAge}
        grossYearlyIncome={data.grossYearlyIncome}
        pensioenFactorA={data.pensioenFactorA}
        currentAge={data.currentAge}
        inflationRate={data.inflationRate}
        samenwonend={samenwonend}
        autoOpenJaarruimte={autoOpenJaarruimte}
        onClose={onClose}
        readOnly={readOnly}
      />
    )
  }

  if (open === 'werk') {
    const werkEvent = events.find((e) => e.event_type === 'werk') ?? null
    return (
      <WerkStrategieEditor
        snapshot={snapshot}
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
    return <HuisStrategieEditor onClose={onClose} preview={data.housingPreview} snapshot={snapshot} readOnly={readOnly} />
  }

  return null
}

/**
 * Host van de Huis-strategie: `HousingStrategySection` in host-modus, zodat Opslaan en de
 * verschilregel in de sheet-footer staan (net als bij AOW, Werk en Pensioen).
 */
function HuisStrategieEditor({
  onClose,
  preview,
  snapshot,
  readOnly,
}: {
  onClose: () => void
  preview: HousingPreviewData | null
  snapshot: RegelSimSnapshot | null
  readOnly?: boolean
}) {
  const router = useRouter()
  const [actions, setActions] = useState<RegelEditActionsState | null>(null)
  const handleActionsChange = useCallback((next: RegelEditActionsState) => setActions(next), [])
  return (
    <StrategieModalShell
      open
      onClose={onClose}
      title="Huis-strategie"
      intro="Bepaal hoe je eigen woning meedoet in de FIRE-berekening. Een huis is geen liquide vermogen — je kunt er pas uit putten door te verkopen of een opeethypotheek af te sluiten."
      readOnly={readOnly}
      footer={
        readOnly ? undefined : (
          <StrategieFooter
            onCancel={onClose}
            onSave={() => actions?.save()}
            saving={actions?.saving}
            saveDisabled={actions ? !actions.canSave || !actions.changed : true}
            saveLabel="Huis-strategie opslaan"
            info={actions?.footerInfo}
          />
        )
      }
    >
      <HousingStrategySection
        showHeader={false}
        preview={preview}
        simSnapshot={snapshot}
        onActionsChange={handleActionsChange}
        onSaved={() => {
          onClose()
          router.refresh()
        }}
      />
    </StrategieModalShell>
  )
}
