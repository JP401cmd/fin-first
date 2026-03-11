import { FinnAvatar } from '@/components/app/avatars'
import { Shield, Zap, Telescope, type LucideIcon } from 'lucide-react'

export function OnboardingSuccess({ onDashboard }: { onDashboard: () => void }) {
  return (
    <div className="flex flex-col items-center py-8 text-center sm:py-12">
      {/* Will's avatar — celebration emphasis with subtle pulse */}
      <div className="mb-6 animate-[pulse_3s_ease-in-out_1]">
        <FinnAvatar size={140} />
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

      {/* Introduction text */}
      <div className="mx-auto max-w-md font-serif text-sm leading-relaxed text-[var(--ink-3)]">
        <p>
          Ik ben Will, je persoonlijke financiële coach. Ik begeleid je door drie
          perspectieven naar financiële vrijheid.
        </p>
      </div>

      {/* Three module cards — card-editorial with module-colored left border */}
      <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {MODULE_CARDS.map((card) => (
          <ModuleCard key={card.name} {...card} />
        ))}
      </div>

      {/* Will's closing — font-serif italic */}
      <div className="mx-auto mt-10 max-w-md border-y border-[var(--border-ed)] px-4 py-4">
        <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
          Veel ontdekkingen! Elke bewuste keuze brengt je dichter bij vrijheid.
        </p>
      </div>

      {/* Decorative module-color line before CTA */}
      <div className="mt-8 flex w-full max-w-xs items-center gap-0">
        <div className="h-0.5 flex-1 bg-kern-300" />
        <div className="h-0.5 flex-1 bg-wil-300" />
        <div className="h-0.5 flex-1 bg-horizon-300" />
      </div>

      {/* Dashboard button — prominent, full-width mobile, bg-wil-600 rounded-xl */}
      <button
        onClick={onDashboard}
        className="mt-6 min-h-[48px] w-full max-w-xs rounded-xl bg-wil-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-wil-700 hover:shadow-md active:bg-wil-800 active:shadow-none sm:w-auto sm:min-w-[200px]"
      >
        Ga naar De Wil
      </button>
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
}

const MODULE_CARDS: ModuleCardDef[] = [
  {
    name: 'De Kern',
    description: 'Ken je werkelijkheid: nettovermogen, bezittingen, schulden en budget.',
    icon: Shield,
    borderClass: 'border-kern-400',
    iconBgClass: 'bg-kern-100',
    iconTextClass: 'text-kern-700',
    nameTextClass: 'text-kern-700',
  },
  {
    name: 'De Wil',
    description: 'Neem de regie: gepersonaliseerde inzichten en acties op basis van jouw data en de wereld om je heen.',
    icon: Zap,
    borderClass: 'border-wil-400',
    iconBgClass: 'bg-wil-100',
    iconTextClass: 'text-wil-700',
    nameTextClass: 'text-wil-700',
  },
  {
    name: 'De Horizon',
    description: 'Zie je vrijheid groeien: prognoses, scenario\'s en het effect van elke keuze.',
    icon: Telescope,
    borderClass: 'border-horizon-400',
    iconBgClass: 'bg-horizon-100',
    iconTextClass: 'text-horizon-700',
    nameTextClass: 'text-horizon-700',
  },
]
