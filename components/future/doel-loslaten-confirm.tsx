'use client'

import { ShellOverlay } from '@/components/app/shell/shell-overlay'

/**
 * DoelLoslatenConfirm — gedeelde bevestiging voor "Doelsituatie loslaten".
 *
 * Ronde 4-extractie: één presentational component zodat /toekomst/doelen
 * (DoelenView) én de horizon-tijdas (horizon-client) BYTE-visueel dezelfde
 * destructieve ShellOverlay-confirm + copy tonen. De loslaten-flow zelf
 * (server-call, toast/router.refresh, state) blijft bij de consumer:
 *  - `busy`   : disable de knoppen + toon "Loslaten…" tijdens de PUT.
 *  - `error`  : inline foutregel (DoelenView); consumers die toasts gebruiken
 *               geven "" mee zodat er geen regel verschijnt.
 *  - `onConfirm` : draait de loslaten-flow.
 *  - `onClose`   : sluit de confirm (genegeerd zolang `busy`).
 */
export function DoelLoslatenConfirm({
  open,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean
  busy: boolean
  error: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <ShellOverlay
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      kind="confirm"
      destructive
      title="Doelsituatie loslaten"
    >
      <div className="p-6">
        <p className="text-sm text-[var(--ink-2)] leading-relaxed">
          Je laat je vastgelegde doelsituatie los. Alle parameter-doelen
          (spaarquote, salaris, rendement en je vrijheidsleeftijd) verdwijnen
          uit deze lijst. Je aannames blijven bewaard in het lab — je kunt ze
          later opnieuw vastleggen.
        </p>
        {error && (
          <p className="mt-3 text-sm text-negative">{error}</p>
        )}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-negative px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Loslaten…' : 'Loslaten'}
          </button>
        </div>
      </div>
    </ShellOverlay>
  )
}
