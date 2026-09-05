'use client'

/**
 * StopPlanVragen — de plan-regel als TWEE VRAGEN (ADR 0129 B10/B13, F3b).
 *
 *   1. Wanneer wil je stoppen met werken?   → het stop-anker (solved · aow · age · now)
 *   2. Tot welke leeftijd moet je geld reiken, en wat moet er dan nog over zijn?
 *      → éérst het eindleeftijd-veld, dán de keuze wat er overblijft
 *        (deplete · legacy · perpetual), dán het bedragveld bij legacy
 *
 * Eén component voor Voorkeuren (de bron), de strategie-modal op /toekomst en de
 * module-activatie-modal. Gecontroleerd: de aanroeper houdt het `PlanDraft` en doet
 * de save (Voorkeuren via de pane-footer, de modal per wijziging). Validatie komt
 * uit `validatePlanDraft` — de AOW-toets zit dáár, met de AOW uit de gebruikerstabel
 * die de aanroeper meegeeft (nooit een hardcoded 67).
 *
 * Volgorde binnen vraag 2 (eigenaar-besluit 5 sep 2026): de eind-vorm is eigenlijk
 * twee getallen — tot welke leeftijd, en wat blijft er dan over. Daarom staat het
 * eindleeftijd-veld BOVEN de keuze; alleen `perpetual` verbergt het (daar rekent de
 * app zonder eindleeftijd) en toont in plaats daarvan één zin uitleg. Vóór F3b
 * verborg de modal het veld onder pensioen en forceerde ≥ 90 terwijl Voorkeuren het
 * toonde (bevinding 3 / M2). De kopij komt letterlijk uit `lib/horizon/plan-draft.ts`
 * — dezelfde strings als de onboarding-stap "Jouw plan".
 */

import { RegelOptionCard } from '@/components/future/regels/shared'
import { SubsectionLabel } from '@/components/editorial'
import {
  END_AGE_MAX,
  END_AGE_MIN,
  END_AGE_QUESTION,
  END_FORM_OPTIONS,
  END_FORM_QUESTION,
  END_REMAINDER_QUESTION,
  PERPETUAL_NO_END_AGE_NOTE,
  STOP_AGE_MAX,
  STOP_AGE_MIN,
  STOP_ANCHOR_OPTIONS,
  STOP_ANCHOR_QUESTION,
  defaultStopAge,
  endAgeHint,
  endFormShowsEndAge,
  formatPlanAge,
  withEndForm,
  type PlanDraft,
  type PlanDraftErrors,
} from '@/lib/horizon/plan-draft'
import type { StopAnchorKind } from '@/lib/fire-strategy'

export interface StopPlanVragenProps {
  value: PlanDraft
  onChange: (next: PlanDraft) => void
  /** Fouten uit `validatePlanDraft` — getoond onder het betreffende veld. */
  errors?: PlanDraftErrors
  /** AOW-leeftijd (fractioneel) uit de gebruikerstabel; `null` = onbekend (dan geen getal op de kaart). */
  aowAge?: number | null
  /** Huidige leeftijd — alleen voor de standaard-stopleeftijd bij het kiezen van 'age'. */
  currentAge?: number | null
  /** Opgeloste vrijheidsleeftijd — de betere standaard-stopleeftijd bij 'age', als bekend. */
  solvedFireAge?: number | null
  disabled?: boolean
  /** Compacte koppen (modal) i.p.v. de editorial SubsectionLabel (Voorkeuren). */
  compact?: boolean
}

const INPUT_CLASS =
  'px-3 py-2 border border-[var(--border-md)] rounded-lg bg-[var(--paper)] font-mono tabular-nums text-sm text-[var(--ink)] focus:border-[var(--module-active-700)] focus:outline-none disabled:opacity-60'

const FIELD_LABEL_CLASS =
  'block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1'

function Kop({ compact, children }: { compact: boolean; children: string }) {
  if (compact) {
    return (
      <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        {children}
      </p>
    )
  }
  return <SubsectionLabel>{children}</SubsectionLabel>
}

function Fout({ text }: { text?: string }) {
  if (!text) return null
  return (
    <p role="alert" className="mt-1 text-[11px] text-amber-700">
      {text}
    </p>
  )
}

