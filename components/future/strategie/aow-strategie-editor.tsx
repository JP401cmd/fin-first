'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { StrategieModalShell, StrategieFooter } from './strategie-modal-shell'
import { AowStrategieBody } from './aow-strategie-body'
import type { StrategieImpactBron } from './strategie-impact'

interface Props {
  /** Bestaande AOW-rij (event_type='aow') of null wanneer nog niet aangemaakt. */
  event: LifeEvent | null
  /** Alle huidige events (voor de live vrijheidsleeftijd-preview). */
  allEvents: LifeEvent[]
  baseline: PreviewBaseline | null
  /**
   * ADR 0179 fase 3 (§7.7) — client-veilige snapshot. Gezet = het effect komt uit de kern-run
   * met een `lifeEvent`-override (zoals de wizard) en staat als verschilregel in de footer;
   * zonder snapshot de oude `preview`-regel in het formulier.
   */
  snapshot?: RegelSimSnapshot | null
  /** Dagelijkse must-uitgaven, voor vrijheid-tijd framing. */
  dailyExpenses: number
  aowRows: AowLeeftijdRow[]
  dateOfBirth: string | null
  onClose: () => void
  readOnly?: boolean
}

/** Modal-host van de AOW-strategie: chrome + footer rond `AowStrategieBody`. */
export function AowStrategieEditor({
  event,
  allEvents,
  baseline,
  snapshot = null,
  dailyExpenses,
  aowRows,
  dateOfBirth,
  onClose,
  readOnly,
}: Props) {
  const router = useRouter()
  const [actions, setActions] = useState<RegelEditActionsState | null>(null)

  const impact = useMemo<StrategieImpactBron>(
    () => (snapshot ? { kind: 'kern', snapshot } : { kind: 'preview', baseline, allEvents }),
    [snapshot, baseline, allEvents],
  )

  const handleSaved = useCallback(() => {
    onClose()
    router.refresh()
  }, [onClose, router])

  return (
    <StrategieModalShell
      open
      onClose={onClose}
      title="AOW-strategie"
      intro="AOW levert je tijd op — gegarandeerde vrijheid vanaf je pensioenleeftijd."
      readOnly={readOnly}
      footer={
        readOnly ? undefined : (
          <StrategieFooter
            onCancel={onClose}
            onSave={() => actions?.save()}
            saving={actions?.saving}
            saveDisabled={actions ? !actions.canSave : false}
            saveLabel="AOW opslaan"
            info={actions?.footerInfo}
          />
        )
      }
    >
      <AowStrategieBody
        event={event}
        impact={impact}
        dailyExpenses={dailyExpenses}
        aowRows={aowRows}
        dateOfBirth={dateOfBirth}
        readOnly={readOnly}
        onActionsChange={setActions}
        onSaved={handleSaved}
      />
    </StrategieModalShell>
  )
}
