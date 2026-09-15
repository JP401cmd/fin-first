'use client'

/**
 * VragenlijstUitnodiging — de popup die vraagt of je een vragenlijst wilt
 * invullen (ADR 0147, fase 1).
 *
 * DE REGEL IS "ÉÉN OPEN PROMPT". De server kiest hoogstens één kandidaat
 * (`popup_kandidaat_id`, met cooldown/snooze/max-weigeringen uit de
 * verspreiding); de client voegt daar de gedragskant aan toe:
 *
 *  1. **Rust eerst.** Pas na ~2,5 s zonder andere aandachtsvrager — de unie uit
 *     `useAttentionQuiet` (scroll-lock, overlay-signaal, open chat, immersieve
 *     route, aandachtsregister). Wordt het onderweg onrustig, dan gaat de timer
 *     terug naar nul; hij begint opnieuw zodra het weer stil is.
 *  2. **Niet in het beheer.** Op /beheer werkt iemand aan de app, niet erin.
 *  3. **Eén keer per sessie per lijst** (sessionStorage-vlag). Ook wie de popup
 *     met X of Escape wegklikt krijgt 'm deze sessie niet nog eens; dat is
 *     bewust géén "later" naar de server — wegklikken is geen antwoord.
 *  4. **Zolang hij openstaat claimt hij het aandachtsregister**, zodat Fin en de
 *     rondleiding erover zwijgen.
 *
 * De drie knoppen zijn de drie antwoorden uit `pasActieToe`: Nu invullen
 * (opent de vragenlijst in Fins chat), Later (snooze) en Niet meer vragen
 * (definitief stil). Het tonen zelf stuurt `gezien`, zodat de cooldown loopt.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { claimAttention } from '@/lib/attention-signal'
import { useAttentionQuiet } from '@/lib/hooks/use-attention-quiet'
import type { UitnodigingActie } from '@/lib/questionnaires/verspreiding'
import { useVragenlijstSignaal } from './vragenlijst-signaal-provider'

/** Hoe lang het stil moet zijn voor de uitnodiging verschijnt. */
const RUST_MS = 2500

const VLAG_PREFIX = 'vragenlijst_popup_getoond:'

function heeftVlag(id: string): boolean {
  try {
    return sessionStorage.getItem(`${VLAG_PREFIX}${id}`) === '1'
  } catch {
    // Geen sessionStorage (privémodus, geblokkeerde site-data): dan liever één
    // keer te veel vragen dan de uitnodiging helemaal verliezen.
    return false
  }
}

function zetVlag(id: string): void {
  try {
    sessionStorage.setItem(`${VLAG_PREFIX}${id}`, '1')
  } catch {
    // Zie hierboven — de vlag is een beleefdheid, geen voorwaarde.
  }
}

async function meldActie(id: string, actie: UitnodigingActie): Promise<void> {
  try {
    await fetch(`/api/questionnaires/${id}/uitnodiging`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actie }),
    })
  } catch {
    // Stil: de uitnodigingsstaat is comfort, geen gegeven dat de gebruiker
    // invoerde. Een mislukte PATCH mag nooit een foutmelding opleveren.
  }
}

export function VragenlijstUitnodiging() {
  const { lijsten, popupKandidaatId, herlaad } = useVragenlijstSignaal()
  const { openVragenlijst } = useChatContext()
  const quiet = useAttentionQuiet({ self: 'vragenlijst-uitnodiging' })
  const pathname = usePathname()

  const [getoondId, setGetoondId] = useState<string | null>(null)

  const inBeheer = (pathname ?? '').startsWith('/beheer')
  const kandidaatId = popupKandidaatId

  // Wachten op rust, dan tonen. `kandidaatId` (een string) en niet het
  // lijst-object als dependency: dat object is per render een nieuwe referentie
  // en zou de timer eindeloos resetten.
  useEffect(() => {
    if (getoondId) return
    if (!kandidaatId || inBeheer || quiet) return
    if (heeftVlag(kandidaatId)) return
    const timer = setTimeout(() => {
      zetVlag(kandidaatId)
      setGetoondId(kandidaatId)
      void meldActie(kandidaatId, 'gezien')
    }, RUST_MS)
    return () => clearTimeout(timer)
  }, [getoondId, kandidaatId, inBeheer, quiet])

  const lijst = useMemo(
    () => (getoondId ? (lijsten.find((l) => l.id === getoondId) ?? null) : null),
    [getoondId, lijsten],
  )

  // Verdwijnt de lijst terwijl de uitnodiging openstaat (gedeactiveerd, of een
  // herlaad die 'm niet meer teruggeeft), dan rendert er niets meer — maar de
  // staat mag dan niet blijven hangen, anders blijft het aandachtsregister
  // geclaimd zonder dat er iets te zien is (eindreview 15-09-2026, #3).
  useEffect(() => {
    if (getoondId && !lijst) setGetoondId(null)
  }, [getoondId, lijst])

  // Zolang de uitnodiging ZICHTBAAR is spreekt zij — Fin en de rondleiding zwijgen.
  const zichtbaar = getoondId != null && lijst != null
  useEffect(() => {
    if (!zichtbaar) return
    return claimAttention('vragenlijst-uitnodiging')
  }, [zichtbaar])

  const sluit = useCallback(() => setGetoondId(null), [])

  const nuInvullen = useCallback(() => {
    const id = getoondId
    setGetoondId(null)
    if (!id) return
    openVragenlijst(id)
    herlaad()
  }, [getoondId, openVragenlijst, herlaad])

  const beantwoord = useCallback(
    (actie: UitnodigingActie) => {
      const id = getoondId
      setGetoondId(null)
      if (!id) return
      void meldActie(id, actie).then(herlaad)
    },
    [getoondId, herlaad],
  )

  if (!getoondId || !lijst) return null

  const aantal = lijst.question_count
  const vragenTekst = `${aantal} ${aantal === 1 ? 'korte vraag' : 'korte vragen'}`

  return (
    <ShellOverlay
      kind="confirm"
      open
      onClose={sluit}
      title={lijst.title}
      footer={
        <ModalFooter
          primary={{ label: 'Nu invullen', onClick: nuInvullen }}
          secondary={{ label: 'Later', onClick: () => beantwoord('later') }}
        />
      }
    >
      <div className="space-y-3 p-5">
        <p className="font-serif text-sm leading-relaxed text-[var(--ink-2)]">
          We horen graag wat je van de app vindt. Het zijn {vragenTekst}.
        </p>

        {lijst.description && (
          <p className="font-serif text-sm leading-relaxed text-[var(--ink-3)]">{lijst.description}</p>
        )}

        <p className="border-t border-[var(--border-ed)] pt-3 font-sans text-xs leading-relaxed text-[var(--ink-3)]">
          Je antwoorden gaan naar het TriFinity-team, niet naar de AI. Je kunt altijd stoppen en later
          verdergaan.
        </p>

        <button
          type="button"
          onClick={() => beantwoord('niet_meer')}
          className="font-sans text-xs text-[var(--ink-3)] underline underline-offset-2 transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fin-500"
        >
          Niet meer vragen
        </button>
      </div>
    </ShellOverlay>
  )
}
