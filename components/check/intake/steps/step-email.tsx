'use client'

import { useState, useId } from 'react'
import Link from 'next/link'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import { primaryBtn, backBtn, fieldLabel, inputBase, inputError, errorText, hintText } from '../intake-styles'

interface Props {
  draft: CheckDraft
  onEmailChange: (email: string) => void
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
  onConsentChange,
  onSubmit,
  onBack,
  isSubmitting,
  submitError,
}: Props) {
  const [submitted, setSubmitted] = useState(false)
  const emailId = useId()
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
      {/* Naam-bevestiging — de voornaam is al in stap ① opgehaald (geen her-vraag) */}
      {draft.intake.firstName && (
        <p className="font-serif text-sm italic text-[var(--ink-3)]">
          We stellen je rapport op voor{' '}
          <b className="font-medium not-italic text-[var(--ink)]">{draft.intake.firstName}</b>.
        </p>
      )}

      {/* E-mail */}
      <div>
        <label htmlFor={emailId} className={fieldLabel}>
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
          className={`${inputBase('kern')} px-3 py-2.5 font-serif text-sm ${emailError ? inputError : ''}`}
        />
        {emailError ? (
          <p id={`${emailId}-err`} className={errorText} role="alert">
            {emailError}
          </p>
        ) : (
          <p id={`${emailId}-hint`} className={hintText}>
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
        <p id={`${consentId}-err`} className="font-serif text-xs text-negative" role="alert">
          {consentError}
        </p>
      )}

      {/* Submit-fout */}
      {submitError && (
        <div
          className="border border-negative/40 bg-negative/5 px-4 py-3 font-serif text-sm text-negative"
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
          className={primaryBtn('kern')}
        >
          {isSubmitting ? 'Rapport genereren…' : 'Mijn vrijheidsrapport ophalen'}
        </button>
        <button type="button" onClick={onBack} disabled={isSubmitting} className={backBtn}>
          Terug
        </button>
      </div>
    </div>
  )
}
