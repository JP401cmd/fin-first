'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import type { RegelEditActionsState } from './regels/types'
import type { Box3Method } from '@/lib/bucket-projection'
import { Box3MethodeBody } from './box3-methode-body'

// De kopij woont bij de body (één body, twee hosts); hier her-geëxporteerd voor bestaande imports.
export { BOX3_METHOD_INTRO, BOX3_METHOD_UITLEG, HEFFINGVRIJ_INKOMEN_UITLEG } from './box3-methode-body'

/**
 * Box3MethodeSheet — bewerkscherm voor `profiles.box3_method` (TPR-10) en, onder
 * werkelijk rendement, `profiles.box3_heffingvrij_inkomen` (TPR-12).
 *
 * De editor zelf is `Box3MethodeBody` (TPR-15: dezelfde body rendert ook in de
 * plan-review); deze sheet is de host — overlay, footer en het sluitpad.
 * `router.refresh()` laat de kernel herrekenen.
 */
export function Box3MethodeSheet({
  current,
  currentHeffingvrijInkomen = null,
  open = true,
  onClose,
}: {
  /** De nu opgeslagen methode (zoals `resolveFireParams` 'm leest). */
  current: Box3Method
  /** Opgeslagen heffingvrij inkomen (euro p.p. per jaar); null = kernel-default. */
  currentHeffingvrijInkomen?: number | null
  open?: boolean
  onClose: () => void
}) {
  const [actions, setActions] = useState<RegelEditActionsState | null>(null)
  const router = useRouter()
  const saving = actions?.saving ?? false

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
      // Zelfde guard als VoorkeurBewerkenSheet: sluiten is geblokkeerd zolang de PUT loopt.
      onClose={saving ? () => {} : onClose}
      kind="sheet"
      size="sm"
      title="Voorkeur bewerken"
      footer={
        <ModalFooter
          primary={{
            label: 'Opslaan',
            onClick: () => actions?.save(),
            loading: saving,
            disabled: !(actions?.changed ?? false),
          }}
          secondary={{ label: 'Annuleer', onClick: onClose }}
        />
      }
    >
      <Box3MethodeBody
        current={current}
        currentHeffingvrijInkomen={currentHeffingvrijInkomen}
        onActionsChange={handleActionsChange}
        onClose={onClose}
        onSaved={handleSaved}
      />
    </ShellOverlay>
  )
}
