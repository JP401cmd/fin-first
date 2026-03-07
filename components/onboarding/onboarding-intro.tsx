import { FinnAvatar, FhinAvatar, FfinAvatar } from '@/components/app/avatars'
import { SpeechBubbleCentered } from './speech-bubble'

export function OnboardingIntro({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6">
        <FinnAvatar size={120} />
      </div>

      <SpeechBubbleCentered>
        <p className="font-medium text-zinc-900">Hoi! Ik ben Will, je financiele gids.</p>
        <p className="mt-2">
          Bij TriFinity kijken we anders naar geld. Geld is opgeslagen tijd &mdash;
          elke euro vertegenwoordigt vrijheid die je hebt verdiend. Samen maken we
          je financiele reis zichtbaar.
        </p>
      </SpeechBubbleCentered>

      {/* Three-module preview */}
      <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <div className="shrink-0"><FhinAvatar size={32} /></div>
          <div className="text-left">
            <p className="text-xs font-semibold text-amber-700">De Kern</p>
            <p className="text-xs text-zinc-500">Je financiele fundament</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-wil-200 bg-wil-50/50 p-3">
          <div className="shrink-0"><FinnAvatar size={32} /></div>
          <div className="text-left">
            <p className="text-xs font-semibold text-wil-700">De Wil</p>
            <p className="text-xs text-zinc-500">Bewuste keuzes maken</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-horizon-200 bg-horizon-50/50 p-3">
          <div className="shrink-0"><FfinAvatar size={32} /></div>
          <div className="text-left">
            <p className="text-xs font-semibold text-horizon-700">De Horizon</p>
            <p className="text-xs text-zinc-500">Je pad naar vrijheid</p>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="mt-8 rounded-lg bg-wil-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700"
      >
        Aan de slag
      </button>
      <p className="mt-3 text-xs text-zinc-400">Dit duurt nog geen 2 minuten</p>
    </div>
  )
}
