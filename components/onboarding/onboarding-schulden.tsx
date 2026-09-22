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
import { dataNoteFor } from '@/lib/onboarding/data-note-copy'
import {
  initialSchuldenPhases,
  phaseKey,
  useSectionPhaseNav,
  type SectionPhase,
} from './section-phase'

/**
 * Stap — Schulden, RASTER-FIRST met ALTIJD-uitgang.
 *
 * Structuur (B-054, eigenaarsbesluit 19 sep 2026 — herziening van H13/26 aug,
 * ADR 0164):
 *
 *   1. ÉÉN aanvinkraster (`pick-many`) met de volledige catalogus, de vier
 *      meest voorkomende soorten (hypotheek, studielening, persoonlijke lening,
 *      autolening — CBS/AFM) vooraan onder "Meest voorkomend". Schuldsoorten die
 *      al via een bezitting zijn opgegeven (hypotheek bij je woning, autolening
 *      bij je voertuig, RC bij je BV — `LINKED_DEBT_SUGGESTIONS`) staan er
 *      uitgeschakeld in mét hun herkomst — zichtbaar, niet dubbel opvoerbaar.
 *   2. De gedeelde `QuickAddWizard` (mode='collect') opent één keer per
 *      aangevinkt type (collect-queue, in rastervolgorde); ná elke toevoeging
 *      volgt "Nog een …?" zodat meerdere schulden van hetzelfde type kunnen
 *      (twee creditcards, twee persoonlijke leningen).
 *   3. Review-overzicht zodra er íets te tonen is.
 *
 * Bij "geen schulden" is dat 1 scherm (H13-hybride: 5; daarvóór: 8). Op élk
 * scherm staat de drempelloze knop "Ik heb (verder) geen schulden" die de
 * sectie in één tik afsluit.
 *
 * HARDE EIS: het herhaalbare blok is de bestaande wizard opnieuw openen, nooit
 * een eigen inline type+saldo-formulier — dat zou rente/looptijd/aflossingsvorm
 * op type-defaults zetten en daarmee `monthly_payment`, de box 1-aftrek en de
 * kernel-uitkomst stil veranderen.
 *
 * De aangevinkte types en de queue leven uitsluitend in component-state en
 * gaan bewust NIET het draft in — zie `draft-persistence.ts`
 * (`SENSITIVE_DRAFT_KEYS`, 3 jul 2026: gevoelige onboarding-invoer wordt niet
 * gepersisteerd). Een hersteld concept van vóór raster-first (stack op
 * `ask`/`more`) heelt naar het raster: `healSchuldenPhases` in de orchestrator,
 * en hier als vangnet in `renderPhase`.
 *
 * "Geld levert tijd op": schulden zijn hier neutraal geframed als *schulden die
 * je aflost* (ADR 0165) — geen nieuw €→tijd-cijfer verzonnen (onboarding kent geen
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

// ── Raster-indeling ────────────────────────────────────────────────────

/**
 * De vier meest voorkomende schuldsoorten (CBS/AFM: hypotheek en studielening
 * via DUO zijn veruit de grootste groepen; persoonlijke lening en autolening/
 * private lease volgen). Tot B-054 waren dit de vier ja/nee-kopvragen; sinds
 * raster-first staan ze als "Meest voorkomend" vooraan in het raster, zodat een
 * hypotheek of studielening niet in een lijst van elf tegels verdwijnt.
 * Geëxporteerd voor de tests (uniciteit + volgorde).
 */
export const FEATURED_DEBT_TYPES: readonly DebtType[] = [
  'mortgage',
  'student_loan',
  'personal_loan',
  'car_loan',
]

/**
 * Term in de vervolgvraag "Nog een …?". Zonder override erft die het
 * quick-add-label en lekt bv. de parenthetical van 'Studielening (DUO)' de zin
 * in ("Nog een studielening (duo)?"). `revolving_credit` en roodstand delen
 * één type (`DebtQuickInput` draagt geen subtype) — bewust één tegel.
 */
const MORE_LABEL_OVERRIDES: Partial<Record<DebtType, string>> = {
  student_loan: 'studielening',
  car_loan: 'autolening of private lease',
  dga_schuld: 'lening bij je eigen BV',
  other: 'andere schuld',
}
const moreLabelFor = (type: DebtType) =>
  MORE_LABEL_OVERRIDES[type] ?? DEBT_QUICK_ADD_LABELS[type].toLowerCase()

/** Schuldsoorten die aan een bezitting gekoppeld kunnen zijn (asset → schuld). */
const LINKABLE_DEBT_TYPES: readonly DebtType[] = Object.values(LINKED_DEBT_SUGGESTIONS)

