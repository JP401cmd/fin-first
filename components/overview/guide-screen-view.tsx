'use client'

import Link from 'next/link'
import {
  Check,
  Minus,
  ArrowRight,
  Wallet,
  Landmark,
  PiggyBank,
  Banknote,
  Upload,
  TrendingUp,
  LineChart,
  BarChart3,
  CalendarClock,
  Calendar,
  Receipt,
  Sparkles,
  Newspaper,
  Calculator,
  Target,
  Settings2,
  LayoutGrid,
  HeartPulse,
  Lightbulb,
  Compass,
  Flag,
  Home,
  type LucideIcon,
} from 'lucide-react'
import type { GuideDerivedStates, GuideIcon, WelcomeGuideScreen, WelcomeGuideStep } from '@/lib/welcome-guide'

/**
 * GuideScreenView — pure presentatie van één welkomstgids-scherm. Gedeeld door
 * de live banner (`welcome-guide-banner.tsx`) én de beheer-preview
 * (`beheer/welkom/page.tsx`), zodat het beheerscherm letterlijk dezelfde
 * schermen toont als de gebruiker ziet.
 *
 * - layout 'process' → genummerde stapkaarten links→rechts (scherm 1).
 * - layout 'list'    → verticale rijen.
 * readOnly = preview: vinkjes niet klikbaar, links niet-navigerend.
 * compact  = eenvoudige weergave (APP-6): áltijd de lijst-layout, zonder
 *            schermintro en zonder stapomschrijvingen — vier afvinkregels in
 *            plaats van vier proceskaarten, zodat de gids op mobiel binnen ~⅓
 *            van het eerste scherm blijft. De stappen zelf, hun vinkjes en hun
 *            links veranderen niet; alleen wat eromheen staat.
 *
 * VIER STAP-TOESTANDEN (M1) — de gids weet sinds M1 wat er al in het account
 * staat, en dat moet zichtbaar anders zijn dan een eigen vinkje:
 *  · 'auto'   — afgeleid uit je gegevens. Positief getint, NIET klikbaar (een
 *               afgeleid vinkje uitzetten kan niet: het zou meteen terugkomen).
 *  · 'manual' — zelf afgevinkt. Positief getint, klikbaar (uitvinken mag).
 *  · 'nvt'    — niet van toepassing. Gedempt, buiten de teller, niet klikbaar.
 *  · 'open'   — nog te doen.
 * De kleuren volgen de semantische tokens (`--positive`), niet de Tailwind-
 * standaardkleuren die hier eerder stonden.
 */

type StepVisualState = 'auto' | 'manual' | 'nvt' | 'open'

function resolveStepState(
  stepId: string,
  done: Set<string>,
  derived?: GuideDerivedStates,
): StepVisualState {
  const state = derived?.[stepId]
  if (state === 'nvt') return 'nvt'
  if (state === 'done') return 'auto'
  return done.has(stepId) ? 'manual' : 'open'
}

const STEP_STATE_LABEL: Record<StepVisualState, string> = {
  auto: 'automatisch afgevinkt op basis van je gegevens',
  manual: 'zelf afgevinkt',
  nvt: 'niet van toepassing',
  open: 'nog te doen',
}

// ── Icoon-map (naam → lucide-component) ─────────────────────────────────────
const ICON_MAP: Record<GuideIcon, LucideIcon> = {
  Wallet,
  Landmark,
  PiggyBank,
  Banknote,
  Upload,
  TrendingUp,
  LineChart,
  BarChart3,
  CalendarClock,
  Calendar,
  Receipt,
  Sparkles,
  Newspaper,
  Calculator,
  Target,
  Settings2,
  LayoutGrid,
  HeartPulse,
  Lightbulb,
  Compass,
  Flag,
  Home,
}

interface Props {
  screen: WelcomeGuideScreen
  completedStepIds: string[]
  /** Server-afgeleide stap-toestand (M1). Weglaten = alles handmatig. */
  derived?: GuideDerivedStates
  onToggle?: (stepId: string) => void
  readOnly?: boolean
  compact?: boolean
}

