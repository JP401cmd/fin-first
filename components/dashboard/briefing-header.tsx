'use client'

import { WillDots } from '@/components/app/will-dots'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import type { TemporalContext } from '@/lib/briefing/types'
import type { BriefingCadence } from '@/lib/briefing/user-preferences'

interface Props {
  temporal: TemporalContext
  userName?: string
  cadence: BriefingCadence
  onCadenceChange: (cadence: BriefingCadence) => void
}

const NL_MONTHS_UPPER: Record<number, string> = {
  1: 'JANUARI', 2: 'FEBRUARI', 3: 'MAART', 4: 'APRIL', 5: 'MEI', 6: 'JUNI',
  7: 'JULI', 8: 'AUGUSTUS', 9: 'SEPTEMBER', 10: 'OKTOBER', 11: 'NOVEMBER', 12: 'DECEMBER',
}

const NL_DAYS_UPPER: Record<string, string> = {
  maandag: 'MAANDAG', dinsdag: 'DINSDAG', woensdag: 'WOENSDAG',
  donderdag: 'DONDERDAG', vrijdag: 'VRIJDAG', zaterdag: 'ZATERDAG', zondag: 'ZONDAG',
}

export function BriefingHeader({ temporal, userName, cadence, onCadenceChange }: Props) {
  const dateStr = `${NL_DAYS_UPPER[temporal.dayOfWeek] ?? temporal.dayOfWeek.toUpperCase()} ${temporal.dayOfMonth} ${NL_MONTHS_UPPER[temporal.month] ?? ''} ${temporal.year}`

  return (
    <header className="mb-6 sm:mb-8">
      {/* Date line with cadence toggle */}
      <div className="flex items-center justify-between border-b border-[var(--border-ed)] pb-2 mb-4">
        <p className="label-editorial text-[var(--ink-3)] tracking-widest text-[10px] sm:text-xs">
          {dateStr}
        </p>
        {/* Cadence toggle */}
        <div
          className="flex rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] p-0.5"
          role="radiogroup"
          aria-label="Briefing frequentie"
          data-testid="briefing-cadence-toggle"
        >
          <button
            type="button"
            role="radio"
            aria-checked={cadence === 'daily'}
            onClick={() => onCadenceChange('daily')}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all ${
              cadence === 'daily'
                ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
            }`}
          >
            Dagelijks
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={cadence === 'weekly'}
            onClick={() => onCadenceChange('weekly')}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all ${
              cadence === 'weekly'
                ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
            }`}
          >
            Wekelijks
          </button>
        </div>
      </div>

      {/* Will's greeting */}
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <WillDots size={36} />
        </div>
        <div>
          <p className="label-editorial text-wil-600 tracking-wider flex items-center gap-1.5">WILL&apos;S BRIEFING <AiPrivacyIndicator size={13} /></p>
          <p className="text-lg sm:text-xl font-display font-bold text-[var(--ink)]">
            {temporal.greeting}{userName ? `, ${userName}` : ''}
          </p>
        </div>
      </div>
    </header>
  )
}
