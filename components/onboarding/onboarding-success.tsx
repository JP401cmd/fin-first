import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubbleCentered } from './speech-bubble'
import { Shield, Zap, Telescope } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const MODULE_CARDS: readonly { Icon: LucideIcon; name: string; description: string; borderColor: string; bgColor: string; iconBg: string; textColor: string }[] = [
  {
    Icon: Shield,
    name: 'De Kern',
    description: 'Je financiele fundament: vermogen, budgetten, schulden en cashflow. Hier zie je waar je nu staat.',
    borderColor: 'border-amber-200',
    bgColor: 'bg-amber-50/50',
    iconBg: 'bg-amber-100',
    textColor: 'text-amber-700',
  },
  {
    Icon: Zap,
    name: 'De Wil',
    description: 'Bewuste keuzes en acties. Will helpt je met slimme aanbevelingen en houdt je doelen in zicht.',
    borderColor: 'border-wil-200',
    bgColor: 'bg-wil-50/50',
    iconBg: 'bg-wil-100',
    textColor: 'text-wil-700',
  },
  {
    Icon: Telescope,
    name: 'De Horizon',
    description: 'Je pad naar financiële vrijheid: projecties, scenario\'s en simulaties van je toekomst.',
    borderColor: 'border-horizon-200',
    bgColor: 'bg-horizon-50/50',
    iconBg: 'bg-horizon-100',
    textColor: 'text-horizon-700',
  },
]

export function OnboardingSuccess({ onDashboard }: { onDashboard: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4">
        <FinnAvatar size={80} />
      </div>

      <h2 className="text-2xl font-bold text-zinc-900">Welkom bij TriFinity!</h2>
      <p className="mt-2 text-sm text-zinc-500">Drie perspectieven, een doel</p>

      {/* Will introduces the modules */}
      <div className="mt-5 w-full">
        <SpeechBubbleCentered>
          Ik ben Will, je persoonlijke financiele coach. Ik begeleid je door drie perspectieven naar financiele vrijheid. Laat me ze voorstellen:
        </SpeechBubbleCentered>
      </div>

      {/* Three module cards — stack vertically on mobile, 3-col on desktop */}
      <div className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
        {MODULE_CARDS.map((card) => (
          <div
            key={card.name}
            className={`flex flex-col items-center rounded-2xl border-2 ${card.borderColor} ${card.bgColor} p-5`}
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${card.iconBg}`}>
              <card.Icon className={`h-6 w-6 ${card.textColor}`} />
            </div>
            <p className={`mt-2 text-sm font-semibold ${card.textColor}`}>{card.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{card.description}</p>
          </div>
        ))}
      </div>

      {/* Will closing speech bubble */}
      <div className="mt-6 w-full">
        <SpeechBubbleCentered>
          Veel ontdekkingen! Elke bewuste keuze brengt je dichter bij vrijheid.
        </SpeechBubbleCentered>
      </div>

      {/* Prominent dashboard button — full-width on mobile */}
      <button
        onClick={onDashboard}
        className="mt-8 w-full min-h-[48px] rounded-lg bg-wil-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-wil-700 active:bg-wil-800 sm:w-auto sm:text-sm sm:font-medium sm:min-h-[44px]"
      >
        Ontdek je dashboard
      </button>
    </div>
  )
}
