import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubbleCentered } from './speech-bubble'
import { Shield, Zap, Telescope } from 'lucide-react'

export function OnboardingIntro({ onNext, onLogout }: { onNext: () => void; onLogout?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6">
        <FinnAvatar size={120} />
      </div>

      <SpeechBubbleCentered>
        <p className="font-medium text-[var(--ink)]">Hoi! Ik ben Will, je persoonlijke gids naar financiële vrijheid.</p>
        <p className="mt-2">
          Wist je dat elke euro die je verdient eigenlijk een stukje levenstijd vertegenwoordigt?
          Hier kijken we anders naar geld: geld is opgeslagen tijd. Tijd die je kunt
          gebruiken om te doen wat jij écht belangrijk vindt.
        </p>
        <p className="mt-2">
          Samen brengen we in kaart hoeveel vrijheid je al hebt opgebouwd &mdash; en hoe je die
          kunt laten groeien. Stap voor stap, in jouw tempo.
        </p>
      </SpeechBubbleCentered>

      {/* Three-module preview */}
      <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Shield className="h-4 w-4 text-amber-700" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-amber-700">De Kern</p>
            <p className="text-xs text-[var(--ink-3)]">Je financiele fundament</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-wil-200 bg-wil-50/50 p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wil-100">
            <Zap className="h-4 w-4 text-wil-700" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-wil-700">De Wil</p>
            <p className="text-xs text-[var(--ink-3)]">Bewuste keuzes maken</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-horizon-200 bg-horizon-50/50 p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-horizon-100">
            <Telescope className="h-4 w-4 text-horizon-700" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-horizon-700">De Horizon</p>
            <p className="text-xs text-[var(--ink-3)]">Je pad naar vrijheid</p>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="mt-8 min-h-[44px] rounded-lg bg-wil-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800"
      >
        Aan de slag
      </button>
      <p className="mt-3 text-xs text-[var(--ink-4)]">Dit duurt nog geen 2 minuten</p>

      {onLogout && (
        <button
          onClick={onLogout}
          className="mt-6 text-xs text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
        >
          Uitloggen
        </button>
      )}
    </div>
  )
}
