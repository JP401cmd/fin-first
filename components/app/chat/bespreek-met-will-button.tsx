'use client'

import { MessageCircle } from 'lucide-react'
import { useChatContextOptional } from './chat-provider'

/**
 * BesprekMetWillButton — opent de Will-chat met een kant-en-klare kick-off-vraag
 * over een specifiek onderwerp, en neemt de betreffende info (titel + toelichting)
 * mee de chat in als context.
 *
 * Generiek & herbruikbaar (niet belasting-specifiek): bedoeld voor "vooruitblik"-
 * en duidings-onderwerpen waar de gebruiker met Will wil sparren in plaats van
 * (of naast) een concrete actie toe te voegen. Gebruikt het bestaande
 * chat-mechanisme `useChatContext().openWithMessage` — geen nieuw kanaal.
 *
 * Server-componenten mogen deze knop als child renderen zonder zelf client te
 * worden.
 */
export function BesprekMetWillButton({
  onderwerp,
  detail,
  vraag,
  className = '',
}: {
  /** Het onderwerp/titel dat besproken wordt (gaat als context naar Will). */
  onderwerp: string
  /** Optionele toelichting die mee de chat in gaat. */
  detail?: string
  /** Optionele afsluitende vraag; default vraagt naar betekenis + actie. */
  vraag?: string
  className?: string
}) {
  const chat = useChatContextOptional()

  function handleClick() {
    if (!chat) return
    const slot = vraag ?? 'Wat betekent dit voor mijn situatie, en moet ik er nu al op anticiperen?'
    const message = `Ik wil dit fiscale onderwerp met je bespreken: "${onderwerp}".${
      detail ? ` ${detail}` : ''
    } ${slot}`
    chat.openWithMessage(message)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Bespreek "${onderwerp}" met Will`}
      className={`inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${className}`}
    >
      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Bespreek met Will
    </button>
  )
}
