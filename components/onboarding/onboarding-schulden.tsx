'use client'

import { useMemo, useState } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { OnboardingVraag } from './onboarding-vraag'
import { SectionReview } from './section-review'
import { DebtRow, DebtTypePicker } from './onboarding-posten'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import {
  DEBT_QUICK_ADD_LABELS,
  type DebtType,
} from '@/lib/debt-data'
import type { DebtQuickInput, QuickAddInput } from '@/lib/quick-add/types'
import { formatCurrency } from '@/lib/format'
import {
  phaseKey,
  useSectionPhaseNav,
  type SectionPhase,
} from './section-phase'

/**
 * Stap — Schulden, als begeleide ja/nee-flow met ALTIJD-uitgang (Boldin-stijl).
 *
 * Vraagt de meest voorkomende Nederlandse consumentenschulden uit, in
 * oplopende volgorde. Bij élke vraag is er — naast "ja"/"nee" — een
 * drempelloze knop "Ik heb (verder) geen schulden" die de hele sectie
 * afsluit. Bij "ja" opent de gedeelde `QuickAddWizard` (mode='collect')
 * voorgeselecteerd op het juiste schuld-type; daarna "Nog een?" tot "nee".
 *
 * De hypotheek-vraag wordt OVERGESLAGEN wanneer er al een hypotheek aan een
 * eigen woning is gekoppeld in de bezittingen-stap (consistent met het
 * gedeelde huis+hypotheek-pad van de wizard).
 *
 * "Geld is opgeslagen tijd": schulden zijn hier geframed als *vrijheid die je
 * terugkoopt* — geen nieuw €→tijd-cijfer verzonnen (onboarding kent geen
 * dagkosten-grondslag).
 */

// ── Props ──────────────────────────────────────────────────────────────

export interface OnboardingSchuldenProps {
  quickDebts: DebtQuickInput[]
  onDebtsChange: (items: DebtQuickInput[]) => void
  /** Sectie afgerond → volgende groep. */
  onNext: () => void
  onBack: () => void
  currentStep?: number
  totalSteps?: number
  /**
   * Gelifte interne fase-stack (controlled) — door de orchestrator gevoed zodat
   * de fase een remount overleeft en Terug uit een latere groep hier op het
   * laatst getoonde scherm landt i.p.v. op vraag 1. Zonder deze props draait de
   * sectie uncontrolled op interne state (los renderen in tests).
   */
  phases?: SectionPhase[]
  onPhasesChange?: (phases: SectionPhase[]) => void
}

// ── Vragen-volgorde ────────────────────────────────────────────────────

interface DebtQuestion {
  type: DebtType
  question: string
  /** Label voor de "nog een?"-prompt (default = quick-add-label). */
  moreLabel?: string
}

/**
 * Gerichte ja/nee-vragen in oplopende waarschijnlijkheid (AFM/CBS: roodstand,
 * persoonlijke lening, doorlopend krediet en creditcard zijn de meest
 * voorkomende consumptief-krediet-vormen; studielening via DUO domineert bij
 * jongeren).
 */
const DEBT_QUESTIONS: DebtQuestion[] = [
  { type: 'mortgage', question: 'Heb je een hypotheek?' },
  { type: 'student_loan', question: 'Heb je een studielening?' },
  { type: 'personal_loan', question: 'Heb je een persoonlijke lening?' },
  { type: 'revolving_credit', question: 'Heb je een doorlopend krediet?', moreLabel: 'doorlopend krediet' },
  { type: 'credit_card', question: 'Heb je een creditcardschuld?' },
  { type: 'revolving_credit', question: 'Sta je weleens rood (roodstand)?', moreLabel: 'roodstand' },
  { type: 'car_loan', question: 'Heb je een autolening of private lease?' },
]

/** Types die via een gerichte vraag aan bod kwamen — uit de catch-all-picker. */
const ASKED_DEBT_TYPES: DebtType[] = [
  'mortgage',
  'student_loan',
  'personal_loan',
  'revolving_credit',
  'credit_card',
  'car_loan',
]

