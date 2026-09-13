'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { VoorkeurBewerkenBody, type VoorkeurBewerkenBodyProps } from './voorkeur-bewerken-body'

/**
 * VoorkeurBewerkenSheet — generieke inline-editor voor één markt-aanname.
 * Gebruikt vanuit de markt-aannames op /toekomst/voorkeuren én vanuit de
 * rendement-chip op de fiscale optimizer.
 *
 * De editor zelf is `VoorkeurBewerkenBody` (TPR-15: dezelfde body rendert ook in de
 * plan-review); deze sheet is de host — overlay, footer en het sluitpad.
 *
 * router.refresh() trigt de horizon-kernel om te herrekenen — de VoorkeurenView
 * toont meteen de nieuwe waarde, de tijdas-grafiek + briefing bewegen mee, en de
 * fiscale optimizer herberekent server-side zijn scenario's met de nieuwe aanname.
 */
export function VoorkeurBewerkenSheet({
  open = true,
  onClose,
  ...bodyProps
}: Omit<VoorkeurBewerkenBodyProps, 'onActionsChange' | 'onSaved'> & {
  /**
   * Of de sheet open staat. Geef 'm expliciet mee en houd de component GEMOUNT
   * (`<Sheet open={x} />`, niet `{x && <Sheet />}`): de focus-trap herstelt de
   * focus naar het openende element in de cleanup van zijn actief-effect, en
   * die tak draait alleen bij een open→dicht-overgang. Bij conditioneel mounten
   * verdwijnt de trap ineens en landt een toetsenbordgebruiker op `<body>`.
   * Default true voor bestaande call-sites die al conditioneel mounten.
   */
  open?: boolean
  onClose: () => void
}) {
  const [actions, setActions] = useState<RegelEditActionsState | null>(null)
  const router = useRouter()
  const saving = actions?.saving ?? false

  // Gepubliceerde save-state hoort bij één open-sessie van de body.
  useEffect(() => {
    if (!open) setActions(null)
  }, [open])

  const handleActionsChange = useCallback((next: RegelEditActionsState) => setActions(next), [])
  const handleSaved = useCallback(() => {
    setActions(null)
    onClose()
    router.refresh()
  }, [onClose, router])

  return (
    <ShellOverlay
      open={open}
      // Tijdens het opslaan is sluiten geblokkeerd. De busy-state woont in de body,
      // het sluitpad bij de ouder, en ShellOverlay vuurt onClose ongeconditioneerd
      // af bij Escape, backdrop-klik en ✕ — zonder deze guard kan een gebruiker
      // "annuleren" terwijl de PUT al onderweg is: die landt alsnog, en een
      // serverafwijzing zou op een ongemounte component worden gezet.
      onClose={saving ? () => {} : onClose}
      kind="sheet"
      size="sm"
      title="Voorkeur bewerken"
      footer={
        <ModalFooter
          primary={{ label: 'Opslaan', onClick: () => actions?.save(), loading: saving }}
          secondary={{ label: 'Annuleer', onClick: onClose }}
        />
      }
    >
      <VoorkeurBewerkenBody {...bodyProps} onActionsChange={handleActionsChange} onSaved={handleSaved} />
    </ShellOverlay>
  )
}