export function GuideScreenView({
  screen,
  completedStepIds,
  derived,
  onToggle,
  readOnly = false,
  compact = false,
}: Props) {
  const done = new Set(completedStepIds)
  const stateOf = (stepId: string) => resolveStepState(stepId, done, derived)
  const steps = screen.steps.filter((s) => s.enabled)
  const showIntro = Boolean(screen.intro) && !compact

  return (
    <div>
      {(screen.title || showIntro) && (
        <header className={compact ? 'mb-2' : 'mb-4'}>
          {screen.title && (
            <h3
              className={`text-[var(--ink)] ${compact ? 'text-base' : 'text-lg sm:text-xl'}`}
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              {screen.title}
            </h3>
          )}
          {showIntro && (
            <p className="mt-1 text-sm text-[var(--ink-3)] leading-snug">{screen.intro}</p>
          )}
        </header>
      )}

      {screen.layout === 'process' && !compact ? (
        <ProcessSteps steps={steps} stateOf={stateOf} onToggle={onToggle} readOnly={readOnly} />
      ) : (
        <ListSteps
          steps={steps}
          stateOf={stateOf}
          onToggle={onToggle}
          readOnly={readOnly}
          compact={compact}
        />
      )}
    </div>
  )
}

// ── Process-layout (genummerde kaarten links→rechts) ────────────────────────

