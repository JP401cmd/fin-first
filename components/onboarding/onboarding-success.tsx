import { WillDots } from '@/components/app/will-dots'
import { Shield, Zap, Telescope, Newspaper, ListChecks, type LucideIcon } from 'lucide-react'
import { type ModuleId, getActiveNavModules } from '@/lib/module-registry'
import type { GoalSlug } from '@/lib/goals/types'
import { getGoalFirstWinPath } from '@/lib/goals/catalog'

export function OnboardingSuccess({
  onDashboard,
  activeModules,
  goal,
}: {
  onDashboard: () => void
  activeModules?: ModuleId[]
  goal?: GoalSlug
}) {
  const navModules = getActiveNavModules(activeModules ?? [])
  const isNewsOnly = activeModules?.length === 1 && activeModules[0] === 'nieuws'

  // Filter module cards to only show the nav modules the user activated
  const visibleCards = isNewsOnly
    ? []
    : MODULE_CARDS.filter((c) => navModules.includes(c.navModule))

  // Dynamic CTA label based on goal → first-win page
  const firstWinPath = goal ? getGoalFirstWinPath(goal) : undefined
  const ctaLabel = isNewsOnly
    ? 'Naar de Trifinity Post'
    : firstWinPath === '/horizon'
      ? 'Bekijk Toekomst'
      : firstWinPath === '/core/budgets'
        ? 'Bekijk je budgetten'
        : firstWinPath === '/core/debts'
          ? 'Bekijk je schulden'
          : firstWinPath === '/core'
            ? 'Bekijk Overzicht'
            : navModules.includes('wil')
              ? 'Bekijk Tips & acties'
              : 'Bekijk Toekomst'

  return (
    <div className="flex flex-col items-center py-8 text-center sm:py-12">
      {/* Will's avatar — celebration emphasis with subtle pulse */}
      <div className="mb-6 animate-[pulse_3s_ease-in-out_1]">
        <WillDots size={140} />
      </div>

      {/* Celebration heading — font-display */}
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-3xl">
        Welkom bij TriFinity!
      </h1>

      {/* Philosophical closing — font-serif italic */}
      <p className="mt-3 max-w-sm font-serif text-base italic leading-relaxed text-[var(--ink-2)] sm:text-lg">
        &ldquo;Geld is opgeslagen tijd &mdash; en jouw reis naar vrijheid begint nu.&rdquo;
      </p>

      {/* Editorial divider */}
      <div className="mx-auto mt-8 mb-8 h-px w-16 bg-[var(--border-md)]" />

      {/* Introduction text — adapted for news-only users */}
      <div className="mx-auto max-w-md font-serif text-sm leading-relaxed text-[var(--ink-3)]">
        {isNewsOnly ? (
          <p>
            Ik ben Will, je persoonlijke financiële coach. Je vindt me elke dag in de Trifinity Post met nieuws en inzichten die relevant zijn voor jouw financiële situatie.
          </p>
        ) : (
          <p>
            Ik ben Will, je persoonlijke financiële coach. Ik begeleid je door drie
            perspectieven naar financiële vrijheid.
          </p>
        )}
      </div>

      {/* News-only card */}
      {isNewsOnly && (
        <div className="mt-10 w-full">
          <NewsCard />
        </div>
      )}

      {/* Module cards — only for active nav modules */}
      {!isNewsOnly && visibleCards.length > 0 && (
        <div
          className={`mt-10 grid w-full grid-cols-1 gap-3 ${
            visibleCards.length === 2
              ? 'sm:grid-cols-2'
              : visibleCards.length >= 3
                ? 'sm:grid-cols-3'
                : ''
          }`}
        >
          {visibleCards.map((card) => (
            <ModuleCard key={card.name} {...card} />
          ))}
        </div>
      )}

      {/* Module-guide briefing explanation */}
      {!isNewsOnly && (
        <div className="mx-auto mt-10 flex max-w-md items-start gap-3 rounded-xl bg-[var(--subtle)] px-4 py-4 text-left">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wil-100">
            <ListChecks className="h-4 w-4 text-wil-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">
              Je dashboard staat klaar!
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
              Per actieve module vind je een kaart met je eerste stappen. Vink ze af terwijl
              je de app ontdekt, of sluit een kaart als je er klaar mee bent.
            </p>
          </div>
        </div>
      )}

      {/* Will's closing — font-serif italic */}
      <div className="mx-auto mt-8 max-w-md border-y border-[var(--border-ed)] px-4 py-4">
        <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
          Veel ontdekkingen! Elke bewuste keuze brengt je dichter bij vrijheid.
        </p>
      </div>

      {/* Decorative color bar — only segments for active nav modules */}
      <div className="mt-8 flex w-full max-w-xs items-center gap-0">
        {(isNewsOnly || navModules.includes('kern')) && (
          <div className="h-0.5 flex-1 bg-kern-300" />
        )}
        {navModules.includes('wil') && (
          <div className="h-0.5 flex-1 bg-wil-300" />
        )}
        {navModules.includes('horizon') && (
          <div className="h-0.5 flex-1 bg-horizon-300" />
        )}
      </div>

      {/* Dashboard button — label and destination adapt to active modules */}
      <button
        onClick={onDashboard}
        className="mt-6 min-h-[48px] w-full max-w-xs rounded-xl bg-kern-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-kern-700 hover:shadow-md active:bg-kern-800 active:shadow-none sm:w-auto sm:min-w-[200px]"
      >
        {ctaLabel}
      </button>
    </div>
  )
}

