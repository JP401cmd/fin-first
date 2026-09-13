'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import type { LifeEvent } from '@/lib/horizon-data'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { StrategieModalShell, StrategieFooter } from './strategie-modal-shell'
import { WerkStrategieBody } from './werk-strategie-body'
import { verwijderStrategie, type StrategieImpactBron } from './strategie-impact'

interface Props {
  /** Bestaande werk-rij (event_type='werk') of null wanneer nog niet aangemaakt. */
  event: LifeEvent | null
  /** Alle huidige events (voor de live vrijheidsleeftijd-preview). */
  allEvents: LifeEvent[]
  baseline: PreviewBaseline | null
  /** Dagelijkse must-uitgaven, voor vrijheid-tijd framing. */
  dailyExpenses: number
  /** Huidige leeftijd uit DOB (null = onbekend → editor defaultet naar 40 + waarschuwing). */
  currentAge: number | null
  /** Huidig netto maandinkomen (prefill). */
  currentNetMonthly: number
  /** Wettelijke AOW-leeftijd — mijlpaal voor de inkomenslijn-readout. */
  aowAge: number
  onClose: () => void
  readOnly?: boolean
}

/**
 * Modal-host van de Werk-strategie: chrome + footer rond `WerkStrategieBody`. Verwijderen
 * blijft hier (alleen de modal biedt het), met een eigen bezig- en foutstatus.
 */
export function WerkStrategieEditor({
  event,
  allEvents,
  baseline,
  dailyExpenses,
  currentAge,
  currentNetMonthly,
  aowAge,
  onClose,
  readOnly,
}: Props) {
  const router = useRouter()
  const [actions, setActions] = useState<RegelEditActionsState | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Opslaan en verwijderen sluiten elkaar uit, zoals toen ze één `saving`-vlag deelden.
  const busy = deleting || (actions?.saving ?? false)

  const impact = useMemo<StrategieImpactBron>(() => ({ kind: 'preview', baseline, allEvents }), [baseline, allEvents])

  const handleSaved = useCallback(() => {
    onClose()
    router.refresh()
  }, [onClose, router])

  async function handleDelete() {
    if (!event) return
    setDeleting(true)
    setError(null)
    const fout = await verwijderStrategie(event.id)
    if (fout) {
      setError(`Verwijderen mislukt: ${fout}`)
      setDeleting(false)
      return
    }
    setDeleting(false)
    onClose()
    router.refresh()
  }

  return (
    <StrategieModalShell
      open
      onClose={onClose}
      title="Werk-strategie"
      intro="Je loopbaan is opgeslagen tijd in wording. Schets je inkomenslijn — groei, een plafond, minder werken — en zie wat het met je vrijheidsdatum doet. Elke euro die je extra verdient, spaar je volledig."
      error={error}
      readOnly={readOnly}
      footer={
        readOnly ? undefined : (
          <StrategieFooter
            onCancel={onClose}
            onSave={() => {
              setError(null)
              actions?.save()
            }}
            saving={busy}
            saveDisabled={actions ? !actions.canSave : false}
            saveLabel="Werk-strategie opslaan"
            leading={
              event ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs text-negative hover:underline disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Verwijder
                </button>
              ) : null
            }
          />
        )
      }
    >
      <WerkStrategieBody
        event={event}
        impact={impact}
        dailyExpenses={dailyExpenses}
        currentAge={currentAge}
        currentNetMonthly={currentNetMonthly}
        aowAge={aowAge}
        readOnly={readOnly}
        onActionsChange={setActions}
        onSaved={handleSaved}
      />
    </StrategieModalShell>
  )
}
