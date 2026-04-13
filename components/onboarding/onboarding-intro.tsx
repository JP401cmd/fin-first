import { WillDots } from '@/components/app/will-dots'

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

      {/* Introduction text — leads to the intention question */}
      <div className="mx-auto max-w-md text-center font-serif text-sm leading-relaxed text-[var(--ink-3)] space-y-3">
        <p>
          Hier kijken we anders naar geld. Samen brengen we in kaart hoeveel vrijheid
          je al hebt opgebouwd &mdash; en hoe je die kunt laten groeien.
        </p>
        <p>
          We beginnen met een paar vragen om te begrijpen waar jij staat
          en wat voor jou belangrijk is.
        </p>
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
