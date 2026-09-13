'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Kicker, EditorialHeadline, EditorialDeck, ScenarioCallout } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'
import {
  UitgavenEigenBedrag,
  UitgavenMethodeKeuze,
  useUitgavenKeuze,
  type UitgavenKeuzeProps,
} from '@/components/app/horizon/uitgaven-keuze'

// De keuze-logica en -weergave wonen sinds TPR-15 in `components/app/horizon/uitgaven-keuze`
// (gedeeld met de plan-review-wizard); het contracttype blijft hier importeerbaar.
export type { UitgavenPaneActionsState } from '@/components/app/horizon/uitgaven-keuze'

interface Props extends UitgavenKeuzeProps {
  /** Wanneer true: geen back-link en geen page-level padding (pane regelt header). */
  inPane?: boolean
}

export default function UitgavenNaPensioenClient(props: Props) {
  const { masked } = useMaskedAmounts()
  const {
    method,
    answers,
    setAnswers,
    saving,
    savedFlash,
    error,
    finalAmount,
    previewByMethod,
    dailyPrice,
    heroAmount,
    pickMethod,
    saveCustom,
    showInlineSaveBlock,
  } = useUitgavenKeuze(props)

  return (
    // In-pane: outer padding wordt geleverd door SlideInPane (driewegregel — ui-ux skill).
    // Standalone route: pagina-content houdt eigen `px-*` voor canvas-marges.
    <div className={`mx-auto max-w-4xl ${props.inPane ? 'pb-8' : 'px-4 sm:px-6 pb-12'}`}>
      {/* Back-link alleen op standalone route — pane heeft eigen header */}
      {!props.inPane && (
        <div className="pt-4 pb-2 lg:pt-8">
          <Link
            href="/toekomst"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Terug naar Horizon
          </Link>
        </div>
      )}

      {/* ── Editorial hero ─────────────────────────────────────────── */}
      <header className={props.inPane ? 'pt-2' : 'pt-6 sm:pt-10'}>
        <Kicker size="large">Toekomst</Kicker>
        <EditorialHeadline emphasis="nodig" className="mt-3">
          Wat heb je straks nodig?
        </EditorialHeadline>
        <EditorialDeck className="mt-5">
          Dit getal stuurt je hele doelbedrag voor vrijheid. Niet de uitgaven van vandaag — maar het leven dat je
          straks wilt leiden. Kies hoe je het wilt benaderen, of stel het zelf samen.
        </EditorialDeck>

        <ScenarioCallout title="Huidige waarde" className="mt-6">
          Alle bedragen op deze pagina zijn in <strong>prijspeil van vandaag</strong> — wat het
          nu zou kosten. Inflatie wordt apart meegenomen in je projectie, dus je hoeft hier niet
          op te tellen voor de toekomst.
        </ScenarioCallout>

        <div className="mt-8 border-t border-b border-[var(--ink)] py-6 flex items-baseline gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1">
              {method === 'custom_amount' ? 'Voorlopig' : 'Huidig'}
            </div>
            <div
              className="text-[44px] sm:text-[56px] font-black leading-none tracking-[-0.025em]"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              <MaskedAmount value={heroAmount} tone="horizon" monoWhenVisible={false} />
              <span className="text-[var(--ink-3)] font-normal text-base ml-2">/ jaar</span>
            </div>
          </div>
          {dailyPrice > 0 && (
            <div className="text-[var(--ink-3)] italic text-sm" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
              ≈ {formatMaskedCurrency(Math.round(dailyPrice), masked)}/dag —{' '}
              {formatMaskedCurrency(Math.round(heroAmount / 12), masked)}/maand
            </div>
          )}
        </div>
      </header>

      <UitgavenMethodeKeuze
        method={method}
        previewByMethod={previewByMethod}
        budgetingActive={props.budgetingActive}
        saving={saving}
        onPick={pickMethod}
      />

      {method === 'custom_amount' && (
        <UitgavenEigenBedrag
          answers={answers}
          setAnswers={setAnswers}
          showInlineSaveBlock={showInlineSaveBlock}
          savedFlash={savedFlash}
          finalAmount={finalAmount}
          saving={saving}
          masked={masked}
          onSaveCustom={saveCustom}
          error={error}
        />
      )}
    </div>
  )
}
