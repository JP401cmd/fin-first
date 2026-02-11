import { FhinAvatar, FinnAvatar, FfinAvatar } from '@/components/app/avatars'

const domains = [
  {
    name: 'De Kern',
    assistantName: 'FHIN',
    subtitle: 'Waar sta je echt?',
    description:
      'Jouw financiële fundament. Een helder overzicht van je vermogen, cashflow en bezittingen — vertaald naar opgeslagen levenstijd.',
    color: 'amber',
    avatar: <FhinAvatar size={120} />,
  },
  {
    name: 'De Wil',
    assistantName: 'FINN',
    subtitle: 'Wat ga je doen?',
    description:
      'Je bewuste keuzes en acties. Strategieën, doelen en optimalisaties — de wilskracht om je financiële koers te sturen.',
    color: 'teal',
    avatar: <FinnAvatar size={120} />,
  },
  {
    name: 'De Horizon',
    assistantName: 'FFIN',
    subtitle: 'Waar ga je naartoe?',
    description:
      'Je financiële toekomst in beeld. Projecties, scenario\'s en simulaties die laten zien wanneer vrijheid bereikbaar is.',
    color: 'purple',
    avatar: <FfinAvatar size={120} />,
  },
]

const colorClasses: Record<string, { bg: string; text: string; border: string; nameBg: string }> = {
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', nameBg: 'bg-amber-100' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200', nameBg: 'bg-teal-100' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', nameBg: 'bg-purple-100' },
}

export function Features() {
  return (
    <section id="domeinen" className="bg-zinc-50 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">
            Drie domeinen, één doel: vrijheid
          </h2>
          <p className="mt-4 text-lg text-zinc-600">
            TriFinity helpt je vanuit drie perspectieven bewust naar je financiën te kijken.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {domains.map((domain) => {
            const colors = colorClasses[domain.color]
            return (
              <div
                key={domain.name}
                className={`flex flex-col items-center rounded-xl border ${colors.border} ${colors.bg} p-8 transition-shadow hover:shadow-md`}
              >
                <div className="mb-4">
                  {domain.avatar}
                </div>
                <span className={`mb-2 inline-block rounded-full ${colors.nameBg} ${colors.text} px-3 py-0.5 text-xs font-bold tracking-widest`}>
                  {domain.assistantName}
                </span>
                <h3 className="text-xl font-bold text-zinc-900">
                  {domain.name}
                </h3>
                <p className={`mt-1 text-sm font-medium ${colors.text}`}>
                  {domain.subtitle}
                </p>
                <p className="mt-3 text-center text-sm leading-relaxed text-zinc-600">
                  {domain.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
