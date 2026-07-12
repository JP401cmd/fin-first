'use client'

import { useMemo, useState } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { OnboardingVraag } from './onboarding-vraag'
import { SectionReview } from './section-review'
import { DebtRow, DebtTypePicker, LinkedDebtRow } from './onboarding-posten'
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

const SECTION_EXIT_LABEL = 'Ik heb (verder) geen schulden'

/**
 * Herkomst-label per gekoppeld schuld-type — spiegelt LINKED_DEBT_SUGGESTIONS
 * (asset→schuld). Toont de gebruiker wáár de schuld vandaan komt zodat het geen
 * dubbeltelling lijkt maar transparantie is.
 */
const DEBT_ORIGIN_LABEL: Partial<Record<DebtType, string>> = {
  mortgage: 'via je woning',
  car_loan: 'via je voertuig',
  dga_schuld: 'via je BV',
}
const debtOrigin = (type: DebtType) => DEBT_ORIGIN_LABEL[type] ?? 'via je bezittingen'

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

  // Losse schulden = zonder koppeling; deze beheer je hier (toevoegen/verwijderen).
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

  // Gekoppelde schulden = eerder bij een bezitting opgegeven (hypotheek bij je
  // woning, RC bij je BV, autolening bij je voertuig). Die horen óók thuis in
  // "dit zijn je schulden" — anders mist de gebruiker ze (de melding bij deze
  // kaart). Read-only hier: verwijderen/wijzigen hoort bij de bezitting, en het
  // achterliggende netto-vermogen telt elke schuld precies één keer.
  const linkedDebts = useMemo(
    () =>
      quickDebts
        .map((debt, index) => ({ debt, index }))
        .filter(({ debt }) => Boolean(debt.linked_client_ref)),
    [quickDebts],
  )
  const linkedTotal = useMemo(
    () => linkedDebts.reduce((s, { debt }) => s + (Number(debt.current_balance) || 0), 0),
    [linkedDebts],
  )
  const hasAnyDebt = standaloneDebts.length > 0 || linkedDebts.length > 0

  // ── Wizard-collect ──────────────────────────────────────────────────
  function handleWizardCollect(item: QuickAddInput) {
    if (item.kind === 'debt') {
      onDebtsChange([...quickDebts, item.debt])
    }
    // 'asset' / 'asset_with_debt' kunnen in de schuld-sectie niet voorkomen.
    setWizardType(null)
    if (phase.kind === 'ask') push({ kind: 'more', qIndex: phase.qIndex })
    else if (phase.kind === 'other-ask' || phase.kind === 'other-pick')
      push({ kind: 'other-more' })
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

  // Sectie afronden: zodra er íets te tonen is (losse óf gekoppelde schuld)
  // eerst een bevestigend overzicht, anders direct door. De altijd-zichtbare
  // drempelloze uitgang (`SECTION_EXIT_LABEL`) blijft bewust direct-naar-onNext.
  function finishSection() {
    if (hasAnyDebt) push({ kind: 'review' })
    else onNext()
  }

  // ── Lopend overzicht ────────────────────────────────────────────────
  const runningList = hasAnyDebt ? (
    <div className="space-y-4">
      {linkedDebts.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            Al opgegeven bij je bezittingen · &minus;{formatCurrency(linkedTotal)}
          </p>
          <ul className="space-y-2">
            {linkedDebts.map(({ debt, index }) => (
              <li key={`linked-debt-${index}`}>
                <LinkedDebtRow item={debt} origin={debtOrigin(debt.debt_type)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {standaloneDebts.length > 0 && (
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
      )}
    </div>
  ) : null

  const totalDebtCount = standaloneDebts.length + linkedDebts.length
  const totalDebt = standaloneTotal + linkedTotal
  const factsPanel = (
    <FactsPanel
      stat={hasAnyDebt ? `−${formatCurrency(totalDebt)}` : '€3.700'}
      sub={hasAnyDebt ? 'vrijheid die je terugkoopt' : 'gemiddelde consumptieve schuld per huishouden'}
      source={
        hasAnyDebt
          ? `${totalDebtCount} schuld${totalDebtCount === 1 ? '' : 'en'}`
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

    // "Heb je nog een andere schuld?" (other-ask) en "Nog een schuld?"
    // (other-more): geen ja/nee-tussenstap meer — de volledige schuld-catalogus
    // staat hier direct als aanklikbare kaartjes (spiegelt de bezittingen-stap).
    // De drempelloze sectie-uitgang blijft bewust altijd bereikbaar. `other-pick`
    // blijft als apart picker-scherm bestaan voor SectionReview.onAddMore.
    if (phase.kind === 'other-ask' || phase.kind === 'other-more') {
      const isFirst = phase.kind === 'other-ask'
      return (
        <OnboardingShell
          kicker="Schuld"
          romanNum="iv."
          title={<span>{isFirst ? 'Heb je nog een andere schuld?' : 'Nog een schuld?'}</span>}
          deck={
            isFirst
              ? 'Kies een categorie om die meteen toe te voegen — denk aan een belastingschuld, afbetalingsregeling of familielening. Of rond de schulden af.'
              : 'Voeg er gerust nog een toe — of rond de schulden af.'
          }
          factsPanel={factsPanel}
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={back}
          footer={
            <div className="flex w-full flex-col gap-2.5">
              <button
                type="button"
                onClick={finishSection}
                className="w-full min-h-11 border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                Nee, klaar
              </button>
              {/* Drempelloze sectie-uitgang blijft — net als op elke ja/nee-vraag
                  (slaat het review-overzicht bewust over → direct door). */}
              <button
                type="button"
                onClick={onNext}
                className="min-h-9 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {SECTION_EXIT_LABEL}
              </button>
            </div>
          }
        >
          <div className="space-y-6">
            {runningList}
            {/* Volledige catalogus (geen `exclude`) — geen `onCancel`: de
                sectie-footer verzorgt de uitgang. */}
            <DebtTypePicker exclude={[]} onPick={(type) => setWizardType(type)} />
          </div>
        </OnboardingShell>
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
          {/* Catch-all vangnet: toon de vólledige schuld-catalogus (canonieke
              `QUICK_ADD_DEBT_ORDER`), óók de types die al via een gerichte
              ja/nee-vraag langskwamen. Wie daar "nee" zei maar een hypotheek,
              studielening of krediet vergat, kan die hier alsnog toevoegen —
              identiek aan het bezittingen-format. Geen `exclude`. */}
          <DebtTypePicker
            exclude={[]}
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
