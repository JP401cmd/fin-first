import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubbleCentered } from './speech-bubble'

const SEEDING_MESSAGES = [
  'Je profiel wordt aangemaakt...',
  'Bankrekeningen en budgetten instellen...',
  'Bezittingen en schulden in kaart brengen...',
  'Transactiehistorie genereren...',
  'Doelen en aanbevelingen opstellen...',
  'Bijna klaar, alles wordt opgeslagen...',
]

export function OnboardingSeeding({
  progress,
  stepText,
  messageIndex,
  error,
  onRetry,
}: {
  progress: number
  stepText: string
  messageIndex: number
  error: string | null
  onRetry: () => void
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
      {!error ? (
        <>
          <div className="mx-auto mb-4">
            <FinnAvatar size={80} />
          </div>

          <SpeechBubbleCentered>
            <p className="font-medium text-zinc-900">
              {SEEDING_MESSAGES[messageIndex % SEEDING_MESSAGES.length]}
            </p>
          </SpeechBubbleCentered>

          <p className="mt-3 text-sm text-zinc-500">{stepText}</p>

          {/* Progress bar */}
          <div className="mx-auto mt-6 max-w-md">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-400">{progress}%</p>
          </div>
        </>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900">Er ging iets mis</h2>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <button
            onClick={onRetry}
            className="mt-6 rounded-lg border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Opnieuw proberen
          </button>
        </>
      )}
    </div>
  )
}
