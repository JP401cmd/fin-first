'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, useCallback, type ComponentType } from 'react'
import { Bell, Settings, MessageCircle, X, Wallet, BarChart3, TrendingUp, Zap, Compass, Newspaper } from 'lucide-react'
import { WillDots } from '@/components/app/will-dots'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { MODULE_CATALOG, getModuleLabel, type ModuleId } from '@/lib/module-registry'

// ── Module display order (canonical) ────────────────────────
const MODULE_ORDER: ModuleId[] = [
  'budgetteren',
  'vermogensregistratie',
  'aandelenregistratie',
  'inzicht_acties',
  'toekomstplannen',
  'nieuws',
]

// ── Module summaries ─────────────────────────────────────────

const MODULE_SUMMARIES: Record<ModuleId, {
  icon: ComponentType<{ className?: string }>
  summary: string
  /** Tailwind classes for the icon color */
  iconColor: string
  /** Tailwind classes for the circle background */
  circleBg: string
}> = {
  budgetteren: {
    icon: BarChart3,
    summary: 'Budgetten, cashflow en spaarquote bijhouden',
    iconColor: 'text-kern-600',
    circleBg: 'bg-kern-50',
  },
  vermogensregistratie: {
    icon: Wallet,
    summary: 'Vermogen, bezittingen en schulden registreren',
    iconColor: 'text-kern-600',
    circleBg: 'bg-kern-50',
  },
  aandelenregistratie: {
    icon: TrendingUp,
    summary: 'Beleggingsportefeuille en koersen volgen',
    iconColor: 'text-kern-600',
    circleBg: 'bg-kern-50',
  },
  inzicht_acties: {
    icon: Zap,
    summary: 'Doelen, trends en gepersonaliseerde aanbevelingen',
    iconColor: 'text-wil-600',
    circleBg: 'bg-wil-50',
  },
  toekomstplannen: {
    icon: Compass,
    summary: 'Vrijheidsdatum, simulaties en levensgebeurtenissen',
    iconColor: 'text-horizon-600',
    circleBg: 'bg-horizon-50',
  },
  nieuws: {
    icon: Newspaper,
    summary: 'Gepersonaliseerd financieel nieuws',
    iconColor: 'text-[var(--ink-2)]',
    circleBg: 'bg-[var(--subtle)]',
  },
}

// ── Module row ───────────────────────────────────────────────

