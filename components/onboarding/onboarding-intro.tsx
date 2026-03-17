import { WillDots } from '@/components/app/will-dots'
import { Shield, Zap, Telescope, type LucideIcon } from 'lucide-react'

export function OnboardingIntro({ onNext, onLogout }: { onNext: () => void; onLogout?: () => void }) {
  return (
    <div className="flex flex-col items-center py-8 sm:py-12">
      {/* Will's avatar — 140px, centered, breathing animation built-in */}
      <div className="mb-8">
        <WillDots size={140} />
      </div>

      {/* Welcome heading — font-display for premium feel */}
      <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
        Welkom bij TriFinity
      </h1>

      {/* Philosophy tagline — font-serif italic */}
      <p className="mt-3 max-w-sm font-serif text-base italic leading-relaxed text-[var(--ink-2)] sm:text-lg">
        Geld is opgeslagen tijd &mdash; elke euro vertegenwoordigt een stukje levenstijd.
      </p>

      {/* Editorial divider */}
      <div className="mx-auto mt-8 mb-8 h-px w-16 bg-[var(--border-md)]" />

      {/* Introduction text */}
      <div className="mx-auto max-w-md text-center font-serif text-sm leading-relaxed text-[var(--ink-3)]">
        <p>
          Hier kijken we anders naar geld. Samen brengen we in kaart hoeveel vrijheid
          je al hebt opgebouwd &mdash; en hoe je die kunt laten groeien.
        </p>
      </div>

      {/* Three-module preview cards — card-editorial with module-colored left border */}
      <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {MODULE_CARDS.map((mod) => (
          <ModuleCard key={mod.name} {...mod} />
        ))}
      </div>

      {/* CTA button — full-width mobile, centered max-w-xs desktop */}
      <button
        onClick={onNext}
        className="mt-10 min-h-[48px] w-full max-w-xs rounded-xl bg-wil-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-wil-700 hover:shadow-md active:bg-wil-800 active:shadow-none sm:w-auto sm:min-w-[200px]"
      >
        Aan de slag
      </button>

      {/* Duration label — label-editorial style */}
      <p className="label-editorial mt-3 text-[var(--ink-4)]">
        Dit duurt nog geen 2 minuten
      </p>

      {/* Logout link — ghost text */}
      {onLogout && (
        <button
          onClick={onLogout}
          className="mt-8 text-xs text-[var(--ink-4)] transition-colors hover:text-[var(--ink-3)]"
        >
          Uitloggen
        </button>
      )}
    </div>
  )
}

/* ── Module card component ───────────────────────────────── */

function ModuleCard({ name, description, icon: Icon, borderClass, iconBgClass, iconTextClass, nameTextClass }: ModuleCardDef) {
  return (
    <div className={`card-editorial flex items-center gap-3 border-l-3 p-4 ${borderClass}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBgClass}`}>
        <Icon className={`h-5 w-5 ${iconTextClass}`} />
      </div>
      <div className="text-left">
        <p className={`font-display text-sm font-semibold ${nameTextClass}`}>{name}</p>
        <p className="text-xs text-[var(--ink-3)]">{description}</p>
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
    description: 'Ken je werkelijkheid',
    icon: Shield,
    borderClass: 'border-kern-400',
    iconBgClass: 'bg-kern-100',
    iconTextClass: 'text-kern-700',
    nameTextClass: 'text-kern-700',
  },
  {
    name: 'De Wil',
    description: 'Neem de regie',
    icon: Zap,
    borderClass: 'border-wil-400',
    iconBgClass: 'bg-wil-100',
    iconTextClass: 'text-wil-700',
    nameTextClass: 'text-wil-700',
  },
  {
    name: 'De Horizon',
    description: 'Zie je vrijheid groeien',
    icon: Telescope,
    borderClass: 'border-horizon-400',
    iconBgClass: 'bg-horizon-100',
    iconTextClass: 'text-horizon-700',
    nameTextClass: 'text-horizon-700',
  },
]
