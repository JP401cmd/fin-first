'use client'

/**
 * CheckWizard — 8-staps publieke Vrijheidscheck-wizard.
 *
 * Orkestreert de intake-stappen, het draft-systeem, de live vrijheidstijd-teller
 * en de e-mailpoort. Na submit: POST /api/check/submit → redirect naar /check/rapport?token=.
 *
 * Architectuur-keuze: alle stap-componenten zijn "dumb" — ze ontvangen state + handlers
 * via props. De draft-state woont in `useCheckDraft` (localStorage-backed).
 *
 * QuickAddWizard-noot: de wizard-instructies vermelden QuickAddWizard collect-mode voor
 * stap ⑤ en ⑥. Die wizard verwacht een `BottomSheet`-context (ToastProvider etc.) die
 * niet beschikbaar is op een publieke route buiten de (app)-layout. Daarom hebben ⑤ en ⑥
 * eigen lichtgewichte add-forms die hetzelfde `CheckIntakeAsset`/`CheckIntakeDebt`-contract
 * produceren. Gemeld als gedeeld-bestand-behoefte (zie rapport onderaan).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useCheckDraft,
  INTAKE_STEPS,
  stepIndex,
  clearCheckDraft,
  type CheckStep,
} from '@/lib/check/use-check-draft'
import { computeFreedomTicker } from '@/lib/freedom-ticker'
import type { CheckIntake, CheckSubmitPayload } from '@/lib/check/types'

import { StepJij } from './steps/step-jij'
import { StepInkomen } from './steps/step-inkomen'
import { StepUitgaven } from './steps/step-uitgaven'
import { StepBuffer } from './steps/step-buffer'
import { StepBezittingen } from './steps/step-bezittingen'
import { StepSchulden } from './steps/step-schulden'
import { StepPensioen } from './steps/step-pensioen'
import { StepGebeurtenissen } from './steps/step-gebeurtenissen'
import { StepDoel } from './steps/step-doel'
import { StepEmail } from './steps/step-email'

// ── Stap-meta ───────────────────────────────────────────────────────────────

const STEP_META: Record<
  Exclude<CheckStep, 'verzenden'>,
  { num: string; title: string; sub: string }
> = {
  jij:            { num: '①', title: 'Wie ben jij?', sub: 'leeftijd · gezin · naam' },
  inkomen:        { num: '②', title: 'Inkomen', sub: 'netto per maand' },
  uitgaven:       { num: '③', title: 'Uitgaven', sub: 'wonen · lasten · vrij' },
  buffer:         { num: '④', title: 'Buffer', sub: 'noodfonds · dekking' },
  bezittingen:    { num: '⑤', title: 'Bezittingen', sub: 'spaar · beleggen · woning' },
  schulden:       { num: '⑥', title: 'Schulden', sub: 'hypotheek · leningen · rest' },
  pensioen:       { num: '⑦', title: 'Pensioen & rendement', sub: 'AOW · risicoprofiel' },
  gebeurtenissen: { num: '⑧', title: 'Levensgebeurtenissen', sub: 'optioneel · huwelijk · sabbatical · erfenis' },
  doel:           { num: '⑨', title: 'Grootste doel', sub: 'optioneel · vrij tekstveld' },
  email:          { num: '✉', title: 'Je rapport', sub: 'e-mail · AVG-consent' },
}

// ── Live vrijheidstijd-teller ────────────────────────────────────────────────

function useFreedomTicker(intake: Partial<CheckIntake> & { assets: CheckIntake['assets'] }) {
  return useMemo(() => {
    // Grondslag + guards wonen in lib/freedom-ticker.ts — gedeeld met de
    // onboarding-teller (bevinding H12), zodat de ingelogde flow en de
    // publieke trechter niet twee versies van hetzelfde getal tonen.
    // `fire_pot_excl_home`: eigen huis telt niet mee, schulden gaan er niet
    // af — dat is wat deze wizard altijd al deed, en het maakt de teller
    // monotoon tijdens het invullen.
    const result = computeFreedomTicker({
      monthlyIncome: intake.monthlyIncomeNet ?? 0,
      monthlyExpenses: intake.expenses?.totaalMaand ?? 0,
      assets: [
        ...(intake.assets ?? []).map((a) => ({
          value: a.value,
          isHome: a.assetType === 'eigen_huis',
        })),
        // Het noodfonds is geen `asset`-rij in de intake maar telt wél als
        // liquide vermogen.
        { value: intake.emergencyFund ?? 0, isHome: false },
      ],
      basis: 'fire_pot_excl_home',
    })
    return result?.label ?? null
  }, [intake])
}

// ── Voortgangsbalk ───────────────────────────────────────────────────────────

function ProgressBar({ current }: { current: CheckStep }) {
  const currentIdx = INTAKE_STEPS.indexOf(current)
  // email-stap valt buiten INTAKE_STEPS maar telt mee als laatste
  const total = INTAKE_STEPS.length + 1 // +1 voor email
  const progress = current === 'email' ? total : currentIdx + 1

  return (
    <div
      role="progressbar"
      aria-label="Voortgang vragenlijst"
      aria-valuenow={progress}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuetext={`Stap ${progress} van ${total}`}
    >
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 transition-colors duration-300 ${
              i < progress ? 'bg-kern-600' : 'bg-[var(--border-ed)]'
            }`}
          />
        ))}
      </div>
      <p className="label-editorial mt-2 font-mono text-[var(--ink-meta)]">
        Stap {progress} van {total}
      </p>
    </div>
  )
}

// ── Hoofd-component ──────────────────────────────────────────────────────────

export function CheckWizard() {
  const router = useRouter()
  const {
    draft,
    step,
    goTo,
    next,
    back,
    patchIntake,
    setEmail,
    setConsentAt,
    isLoaded,
  } = useCheckDraft()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Vrijheidstijd-teller
  const freedomTick = useFreedomTicker(draft.intake)

  // Scroll-naar-boven + focus op de stap-kop bij elke stapwissel (voorkomt 'doorschieten'
  // na een lange stap; raakt de sticky vrijheidsticker niet — die zit erbuiten).
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
    headingRef.current?.focus()
  }, [step])

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    // Haal Turnstile-token op via de widget indien aanwezig
    let turnstileToken = ''
    if (typeof window !== 'undefined') {
      const response = (window as Window & { turnstile?: { getResponse: () => string } }).turnstile?.getResponse()
      if (response) turnstileToken = response
    }

    const intake = draft.intake as CheckIntake

    const payload: CheckSubmitPayload = {
      intake,
      email: draft.email,
      consentAt: draft.consentAt ?? new Date().toISOString(),
      turnstileToken,
    }

    try {
      const res = await fetch('/api/check/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const text = await res.text()
        let msg = 'Er ging iets mis — probeer het opnieuw.'
        try {
          const json = JSON.parse(text)
          if (json?.error) msg = json.error
        } catch { /* ignore */ }
        setSubmitError(msg)
        setIsSubmitting(false)
        return
      }

      const data = await res.json() as { token?: string }
      clearCheckDraft()

      if (data.token) {
        router.push(`/check/rapport?token=${data.token}`)
      } else {
        setSubmitError('Rapport kon niet worden gegenereerd. Probeer het opnieuw.')
        setIsSubmitting(false)
      }
    } catch {
      setSubmitError('Verbinding mislukt — controleer je internet en probeer opnieuw.')
      setIsSubmitting(false)
    }
  }, [draft, router])

  // ── Render helpers ────────────────────────────────────────────────────────

  // Zolang draft geladen wordt, toon niets (voorkomt hydration-mismatch)
  if (!isLoaded) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-ed)] border-t-kern-600" />
      </div>
    )
  }

  // Stap-meta voor de actieve stap
  const meta = step !== 'verzenden' ? STEP_META[step] : null

  // Bereken actieve intake-index voor progressbalk
  const intakeIdx = INTAKE_STEPS.indexOf(step)
  const isIntakeStep = intakeIdx !== -1
  const isEmailStep = step === 'email'

  return (
    <div className="w-full">
      {/* Vrijheidstijd-teller — verschijnt zodra inkomen + uitgaven + vermogen bekend zijn */}
      {freedomTick && (
        <div
          className="sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-[var(--border-ed)] bg-[var(--bg)]/95 px-4 py-2 backdrop-blur-sm"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="label-editorial font-mono text-[var(--ink-meta)]">
            Al vrijgekocht
          </span>
          <span className="font-mono tabular-nums text-base font-medium text-horizon-700">
            {freedomTick}
          </span>
        </div>
      )}

      {/* Wizard-kaart */}
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">

        {/* Voortgangsbalk — alleen tijdens intake-stappen en e-mailstap */}
        {(isIntakeStep || isEmailStep) && (
          <div className="mb-8">
            <ProgressBar current={step} />
          </div>
        )}

        {/* Stap-kop */}
        {meta && (
          <header className="mb-8 border-b border-[var(--border-ed)] pb-6">
            <p className="label-editorial mb-2 font-mono text-[var(--ink-meta)]">
              {meta.num} · {meta.sub}
            </p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-2xl font-bold leading-tight tracking-tight text-[var(--ink)] outline-none md:text-3xl"
            >
              {meta.title}
            </h2>
          </header>
        )}

        {/* Stap-inhoud */}
        <div>
          {step === 'jij' && (
            <StepJij
              intake={draft.intake}
              onChange={patchIntake}
              onNext={next}
            />
          )}
          {step === 'inkomen' && (
            <StepInkomen
              intake={draft.intake}
              onChange={patchIntake}
              onNext={next}
              onBack={back}
            />
          )}
          {step === 'uitgaven' && (
            <StepUitgaven
              intake={draft.intake}
              onChange={patchIntake}
              onNext={next}
              onBack={back}
            />
          )}
          {step === 'buffer' && (
            <StepBuffer
              intake={draft.intake}
              onChange={patchIntake}
              onNext={next}
              onBack={back}
            />
          )}
          {step === 'bezittingen' && (
            <StepBezittingen
              intake={draft.intake}
              onChange={patchIntake}
              onNext={next}
              onBack={back}
            />
          )}
          {step === 'schulden' && (
            <StepSchulden
              intake={draft.intake}
              onChange={patchIntake}
              onNext={next}
              onBack={back}
            />
          )}
          {step === 'pensioen' && (
            <StepPensioen
              intake={draft.intake}
              onChange={patchIntake}
              onNext={next}
              onBack={back}
            />
          )}
          {step === 'gebeurtenissen' && (
            <StepGebeurtenissen
              intake={draft.intake}
              onChange={patchIntake}
              onNext={next}
              onBack={back}
            />
          )}
          {step === 'doel' && (
            <StepDoel
              intake={draft.intake}
              onChange={patchIntake}
              onNext={next}
              onBack={back}
            />
          )}
          {step === 'email' && (
            <StepEmail
              draft={draft}
              onEmailChange={setEmail}
              onConsentChange={setConsentAt}
              onSubmit={handleSubmit}
              onBack={back}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          )}
          {step === 'verzenden' && (
            <div className="flex flex-col items-center gap-6 py-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-ed)] border-t-kern-600" />
              <div className="space-y-2">
                <p className="font-display text-xl font-bold text-[var(--ink)]">
                  Je rapport wordt samengesteld…
                </p>
                <p className="font-serif text-sm italic text-[var(--ink-3)]">
                  Dit duurt een moment — we rekenen je vrijheidsperspectief uit.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