/**
 * Drempelloze sectie-uitgang. Scherp geformuleerd wanneer er nog niets staat
 * ("Ik heb geen schulden") — de tegenhanger van elf tegels scannen — en met
 * "verder" zodra er al een schuld in het overzicht staat.
 */
const sectionExitLabel = (hasAnyDebt: boolean) =>
  hasAnyDebt ? 'Ik heb verder geen schulden' : 'Ik heb geen schulden'

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
   * gekoppeld — in het raster uitgeschakeld mét herkomst ("via je woning" /
   * "via je voertuig" / "via je BV"): de schuld staat al in het lopende
   * overzicht en mag niet dubbel worden opgevoerd. Geldt voor élk type uit
   * `LINKED_DEBT_SUGGESTIONS`, niet alleen de hypotheek.
   */
  const linkedTypeOrigins = useMemo(() => {
    const linked: Partial<Record<DebtType, string>> = {}
    for (const d of quickDebts) {
      const type = d.debt_type as DebtType
      if (d.linked_client_ref && LINKABLE_DEBT_TYPES.includes(type)) {
        linked[type] = debtOrigin(type)
      }
    }
    return linked
  }, [quickDebts])

  // Fase-stack (controlled door de orchestrator, anders interne useState). Terug
  // popt één scherm; op de stack-bodem valt 'ie terug op de groep-`onBack`.
  const { phase: rawPhase, push, replace, back } = useSectionPhaseNav(
    phases,
    onPhasesChange,
    onBack,
    initialSchuldenPhases,
  )
  const [wizardType, setWizardType] = useState<DebtType | null>(null)

  /**
   * Aanvinkraster-selectie + collect-queue. Beide leven UITSLUITEND hier in
   * component-state: ze mogen niet in het gepersisteerde draft belanden (zie de
   * bestandskop). `queue` is `null` zolang er geen queue loopt, en anders de
   * types die ná de nu geopende wizard nog aan de beurt zijn.
   */
  const [selectedTypes, setSelectedTypes] = useState<DebtType[]>([])
  const [queue, setQueue] = useState<DebtType[] | null>(null)

  // Vangnet voor een niet-geheelde stack van vóór raster-first: de ja/nee-kop
  // bestaat niet meer, en `more` hoort bij een queue die hier niet loopt.
  const phase: SectionPhase =
    rawPhase.kind === 'ask' || (rawPhase.kind === 'more' && queue === null)
      ? { kind: 'pick-many' }
      : rawPhase

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
   * Rastervolgorde = eerst "Meest voorkomend", dan de rest van de catalogus in
   * `QUICK_ADD_DEBT_ORDER` — de wizard loopt de tegels af zoals ze op het
   * scherm stonden, niet in aanvink-volgorde.
   */
  const rasterOrder = useMemo(
    () => [
      ...FEATURED_DEBT_TYPES,
      ...QUICK_ADD_DEBT_ORDER.filter((t) => !FEATURED_DEBT_TYPES.includes(t)),
    ],
    [],
  )

  /**
   * Start de queue voor de aangevinkte types. De wizard opent meteen op het
   * eerste type; `queue` houdt de rest vast.
   */
  function startQueue(types: DebtType[]) {
    const ordered = rasterOrder.filter((t) => types.includes(t))
    if (ordered.length === 0) {
      finishSection()
      return
    }
    setQueue(ordered.slice(1))
    setWizardType(ordered[0])
  }

  /** Sluit de queue af: review zodra er iets staat, anders blijf op het raster. */
  function endQueue(collectedNow: boolean, via: 'push' | 'replace') {
    setQueue(null)
    setWizardType(null)
    setSelectedTypes([])
    // `hasAnyDebt` is in dezelfde render nog de oude waarde — daarom `collectedNow`.
    if (collectedNow || hasAnyDebt) {
      if (via === 'replace') replace({ kind: 'review' })
      else push({ kind: 'review' })
    } else if (via === 'replace') {
      // "Nog een?" zonder dat er iets staat kan niet voorkomen; vangnet.
      back()
    }
    // Niets toegevoegd (alles geannuleerd) → blijf op het raster staan i.p.v.
    // de gebruiker ongevraagd de sectie uit te sturen.
  }

  /**
   * Na "Nee" op "Nog een …?": het volgende type uit de queue, of afronden. De
   * "nog een?"-fase gaat eraf (pop) resp. wordt het review (replace) — één
   * state-update per pad, zodat er nooit op een verouderde stack wordt gerekend.
   */
  function continueQueueAfterMore() {
    const rest = queue ?? []
    if (rest.length > 0) {
      setQueue(rest.slice(1))
      back() // "nog een?" eraf → het raster, met de wizard eroverheen
      setWizardType(rest[0])
      return
    }
    endQueue(true, 'replace')
  }

  /** De wizard geannuleerd midden in de queue = "sla dit type over". */
  function skipQueuedType() {
    const rest = queue ?? []
    if (rest.length > 0) {
      setQueue(rest.slice(1))
      setWizardType(rest[0])
      return
    }
    endQueue(false, 'push')
  }

  // ── Wizard-collect ──────────────────────────────────────────────────
  function handleWizardCollect(item: QuickAddInput) {
    if (item.kind !== 'debt') return // 'asset' kan in de schuld-sectie niet voorkomen.
    onDebtsChange([...quickDebts, item.debt])
    setWizardType(null)
    if (queue !== null) {
      // Ná elke toevoeging in de queue: "Nog een …?" — zo kunnen twee schulden
      // van hetzelfde type (de tweede helft van melding B-054). Vanuit de
      // "nog een?"-fase zelf blijft die fase gewoon staan.
      if (phase.kind !== 'more') {
        push({ kind: 'more', qIndex: QUICK_ADD_DEBT_ORDER.indexOf(item.debt.debt_type as DebtType) })
      }
      return
    }
    if (phase.kind === 'other-pick') back() // terug naar het review-overzicht
  }

  function handleWizardClose() {
    // Midden in de queue (raster → wizard) = "sla deze over", niet "stop alles".
    // Vanuit "Nog een?" → gewoon dicht, de vraag blijft staan.
    if (queue !== null && phase.kind !== 'more') {
      skipQueuedType()
      return
    }
    setWizardType(null)
  }

  function removeDebt(idx: number) {
    onDebtsChange(quickDebts.filter((_, i) => i !== idx))
  }

  // Sectie afronden: zodra er íets te tonen is (losse óf gekoppelde schuld)
  // eerst een bevestigend overzicht, anders direct door. De altijd-zichtbare
  // drempelloze uitgang (`sectionExitLabel`) blijft bewust direct-naar-onNext.
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
      sub={hasAnyDebt ? 'schulden die je aflost' : 'gemiddelde consumptieve schuld per huishouden'}
      source={
        hasAnyDebt
          ? `${totalDebtCount} schuld${totalDebtCount === 1 ? '' : 'en'}`
          : 'Indicatief · CBS/AFM'
      }
    />
  )

  const exitLabel = sectionExitLabel(hasAnyDebt)

  function renderPhase() {
    // "Nog een …?" ná een toevoeging uit de queue: zelfde type nog eens (de
    // wizard opnieuw — nooit een eigen formulier), of door met de queue.
    if (phase.kind === 'more') {
      const type = QUICK_ADD_DEBT_ORDER[phase.qIndex] ?? 'other'
      return (
        <OnboardingVraag
          kicker="Schuld"
          romanNum="iv."
          factsPanel={factsPanel}
          currentStep={currentStep}
          totalSteps={totalSteps}
          title={<span>Nog een {moreLabelFor(type)}?</span>}
          deck="Voeg er gerust meer toe — of ga door."
          onBack={() => {
            // Terug naar het raster = de lopende queue laten vallen; wat al is
            // toegevoegd blijft in het overzicht staan.
            setQueue(null)
            setSelectedTypes([])
            back()
          }}
          exitLabel={exitLabel}
          onExit={onNext}
          onYes={() => setWizardType(type)}
          onNo={continueQueueAfterMore}
        >
          {runningList}
        </OnboardingVraag>
      )
    }

    // Aanvinkraster — de INGANG van de sectie, in één scherm: de volledige
    // catalogus met de vier meest voorkomende soorten vooraan en de al via een
    // bezitting opgegeven soorten uitgeschakeld mét herkomst. De drempelloze
    // sectie-uitgang blijft bewust altijd bereikbaar.
    if (phase.kind === 'pick-many') {
      const count = selectedTypes.length
      return (
        <OnboardingShell
          kicker="Schuld"
          romanNum="iv."
          title={
            <span>
              Welke <em className="font-normal italic">schulden</em> heb je?
            </span>
          }
          deck="Vink alles aan wat van toepassing is — denk ook aan een hypotheek of studielening. Daarna vul je per schuld het bedrag in; elke aflossing levert tijd op. Geen schulden? Ga gewoon verder."
          dataNote={dataNoteFor('schulden')}
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
              {/* Drempelloze sectie-uitgang (slaat het review-overzicht bewust
                  over → direct door). */}
              <button
                type="button"
                onClick={onNext}
                className="min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {exitLabel}
              </button>
            </div>
          }
        >
          <div className="space-y-6">
            {runningList}
            <DebtTypeMultiPicker
              featured={FEATURED_DEBT_TYPES}
              linked={linkedTypeOrigins}
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
          deck="Samen de schulden die je stap voor stap aflost. Klopt het, of wil je nog iets toevoegen?"
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
