'use client'

import { useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { Button } from '@/components/editorial/button'

/** Waar een account na het wisselen naartoe gaat: het Geheel-homescherm. */
export const NA_OVERSTAP_HREF = '/overzicht'

/**
 * Harde navigatie na het wisselen van product. Bewust geen `router.push`: de
 * gedeelde (app)-layout houdt de moduleset in de FeatureAccessProvider en
 * wordt bij een client-navigatie niet opnieuw gerenderd. Met een soft-push
 * ziet de `KrantRouteGuard` nog het oude product (alleen 'nieuws') en stuurt
 * /overzicht meteen terug naar /nieuws. Een volledige laadbeurt leest het
 * profiel opnieuw — daarna klopt de hele shell.
 */
function hardeNavigatie(href: string) {
  window.location.assign(href)
}

/**
 * De knop "Meer TriFinity" (Krant 2D fase 1, besluit B12) met zijn bevestiging.
 *
 * Klik → `<ShellOverlay kind="confirm">` → `PUT /api/modules { product: 'geheel' }`
 * → harde navigatie naar /overzicht. Er wordt niets gewist: de route schrijft
 * alleen `active_modules` en `home_screen` (app/api/modules/route.test.ts).
 *
 * TODO(Krant 2C): na 2C zet dezelfde PUT `onboarding_completed` terug op false
 * voor een account zonder de stap `'identity'` (besluit eigenaar 29 sep, keuze
 * 1); de layout stuurt de lezer dan vanzelf naar /onboarding. Voorvullen uit
 * het nieuwsprofiel en herkomst omzetten volgen ook in 2C. Deze knop hoeft
 * daarvoor niet te veranderen.
 */
export function MeerTriFinityKnop({
  navigeer = hardeNavigatie,
}: {
  /** Test-naad: de navigatie na een geslaagde overstap. */
  navigeer?: (href: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function bevestig() {
    if (bezig) return
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch('/api/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'geheel' }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof data.error === 'string' ? data.error : 'Aanzetten lukte niet.')
      }
      navigeer(NA_OVERSTAP_HREF)
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Aanzetten lukte niet.')
      setBezig(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Meer TriFinity</Button>

      <ShellOverlay
        kind="confirm"
        open={open}
        onClose={() => setOpen(false)}
        // Tijdens de aanvraag niet te sluiten: anders landt een fout in een al
        // gesloten venster en hoort de lezer nooit dat het niet lukte.
        onRequestClose={() => !bezig}
        title="Meer TriFinity aanzetten?"
        footer={
          <ModalFooter
            layout="stacked"
            primary={{ label: 'Aanzetten', onClick: () => void bevestig(), loading: bezig }}
            secondary={{ label: 'Annuleren', onClick: () => setOpen(false), disabled: bezig }}
          />
        }
      >
        <div className="space-y-3 p-6 text-sm leading-relaxed text-[var(--ink-2)]">
          {fout && (
            <p role="alert" className="border border-[var(--negative)] px-3 py-2 text-xs text-[var(--negative)]">
              {fout}
            </p>
          )}
          <p>
            Het volledige TriFinity komt naast je Krant. Je Krant en je nieuwsprofiel blijven zoals ze zijn, en er
            wordt niets gewist.
          </p>
          <p>
            Daarna vul je zelf aan wat nog ontbreekt. Terug naar alleen de Krant kan via support; je gegevens blijven
            dan ook staan.
          </p>
        </div>
      </ShellOverlay>
    </>
  )
}
