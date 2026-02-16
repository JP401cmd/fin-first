'use client'

import { useState } from 'react'
import { NextStepCard, NextStepSection, NextStepEmptyCard, type NextStepSuggestion } from '@/components/app/next-step-card'

const FIXTURE_STEPS: NextStepSuggestion[] = [
  {
    key: 'import_transactions',
    title: 'Importeer je transacties',
    description: 'Upload je bankafschriften om inzicht te krijgen in je inkomsten en uitgaven.',
    href: '/core/cash/import',
    icon: 'receipt',
    moduleColor: 'amber',
  },
  {
    key: 'set_budgets',
    title: 'Stel je budgetten in',
    description: 'Maak budgetten aan om grip te krijgen op je uitgaven.',
    href: '/core/budgets',
    icon: 'cart',
    moduleColor: 'amber',
  },
  {
    key: 'add_assets',
    title: 'Voeg je assets toe',
    description: 'Registreer je bezittingen voor een compleet vermogensoverzicht.',
    href: '/core/assets',
    icon: 'piggybank',
    moduleColor: 'amber',
  },
]

const TEAL_STEPS: NextStepSuggestion[] = [
  {
    key: 'review_recommendations',
    title: 'Bekijk je aanbevelingen',
    description: 'Je hebt 3 openstaande aanbevelingen. Neem een beslissing.',
    href: '/will',
    icon: 'lightbulb',
    moduleColor: 'teal',
  },
  {
    key: 'set_goals',
    title: 'Stel je eerste doel',
    description: 'Definieer een financieel doel om naartoe te werken.',
    href: '/will',
    icon: 'target',
    moduleColor: 'teal',
  },
]

const PURPLE_STEPS: NextStepSuggestion[] = [
  {
    key: 'calculate_fire',
    title: 'Bereken je FIRE-datum',
    description: 'Ontdek wanneer je financieel onafhankelijk kunt zijn.',
    href: '/horizon',
    icon: 'compass',
    moduleColor: 'purple',
  },
]

export default function TestNextStepDismissPage() {
  const [dismissLog, setDismissLog] = useState<string[]>([])
  const [showSingle, setShowSingle] = useState(true)

  function handleDismiss(step: NextStepSuggestion) {
    setDismissLog(prev => [...prev, `Dismissed: ${step.key || step.title}`])
  }

  return (
    <div className="mx-auto max-w-4xl p-8 space-y-10">
      <h1 className="text-2xl font-bold">Test: Next Step Dismiss & Complete Workflow (Feature #86)</h1>
      <p className="text-sm text-zinc-500">
        This page tests the dismiss and complete workflow for smart next step suggestions.
        No authentication required.
      </p>

      {/* Section 1: NextStepSection with multiple steps (dismiss workflow) */}
      <section>
        <h2 className="text-lg font-semibold mb-3">1. De Kern — NextStepSection (3 steps, dismiss enabled)</h2>
        <p className="text-xs text-zinc-400 mb-2">Click X to dismiss. Next suggestion should appear. After all dismissed, empty state shows.</p>
        <div data-testid="kern-section">
          <NextStepSection steps={FIXTURE_STEPS} moduleColor="amber" />
        </div>
      </section>

      {/* Section 2: De Wil module steps */}
      <section>
        <h2 className="text-lg font-semibold mb-3">2. De Wil — NextStepSection (2 steps, dismiss enabled)</h2>
        <div data-testid="wil-section">
          <NextStepSection steps={TEAL_STEPS} moduleColor="teal" />
        </div>
      </section>

      {/* Section 3: Single step (dismiss shows empty) */}
      <section>
        <h2 className="text-lg font-semibold mb-3">3. De Horizon — NextStepSection (1 step, dismiss shows empty)</h2>
        <div data-testid="horizon-section">
          <NextStepSection steps={PURPLE_STEPS} moduleColor="purple" />
        </div>
      </section>

      {/* Section 4: Empty state directly */}
      <section>
        <h2 className="text-lg font-semibold mb-3">4. Empty State (no suggestions)</h2>
        <div data-testid="empty-section">
          <NextStepEmptyCard moduleColor="amber" />
        </div>
      </section>

      {/* Section 5: Individual card with dismiss callback */}
      <section>
        <h2 className="text-lg font-semibold mb-3">5. Individual NextStepCard (with onDismiss callback)</h2>
        {showSingle ? (
          <div data-testid="single-card">
            <NextStepCard
              step={{
                key: 'test_step',
                title: 'Test suggestie',
                description: 'Dit is een test suggestie die je kunt negeren.',
                href: '#',
                icon: 'lightbulb',
                moduleColor: 'amber',
              }}
              onDismiss={(step) => {
                handleDismiss(step)
                setShowSingle(false)
              }}
            />
          </div>
        ) : (
          <div data-testid="single-dismissed" className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-500">
            Card dismissed! (parent handled state)
          </div>
        )}
      </section>

      {/* Section 6: NextStepCard WITHOUT dismiss (original behavior) */}
      <section>
        <h2 className="text-lg font-semibold mb-3">6. NextStepCard without dismiss (backward compatible)</h2>
        <div data-testid="no-dismiss-card">
          <NextStepCard
            step={{
              key: 'no_dismiss',
              title: 'Bekijk je doelen',
              description: 'Check de voortgang van je financiele doelen.',
              href: '/will',
              icon: 'target',
              moduleColor: 'teal',
            }}
          />
        </div>
      </section>

      {/* Dismiss Log */}
      {dismissLog.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Dismiss Log</h2>
          <div className="bg-zinc-50 border rounded-lg p-4 space-y-1">
            {dismissLog.map((entry, i) => (
              <p key={i} className="text-sm text-zinc-600">{entry}</p>
            ))}
          </div>
        </section>
      )}

      {/* Verification checklist */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Verification Checklist</h2>
        <div className="bg-white border rounded-lg p-5 space-y-2 text-sm">
          <p>1. NextStepCard shows dismiss (X) button when onDismiss prop provided</p>
          <p>2. NextStepCard does NOT show dismiss button when onDismiss not provided (section 6)</p>
          <p>3. Clicking X dismisses current suggestion, shows next one</p>
          <p>4. After all dismissed, empty state appears (&quot;Alles bij!&quot;)</p>
          <p>5. Card still navigates to CTA href when clicked (not on X button)</p>
          <p>6. Empty state card shows checkmark icon and &quot;Geen openstaande suggesties&quot;</p>
          <p>7. Each module color theme renders correctly (amber, teal, purple)</p>
        </div>
      </section>
    </div>
  )
}
