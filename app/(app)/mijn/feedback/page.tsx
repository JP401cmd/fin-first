'use client'

import { Megaphone, Bug, HelpCircle, Lightbulb } from 'lucide-react'
import { PageOpening, Button, Kicker } from '@/components/editorial'
import { useChatContext } from '@/components/app/chat/chat-provider'

/**
 * /mijn/feedback — VERWIJSPAGINA (ADR 0096).
 *
 * Het oude formulier (POST /api/feedback → tabel `feedback`) is gesloten:
 * melden loopt uitsluitend via de meldmodus in het gesprek met Fin. Deze
 * pagina blijft bestaan omdat er nog deeplinks en een ⌘K-ingang naar wijzen —
 * en omdat een dood pad erger is dan een verwijzing.
 *
 * De drie typen hieronder spiegelen exact de meldmodus (bug · vraag ·
 * aanbeveling). De oude categorie "overig" heeft bewust geen opvolger: een
 * meldingstype dat niets zegt is voor triage waardeloos.
 */

const TYPES = [
  {
    Icon: Bug,
    label: 'Bug',
    uitleg: 'Er gaat iets kapot of een getal klopt niet. Je scherm gaat mee, zodat we zien wat jij ziet.',
  },
  {
    Icon: HelpCircle,
    label: 'Vraag',
    uitleg: 'Je snapt niet wat je ziet of waar iets vandaan komt.',
  },
  {
    Icon: Lightbulb,
    label: 'Aanbeveling',
    uitleg: 'Je hebt een idee dat de app beter maakt.',
  },
] as const

export default function MijnFeedbackPage() {
  const { openMelding } = useChatContext()

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <PageOpening
        className="mb-6"
        kicker={
          <>
            <Megaphone className="h-3 w-3" aria-hidden />
            Melden
          </>
        }
        titleBefore="Melden doe je vanuit je "
        emphasis="gesprek"
        titleAfter=" met Fin"
        deck="Er is één plek om iets te melden: het meldvenster in de chat. Daar kun je je scherm meesturen, zodat je melding meteen bruikbaar binnenkomt — en niet in een tweede postbak belandt."
      />

      <Button type="button" onClick={openMelding}>
        <Megaphone className="h-4 w-4" aria-hidden />
        Open het meldvenster
      </Button>

      <p className="mt-3 text-xs text-[var(--ink-3)]">
        Je kunt het ook altijd zelf openen: klik op de megafoon rechtsboven in het chatvenster.
        Melden werkt ook zonder AI-abonnement.
      </p>

      <div className="mt-8 border-t border-[var(--border-ed)] pt-5">
        <Kicker>Wat je kunt melden</Kicker>
        <ul className="mt-3 space-y-3">
          {TYPES.map(({ Icon, label, uitleg }) => (
            <li key={label} className="flex items-start gap-3">
              <Icon
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--module-active-700)]"
                aria-hidden
              />
              <p className="text-sm text-[var(--ink-2)]">
                <span className="font-medium text-[var(--ink)]">{label}</span> — {uitleg}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-xs text-[var(--ink-3)]">
        Eerder ingestuurde feedback blijft bewaard en is nog steeds onderdeel van je gegevensexport.
      </p>
    </div>
  )
}
