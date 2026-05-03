'use client'

/**
 * ConfirmDestructive — twee-staps bevestiging voor onomkeerbare acties.
 *
 * Fintech-veiligheidspatroon uit de UI-bijbel:
 *  - Type-to-confirm: gebruiker tikt letterlijk de entiteitsnaam (of ander token)
 *    over voordat de destructieve knop activeert. Case-sensitive, exact-match.
 *  - Initiale focus staat ALTIJD op "Annuleren" — nooit op de destructieve knop.
 *  - Bouwt op `BottomSheet`, erft daarmee focus-trap, escape-close, return-focus
 *    naar trigger, safe-area padding en reduced-motion support. Geen parallel
 *    modal-primitive.
 *
 * Toon & microcopy: actieve stem ("je"), werkwoord eerst, NL-locale.
 * Kleur: `--negative` tint voor de destructieve CTA (scherpe hoeken, krantstijl).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BottomSheet } from './bottom-sheet'

type ConfirmDestructiveProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
  /** Entiteit-naam (bijv. "budget Boodschappen") — gebruikt in default titel. */
  entityLabel: string
  /** De exacte tekst die de gebruiker moet overtypen om te bevestigen. */
  confirmationText: string
  /** Override voor de titel (default: `Verwijder ${entityLabel}?`). */
  title?: string
  /** Override voor de body-zin (default: "Deze actie kan niet ongedaan worden gemaakt."). */
  description?: string
  /** Override voor het label op de destructieve knop (default: "Definitief verwijderen"). */
  confirmButtonLabel?: string
}

export function ConfirmDestructive({
  open,
  onClose,
  onConfirm,
  entityLabel,
  confirmationText,
  title,
  description,
  confirmButtonLabel,
}: ConfirmDestructiveProps) {
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputId = useId()
  const errorId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Exact-match, case-sensitive: dit is een opzettelijke frictie-stap.
  // Trim NIET — als de gebruiker een spatie mee-kopieert is dat hun input,
  // niet onze verantwoordelijkheid om weg te poetsen.
  const matches = typed === confirmationText

  // Reset lokale state wanneer de modal opnieuw opent. We doen dit niet on-close
  // om een flash-van-lege-input te voorkomen tijdens de exit-animatie.
  useEffect(() => {
    if (open) {
      setTyped('')
      setPending(false)
      setError(null)
    }
  }, [open])

  // Initiale focus: override BottomSheet's "eerste focusable" door na de
  // focus-toekenning (binnen requestAnimationFrame) de annuleer-knop te pakken.
  // Het input-veld komt ná de knop in de DOM, dus zonder deze override zou
  // BottomSheet de annuleer-knop al kiezen — we maken het expliciet voor
  // robuustheid bij toekomstige layout-wijzigingen.
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      cancelRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  const handleCancel = useCallback(() => {
    if (pending) return
    onClose()
  }, [onClose, pending])

  const handleConfirm = useCallback(async () => {
    if (!matches || pending) return
    setError(null)
    setPending(true)
    try {
      await onConfirm()
      // Succes: sluit de modal. De parent zal doorgaans een toast/banner
      // tonen op de bestemmingspagina (zie UI-bijbel: success-state nooit
      // in dezelfde modal).
      onClose()
    } catch (err) {
      setPending(false)
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Er ging iets mis. Probeer het opnieuw.'
      setError(message)
    }
  }, [matches, pending, onConfirm, onClose])

  const resolvedTitle = title ?? `Verwijder ${entityLabel}?`
  const resolvedDescription =
    description ?? 'Deze actie kan niet ongedaan worden gemaakt.'
  const resolvedConfirmLabel = confirmButtonLabel ?? 'Definitief verwijderen'

  return (
    <BottomSheet open={open} onClose={handleCancel} size="sm">
      <div className="px-5 pb-5 pt-2 md:px-6 md:pb-6 md:pt-4">
        {/* Kicker met streep — ONOMKEERBAAR in rood (geen module-active hier:
            destructive-context vereist semantisch rood, niet de actieve module) */}
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-negative">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0 bg-negative"
          />
          Onomkeerbaar
        </div>

        {/* Titel — Playfair display font, serieuze krant-kop */}
        <h2
          className="mt-2 text-[22px] leading-tight font-bold text-[var(--ink)] md:text-[26px] tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {resolvedTitle}
        </h2>

        {/* Beschrijving — Source Serif body, leesbare waarschuwing */}
        <p className="mt-2 font-serif text-base leading-relaxed text-[var(--ink-2)]">
          {resolvedDescription}
        </p>

        {/* Type-to-confirm input */}
        <div className="mt-5">
          <label
            htmlFor={inputId}
            className="block text-sm text-[var(--ink-2)]"
          >
            Typ{' '}
            <span className="font-mono text-[var(--ink)] bg-[var(--subtle)] px-1 py-[1px] border border-[var(--border-ed)]">
              {confirmationText}
            </span>{' '}
            om te bevestigen
          </label>
          <input
            id={inputId}
            type="text"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              // Laat eerdere server-fout verdwijnen zodra de gebruiker opnieuw
              // gaat typen — anders blijft een stale error staan na een retry.
              if (error) setError(null)
            }}
            disabled={pending}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            // Screenreader-koppeling met de inline error (indien aanwezig).
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="mt-2 w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-3 font-mono text-[15px] text-[var(--ink)] outline-none focus:border-[var(--ink-2)] focus:ring-2 focus:ring-[var(--ink-2)]/20 disabled:opacity-60"
            style={{ minHeight: 44 }}
          />
          {error && (
            <p
              id={errorId}
              role="alert"
              className="mt-2 text-sm text-negative"
            >
              {error}
            </p>
          )}
        </div>

        {/* Acties — secundair links, destructief rechts. Mobiel: stacked. */}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={handleCancel}
            disabled={pending}
            className="inline-flex items-center justify-center border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-2)]/40 disabled:opacity-50"
            style={{ minHeight: 44 }}
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!matches || pending}
            aria-busy={pending || undefined}
            className="inline-flex items-center justify-center gap-2 border border-[var(--negative)] bg-[var(--negative)] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--negative)]/60 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ minHeight: 44 }}
          >
            {pending && (
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border border-white/70 border-t-transparent"
                aria-hidden="true"
              />
            )}
            <span>{pending ? 'Bezig…' : resolvedConfirmLabel}</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