const SECTION_EXIT_LABEL = 'Ik heb (verder) geen schulden'

// ── Component ──────────────────────────────────────────────────────────

export function OnboardingSchulden({
  quickDebts,
  onDebtsChange,
  onNext,
  onBack,
  currentStep = 4,
  totalSteps = 7,
  phases,
  onPhasesChange,
}: OnboardingSchuldenProps) {
  // Hypotheek al gekoppeld via het huis-pad? Dan die vraag overslaan.
  const hasLinkedMortgage = useMemo(
    () => quickDebts.some((d) => d.debt_type === 'mortgage' && d.linked_client_ref),
    [quickDebts],
  )
  const questions = useMemo(
    () => (hasLinkedMortgage ? DEBT_QUESTIONS.filter((q) => q.type !== 'mortgage') : DEBT_QUESTIONS),
    [hasLinkedMortgage],
  )

  // Fase-stack (controlled door de orchestrator, anders interne useState). Terug
  // popt één scherm; op de stack-bodem valt 'ie terug op de groep-`onBack`.
  const { phase, push, back } = useSectionPhaseNav(phases, onPhasesChange, onBack)
  const [wizardType, setWizardType] = useState<DebtType | null>(null)

  // Losse schulden = zonder koppeling (gekoppelde hypotheken horen onder het
  // huis in de bezittingen-stap, niet hier).
  const standaloneDebts = useMemo(
    () =>
      quickDebts
        .map((debt, index) => ({ debt, index }))
        .filter(({ debt }) => !debt.linked_client_ref),
    [quickDebts],
  )
  const standaloneTotal = useMemo(
    () => standaloneDebts.reduce((s, { debt }) => s + (Number(debt.current_balance) || 0), 0),
    [standaloneDebts],
  )

  // ── Wizard-collect ──────────────────────────────────────────────────
  function handleWizardCollect(item: QuickAddInput) {
    if (item.kind === 'debt') {
      onDebtsChange([...quickDebts, item.debt])
    }
    // 'asset' / 'asset_with_debt' kunnen in de schuld-sectie niet voorkomen.
    setWizardType(null)
    if (phase.kind === 'ask') push({ kind: 'more', qIndex: phase.qIndex })
    else if (phase.kind === 'other-pick') push({ kind: 'other-more' })
    // 'more' / 'other-more' → geen push, de "nog een?"-fase blijft staan.
  }

  function removeDebt(idx: number) {
    onDebtsChange(quickDebts.filter((_, i) => i !== idx))
  }

  function nextAfterQuestion(qIndex: number) {
    if (qIndex + 1 < questions.length) {
      push({ kind: 'ask', qIndex: qIndex + 1 })
    } else {
      push({ kind: 'other-ask' })
    }
  }

  // Sectie afronden: bij gevulde lijst eerst een bevestigend overzicht,
  // bij lege lijst direct door. De altijd-zichtbare drempelloze uitgang
  // (`SECTION_EXIT_LABEL`) blijft bewust direct-naar-onNext.
  function finishSection() {
    if (standaloneDebts.length > 0) push({ kind: 'review' })
    else onNext()
  }

  // ── Lopend overzicht ────────────────────────────────────────────────
  const runningList =
    standaloneDebts.length > 0 ? (
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Toegevoegd · &minus;{formatCurrency(standaloneTotal)}
        </p>
        <ul className="space-y-2">
          {standaloneDebts.map(({ debt, index }) => (
            <li key={`debt-${index}`}>
              <DebtRow item={debt} onRemove={() => removeDebt(index)} />
            </li>
          ))}
        </ul>
      </div>
    ) : null

  const factsPanel = (
    <FactsPanel
      stat={standaloneDebts.length > 0 ? `−${formatCurrency(standaloneTotal)}` : '€3.700'}
      sub={
        standaloneDebts.length > 0
          ? 'vrijheid die je terugkoopt'
          : 'gemiddelde consumptieve schuld per huishouden'
      }
      source={
        standaloneDebts.length > 0
          ? `${standaloneDebts.length} schuld${standaloneDebts.length === 1 ? '' : 'en'}`
          : 'Indicatief · CBS/AFM'
      }
    />
  )

  const sharedVraagProps = {
    kicker: 'Schuld',
    romanNum: 'iv.',
    factsPanel,
    currentStep,
    totalSteps,
    onBack: back,
    exitLabel: SECTION_EXIT_LABEL,
    onExit: onNext,
  }

  function renderPhase() {
    if (phase.kind === 'ask' || phase.kind === 'more') {
      const q = questions[phase.qIndex]
      const isMore = phase.kind === 'more'
      const moreLabel = q.moreLabel ?? DEBT_QUICK_ADD_LABELS[q.type].toLowerCase()
      const title = isMore ? <span>Nog een {moreLabel}?</span> : <span>{q.question}</span>
      return (
        <OnboardingVraag
          {...sharedVraagProps}
          title={title}
          deck={
            isMore
              ? 'Voeg er gerust meer toe — of ga door naar de volgende vraag.'
              : 'Een schuld is vrijheid die je stap voor stap terugkoopt. Heb je deze niet? Tik op "Nee".'
          }
          onYes={() => setWizardType(q.type)}
          onNo={() => nextAfterQuestion(phase.qIndex)}
        >
          {runningList}
        </OnboardingVraag>
      )
    }

    if (phase.kind === 'other-ask') {
      return (
        <OnboardingVraag
          {...sharedVraagProps}
          title={<span>Heb je nog een andere schuld?</span>}
          deck="Bijvoorbeeld een afbetalingsregeling, belastingschuld of familielening."
          onYes={() => push({ kind: 'other-pick' })}
          onNo={finishSection}
        >
          {runningList}
        </OnboardingVraag>
      )
    }

    if (phase.kind === 'other-more') {
      return (
        <OnboardingVraag
          {...sharedVraagProps}
          title={<span>Nog een schuld?</span>}
          deck="Voeg er gerust meer toe — of rond de schulden af."
          yesLabel="Ja, nog een"
          noLabel="Nee, klaar"
          onYes={() => push({ kind: 'other-pick' })}
          onNo={finishSection}
        >
          {runningList}
        </OnboardingVraag>
      )
    }

    if (phase.kind === 'review') {
      return (
        <SectionReview
          kicker="Schuld"
          romanNum="iv."
          title={<span>Dit zijn je schulden</span>}
          deck="Samen de vrijheid die je stap voor stap terugkoopt. Klopt het, of wil je nog iets toevoegen?"
          factsPanel={factsPanel}
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={back}
          onConfirm={onNext}
          onAddMore={() => push({ kind: 'other-pick' })}
        >
          {runningList}
        </SectionReview>
      )
    }

    // other-pick — type-keuzelijst voor de resterende catalogus.
    return (
      <OnboardingShell
        kicker="Schuld"
        romanNum="iv."
        title={<span>Wat voor schuld?</span>}
        deck="Kies wat je wilt toevoegen — daarna vul je het bedrag in."
        factsPanel={factsPanel}
        currentStep={currentStep}
        totalSteps={totalSteps}
        onBack={back}
        footer={
          <button
            type="button"
            onClick={back}
            className="w-full min-h-11 border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            Terug
          </button>
        }
      >
        <div className="space-y-6">
          {runningList}
          <DebtTypePicker
            exclude={ASKED_DEBT_TYPES}
            onPick={(type) => setWizardType(type)}
            onCancel={back}
          />
        </div>
      </OnboardingShell>
    )
  }

  return (
    <>
      {/* Scherm-vernieuwing per interne vraag: re-key op de fase zodat de
          bestaande `.step-enter-forward`-overgang óók tussen de ja/nee-
          vervolgvragen bínnen deze sectie speelt. */}
      <div key={phaseKey(phase)} className="step-enter-forward">
        {renderPhase()}
      </div>

      <QuickAddWizard
        open={wizardType !== null}
        onClose={() => setWizardType(null)}
        initialIntent="debt"
        initialDebtType={wizardType ?? undefined}
        mode="collect"
        onCollect={handleWizardCollect}
      />
    </>
  )
}
