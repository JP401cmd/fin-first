'use client'

import { useMemo, useState } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { OnboardingVraag } from './onboarding-vraag'
import { SectionReview } from './section-review'
import {
  DebtRow,
  DebtTypeMultiPicker,
  DebtTypePicker,
  LinkedDebtRow,
} from './onboarding-posten'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import {
  DEBT_QUICK_ADD_LABELS,
  QUICK_ADD_DEBT_ORDER,
  type DebtType,
} from '@/lib/debt-data'
import { LINKED_DEBT_SUGGESTIONS } from '@/lib/asset-data'
import type { DebtQuickInput, QuickAddInput } from '@/lib/quick-add/types'
import { formatCurrency } from '@/lib/format'
import {
  phaseKey,
  useSectionPhaseNav,
  type SectionPhase,
} from './section-phase'

/**
 * Stap — Schulden, als HYBRIDE flow met ALTIJD-uitgang (Boldin-stijl kop,
 * aanvinkraster-staart).
 *
 * Structuur (H13, besluit eigenaar 26 aug 2026 — optie C):
 *
 *   1. Gerichte ja/nee-vragen voor de meest voorkomende schuldsoorten
 *      (`DEBT_QUESTIONS`, max. 4). Bij "ja" opent de gedeelde `QuickAddWizard`
 *      (mode='collect') voorgeselecteerd op dat type; daarna "Nog een?" tot
 *      "nee".
 *   2. ÉÉN aanvinkraster (`pick-many`) met de volledige catalogus voor de
 *      staart: vink aan wat nog meer van toepassing is, daarna opent de wizard
 *      één keer per aangevinkt type (collect-queue, in rastervolgorde).
 *   3. Review-overzicht zodra er íets te tonen is.
 *
 * Bij "alles nee" zijn dat 4-5 schermen (2-4 ja/nee + het raster), tegen 8
 * voorheen. Op élk scherm staat — naast "ja"/"nee" — de drempelloze knop
 * "Ik heb (verder) geen schulden" die de hele sectie in één tik afsluit.
 *
 * Een ja/nee-vraag wordt OVERGESLAGEN wanneer die schuldsoort al via een
 * bezitting gekoppeld is (hypotheek bij je woning, autolening bij je voertuig,
 * RC bij je BV — `LINKED_DEBT_SUGGESTIONS`). Voorheen gold dat alleen voor de
 * hypotheek; wie een auto mét autolening opgaf kreeg de autolening-vraag
 * alsnog.
 *
 * De aangevinkte types leven uitsluitend in component-state en gaan bewust
 * NIET het draft in — zie `draft-persistence.ts` (`SENSITIVE_DRAFT_KEYS`,
 * 3 jul 2026: gevoelige onboarding-invoer wordt niet gepersisteerd).
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
 * Gerichte ja/nee-vragen — de KOP van de flow: de meest voorkomende
 * schuldsoorten, in aflopende waarschijnlijkheid (CBS/AFM: hypotheek en
 * studielening via DUO zijn veruit de grootste groepen; persoonlijke lening en
 * autolening/private lease volgen). De staart van de catalogus zit in het
 * aanvinkraster (`pick-many`), niet in losse vragen.
 *
 * **Elk type komt hier hoogstens één keer voor.** De vragen "doorlopend
 * krediet" en "roodstand" leverden allebei `debt_type: 'revolving_credit'`
 * terwijl `DebtQuickInput` geen `subtype`-veld draagt (`buildDebtDraft` zet
 * `subtype: null`) — twee vragen, één ononderscheidbare uitkomst. De
 * roodstand-vraag kon dus geen enkel record of getal beïnvloeden en is
 * vervallen; `revolving_credit` is via het raster gewoon bereikbaar. Wordt
 * `subtype` ooit een echt veld op `DebtQuickInput`, dan kan het onderscheid
 * terugkomen — maar dan als subtype-keuze in de wizard, niet als tweede vraag.
 * De telltest in `onboarding-schulden.test.tsx` bewaakt de uniciteit.
 */
