import { FinnAvatar } from '@/components/app/avatars'
import { PersonaCard } from '@/components/app/persona-card'
import { SpeechBubble } from './speech-bubble'
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from '@/lib/test-personas'

export function OnboardingPersonaSelect({
  onSelect,
  onBack,
}: {
  onSelect: (key: PersonaKey) => void
  onBack: () => void
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      {/* FINN guidance */}
      <div className="mb-6 flex items-start gap-3">
        <div className="shrink-0"><FinnAvatar size={48} /></div>
        <SpeechBubble>
          Elk profiel vertegenwoordigt een andere levensfase. Kies er een die bij je past &mdash; je kunt later altijd wisselen.
        </SpeechBubble>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PERSONA_KEYS.map((key) => {
          const meta = PERSONAS[key].meta
          return (
            <PersonaCard
              key={key}
              meta={meta}
              onSelect={() => onSelect(key)}
            />
          )
        })}
      </div>
    </div>
  )
}