/* ── News-only card ───────────────────────────────────────── */

function NewsCard() {
  return (
    <div className="card-editorial flex items-start gap-3 border-l-3 border-wil-400 p-4 text-left">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wil-100">
        <Newspaper className="h-5 w-5 text-wil-700" />
      </div>
      <div>
        <p className="font-display text-sm font-semibold text-wil-700">De Trifinity Post</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">
          Dagelijks financieel nieuws en inzichten, gepersonaliseerd voor jouw situatie.
        </p>
      </div>
    </div>
  )
}

/* ── Module card component ───────────────────────────────── */

function ModuleCard({ name, description, icon: Icon, borderClass, iconBgClass, iconTextClass, nameTextClass }: ModuleCardDef) {
  return (
    <div className={`card-editorial flex items-start gap-3 border-l-3 p-4 text-left ${borderClass}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBgClass}`}>
        <Icon className={`h-5 w-5 ${iconTextClass}`} />
      </div>
      <div>
        <p className={`font-display text-sm font-semibold ${nameTextClass}`}>{name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">{description}</p>
      </div>
    </div>
  )
}

/* ── Module card data ────────────────────────────────────── */

interface ModuleCardDef {
  name: string
  description: string
  icon: LucideIcon
  borderClass: string
  iconBgClass: string
  iconTextClass: string
  nameTextClass: string
  navModule: 'kern' | 'wil' | 'horizon'
}

const MODULE_CARDS: ModuleCardDef[] = [
  {
    name: 'Overzicht',
    description: 'Ken je werkelijkheid: nettovermogen, bezittingen, schulden en budget.',
    icon: Shield,
    borderClass: 'border-kern-400',
    iconBgClass: 'bg-kern-100',
    iconTextClass: 'text-kern-700',
    nameTextClass: 'text-kern-700',
    navModule: 'kern',
  },
  {
    name: 'Tips & acties',
    description: 'Neem de regie: gepersonaliseerde tips en acties op basis van jouw data en de wereld om je heen.',
    icon: Zap,
    borderClass: 'border-wil-400',
    iconBgClass: 'bg-wil-100',
    iconTextClass: 'text-wil-700',
    nameTextClass: 'text-wil-700',
    navModule: 'wil',
  },
  {
    name: 'Toekomst',
    description: "Zie je vrijheid groeien: prognoses, scenario's en het effect van elke keuze.",
    icon: Telescope,
    borderClass: 'border-horizon-400',
    iconBgClass: 'bg-horizon-100',
    iconTextClass: 'text-horizon-700',
    nameTextClass: 'text-horizon-700',
    navModule: 'horizon',
  },
]