const DEBT_QUESTIONS: DebtQuestion[] = [
  { type: 'mortgage', question: 'Heb je een hypotheek?' },
  // moreLabel: zonder override erft de vervolgvraag het quick-add-label
  // 'Studielening (DUO)' en lekt de parenthetical de zin in
  // ("Nog een studielening (duo)?"). De reeks houdt dezelfde term aan als de
  // eerste vraag.
  { type: 'student_loan', question: 'Heb je een studielening?', moreLabel: 'studielening' },
  { type: 'personal_loan', question: 'Heb je een persoonlijke lening?' },
  { type: 'car_loan', question: 'Heb je een autolening of private lease?' },
]

/** Schuldsoorten die aan een bezitting gekoppeld kunnen zijn (asset → schuld). */
const LINKABLE_DEBT_TYPES: readonly DebtType[] = Object.values(LINKED_DEBT_SUGGESTIONS)

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
  totalSteps = 8,
  phases,
  onPhasesChange,
}: OnboardingSchuldenProps) {
  /**
   * Schuldsoorten die in de bezittingen-stap al aan een bezitting zijn
   * gekoppeld — die vraag hoeft niet meer gesteld: de schuld staat al in het
   * lopende overzicht ("via je woning" / "via je voertuig" / "via je BV").
   * Geldt voor élk type uit `LINKED_DEBT_SUGGESTIONS`, niet alleen de hypotheek.
   */
  const linkedQuestionTypes = useMemo(() => {
    const linked = new Set<DebtType>()
    for (const d of quickDebts) {
      if (d.linked_client_ref && LINKABLE_DEBT_TYPES.includes(d.debt_type as DebtType)) {
        linked.add(d.debt_type as DebtType)
      }
    }
    return linked
  }, [quickDebts])
  const questions = useMemo(
    () => DEBT_QUESTIONS.filter((q) => !linkedQuestionTypes.has(q.type)),
    [linkedQuestionTypes],
  )

  // Fase-stack (controlled door de orchestrator, anders interne useState). Terug
  // popt één scherm; op de stack-bodem valt 'ie terug op de groep-`onBack`.
  const { phase, push, back } = useSectionPhaseNav(phases, onPhasesChange, onBack)
  const [wizardType, setWizardType] = useState<DebtType | null>(null)

  /**
   * Aanvinkraster-selectie + collect-queue. Beide leven UITSLUITEND hier in
   * component-state: ze mogen niet in het gepersisteerde draft belanden (zie de
   * bestandskop). `queue` is `null` zolang er geen queue loopt, en anders de
   * types die ná de nu geopende wizard nog aan de beurt zijn.
   */
  const [selectedTypes, setSelectedTypes] = useState<DebtType[]>([])
  const [queue, setQueue] = useState<DebtType[] | null>(null)

  function toggleSelectedType(type: DebtType) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

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

  // ── Collect-queue (aanvinkraster → wizard per aangevinkt type) ──────
  /**
   * Start de queue voor de aangevinkte types, in rastervolgorde. De wizard
   * opent meteen op het eerste type; `queue` houdt de rest vast.
   */
  function startQueue(types: DebtType[]) {
    // Rastervolgorde, niet aanvink-volgorde: de wizard loopt de tegels af zoals
    // ze op het scherm stonden (`QUICK_ADD_DEBT_ORDER`).
    const ordered = QUICK_ADD_DEBT_ORDER.filter((t) => types.includes(t))
    if (ordered.length === 0) {
      finishSection()
      return
    }
    setQueue(ordered.slice(1))
    setWizardType(ordered[0])
  }

  /**
   * Volgende type uit de queue, of de queue afronden. `collectedNow` zegt of er
   * zojuist een schuld is toegevoegd — `hasAnyDebt` is in dezelfde render nog
   * de oude waarde, dus daar niet op leunen.
   */
  function advanceQueue(collectedNow: boolean) {
    const rest = queue ?? []
    if (rest.length > 0) {
      setQueue(rest.slice(1))
      setWizardType(rest[0])
      return
    }
    setQueue(null)
    setWizardType(null)
    setSelectedTypes([])
    if (collectedNow || hasAnyDebt) push({ kind: 'review' })
    // Niets toegevoegd (alles geannuleerd) → blijf op het raster staan i.p.v.
    // de gebruiker ongevraagd de sectie uit te sturen.
  }

  // ── Wizard-collect ──────────────────────────────────────────────────
  function handleWizardCollect(item: QuickAddInput) {
    if (item.kind === 'debt') {
      onDebtsChange([...quickDebts, item.debt])
    }
    // 'asset' / 'asset_with_debt' kunnen in de schuld-sectie niet voorkomen.
    if (queue !== null) {
      advanceQueue(true)
      return
    }
    setWizardType(null)
    if (phase.kind === 'ask') push({ kind: 'more', qIndex: phase.qIndex })
    else if (phase.kind === 'other-pick') back() // terug naar het review-overzicht
    // 'more' → geen push, de "nog een?"-fase blijft staan.
  }

  function handleWizardClose() {
    // Midden in een queue = "sla deze over", niet "stop alles".
    if (queue !== null) {
      advanceQueue(false)
      return
    }
    setWizardType(null)
  }

  function removeDebt(idx: number) {
    onDebtsChange(quickDebts.filter((_, i) => i !== idx))
  }

  function nextAfterQuestion(qIndex: number) {
    if (qIndex + 1 < questions.length) {
      push({ kind: 'ask', qIndex: qIndex + 1 })
    } else {
      push({ kind: 'pick-many' })
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

    // Aanvinkraster — de STAART van de sectie in één scherm. Vervangt de losse
    // ja/nee-vragen voor creditcard, doorlopend krediet, belastingschuld,
    // familielening enz. plus de oude "Heb je nog een andere schuld?"-stap.
    // Volledige catalogus (geen `exclude`): wie hierboven "nee" zei maar zich
    // alsnog iets herinnert, vinkt het hier gewoon aan. De drempelloze
    // sectie-uitgang blijft bewust altijd bereikbaar.
    if (phase.kind === 'pick-many') {
      const count = selectedTypes.length
      return (
        <OnboardingShell
          kicker="Schuld"
          romanNum="iv."
          title={
            <span>
              Welke van deze heb je <em className="font-normal italic">nog meer</em>?
            </span>
          }
          deck="Vink alles aan wat van toepassing is — daarna vul je per schuld het bedrag in. Elke schuld is vrijheid die je stap voor stap terugkoopt. Niets van toepassing? Ga gewoon verder."
          factsPanel={factsPanel}
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={back}
          footer={
            <div className="flex w-full flex-col gap-2.5">
              <button
                type="button"
                onClick={() => (count > 0 ? startQueue(selectedTypes) : finishSection())}
                className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                {count > 0
                  ? `Verder met ${count} schuld${count === 1 ? '' : 'en'}`
                  : 'Verder — geen van deze'}
              </button>
              {/* Drempelloze sectie-uitgang blijft — net als op elke ja/nee-vraag
                  (slaat het review-overzicht bewust over → direct door). */}
              <button
                type="button"
                onClick={onNext}
                className="min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {SECTION_EXIT_LABEL}
              </button>
            </div>
          }
        >
          <div className="space-y-6">
            {runningList}
            <DebtTypeMultiPicker
              selected={selectedTypes}
              onToggle={toggleSelectedType}
            />
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
        onClose={handleWizardClose}
        initialIntent="debt"
        initialDebtType={wizardType ?? undefined}
        mode="collect"
        onCollect={handleWizardCollect}
      />
    </>
  )
}
