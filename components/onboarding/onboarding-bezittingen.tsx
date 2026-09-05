'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { OnboardingVraag } from './onboarding-vraag'
import { SectionReview } from './section-review'
import { AssetRow, LinkedDebtRow, AssetTypePicker } from './onboarding-posten'
import { OnboardingWoningKeuze } from './onboarding-woning-keuze'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import type { HousingChoice } from '@/lib/housing-choice'
import {
  ASSET_QUICK_ADD_LABELS,
  type AssetType,
} from '@/lib/asset-data'
import type {
  AssetQuickInput,
  DebtQuickInput,
  QuickAddInput,
} from '@/lib/quick-add/types'
import { formatCurrency } from '@/lib/format'
import { dataNoteFor } from '@/lib/onboarding/data-note-copy'
import {
  phaseKey,
  useSectionPhaseNav,
  type SectionPhase,
} from './section-phase'

/**
 * Stap — Bezittingen, als begeleide ja/nee-enumeratie (Boldin-stijl).
 *
 * Vervangt het oude tiles-scherm door een serie gerichte ja/nee-vragen in
 * oplopende waarschijnlijkheid (betaalrekening → spaargeld → eigen huis →
 * beleggingen → andere bezittingen). Bij "ja" opent de gedeelde
 * `QuickAddWizard` (mode='collect') voorgeselecteerd op het juiste asset-type;
 * na het verzamelen van één post sluiten we de wizard en stellen we "Nog een?"
 * tot de gebruiker "nee" zegt. Elke "nee" is een drempelloze, gelijkwaardige
 * knop; de hele sectie is overslaanbaar.
 *
 * Het eigen-huis-pad hergebruikt het bestaande `asset_with_debt`-pad van de
 * wizard: ná het huis vraagt de wizard zelf "Heeft deze woning een hypotheek?"
 * en levert huis + hypotheek als lokaal paar (gekoppeld via `client_ref`). De
 * schulden-sectie (`onboarding-schulden.tsx`) slaat de hypotheek-vraag dan over.
 *
 * **Wizard strak aansturen** (zie card-risico 4): we openen voorgeselecteerd,
 * ontvangen exact één item via `onCollect`, sluiten de wizard onmiddellijk en
 * voeren onze eigen "nog een?"-loop — zodat de wizard z'n eigen "Nog een
 * toevoegen"-success-flow de ja/nee-loop niet bijt.
 */

// ── Props ──────────────────────────────────────────────────────────────

export interface OnboardingBezittingenProps {
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  onAssetsChange: (items: AssetQuickInput[]) => void
  onDebtsChange: (items: DebtQuickInput[]) => void
  /** Sectie afgerond → volgende groep. */
  onNext: () => void
  onBack: () => void
  /** Groep-index (1-indexed) voor de voortgangsbalk. */
  currentStep?: number
  totalSteps?: number
  /** Net terug van een succesvolle PSD2-koppeling (?bank_connected=1). */
  bankConnected?: boolean
  /** PSD2-callback gaf een fout (?bank_error=1). */
  bankError?: boolean
  /**
   * Gelifte interne fase-stack (controlled) — door de orchestrator gevoed zodat
   * de fase een remount overleeft en Terug uit een latere groep hier op het
   * laatst getoonde scherm landt i.p.v. op vraag 1. Zonder deze props draait de
   * sectie uncontrolled op interne state (los renderen in tests).
   */
  phases?: SectionPhase[]
  onPhasesChange?: (phases: SectionPhase[]) => void
  /**
   * De woning-keuze uit stap iii-a (ADR 0133), gelift naar de orchestrator zodat
   * hij het concept in reist en de save-body haalt. `null` = nog niet gevraagd.
   */
  housingChoice?: HousingChoice | null
  /**
   * Rapporteert de keuze terug. `null` betekent WISSEN — dat gebeurt zodra de
   * laatste eigen woning uit de lijst verdwijnt: een keuze over een woning die
   * er niet meer is, mag niet stil in het profiel achterblijven.
   *
   * Weggelaten (los renderen in tests) → de sectie houdt de keuze zelf vast,
   * zelfde controlled/uncontrolled-patroon als de fase-stack hierboven.
   */
  onHousingChoiceChange?: (choice: HousingChoice | null) => void
}

