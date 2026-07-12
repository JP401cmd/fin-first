'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { OnboardingVraag } from './onboarding-vraag'
import { SectionReview } from './section-review'
import { AssetRow, LinkedDebtRow, AssetTypePicker } from './onboarding-posten'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
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
 * Onboarding-specifieke override voor de kleine-letter labels in de
 * "Nog een …?"-vervolgvraag. Alleen `savings` wijkt bewust af van het
 * gedeelde `ASSET_QUICK_ADD_LABELS` ('Spaargeld'): op de vermogensstap
 * spreken we van een concrete "spaargeldrekening" (telbaar → "nog een …"),
 * zonder het app-brede wizard-label te raken. Andere types vallen terug op
 * het gedeelde label. */
const ONBOARDING_MORE_LABELS: Partial<Record<AssetType, string>> = {
  savings: 'spaargeldrekening',
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
}: OnboardingBezittingenProps) {
  // Fase-stack (controlled door de orchestrator, anders interne useState). Terug
  // popt één scherm; op de stack-bodem valt 'ie terug op de groep-`onBack`.
  const { phase, push, back } = useSectionPhaseNav(phases, onPhasesChange, onBack)
  // Wanneer gezet: de wizard staat open, voorgeselecteerd op dit asset-type.
  const [wizardType, setWizardType] = useState<AssetType | null>(null)
  const [unlinkNotice, setUnlinkNotice] = useState<string | null>(null)

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

  // ── Wizard-collect ──────────────────────────────────────────────────
  function handleWizardCollect(item: QuickAddInput) {
    setUnlinkNotice(null)
    if (item.kind === 'asset') {
      onAssetsChange([...quickAssets, item.asset])
    } else if (item.kind === 'asset_with_debt') {
      // Huis + hypotheek als lokaal paar — koppel via opaak client_ref-token
      // (server vertaalt na insert naar het echte debts.linked_asset_id).
      const ref = `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      onAssetsChange([...quickAssets, { ...item.asset, client_ref: ref }])
      onDebtsChange([
        ...quickDebts,
        { ...item.debt, linked_asset_id: null, linked_client_ref: ref },
      ])
    }
    // 'debt' kan in de asset-sectie niet voorkomen (wizard intent = asset).

    // Sluit de wizard en ga naar de "nog een?"-fase voor het juiste type.
    setWizardType(null)
    if (phase.kind === 'ask') push({ kind: 'more', qIndex: phase.qIndex })
    else if (phase.kind === 'other-ask' || phase.kind === 'other-pick')
      push({ kind: 'other-more' })
    // 'more' / 'other-more' → geen push, de "nog een?"-fase blijft staan.
  }

  // ── Verwijderen (transient input — geen confirm) ────────────────────
  function removeAsset(idx: number) {
    const removed = quickAssets[idx]
    onAssetsChange(quickAssets.filter((_, i) => i !== idx))
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

  const factsPanel = (
    <FactsPanel
      stat={quickAssets.length > 0 ? formatCurrency(totalAssets) : '€128.500'}
      sub={
        quickAssets.length > 0
          ? 'jouw bezittingen tot nu toe'
          : 'mediaan huishoud-vermogen in Nederland'
      }
      source={
        quickAssets.length > 0
          ? `${quickAssets.length} bezit${quickAssets.length === 1 ? '' : 'ten'}`
          : 'CBS Vermogensstatistiek, 2023'
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
                'Elke post die je toevoegt, toont een stukje opgebouwde vrijheid. Twijfel je? Sla gerust over.')
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
