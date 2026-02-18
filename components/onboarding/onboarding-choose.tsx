import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubble } from './speech-bubble'

export function OnboardingChoose({
  onOwnData,
  onDemo,
}: {
  onOwnData: () => void
  onDemo: () => void
}) {
  return (
    <div>
      {/* FINN guidance */}
      <div className="mb-6 flex items-start gap-3">
        <div className="shrink-0"><FinnAvatar size={48} /></div>
        <SpeechBubble>
          Top, daar gaan we! Kies hoe je wilt starten &mdash; je kunt later altijd wisselen.
        </SpeechBubble>
      </div>

      <div className="space-y-4">
        {/* Option 1: Own data */}
        <button
          onClick={onOwnData}
          className="group w-full rounded-2xl border-2 border-zinc-200 bg-white p-6 text-left transition-all hover:border-teal-300 hover:shadow-md"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xl group-hover:bg-teal-100">
              <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">Eigen data gebruiken</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Vul je inkomen, budgetten en optioneel je rekeningen in. Begeleide flow in 3 stappen.
              </p>
            </div>
          </div>
        </button>

        {/* Option 2: Demo data */}
        <button
          onClick={onDemo}
          className="group w-full rounded-2xl border-2 border-zinc-200 bg-white p-6 text-left transition-all hover:border-purple-300 hover:shadow-md"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-xl group-hover:bg-purple-100">
              <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">App bekijken met demo data</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Kies een van 4 voorbeeldprofielen om de app direct gevuld te verkennen. Je kunt later overstappen naar eigen data.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