// ── Vragen-volgorde ────────────────────────────────────────────────────

interface AssetQuestion {
  type: AssetType
  question: string
  /**
   * Optioneel eigen deck voor déze vraag (valt anders terug op het gedeelde
   * default-deck). Zo staat de spaarrekening-verduidelijking uitsluitend bij de
   * betaalrekening-vraag en lekt 'die vragen we hierna' niet naar de andere
   * vragen — die het default-deck delen.
   */
  deck?: string
}

/** Gerichte ja/nee-vragen, in oplopende waarschijnlijkheid. */
const ASSET_QUESTIONS: AssetQuestion[] = [
  {
    type: 'cash',
    question: 'Heb je een betaalrekening?',
    deck: 'Begin met je betaalrekening — de rekening waar je salaris binnenkomt. Spaargeld staat op een aparte rekening; die vragen we hierna. Elke post toont een stukje opgebouwde vrijheid.',
  },
  { type: 'savings', question: 'Heb je een spaargeldrekening?' },
  { type: 'eigen_huis', question: 'Heb je een eigen huis?' },
  { type: 'investment', question: 'Heb je beleggingen?' },
]

/**
 * De vraag waarna de woning-keuze (stap iii-a, ADR 0133) kan volgen. Afgeleid
 * i.p.v. hardgecodeerd, zodat een herordening van `ASSET_QUESTIONS` de
 * terugkeer-fase na die keuze niet stil naar de verkeerde vraag stuurt.
 */
const HOME_QUESTION_INDEX = ASSET_QUESTIONS.findIndex((q) => q.type === 'eigen_huis')

/**
 * Onboarding-specifieke override voor de kleine-letter labels in de
 * "Nog een …?"-vervolgvraag. De vervolgvraag telt één post, dus het label
 * moet ENKELVOUD en telbaar zijn; `ASSET_QUICK_ADD_LABELS` is daar niet
 * altijd geschikt voor omdat dat het app-brede wizard-label is:
 * - `savings` → 'Spaargeld' (niet telbaar) → "spaargeldrekening"
 * - `investment` → 'Beleggingen' (meervoud) → "belegging"
 * Andere types vallen terug op het gedeelde label, dat daar al enkelvoud is
 * ('Betaalrekening', 'Eigen woning'). Raakt het app-brede label niet. */
const ONBOARDING_MORE_LABELS: Partial<Record<AssetType, string>> = {
  savings: 'spaargeldrekening',
  investment: 'belegging',
}

// ── Component ──────────────────────────────────────────────────────────

