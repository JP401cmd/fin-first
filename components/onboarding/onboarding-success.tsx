import { FinnAvatar, FhinAvatar, FfinAvatar } from '@/components/app/avatars'
import { SpeechBubbleCentered } from './speech-bubble'

export function OnboardingSuccess({ onDashboard }: { onDashboard: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4">
        <FinnAvatar size={80} />
      </div>

      <h2 className="text-2xl font-bold text-zinc-900">Welkom bij TriFinity!</h2>
      <p className="mt-2 text-sm text-zinc-500">Ontmoet je team</p>

      {/* Three avatar cards */}
      <div className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col items-center rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-5">
          <FhinAvatar size={48} />
          <p className="mt-2 text-sm font-semibold text-amber-700">De Kern</p>
          <p className="mt-1 text-xs text-zinc-500">Je financiele fundament</p>
        </div>
        <div className="flex flex-col items-center rounded-2xl border-2 border-teal-200 bg-teal-50/50 p-5">
          <FinnAvatar size={48} />
          <p className="mt-2 text-sm font-semibold text-teal-700">De Wil</p>
          <p className="mt-1 text-xs text-zinc-500">Bewuste keuzes. Ik ben bereikbaar via het chatknopje</p>
        </div>
        <div className="flex flex-col items-center rounded-2xl border-2 border-purple-200 bg-purple-50/50 p-5">
          <FfinAvatar size={48} />
          <p className="mt-2 text-sm font-semibold text-purple-700">De Horizon</p>
          <p className="mt-1 text-xs text-zinc-500">Je pad naar het &infin;-symbool</p>
        </div>
      </div>

      {/* FINN closing message */}
      <div className="mt-6 w-full">
        <SpeechBubbleCentered>
          Veel ontdekkingen! Elke bewuste keuze brengt je dichter bij vrijheid.
        </SpeechBubbleCentered>
      </div>

      <button
        onClick={onDashboard}
        className="mt-8 rounded-lg bg-teal-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700"
      >
        Ontdek je dashboard
      </button>
    </div>
  )
}
