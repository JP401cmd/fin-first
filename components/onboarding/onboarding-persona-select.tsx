import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubble } from './speech-bubble'
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from '@/lib/test-personas'

export function OnboardingPersonaSelect({
  onSelect,
  onBack,
}: {
  onSelect: (key: PersonaKey) => void
  onBack: () => void
}) {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

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
          const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
            red: { bg: 'bg-red-50', border: 'border-red-200 hover:border-red-400', text: 'text-red-700' },
            teal: { bg: 'bg-teal-50', border: 'border-teal-200 hover:border-teal-400', text: 'text-teal-700' },
            amber: { bg: 'bg-amber-50', border: 'border-amber-200 hover:border-amber-400', text: 'text-amber-700' },
            purple: { bg: 'bg-purple-50', border: 'border-purple-200 hover:border-purple-400', text: 'text-purple-700' },
          }
          const colors = colorClasses[meta.color] ?? colorClasses.amber

          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-5 text-left transition-all hover:shadow-md`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold"
                  style={{ backgroundColor: meta.avatarColor }}
                >
                  {meta.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={`font-semibold ${colors.text}`}>{meta.name}</h3>
                  <p className="text-xs font-medium text-zinc-500">{meta.subtitle}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-zinc-600 line-clamp-2">{meta.description}</p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span>Vermogen: <span className={`font-semibold ${meta.netWorth < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(meta.netWorth)}</span></span>
                <span>Inkomen: <span className="font-medium text-zinc-700">{formatCurrency(meta.income)}/mnd</span></span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
