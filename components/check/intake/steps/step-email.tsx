'use client'

import { useState, useId } from 'react'
import Link from 'next/link'
import type { CheckDraft } from '@/lib/check/use-check-draft'

interface Props {
  draft: CheckDraft
  onEmailChange: (email: string) => void
  onFirstNameChange: (name: string) => void
  onConsentChange: (ts: string | null) => void
  onSubmit: () => void
  onBack: () => void
  isSubmitting: boolean
  submitError: string | null
}

/**
 * Cloudflare Turnstile widget-placeholder.
 * Als de site-key aanwezig is, laad je de Turnstile JS via een `<script>` tag
 * in de page; hier renderen we alleen de container div die Turnstile koppelt.
 * Als de key ontbreekt, tonen we niets — de server handelt het af met een
 * lege token (cf. instructies wizard spec).
 */
function TurnstilePlaceholder({ siteKey }: { siteKey: string | undefined }) {
  if (!siteKey) return null
  return (
    <div
      className="cf-turnstile"
      data-sitekey={siteKey}
      data-theme="light"
      aria-label="Bot-verificatie"
    />
  )
}

export function StepEmail({
  draft,
  onEmailChange,
  onFirstNameChange,
  onConsentChange,
  onSubmit,
  onBack,
  isSubmitting,
  submitError,
}: Props) {
  const [submitted, setSubmitted] = useState(false)
  const emailId = useId()
  const nameId = useId()
  const consentId = useId()

  const siteKey = typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    : undefined

  const emailError =
    submitted && !draft.email
      ? 'Vul je e-mailadres in'
      : submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)
        ? 'Voer een geldig e-mailadres in'
        : null

  const consentError =
    submitted && !draft.consentAt ? 'Bevestig dat je akkoord gaat met de AVG-voorwaarden' : null

  function handleConsentChange(checked: boolean) {
    onConsentChange(checked ? new Date().toISOString() : null)
  }

  function handleSubmit() {
    setSubmitted(true)
    if (!draft.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) return
    if (!draft.consentAt) return
    onSubmit()
  }

  return (
    <div className="space-y-6">
      {/* Voornaam (optioneel — was ook in stap ①, hier herhalen als niet al ingevuld) */}
      {!draft.firstName && (
        <div>
          <label htmlFor={nameId} className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
            Voornaam{' '}
            <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
          </label>
          <input
            id={nameId}
            type="text"
            value={draft.firstName ?? ''}
            onChange={(e) => onFirstNameChange(e.target.value)}
            autoComplete="given-name"
            placeholder="bijv. Sarah"
            className="w-full border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 font-serif text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
          />
        </div>
      )}

      {/* E-mail */}
      <div>
        <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
          E-mailadres
        </label>
        <input
          id={emailId}
          type="email"
          value={draft.email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoComplete="email"
          placeholder="jij@voorbeeld.nl"
          aria-invalid={!!emailError}
          aria-describedby={emailError ? `${emailId}-err` : `${emailId}-hint`}
          className={`w-full border bg-[var(--subtle)] px-3 py-2.5 font-serif text-sm text-[var(--ink)] outline-none focus:ring-1 ${
            emailError
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
              : 'border-[var(--border-ed)] focus:border-kern-500 focus:ring-kern-500'
          }`}
        />
        {emailError ? (
          <p id={`${emailId}-err`} className="mt-1 text-xs text-red-500" role="alert">
            {emailError}
          </p>
        ) : (
          <p id={`${emailId}-hint`} className="mt-1 font-serif text-xs italic text-[var(--ink-3)]">
            Je rapport wordt naar dit adres gestuurd. We spammen niet.
          </p>
        )}
      </div>

      {/* Turnstile-placeholder */}
      <TurnstilePlaceholder siteKey={siteKey} />

      {/* AVG-consent */}
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            id={consentId}
            type="checkbox"
            checked={Boolean(draft.consentAt)}
            onChange={(e) => handleConsentChange(e.target.checked)}
            aria-invalid={!!consentError}
            aria-describedby={consentError ? `${consentId}-err` : undefined}
            className="h-4 w-4 cursor-pointer accent-kern-600"
          />
        </div>
        <label htmlFor={consentId} className="font-serif text-sm leading-relaxed text-[var(--ink-2)]">
          Ik ga akkoord met de{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-kern-600">
            privacyverklaring
          </Link>{' '}
          en geef toestemming voor de verwerking van mijn gegevens ten behoeve van het
          Vrijheidsrapport.
        </label>
      </div>
      {consentError && (
        <p id={`${consentId}-err`} className="text-xs text-red-500" role="alert">
          {consentError}
        </p>
      )}

      {/* Submit-fout */}
      {submitError && (
        <div
          className="border border-red-200 bg-red-50 px-4 py-3 font-serif text-sm text-red-700"
          role="alert"
        >
          {submitError}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Rapport genereren…' : 'Mijn vrijheidsrapport ophalen'}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="w-full min-h-11 px-6 py-2 text-sm text-[var(--ink-3)] underline-offset-4 hover:text-[var(--ink)] hover:underline disabled:opacity-50"
        >
          Terug
        </button>
      </div>
    </div>
  )
}