export function StopPlanVragen({
  value,
  onChange,
  errors = {},
  aowAge = null,
  currentAge = null,
  solvedFireAge = null,
  disabled = false,
  compact = false,
}: StopPlanVragenProps) {
  const kiesAnker = (kind: StopAnchorKind) => {
    if (kind === 'age') {
      onChange({
        ...value,
        anchor: 'age',
        stopAge: value.stopAge ?? defaultStopAge({ solvedFireAge, currentAge, endAge: value.endAge }),
      })
      return
    }
    onChange({ ...value, anchor: kind })
  }

  const ankerOndertitel = (kind: StopAnchorKind, subtitle: string) =>
    kind === 'aow' && aowAge != null && Number.isFinite(aowAge)
      ? `${subtitle} Jouw AOW-leeftijd: ${formatPlanAge(aowAge)}.`
      : subtitle

  return (
    <div className="space-y-6">
      {/* ── Vraag 1: het stop-anker ─────────────────────────────────────── */}
      <section aria-labelledby="stop-plan-vraag-1">
        <span id="stop-plan-vraag-1" className="sr-only">{STOP_ANCHOR_QUESTION}</span>
        <Kop compact={compact}>{STOP_ANCHOR_QUESTION}</Kop>
        <div className="space-y-2" role="group" aria-labelledby="stop-plan-vraag-1">
          {STOP_ANCHOR_OPTIONS.map((opt) => (
            <RegelOptionCard
              key={opt.kind}
              active={value.anchor === opt.kind}
              title={opt.name}
              description={ankerOndertitel(opt.kind, opt.subtitle)}
              disabled={disabled}
              onSelect={() => kiesAnker(opt.kind)}
            />
          ))}
        </div>

        {value.anchor === 'age' && (
          <label className="mt-3 block">
            <span className={FIELD_LABEL_CLASS}>Stopleeftijd</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={STOP_AGE_MIN}
                max={STOP_AGE_MAX}
                step={0.5}
                value={value.stopAge ?? ''}
                disabled={disabled}
                aria-invalid={errors.stopAge ? true : undefined}
                onChange={(e) =>
                  onChange({ ...value, stopAge: e.target.value === '' ? null : Number(e.target.value) })
                }
                className={`w-28 ${INPUT_CLASS}`}
              />
              <span className="text-sm text-[var(--ink-3)]">jaar · halve jaren toegestaan</span>
            </span>
            <Fout text={errors.stopAge} />
          </label>
        )}
      </section>

      {/* ── Vraag 2: tot welke leeftijd, en wat blijft er over ─────────── */}
      <section aria-labelledby="stop-plan-vraag-2">
        <span id="stop-plan-vraag-2" className="sr-only">{END_FORM_QUESTION}</span>
        <Kop compact={compact}>{END_FORM_QUESTION}</Kop>

        {/* Eerst de eindleeftijd — de eerste helft van de vraag. */}
        {endFormShowsEndAge(value.endForm) ? (
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>{END_AGE_QUESTION}</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={END_AGE_MIN}
                max={END_AGE_MAX}
                step={1}
                value={value.endAge}
                disabled={disabled}
                aria-invalid={errors.endAge ? true : undefined}
                onChange={(e) => onChange({ ...value, endAge: Number(e.target.value) || 0 })}
                className={`w-28 ${INPUT_CLASS}`}
              />
              <span className="text-sm text-[var(--ink-3)]">jaar</span>
            </span>
            <Fout text={errors.endAge} />
            <p className="mt-1 text-[11px] text-[var(--ink-3)] italic leading-snug">
              {endAgeHint(value.endForm)}
            </p>
          </label>
        ) : (
          <p className="text-[11px] text-[var(--ink-3)] italic leading-snug">
            {PERPETUAL_NO_END_AGE_NOTE}
          </p>
        )}

        {/* Dan de keuze wat er overblijft — de tweede helft. */}
        <p id="stop-plan-vraag-2-rest" className={`${FIELD_LABEL_CLASS} mt-4`}>
          {END_REMAINDER_QUESTION}
        </p>
        <div className="space-y-2" role="group" aria-labelledby="stop-plan-vraag-2-rest">
          {END_FORM_OPTIONS.map((opt) => (
            <RegelOptionCard
              key={opt.form}
              active={value.endForm === opt.form}
              title={opt.name}
              description={opt.subtitle}
              disabled={disabled}
              onSelect={() => onChange(withEndForm(value, opt.form))}
            />
          ))}
        </div>

        {/* Tot slot het bedrag — alleen wanneer er iets over moet blijven. */}
        {value.endForm === 'legacy' && (
          <label className="mt-4 block">
            <span className={FIELD_LABEL_CLASS}>Bedrag dat over moet blijven (€)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={value.legacyAmount}
              disabled={disabled}
              aria-invalid={errors.legacyAmount ? true : undefined}
              onChange={(e) => onChange({ ...value, legacyAmount: Number(e.target.value) || 0 })}
              className={`w-40 ${INPUT_CLASS}`}
            />
            <Fout text={errors.legacyAmount} />
            <p className="mt-1 text-[11px] text-[var(--ink-3)] italic leading-snug">
              Dit bedrag (in huidige euro&apos;s) blijft over — de rest mag opraken.
            </p>
          </label>
        )}
      </section>
    </div>
  )
}
