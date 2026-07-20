'use client'

import { useState, type MouseEvent } from 'react'
import { Plus, Check, Loader2 } from 'lucide-react'
import {
  aandachtspuntToActionPayload,
  type Aandachtspunt,
  type AandachtspuntDomain,
} from '@/lib/aandachtspunten'

/**
 * AandachtspuntActieButton — generieke, herbruikbare "Voeg toe als actie"-knop.
 *
 * Neemt óf een volledig `Aandachtspunt`-object (via `aandachtspunt`), óf de losse
 * velden (title/savings/freedomDays/…). De losse-velden-variant is er voor
 * surfaces die een aandachtspunt ad-hoc samenstellen uit hun eigen state
 * (bv. de jaarruimte-simulator met live besparing) zonder een volledig
 * Aandachtspunt-record op te bouwen.
 *
 * Bij klik:
 *   1) bouwt het een `Aandachtspunt`, mapt het via `aandachtspuntToActionPayload`
 *      naar de body van POST /api/ai/actions (deterministisch, los van Fin),
 *   2) POST't met `source: 'manual'`,
 *   3) toont feedback: idle → bezig → "Toegevoegd ✓" (ook bij deduped:true).
 *
 * Foutstaat is subtiel (rode hint-tekst) en laat de gebruiker opnieuw proberen.
 *
 * Vormgeving (belasting-vormgeving-brief): editorial, scherp, ink, compact —
 * TogglePill-achtige mono-pill. Toegevoegd-staat = ink-fill (zoals TogglePill
 * `on`). 200-300ms feedback, aria-label, min-tap-target 32px.
 */

export interface AandachtspuntActieButtonProps {
  /** Volledig aandachtspunt — wint van de losse velden indien meegegeven. */
  aandachtspunt?: Aandachtspunt
  /** Losse velden — alternatief voor `aandachtspunt`. */
  id?: string
  domain?: AandachtspuntDomain
  title?: string
  description?: string
  /** Geschatte jaarbesparing in EUR. */
  savings?: number
  freedomDays?: number
  euroImpactMonthly?: number
  /** Vrije-tekst ('31 dec') of ISO-datum. */
  deadline?: string
  href?: string
  priority?: number
  /** Tekst in idle-staat. Default "Toevoegen als actie". */
  label?: string
  className?: string
}

type Status = 'idle' | 'busy' | 'done' | 'error'

/** Bouw een Aandachtspunt uit props — `aandachtspunt` wint van losse velden. */
function resolveAandachtspunt(props: AandachtspuntActieButtonProps): Aandachtspunt | null {
  if (props.aandachtspunt) return props.aandachtspunt

  const { id, domain, title, savings, freedomDays, href } = props
  // Minimaal vereist: een id-fragment, domein, titel en bron-link.
  if (!id || !domain || !title || !href) return null

  return {
    id,
    domain,
    title,
    description: props.description,
    savings: savings ?? 0,
    freedomDays: freedomDays ?? 0,
    euroImpactMonthly: props.euroImpactMonthly,
    deadline: props.deadline,
    href,
    priority: props.priority,
  }
}

export function AandachtspuntActieButton(props: AandachtspuntActieButtonProps) {
  const { label = 'Toevoegen als actie', className = '' } = props
  const [status, setStatus] = useState<Status>('idle')

  const aandachtspunt = resolveAandachtspunt(props)
  // Geen valide aandachtspunt → render niets (geen halve knop).
  if (!aandachtspunt) return null

  async function handleClick(e: MouseEvent<HTMLButtonElement>) {
    // De knop kan binnen een klikbare Link/rij staan — voorkom doornavigeren.
    e.preventDefault()
    e.stopPropagation()
    if (status === 'busy' || status === 'done') return
    setStatus('busy')
    try {
      const payload = aandachtspuntToActionPayload(aandachtspunt!)
      const res = await fetch('/api/ai/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, source: 'manual' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // deduped:true telt óók als succes — de actie bestaat al.
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  const isDone = status === 'done'
  const isBusy = status === 'busy'
  const isError = status === 'error'

  // Pill-stijl naar TogglePill-patroon: ink-fill bij done, scherpe ink-border idle.
  const base =
    'inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] font-mono text-[10px] font-semibold uppercase tracking-[0.12em] border transition-all duration-200 ease-out'
  const stateClass = isDone
    ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] cursor-default'
    : isError
      ? 'bg-transparent text-[var(--negative)] border-[var(--negative)] hover:bg-[color-mix(in_srgb,var(--negative)_8%,transparent)]'
      : 'bg-transparent text-[var(--ink)] border-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] focus-visible:bg-[var(--ink)] focus-visible:text-[var(--paper)]'

  const text = isDone
    ? 'Toegevoegd'
    : isBusy
      ? 'Bezig…'
      : isError
        ? 'Opnieuw proberen'
        : label

  const ariaLabel = isDone
    ? `${aandachtspunt.title} toegevoegd als actie`
    : isError
      ? `Toevoegen mislukt — opnieuw proberen: ${aandachtspunt.title}`
      : `${label}: ${aandachtspunt.title}`

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy || isDone}
        aria-label={ariaLabel}
        aria-live="polite"
        className={`${base} ${stateClass} disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {isBusy ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
        ) : isDone ? (
          <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <Plus className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        {text}
      </button>
      {isError && (
        <span className="font-mono text-[9px] tracking-[0.06em] text-[var(--negative)]" role="status">
          Kon niet toevoegen — probeer opnieuw.
        </span>
      )}
    </span>
  )
}