function ModuleRow({
  moduleId,
  delay,
}: {
  moduleId: ModuleId
  delay: number
}) {
  const entry = MODULE_SUMMARIES[moduleId]
  const Icon = entry.icon
  const label = getModuleLabel(moduleId)

  return (
    <div
      className="flex items-center gap-3 animate-fade-up"
      style={{ '--stagger': `${delay}ms` } as React.CSSProperties}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${entry.circleBg}`}
      >
        <Icon className={`h-3.5 w-3.5 ${entry.iconColor}`} />
      </span>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-sm font-medium text-[var(--ink)] whitespace-nowrap">{label}</span>
        <span className="text-sm text-[var(--ink-3)] truncate">{entry.summary}</span>
      </div>
    </div>
  )
}

// ── Tip row ──────────────────────────────────────────────────

function Tip({
  icon: Icon,
  children,
  delay,
}: {
  icon: ComponentType<{ className?: string }>
  children: React.ReactNode
  delay: number
}) {
  return (
    <div
      className="flex items-start gap-3 animate-fade-up"
      style={{ '--stagger': `${delay}ms` } as React.CSSProperties}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)]">
        <Icon className="h-3.5 w-3.5 text-[var(--ink-3)]" />
      </span>
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">{children}</p>
    </div>
  )
}

// ── Banner ───────────────────────────────────────────────────

export function WelcomeBanner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { activeModules } = useModuleAccess()
  const [visible, setVisible] = useState(false)

  const isWelcome = searchParams.get('welcome') === '1'

  useEffect(() => {
    if (isWelcome) setVisible(true)
  }, [isWelcome])

  const dismiss = useCallback(() => {
    setVisible(false)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('welcome')
    const qs = params.toString()
    router.replace(pathname + (qs ? `?${qs}` : ''), { scroll: false })
  }, [searchParams, router, pathname])

  // Auto-dismiss na 30s
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(dismiss, 30_000)
    return () => clearTimeout(timer)
  }, [visible, dismiss])

  if (!visible) return null

  const moduleCount = activeModules.length
  const isNewsOnly =
    activeModules.length === 1 && activeModules[0] === 'nieuws'

  // Sorted active modules following canonical order
  const sortedModules = MODULE_ORDER.filter((id) =>
    activeModules.includes(id),
  )

  // Stagger delay accounting: modules section comes first, tips follow after
  const moduleBaseDelay = 160
  const moduleStaggerStep = 60
  const tipBaseDelay =
    moduleBaseDelay + sortedModules.length * moduleStaggerStep + 40

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <div className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s1)] animate-fade-up">
        {/* Module color accent bar */}
        <div className="flex h-1">
          {activeModules.some((m) =>
            ['budgetteren', 'vermogensregistratie', 'aandelenregistratie'].includes(m),
          ) && <div className="flex-1 bg-kern-400" />}
          {activeModules.includes('inzicht_acties') && (
            <div className="flex-1 bg-wil-400" />
          )}
          {activeModules.includes('toekomstplannen') && (
            <div className="flex-1 bg-horizon-400" />
          )}
        </div>

        <div className="p-5 sm:p-6">
          {/* Close */}
          <button
            type="button"
            onClick={dismiss}
            className="absolute right-3 top-4 rounded-[var(--r-sm)] p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)]"
            aria-label="Sluiten"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="flex items-start gap-4 pr-8">
            <div className="shrink-0 animate-fade-up">
              <WillDots size={44} />
            </div>
            <div className="flex-1 animate-fade-up" style={{ '--stagger': '80ms' } as React.CSSProperties}>
              <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--ink)]">
                Welkom bij TriFinity!
              </h2>
              <p className="mt-1 font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
                {isNewsOnly
                  ? 'Je persoonlijke financiële krant staat klaar.'
                  : `Je hebt ${moduleCount} module${moduleCount !== 1 ? 's' : ''} geactiveerd. Hier is wat ze voor je doen.`}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-12 my-4 h-px bg-[var(--border-ed)]" />

          {/* Section 1: Jouw modules */}
          <div className="space-y-2.5 pl-0 sm:pl-[60px]">
            {sortedModules.map((id, i) => (
              <ModuleRow
                key={id}
                moduleId={id}
                delay={moduleBaseDelay + i * moduleStaggerStep}
              />
            ))}
          </div>

          {/* Divider */}
          <div className="mx-12 my-4 h-px bg-[var(--border-ed)]" />

          {/* Section 2: Tips */}
          <div className="space-y-3 pl-0 sm:pl-[60px]">
            <Tip icon={Bell} delay={tipBaseDelay}>
              Er staan invul-suggesties klaar in je{' '}
              <strong className="font-medium text-[var(--ink)]">meldingencentrum</strong>{' '}
              <span className="text-[var(--ink-4)]">(bel-icoon rechtsboven)</span>.
              {' '}Vul je gegevens stap voor stap aan.
            </Tip>
            <Tip icon={Settings} delay={tipBaseDelay + 80}>
              Modules en instellingen aanpassen? Ga naar je{' '}
              <strong className="font-medium text-[var(--ink)]">profielicoon</strong>{' '}
              <span className="text-[var(--ink-4)]">(rechtsboven)</span>.
            </Tip>
            <Tip icon={MessageCircle} delay={tipBaseDelay + 160}>
              Heb je vragen? Klik op{' '}
              <strong className="font-medium text-[var(--ink)]">Will</strong>{' '}
              <span className="text-[var(--ink-4)]">(rechtsonder)</span>.
            </Tip>
          </div>
        </div>
      </div>
    </div>
  )
}
