'use client'

import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'

export function OnboardingNieuwsOnly({
  description,
  onChange,
  onNext,
  onBack,
}: {
  description: string
  onChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="pb-20 sm:pb-0">
      {/* Back button — same pattern as all steps */}
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors duration-150"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-8">
        <StepProgress currentPhase="instellen" subStep={{ current: 1, total: 1 }} />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Nieuws</p>

      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0"><WillDots size={48} /></div>
        <SpeechBubble>
          Je hebt gekozen voor gepersonaliseerd financieel nieuws. Om relevante berichten te vinden, helpt het als we iets weten over je financiële situatie.
        </SpeechBubble>
      </div>

      <h2 className="mb-2 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">
        Vertel iets over je financiële situatie
      </h2>
      <p className="mb-4 text-xs text-[var(--ink-4)]">
        Dit helpt ons om nieuws te vinden dat voor jou relevant is. Je kunt dit veld ook leeg laten.
      </p>

      <textarea
        value={description}
        onChange={(e) => onChange(e.target.value.slice(0, 500))}
        placeholder="Bijv. ik huur een woning, spaar voor een huis, heb een beleggingsrekening bij..."
        rows={5}
        className="w-full resize-none rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
        maxLength={500}
      />
      <p className="mt-1 text-right text-[10px] text-[var(--ink-4)]">{description.length}/500</p>

      {/* Tips */}
      <div className="mt-4 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3">
        <p className="mb-2 text-xs font-semibold text-[var(--ink-2)]">Tips voor een goede beschrijving:</p>
        <ul className="space-y-1 text-xs text-[var(--ink-3)]">
          <li>Beschrijf je woonsituatie (huur of koop)</li>
          <li>Noem je belangrijkste spaardoelen</li>
          <li>Heb je beleggingen of schulden?</li>
          <li>Wat is je levensfase? (starter, gezin, bijna pensioen)</li>
        </ul>
      </div>

      {/* Sticky navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={onBack}
          className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)] transition-colors duration-150"
        >
          Terug
        </button>
        <button
          onClick={onNext}
          className="flex-1 min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800"
        >
          {description.trim() ? 'Verder' : 'Overslaan'}
        </button>
      </div>
    </div>
  )
}