function ProcessSteps({
  steps,
  stateOf,
  onToggle,
  readOnly,
}: {
  steps: WelcomeGuideStep[]
  stateOf: (stepId: string) => StepVisualState
  onToggle?: (id: string) => void
  readOnly: boolean
}) {
  return (
    <ol className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-2">
      {steps.map((step, i) => {
        const state = stateOf(step.id)
        const isDone = state === 'auto' || state === 'manual'
        return (
          <li key={step.id} className="flex items-stretch gap-2 lg:flex-1">
            <div
              className={`flex flex-1 flex-col rounded-xl border p-3.5 transition-colors ${
                isDone
                  ? 'border-[var(--positive)]/40 bg-positive-bg'
                  : state === 'nvt'
                    ? 'border-[var(--border-ed)] bg-[var(--subtle)]'
                    : 'border-[var(--border-ed)] bg-[var(--paper)]'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                    isDone
                      ? 'bg-[var(--positive)] text-[var(--paper)]'
                      : 'bg-[var(--subtle)] text-[var(--ink-3)]'
                  }`}
                >
                  {i + 1}
                </span>
                <StepCheckbox step={step} state={state} onToggle={onToggle} readOnly={readOnly} />
              </div>
              <StepIcon step={step} isDone={isDone} />
              <p className="mt-1.5 text-sm font-semibold leading-snug text-[var(--ink)]">
                {step.title}
              </p>
              {step.description && (
                <p className="mt-1 text-xs leading-snug text-[var(--ink-3)]">{step.description}</p>
              )}
              {(state === 'auto' || state === 'nvt') && (
                <p
                  className={`mt-1 text-[11px] font-medium leading-snug ${
                    state === 'auto' ? 'text-positive' : 'text-[var(--ink-4)]'
                  }`}
                >
                  {state === 'auto' ? 'Al geregeld — uit je gegevens' : 'Niet van toepassing'}
                </p>
              )}
              <div className="mt-auto pt-2.5">
                <StepLink step={step} readOnly={readOnly} />
              </div>
            </div>
            {/* Procespijl tussen kaarten (alleen desktop, niet na de laatste) */}
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="hidden shrink-0 items-center self-center text-[var(--ink-4)] lg:flex"
              >
                <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ── List-layout (verticale rijen) ───────────────────────────────────────────

function ListSteps({
  steps,
  stateOf,
  onToggle,
  readOnly,
  compact = false,
}: {
  steps: WelcomeGuideStep[]
  stateOf: (stepId: string) => StepVisualState
  onToggle?: (id: string) => void
  readOnly: boolean
  /** Eenvoudige weergave: strakkere rijen, geen stapomschrijving (APP-6). */
  compact?: boolean
}) {
  return (
    <ul className="divide-y divide-[var(--border-ed)] rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      {steps.map((step) => {
        const state = stateOf(step.id)
        const isDone = state === 'auto' || state === 'manual'
        return (
          <li
            key={step.id}
            className={`flex gap-3 transition-colors ${compact ? 'items-center px-3 py-1.5' : 'items-start p-3.5'} ${
              isDone ? 'bg-positive-bg' : state === 'nvt' ? 'bg-[var(--subtle)]' : ''
            }`}
          >
            <StepCheckbox step={step} state={state} onToggle={onToggle} readOnly={readOnly} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StepIcon step={step} isDone={isDone} inline />
                <p
                  className={`font-semibold leading-snug text-[var(--ink)] ${
                    compact ? 'text-[13px] truncate' : 'text-sm'
                  }`}
                >
                  {step.title}
                </p>
              </div>
              {step.description && !compact && (
                <p className="mt-0.5 text-xs leading-snug text-[var(--ink-3)]">{step.description}</p>
              )}
            </div>
            <div className="shrink-0 self-center">
              <StepLink step={step} readOnly={readOnly} compact />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── Bouwstenen ──────────────────────────────────────────────────────────────

/**
 * Het vinkje. Alleen 'manual' en 'open' zijn KLIKBAAR — een afgeleid vinkje
 * ('auto') uitzetten kan niet (het komt bij de volgende render terug) en een
 * niet-van-toepassing-stap heeft niets af te vinken. Beide renderen daarom als
 * statisch merkteken met een sprekend `aria-label`, i.p.v. als knop die niets
 * doet.
 */
function StepCheckbox({
  step,
  state,
  onToggle,
  readOnly,
}: {
  step: WelcomeGuideStep
  state: StepVisualState
  onToggle?: (id: string) => void
  readOnly: boolean
}) {
  const base = 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2'

  if (state === 'auto' || state === 'nvt') {
    const isAuto = state === 'auto'
    return (
      <span
        role="img"
        aria-label={`"${step.title}" — ${STEP_STATE_LABEL[state]}`}
        title={STEP_STATE_LABEL[state]}
        className={`${base} ${
          isAuto
            ? 'border-[var(--positive)] bg-[var(--positive)]'
            : 'border-[var(--border-md)] bg-[var(--subtle)]'
        }`}
      >
        {isAuto ? (
          <Check className="h-3 w-3 text-[var(--paper)]" strokeWidth={3} />
        ) : (
          <Minus className="h-3 w-3 text-[var(--ink-4)]" strokeWidth={3} />
        )}
      </span>
    )
  }

  const isDone = state === 'manual'
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => onToggle?.(step.id)}
      aria-pressed={isDone}
      aria-label={
        isDone ? `Markeer "${step.title}" als niet gedaan` : `Markeer "${step.title}" als gedaan`
      }
      className={`${base} transition-all ${
        isDone
          ? 'border-[var(--positive)] bg-[var(--positive)]'
          : 'border-[var(--border-md)] bg-[var(--paper)]'
      } ${readOnly ? 'cursor-default' : 'cursor-pointer hover:border-[var(--positive)] hover:scale-110'}`}
    >
      {isDone && <Check className="h-3 w-3 text-[var(--paper)]" strokeWidth={3} />}
    </button>
  )
}

function StepIcon({
  step,
  isDone,
  inline = false,
}: {
  step: WelcomeGuideStep
  isDone: boolean
  inline?: boolean
}) {
  if (!step.icon) return null
  const Icon = ICON_MAP[step.icon]
  if (!Icon) return null
  return (
    <Icon
      className={`${inline ? 'h-4 w-4' : 'h-5 w-5'} shrink-0 ${
        isDone ? 'text-positive' : 'text-[var(--ink-3)]'
      }`}
      aria-hidden
    />
  )
}

function StepLink({
  step,
  readOnly,
  compact = false,
}: {
  step: WelcomeGuideStep
  readOnly: boolean
  compact?: boolean
}) {
  if (!step.href) return null
  const label = (
    <>
      Open
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </>
  )
  const cls = `inline-flex items-center gap-1 text-xs font-semibold transition-colors ${
    readOnly
      ? 'text-[var(--ink-4)]'
      : 'text-[var(--ink-2)] hover:text-[var(--ink)] underline-offset-2 hover:underline'
  }`
  if (readOnly) {
    return (
      <span className={cls}>
        {label}
      </span>
    )
  }
  return (
    <Link href={step.href} className={cls}>
      {compact ? <ArrowRight className="h-4 w-4" aria-hidden /> : label}
    </Link>
  )
}
