import { memo } from 'react'
import Link from 'next/link'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, NextStep, NextStepModule } from './widget-renderer'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// Module-accent per stap — de widget bundelt stappen uit Kern, Wil en Horizon,
// dus het stipje vertelt bij welke module de stap hoort. Uitsluitend
// module-tokens (nooit Tailwind-standaardkleuren) conform de kleurconventie.
const STEP_DOT: Record<NextStepModule, string> = {
  kern: 'bg-kern-500',
  wil: 'bg-wil-500',
  horizon: 'bg-horizon-500',
}

const MODULE_LABEL: Record<NextStepModule, string> = {
  kern: 'Overzicht',
  wil: 'Will',
  horizon: 'Toekomst',
}

function ModuleDot({ module }: { module: NextStepModule }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${STEP_DOT[module]}`}
      role="img"
      aria-label={MODULE_LABEL[module]}
      title={MODULE_LABEL[module]}
    />
  )
}

/** Vrijheidsdagen-badge — alleen wanneer de motor een canonieke impact meegaf. */
function ImpactBadge({ days }: { days: number }) {
  return (
    <span
      className="shrink-0 rounded-full bg-wil-50 px-2 py-px font-mono text-xs tabular-nums text-wil-700"
      title={`+${days} vrijheidsdagen`}
    >
      +{days}d
    </span>
  )
}

/** Compacte rij (half) — eigen link naar de bestemming van de stap. */
function StepRow({ step }: { step: NextStep }) {
  return (
    <li className="min-w-0">
      <Link
        href={step.href}
        className="group/step flex items-center gap-2 rounded-[var(--r)] px-1 py-1 transition-colors hover:bg-[var(--subtle)]"
      >
        <ModuleDot module={step.module} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--ink)]">{step.label}</span>
          {step.metric && (
            <span className="block truncate font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
              {step.metric}
            </span>
          )}
        </span>
        {step.impact != null && step.impact > 0 && <ImpactBadge days={step.impact} />}
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] opacity-0 transition-opacity group-hover/step:opacity-100" />
      </Link>
    </li>
  )
}

/** Kaartrij (full) — label + volle zin + meting, eigen link. */
function StepCard({ step }: { step: NextStep }) {
  return (
    <li>
      <Link
        href={step.href}
        className="group/step block rounded-[var(--r)] border border-[var(--border-ed)] p-2.5 transition-colors hover:border-wil-200 hover:bg-[var(--subtle)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ModuleDot module={step.module} />
            <p className="truncate text-sm font-medium text-[var(--ink)]">{step.label}</p>
          </div>
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] opacity-0 transition-opacity group-hover/step:opacity-100" />
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-[var(--ink-3)]">{step.description}</p>
        <div className="mt-1 flex items-center gap-2">
          {step.metric && (
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-4)]">{step.metric}</span>
          )}
          {step.impact != null && step.impact > 0 && (
            <span className="font-serif text-[11px] italic text-positive">
              +{step.impact} vrijheidsdagen
            </span>
          )}
        </div>
      </Link>
    </li>
  )
}

export const VolgendeStapWidget = memo(function VolgendeStapWidget({ size, data, href }: Props) {
  const { nextSteps } = data
  const active = nextSteps.filter(s => !s.dismissed)

  // ── Lege staat ───────────────────────────────────────────────
  if (active.length === 0) {
    // Mini heeft ~40px content-hoogte: één regel, geen icoon — anders kapt de
    // zin af tot onleesbaar.
    if (size === 'mini') {
      return (
        <WidgetShell module="wil" size="mini" kicker="Volgende Stap" href={href}>
          <p className="truncate font-serif text-[13px] italic leading-none text-[var(--ink-3)]">
            Alles op orde
          </p>
        </WidgetShell>
      )
    }
    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-positive" strokeWidth={1.5} />
          <p className="text-center font-serif text-[13px] italic leading-relaxed text-[var(--ink-3)]">
            Alles op orde — geen openstaande stappen
          </p>
        </div>
      </WidgetShell>
    )
  }

  const first = active[0]
  // De tegel wijst naar de bestemming van de bovenste stap i.p.v. de generieke
  // widget-href: inhoud en klikbestemming horen bij elkaar.
  const topHref = first.href || href
  const fundament = active.filter(s => s.kind === 'fundament').length

  // ── Mini: kort actielabel ────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="wil" size="mini" kicker="Volgende Stap" href={topHref}>
        <p className="truncate text-[13px] font-semibold leading-none text-[var(--ink)]">
          {first.label}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: één stap, volledige hoogte benut ────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={topHref}>
        <div className="flex h-full flex-col justify-between">
          <div>
            <div className="flex items-start gap-2">
              <span className="mt-1.5 shrink-0"><ModuleDot module={first.module} /></span>
              <p className="line-clamp-2 flex-1 text-sm font-medium leading-snug text-[var(--ink)]">
                {first.label}
              </p>
            </div>
            {first.metric && (
              <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
                {first.metric}
              </p>
            )}
          </div>
          <div>
            {first.impact != null && first.impact > 0 && (
              <p className="font-serif text-[11px] italic text-positive">
                +{first.impact} vrijheidsdagen
              </p>
            )}
            <p className="text-[10px] text-[var(--ink-4)]">
              {active.length === 1 ? '1 stap open' : `${active.length} stappen open`}
            </p>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Half: drie klikbare rijen, canvas gevuld ─────────────────
  // Geen shell-href: elke rij is zijn eigen link (geen genest anker).
  if (size === 'half') {
    // Rijen met een meting zijn twee regels hoog; dan passen er twee i.p.v.
    // drie binnen de 160px zonder de telregel eruit te duwen.
    const heeftMeting = active.slice(0, 3).some(s => s.metric)
    const shown = active.slice(0, heeftMeting ? 2 : 3)

    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap">
        <div className="flex h-full flex-col">
          <ul className="flex flex-1 flex-col justify-evenly">
            {shown.map(step => (
              <StepRow key={step.key} step={step} />
            ))}
          </ul>
          <p className="shrink-0 border-t border-dashed border-[var(--border-ed)] pt-1 text-[10px] text-[var(--ink-4)]">
            {active.length === 1 ? '1 stap open' : `${active.length} stappen open`}
            {fundament > 0 && fundament < active.length && ` · ${fundament} inrichting`}
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Full: kop met telling + vier stapkaarten ─────────────────
  const topSteps = active.slice(0, 4)
  const totalImpact = active.reduce((sum, s) => sum + (s.impact != null && s.impact > 0 ? s.impact : 0), 0)

  return (
    <WidgetShell module="wil" size={size} kicker="Volgende Stap">
      <div>
        <div className="grid grid-cols-2 divide-x divide-dashed divide-[var(--border-ed)] rounded-[var(--r)] border border-dashed border-[var(--border-ed)] p-3">
          <div className="flex flex-col items-center pr-3">
            <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
              {active.length}
            </span>
            <span className="mt-0.5 text-center font-sans text-[10px] uppercase tracking-wide text-[var(--ink-3)]">
              {active.length === 1 ? 'STAP OPEN' : 'STAPPEN OPEN'}
            </span>
          </div>
          <div className="flex flex-col items-center pl-3">
            <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
              {totalImpact > 0 ? `+${totalImpact}` : '—'}
            </span>
            <span className="mt-0.5 text-center font-sans text-[10px] uppercase leading-tight tracking-wide text-[var(--ink-3)]">
              VRIJHEIDSDAGEN TE WINNEN
            </span>
          </div>
        </div>

        <p className="label-editorial mb-1.5 mt-3 text-[var(--ink-3)]">WAT NU TELT</p>

        <ul className="space-y-2">
          {topSteps.map(step => (
            <StepCard key={step.key} step={step} />
          ))}
        </ul>

        {active.length > topSteps.length && (
          <p className="mt-2 text-center text-xs text-[var(--ink-4)]">
            +{active.length - topSteps.length} andere{' '}
            {active.length - topSteps.length === 1 ? 'stap' : 'stappen'}
          </p>
        )}
      </div>
    </WidgetShell>
  )
})