export function OnboardingBezittingen({
  quickAssets,
  quickDebts,
  onAssetsChange,
  onDebtsChange,
  onNext,
  onBack,
  currentStep = 3,
  totalSteps = 7,
  bankConnected = false,
  bankError = false,
  phases,
  onPhasesChange,
  housingChoice,
  onHousingChoiceChange,
}: OnboardingBezittingenProps) {
  // Fase-stack (controlled door de orchestrator, anders interne useState). Terug
  // popt één scherm; op de stack-bodem valt 'ie terug op de groep-`onBack`.
  const { phase, push, back } = useSectionPhaseNav(phases, onPhasesChange, onBack)
  // Wanneer gezet: de wizard staat open, voorgeselecteerd op dit asset-type.
  const [wizardType, setWizardType] = useState<AssetType | null>(null)
  const [unlinkNotice, setUnlinkNotice] = useState<string | null>(null)

  // ── Woning-keuze (stap iii-a, ADR 0133) ─────────────────────────────
  // Controlled zodra de orchestrator een setter levert; anders interne state —
  // zelfde patroon als `useSectionPhaseNav`, zodat de sectie los te renderen is.
  const [internalChoice, setInternalChoice] = useState<HousingChoice | null>(null)
  const choice = onHousingChoiceChange ? (housingChoice ?? null) : internalChoice
  const setChoice = (next: HousingChoice | null) => {
    if (onHousingChoiceChange) onHousingChoiceChange(next)
    else setInternalChoice(next)
  }
  /**
   * De fase waar "Verder" op het woning-keuze-scherm heen gaat: de vervolgfase
   * die de normale loop zonder dat tussenscherm zou hebben gekozen. `phase: null`
   * betekent "blijf op de fase eronder" (de collect gebeurde in een
   * `more`/`other-more`-scherm), en de hele waarde `null` betekent "niet gezet" —
   * dat laatste kan alleen na een remount midden op dit scherm.
   */
  const [afterHousingChoice, setAfterHousingChoice] = useState<{
    phase: SectionPhase | null
  } | null>(null)

  // Koppel-index: client_ref → gekoppelde schuld (hypotheek onder huis).
  const debtByRef = useMemo(() => {
    const map = new Map<string, { debt: DebtQuickInput; index: number }>()
    quickDebts.forEach((debt, index) => {
      if (debt.linked_client_ref) map.set(debt.linked_client_ref, { debt, index })
    })
    return map
  }, [quickDebts])

  const totalAssets = useMemo(
    () => quickAssets.reduce((s, a) => s + (Number(a.current_value) || 0), 0),
    [quickAssets],
  )

  /**
   * Gekoppelde schuld (hypotheek onder de woning, RC onder de BV, …) die in
   * DÉZE lijst als eigen rode regel zichtbaar is.
   *
   * Bevinding UR2-06: het getoonde totaal was de kale bezittingen-som, terwijl
   * de gekoppelde hypotheek er als "−€285.000" naast stond. Dat leest als netto
   * vermogen en is het niet. We tellen daarom uitsluitend de schulden mee die
   * hier ook echt gerenderd worden — zo is de som per definitie de som van de
   * getoonde rijen. Losse schulden komen pas in de schulden-sectie aan bod en
   * horen hier dus niet in (de recap op het eindscherm trekt die er wél af).
   */
  const linkedDebtAmounts = useMemo(
    () =>
      quickAssets
        .map((asset) => (asset.client_ref ? debtByRef.get(asset.client_ref) : undefined))
        .map((entry) => (entry ? Number(entry.debt.current_balance) || 0 : 0))
        .filter((amount) => amount > 0),
    [quickAssets, debtByRef],
  )
  const linkedDebtTotal = linkedDebtAmounts.reduce((s, amount) => s + amount, 0)
  const hasLinkedDebt = linkedDebtTotal > 0
  const netAssets = totalAssets - linkedDebtTotal
  const linkedDebtLabel = `gekoppelde schuld${linkedDebtAmounts.length === 1 ? '' : 'en'}`

  // ── Wizard-collect ──────────────────────────────────────────────────
  function handleWizardCollect(item: QuickAddInput) {
    setUnlinkNotice(null)
    // Was er vóór deze post al een eigen woning? Bepaalt of de woning-keuze nog
    // gesteld moet worden — hij hoort exact één keer te komen, bij de eerste.
    const hadHome = quickAssets.some((a) => a.asset_type === 'eigen_huis')
    let addedHome = false
    if (item.kind === 'asset') {
      onAssetsChange([...quickAssets, item.asset])
      addedHome = item.asset.asset_type === 'eigen_huis'
    } else if (item.kind === 'asset_with_debt') {
      // Huis + hypotheek als lokaal paar — koppel via opaak client_ref-token
      // (server vertaalt na insert naar het echte debts.linked_asset_id).
      const ref = `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      onAssetsChange([...quickAssets, { ...item.asset, client_ref: ref }])
      onDebtsChange([
        ...quickDebts,
        { ...item.debt, linked_asset_id: null, linked_client_ref: ref },
      ])
      addedHome = item.asset.asset_type === 'eigen_huis'
    }
    // 'debt' kan in de asset-sectie niet voorkomen (wizard intent = asset).

    // Sluit de wizard en ga naar de "nog een?"-fase voor het juiste type.
    setWizardType(null)
    const next: SectionPhase | null =
      phase.kind === 'ask'
        ? { kind: 'more', qIndex: phase.qIndex }
        : phase.kind === 'other-ask' || phase.kind === 'other-pick'
          ? { kind: 'other-more' }
          : // 'more' / 'other-more' → geen push, de "nog een?"-fase blijft staan.
            null

    // Eerste eigen woning → de keuze ertussen (ADR 0133). Dit komt ná de
    // hypotheek-vraag van de wizard, want die zit in dezelfde collect
    // (`asset_with_debt`). "Verder" op dat scherm hervat `next`.
    if (addedHome && !hadHome && choice === null) {
      setAfterHousingChoice({ phase: next })
      push({ kind: 'woning-keuze' })
      return
    }

    if (next) push(next)
  }

  /** "Verder" op het woning-keuze-scherm: hervat de normale loop. */
  function finishHousingChoice() {
    const pending = afterHousingChoice
    setAfterHousingChoice(null)
    if (!pending) {
      // Alleen bereikbaar na een remount midden op dit scherm (de vervolgfase
      // leeft in component-state, niet in de gelifte stack). De woning-vraag is
      // dan de eerlijkste terugval: dáár kwam de keuze vandaan.
      push({ kind: 'more', qIndex: HOME_QUESTION_INDEX })
      return
    }
    if (pending.phase) push(pending.phase)
    else back()
  }

  // ── Verwijderen (transient input — geen confirm) ────────────────────
  function removeAsset(idx: number) {
    const removed = quickAssets[idx]
    const remaining = quickAssets.filter((_, i) => i !== idx)
    onAssetsChange(remaining)
    // Laatste woning weg → de woning-keuze wissen. Een antwoord op "telt je
    // woning mee?" mag niet stil in het profiel achterblijven zonder woning;
    // komt er later toch weer een woning bij, dan wordt de vraag opnieuw
    // gesteld (dezelfde eerste-woning-regel als hierboven).
    if (choice !== null && !remaining.some((a) => a.asset_type === 'eigen_huis')) {
      setChoice(null)
      setAfterHousingChoice(null)
    }
    // Huis met gekoppelde hypotheek verwijderd → hypotheek blijft als losse
    // schuld (ontkoppeld), spiegelt het DB-gedrag ON DELETE SET NULL.
    if (removed?.client_ref) {
      const linked = quickDebts.find((d) => d.linked_client_ref === removed.client_ref)
      if (linked) {
        onDebtsChange(
          quickDebts.map((d) =>
            d.linked_client_ref === removed.client_ref ? { ...d, linked_client_ref: null } : d,
          ),
        )
        setUnlinkNotice(linked.name)
        return
      }
    }
    setUnlinkNotice(null)
  }
  function removeLinkedDebt(idx: number) {
    setUnlinkNotice(null)
    onDebtsChange(quickDebts.filter((_, i) => i !== idx))
  }

  // ── Navigatie tussen vragen ─────────────────────────────────────────
  function nextAfterQuestion(qIndex: number) {
    if (qIndex + 1 < ASSET_QUESTIONS.length) {
      push({ kind: 'ask', qIndex: qIndex + 1 })
    } else {
      push({ kind: 'other-ask' })
    }
  }

  // Sectie afronden: bij gevulde lijst eerst een bevestigend overzicht,
  // bij lege lijst (bezittingen overgeslagen) direct door.
  function finishSection() {
    if (quickAssets.length > 0) push({ kind: 'review' })
    else onNext()
  }

  // ── Lopend overzicht (children) ─────────────────────────────────────
  const runningList =
    quickAssets.length > 0 ? (
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Toegevoegd · {formatCurrency(totalAssets)}
          {hasLinkedDebt ? ' bruto' : ''}
        </p>
        <ul className="space-y-2">
          {quickAssets.map((item, idx) => {
            const linked = item.client_ref ? debtByRef.get(item.client_ref) : undefined
            return (
              <li key={`asset-${idx}`} className="space-y-2">
                <AssetRow item={item} onRemove={() => removeAsset(idx)} />
                {linked && (
                  <LinkedDebtRow
                    item={linked.debt}
                    onRemove={() => removeLinkedDebt(linked.index)}
                  />
                )}
              </li>
            )
          })}
        </ul>
        {/* Netto-afsluiting: zonder deze regel leest het bruto-totaal boven de
            lijst als netto vermogen, terwijl de gekoppelde schuld er als eigen
            rode regel tússen staat (UR2-06). */}
        {hasLinkedDebt && (
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-2)]">
            Netto na {linkedDebtLabel} · {formatCurrency(netAssets)}
          </p>
        )}
        {unlinkNotice && (
          <p className="text-[11px] italic text-[var(--ink-3)]">
            {unlinkNotice} blijft als losse schuld staan na het verwijderen van de woning.
          </p>
        )}
      </div>
    ) : null

  // Statusmelding bovenaan de eerste vraag bij terugkeer van een PSD2-koppeling.
  const bankBanner =
    phase.kind === 'ask' && phase.qIndex === 0 && (bankConnected || bankError) ? (
      bankConnected ? (
        <div className="flex items-center gap-3 border-2 border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <p className="text-sm font-semibold text-green-800">Bank succesvol gekoppeld</p>
        </div>
      ) : (
        <div className="border-2 border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">
            Bankverbinding mislukt — voeg je bezittingen handmatig toe.
          </p>
        </div>
      )
    ) : null

  // Stam is "bezitting" (zelfstandig naamwoord), niet "bezit": met de stam
  // "bezit" + suffix "ten" ontstond het wérkwoord "bezitten" ("2 bezitten") en
  // bij één post het kale "1 bezit".
  const assetCountLabel = `${quickAssets.length} bezitting${quickAssets.length === 1 ? '' : 'en'}`
  const factsPanel = (
    <FactsPanel
      // Kopgetal is netto zodra er een gekoppelde schuld tussen staat — anders
      // belooft het bruto-bedrag een vermogen dat de gebruiker niet heeft
      // (UR2-06). Het bruto-bedrag blijft zichtbaar in de bron-regel.
      stat={
        quickAssets.length > 0
          ? formatCurrency(hasLinkedDebt ? netAssets : totalAssets)
          : '€128.500'
      }
      sub={
        quickAssets.length === 0
          ? 'mediaan huishoud-vermogen in Nederland'
          : hasLinkedDebt
            ? `jouw bezittingen min de ${linkedDebtLabel}`
            : 'jouw bezittingen tot nu toe'
      }
      source={
        quickAssets.length === 0
          ? 'CBS Vermogensstatistiek, 2023'
          : hasLinkedDebt
            ? `${assetCountLabel} · ${formatCurrency(totalAssets)} bruto`
            : assetCountLabel
      }
    />
  )

  // ── Render per fase ─────────────────────────────────────────────────
  const sharedVraagProps = {
    kicker: 'Bezit',
    romanNum: 'iii.',
    factsPanel,
    currentStep,
    totalSteps,
    onBack: back,
  }

  function renderPhase() {
    if (phase.kind === 'ask' || phase.kind === 'more') {
      const q = ASSET_QUESTIONS[phase.qIndex]
      const label =
        ONBOARDING_MORE_LABELS[q.type] ?? ASSET_QUICK_ADD_LABELS[q.type].toLowerCase()
      const isMore = phase.kind === 'more'
      const title = isMore ? (
        <>
          Nog een{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            {label}
          </em>
          ?
        </>
      ) : (
        questionHeadline(q.question)
      )
      return (
        <OnboardingVraag
          {...sharedVraagProps}
          title={title}
          deck={
            isMore
              ? 'Voeg er gerust meer toe — of ga door naar de volgende vraag.'
              : (q.deck ??
                'Elke post die je toevoegt, toont een stukje opgebouwde vrijheid; samen vormen ze je netto vermogen. Twijfel je? Sla gerust over — toevoegen kan later altijd.')
          }
          // Gegevensregel alleen bij de INGANG van de sectie: op elke micro-vraag
          // herhalen maakt van een rustige regel een refrein en botst met
          // "één ding tegelijk" (UR3-10).
          dataNote={
            !isMore && phase.qIndex === 0 ? dataNoteFor('bezittingen') : undefined
          }
          onYes={() => setWizardType(q.type)}
          onNo={() => nextAfterQuestion(phase.qIndex)}
          exitLabel={!isMore && phase.qIndex === 0 ? 'Sla bezittingen over' : undefined}
          onExit={!isMore && phase.qIndex === 0 ? onNext : undefined}
        >
          <>
            {bankBanner}
            {runningList}
          </>
        </OnboardingVraag>
      )
    }

    // Eenmalige woning-keuze, direct na de eerste eigen woning (ADR 0133).
    // Alle kopij komt uit `lib/housing-choice.ts`; deze sectie levert alleen de
    // kop-taxonomie en de voortgang.
    if (phase.kind === 'woning-keuze') {
      return (
        <OnboardingWoningKeuze
          {...sharedVraagProps}
          value={choice}
          onChange={setChoice}
          onNext={finishHousingChoice}
        />
      )
    }

    // "Heb je nog andere bezittingen?" (other-ask) en "Nog een bezitting?"
    // (other-more): geen ja/nee-tussenstap meer — de volledige asset-catalogus
    // staat hier direct als aanklikbare kaartjes (kaartje-klik opent meteen de
    // wizard). De footer is één drempelloze afsluitknop. `other-pick` blijft als
    // apart picker-scherm bestaan voor SectionReview.onAddMore + oude fase-stacks.
    if (phase.kind === 'other-ask' || phase.kind === 'other-more') {
      const isFirst = phase.kind === 'other-ask'
      return (
        <OnboardingShell
          {...sharedVraagProps}
          title={questionHeadline(
            isFirst ? 'Heb je nog andere bezittingen?' : 'Nog een bezitting?',
          )}
          deck={
            isFirst
              ? 'Kies een categorie om die meteen toe te voegen — denk aan een auto, pensioen, crypto of een eigen BV. Of rond je bezittingen af.'
              : 'Voeg er gerust nog een toe — of rond je bezittingen af.'
          }
          footer={
            <button
              type="button"
              onClick={finishSection}
              className="w-full min-h-11 border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              {isFirst ? 'Nee, ik ben klaar' : 'Nee, klaar'}
            </button>
          }
        >
          <div className="space-y-6">
            {runningList}
            {/* Volledige catalogus (geen `exclude`) zodat een eerder overgeslagen
                woning/spaar-/betaalrekening/belegging hier alsnog toe te voegen
                is. Geen `onCancel`: de sectie-footer verzorgt de uitgang. */}
            <AssetTypePicker exclude={[]} onPick={(type) => setWizardType(type)} />
          </div>
        </OnboardingShell>
      )
    }

    if (phase.kind === 'review') {
      return (
        <SectionReview
          kicker="Bezit"
          romanNum="iii."
          title={questionHeadline('Dit zijn je bezittingen')}
          deck="Een rustig overzicht van wat je tot nu toe hebt opgebouwd. Klopt het, of wil je nog iets toevoegen?"
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
        kicker="Bezit"
        romanNum="iii."
        title={questionHeadline('Wat voor bezitting?')}
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
          {/* Catch-all vangnet: toon de vólledige asset-catalogus (canonieke
              `QUICK_ADD_ASSET_ORDER`), óók de vier types die al via een
              gerichte ja/nee-vraag langskwamen. Wie daar "nee" zei maar een
              woning/spaar-/betaalrekening/belegging vergat, kan die hier alsnog
              toevoegen. Geen `exclude` — anders ontbreken juist de meest
              voorkomende bezittingen. */}
          <AssetTypePicker
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
          vervolgvragen bínnen deze sectie speelt (niet alleen tussen groepen). */}
      <div key={phaseKey(phase)} className="step-enter-forward">
        {renderPhase()}
      </div>

      {/* QuickAddWizard — BottomSheet via portal, voorgeselecteerd op type. */}
      <QuickAddWizard
        open={wizardType !== null}
        onClose={() => setWizardType(null)}
        initialIntent="asset"
        initialAssetType={wizardType ?? undefined}
        mode="collect"
        onCollect={handleWizardCollect}
      />
    </>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Headline met de laatste betekenisvolle term geaccentueerd (italic-em). */
function questionHeadline(question: string) {
  return <span>{question}</span>
}
