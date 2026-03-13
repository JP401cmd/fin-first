'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, ChevronRight, ChevronLeft,
  Zap, Target, ListChecks, CreditCard,
  TrendingUp, Calendar, GitBranch, Dice5,
  Check, type LucideIcon,
} from 'lucide-react'
import { FfinAvatar } from '@/components/app/avatars'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { formatCurrency } from '@/lib/format'
import type { FeatureAccessData } from '@/lib/compute-feature-access'

// ── Phase styling ──────────────────────────────────────────

const PHASE_GRADIENT_STYLE: Record<string, React.CSSProperties> = {
  recovery:  { background: 'linear-gradient(to right, var(--color-phase-recovery-500), var(--color-phase-recovery-600))' },
  stability: { background: 'linear-gradient(to right, var(--color-phase-stability-500), var(--color-phase-stability-600))' },
  momentum:  { background: 'linear-gradient(to right, var(--color-phase-momentum-500), var(--color-phase-momentum-600))' },
  mastery:   { background: 'linear-gradient(to right, var(--color-phase-mastery-500), var(--color-phase-mastery-600))' },
}

const PHASE_BADGE_STYLE: Record<string, React.CSSProperties> = {
  recovery:  { backgroundColor: 'var(--color-phase-recovery-100)',  color: 'var(--color-phase-recovery-700)' },
  stability: { backgroundColor: 'var(--color-phase-stability-100)', color: 'var(--color-phase-stability-700)' },
  momentum:  { backgroundColor: 'var(--color-phase-momentum-100)',  color: 'var(--color-phase-momentum-700)' },
  mastery:   { backgroundColor: 'var(--color-phase-mastery-100)',   color: 'var(--color-phase-mastery-700)' },
}

const PHASE_LABELS: Record<string, string> = {
  recovery: 'Herstel',
  stability: 'Stabiliteit',
  momentum: 'Momentum',
  mastery: 'Meesterschap',
}

// ── Step types ─────────────────────────────────────────────

type Step = 'level' | 'kern' | 'wil' | 'horizon'
const STEPS: Step[] = ['level', 'kern', 'wil', 'horizon']

const STEP_DOT_COLORS: Record<Step, string> = {
  level: 'bg-[var(--ink)]',
  kern: 'bg-kern-500',
  wil: 'bg-wil-500',
  horizon: 'bg-horizon-500',
}

type RoadmapModalProps = {
  data: FeatureAccessData
  open: boolean
  onClose: () => void
}

// ── Newspaper primitives ───────────────────────────────────

function Masthead({ section, pageNum }: { section: string; pageNum: number }) {
  const today = new Date()
  const dateStr = today.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
        <span>{dateStr}</span>
        <span>Pagina {pageNum} van 4</span>
      </div>
      <div className="mt-1.5 border-t-2 border-b border-[var(--ink)] py-1">
        <p className="text-center font-display text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          {section}
        </p>
      </div>
    </div>
  )
}

function Rule() {
  return <div className="my-4 border-t border-[var(--border-ed)]" />
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[22px] font-bold leading-tight tracking-tight text-[var(--ink)] sm:text-[26px]">
      {children}
    </h2>
  )
}

function Byline({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 font-serif text-[13px] italic leading-relaxed text-[var(--ink-3)]">
      {children}
    </p>
  )
}

function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-l-2 border-[var(--ink)] pl-3 font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
      {children}
    </blockquote>
  )
}

function ArticleTeaser({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--subtle)]">
        <Icon className="h-3.5 w-3.5 text-[var(--ink-3)]" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug text-[var(--ink)]">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-3)]">{body}</p>
      </div>
    </div>
  )
}

function StatBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${color ?? 'text-[var(--ink)]'}`}>{value}</p>
    </div>
  )
}

function KernCheckRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-dotted border-[var(--border-ed)] py-1.5">
      <span className="flex items-center gap-1.5 text-[13px] text-[var(--ink-2)]">
        <Check className="h-3 w-3 text-kern-500" />
        {label}
      </span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-[var(--ink)]">{value}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────

export function RoadmapModal({ data, open, onClose }: RoadmapModalProps) {
  const router = useRouter()
  const [stepIdx, setStepIdx] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [activating, setActivating] = useState(false)
  const [recsTriggered, setRecsTriggered] = useState(false)

  const step = STEPS[stepIdx]
  const gradientStyle = PHASE_GRADIENT_STYLE[data.phase] ?? PHASE_GRADIENT_STYLE.recovery
  const badgeStyle = PHASE_BADGE_STYLE[data.phase] ?? PHASE_BADGE_STYLE.recovery
  const phaseLabel = PHASE_LABELS[data.phase] ?? data.phase

  const yearlyExpenses = data.monthlyExpenses * 12
  const freedomYears = yearlyExpenses > 0 ? Math.floor(data.netWorth / yearlyExpenses) : 0
  const freedomMonths = yearlyExpenses > 0 ? Math.floor(((data.netWorth / yearlyExpenses) - freedomYears) * 12) : 0

  // Fire-and-forget background recommendation generation
  const triggerRecs = useCallback(() => {
    if (recsTriggered) return
    setRecsTriggered(true)
    fetch('/api/ai/recommendations/initial', { method: 'POST' }).catch(() => {})
  }, [recsTriggered])

  if (open && !recsTriggered) triggerRecs()

  function goNext() {
    if (stepIdx < STEPS.length - 1) {
      setDirection('forward')
      setStepIdx(stepIdx + 1)
    }
  }

  function goBack() {
    if (stepIdx > 0) {
      setDirection('back')
      setStepIdx(stepIdx - 1)
    }
  }

  async function handleActivate() {
    setActivating(true)
    try {
      const res = await fetch('/api/activate', { method: 'POST' })
      if (!res.ok) throw new Error('Activation failed')
      router.refresh()
      onClose()
      router.push('/will')
    } catch {
      setActivating(false)
    }
  }

  const isLast = stepIdx === STEPS.length - 1

  return (
    <BottomSheet open={open} onClose={onClose} size="xl">
      <div className="px-5 pb-5 pt-4 sm:px-8 sm:pb-8 sm:pt-6">
      <div className="overflow-hidden">
        <div
          key={step}
          className={direction === 'forward' ? 'roadmap-step-forward' : 'roadmap-step-back'}
        >
          {/* ════════════════════════════════════════════════════
              PAGE 1 — VOORPAGINA: Jouw Startpositie
              ════════════════════════════════════════════════════ */}
          {step === 'level' && (
            <article>
              <Masthead section="Jouw Financiele Krant" pageNum={1} />

              {/* Headline + avatar layout */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Headline>
                    Fase: {phaseLabel}
                  </Headline>
                  <Byline>
                    Dit is je financiele startpositie — het begin van je reis naar vrijheid.
                  </Byline>
                </div>
                <div className="flex-shrink-0">
                  <div className="rounded-full p-0.5" style={gradientStyle}>
                    <div className="rounded-full bg-[var(--paper)] p-1">
                      <FfinAvatar size={52} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Phase badge */}
              <div className="mt-3">
                <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={badgeStyle}>
                  {phaseLabel}
                </span>
              </div>

              <Rule />

              {/* 3-column stats — newspaper style with separators */}
              <div className="grid grid-cols-3">
                <StatBlock
                  label="Vermogen"
                  value={formatCurrency(data.netWorth)}
                  color={data.netWorth >= 0 ? 'text-green-700' : 'text-red-600'}
                />
                <div className="border-x border-[var(--border-ed)]">
                  <StatBlock label="Vrijheid" value={`${data.freedomPct.toFixed(1)}%`} color="text-horizon-700" />
                </div>
                <StatBlock
                  label="Tijd"
                  value={`${freedomYears > 0 ? `${freedomYears}j ` : ''}${freedomMonths}m`}
                />
              </div>

              <Rule />

              <PullQuote>
                Geld is opgeslagen tijd — elke euro vertegenwoordigt een stukje levenstijd.
              </PullQuote>
            </article>
          )}

          {/* ════════════════════════════════════════════════════
              PAGE 2 — DE KERN: Financieel Overzicht
              ════════════════════════════════════════════════════ */}
          {step === 'kern' && (
            <article>
              <Masthead section="De Kern — Financieel Overzicht" pageNum={2} />

              <Headline>Je fundament staat</Headline>
              <Byline>
                Alle financiele feiten zijn verzameld. Hier is wat we weten.
              </Byline>

              <Rule />

              {/* Ledger-style check rows */}
              <div>
                <KernCheckRow label="Vermogen in kaart" value={formatCurrency(Math.abs(data.netWorth))} />
                <KernCheckRow
                  label="Schulden"
                  value={data.netWorth < 0 ? formatCurrency(Math.abs(data.netWorth)) : 'Geen'}
                />
                <KernCheckRow
                  label="Maandelijkse cashflow"
                  value={data.monthlyExpenses > 0 ? formatCurrency(data.monthlyExpenses) : 'Via profiel'}
                />
              </div>

              <Rule />

              <PullQuote>
                De Kern is je anker — hier keer je altijd terug om de feiten te zien.
              </PullQuote>
            </article>
          )}

          {/* ════════════════════════════════════════════════════
              PAGE 3 — DE WIL: Actie & Inzicht
              ════════════════════════════════════════════════════ */}
          {step === 'wil' && (
            <article>
              <Masthead section="De Wil — Actie & Inzicht" pageNum={3} />

              <Headline>Van data naar daadkracht</Headline>
              <Byline>
                De Wil vertaalt je financiele werkelijkheid naar concrete stappen.
              </Byline>

              <Rule />

              <div className="space-y-4">
                <ArticleTeaser icon={Zap} title="Voorstellen" body="Gepersonaliseerde aanbevelingen op basis van jouw situatie" />
                <ArticleTeaser icon={Target} title="Doelen" body="Stel financiele doelen en volg je voortgang over tijd" />
                <ArticleTeaser icon={ListChecks} title="Acties" body="Concrete stappen die je vandaag al kunt nemen" />
                <ArticleTeaser icon={CreditCard} title="Abonnementen" body="Beheer en optimaliseer je vaste lasten" />
              </div>
            </article>
          )}

          {/* ════════════════════════════════════════════════════
              PAGE 4 — DE HORIZON: Toekomst & Vrijheid
              ════════════════════════════════════════════════════ */}
          {step === 'horizon' && (
            <article>
              <Masthead section="De Horizon — Toekomst & Vrijheid" pageNum={4} />

              <Headline>Wanneer ben je vrij?</Headline>
              <Byline>
                De Horizon berekent je pad naar financiele onafhankelijkheid.
              </Byline>

              <Rule />

              <div className="space-y-4">
                <ArticleTeaser icon={TrendingUp} title="FIRE Projectie" body="Wanneer bereik je financiele onafhankelijkheid?" />
                <ArticleTeaser icon={Calendar} title="Levensgebeurtenissen" body="Plan grote uitgaven en veranderingen in je leven" />
                <ArticleTeaser icon={GitBranch} title="Scenario's" body="Vergelijk wat-als scenario's naast elkaar" />
                <ArticleTeaser icon={Dice5} title="Simulaties" body="Monte Carlo simulaties voor robuuste planning" />
              </div>

              <Rule />

              {/* Activation CTA — styled as a newspaper call-to-action box */}
              <div className="rounded-[var(--r)] border-2 border-[var(--ink)] p-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">Klaar om te beginnen?</p>
                <p className="mt-1 font-serif text-sm italic text-[var(--ink-2)]">
                  Activeer je routekaart en ontgrendel De Wil en De Horizon.
                </p>
              </div>
            </article>
          )}
        </div>
      </div>

      {/* ── Page navigation ── */}
      <div className="mt-6 flex items-center justify-between border-t border-[var(--border-ed)] pt-4">
        <button
          onClick={goBack}
          disabled={stepIdx === 0}
          className="flex items-center gap-1 text-[12px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] disabled:invisible"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Vorige pagina
        </button>

        {/* Page dots */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`rounded-full transition-all duration-300 ${
                i === stepIdx
                  ? `h-2 w-5 ${STEP_DOT_COLORS[s]}`
                  : i < stepIdx
                    ? `h-1.5 w-1.5 ${STEP_DOT_COLORS[s]} opacity-40`
                    : 'h-1.5 w-1.5 bg-[var(--border-md)]'
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <button
            onClick={handleActivate}
            disabled={activating}
            className="flex items-center gap-1.5 rounded-[var(--r)] px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={gradientStyle}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {activating ? 'Activeren...' : 'Activeer'}
          </button>
        ) : (
          <button
            onClick={goNext}
            className="flex items-center gap-1 text-[12px] font-medium text-[var(--ink)] transition-colors hover:text-[var(--ink-2)]"
          >
            Volgende pagina
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      </div>
    </BottomSheet>
  )
}
