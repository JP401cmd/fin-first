'use client'

/**
 * De keuze voor de uitgaven ná stoppen — logica en weergave, uit
 * `app/(app)/horizon/uitgaven-na-pensioen/uitgaven-client.tsx` gehaald (TPR-15, pure move)
 * zodat de plan-review-wizard exact dezelfde methodekeuze en dezelfde reflectieve flow
 * rendert als het uitgaven-scherm. Eén body, twee plekken.
 */

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MaskedAmount } from '@/components/app/masked-amount'
import { AspirationQuestionnaire } from '@/components/app/horizon/aspiration-questionnaire'
import { formatMaskedCurrency } from '@/lib/format'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import {
  DEFAULT_ASPIRATIONS,
  computeAspirationTotal,
  type AspirationAnswers,
} from '@/lib/retirement-aspirations'

/**
 * Status die de pane-wrapper nodig heeft om de standaard pane-footer (primary/
 * secondary action) te kunnen aansturen. Wordt elke render geüpdatet via
 * `onActionsChange`, zodat de pane `disabled`/`loading` realtime kan volgen.
 */
export interface UitgavenPaneActionsState {
  /** True wanneer er iets op te slaan valt (custom-flow met geldig bedrag). */
  canSave: boolean
  /** True tijdens een lopende save-call (PUT /api/fire-settings). */
  saving: boolean
  /** True direct na succesvolle save — gebruikt voor "Klaar ✓"-flash. */
  savedFlash: boolean
  /** True wanneer de huidige methode `custom_amount` is. Pane laat de save-
   *  knop alleen daar zien — bij andere methoden slaat een methode-klik direct
   *  op (zonder expliciete CTA), dus de pane-footer is dan overbodig. */
  isCustom: boolean
  /** Aanroepbaar door de pane-footer wanneer de gebruiker op "Opslaan" klikt. */
  save: () => void
  /** Live-bedrag (handmatige override of berekend totaal) dat na opslaan
   *  als doelbedrag wordt vastgelegd. Door dit aan de pane-wrapper te leveren
   *  kan die het in de footer náást de Opslaan/Annuleren-knoppen tonen, zodat
   *  gebruikers tijdens het bedienen van settings direct het effect zien. */
  finalAmount: number
}

export interface UitgavenKeuzeProps {
  initialMethod: RetirementExpenseMethod
  customAmount: number | null
  yearlyMustExpenses: number
  yearlyIncome: number
  estimatedYearlyExpenses: number
  currentRetirementExpense: number
  budgetingActive: boolean
  savedAspirations?: unknown
  /** Wanneer aanwezig: child rapporteert save-state aan de pane-wrapper, en het
   *  inline save-blok wordt onderdrukt zodat de pane-footer de enige CTA is. */
  onActionsChange?: (state: UitgavenPaneActionsState) => void
  /** Optionele callback die wordt aangeroepen ná een succesvolle save. De
   *  pane-wrapper gebruikt dit om bij Opslaan-klik óók direct te sluiten — de
   *  pane-sluiting is dan zelf de success-feedback. Niet gezet vanuit de
   *  standalone route, daar blijft het inline save-blok met "Klaar ✓"-flash
   *  het feedback-kanaal. */
  onSaved?: () => void
  /** Optionele callback ná een succesvolle NIET-custom methode-pick (pane blijft
   *  open). De pane-wrapper gebruikt dit om zijn ctx te herladen, zodat het
   *  hero-bedrag (currentRetirementExpense) de zojuist opgeslagen methode toont
   *  i.p.v. de stale waarde van de initiële pane-open. */
  onSaveComplete?: () => void
  /**
   * TPR-15 — schrijft een methode-klik direct weg? Default `true` (het uitgaven-scherm,
   * ongewijzigd). De plan-review-wizard zet `false`: daar is een klik een concept, zie je
   * eerst het effect, en schrijft pas "Opslaan en bevestigen" via `slaConceptOp`.
   */
  opslaanBijKiezen?: boolean
}

/** Merge bewaarde JSON met defaults zodat nieuwe keys altijd een fallback hebben. */
function hydrateAspirations(saved: unknown): AspirationAnswers {
  if (!saved || typeof saved !== 'object') return DEFAULT_ASPIRATIONS
  const s = saved as Partial<AspirationAnswers>
  return {
    ...DEFAULT_ASPIRATIONS,
    ...s,
    hobbies: Array.isArray(s.hobbies) ? s.hobbies : DEFAULT_ASPIRATIONS.hobbies,
    customDreams: Array.isArray(s.customDreams) ? s.customDreams : DEFAULT_ASPIRATIONS.customDreams,
  }
}

const METHOD_DESCRIPTIONS: Record<RetirementExpenseMethod, { title: string; sub: string }> = {
  essential_budgets: {
    title: 'Essentiële budgetten',
    sub: 'Je must-budgetten van vandaag, geïndexeerd',
  },
  current_income: {
    title: 'Behoud van inkomen',
    sub: 'Je huidige levensstijl precies aanhouden',
  },
  custom_amount: {
    title: 'Zelf samenstellen',
    sub: 'Doorloop een korte reflectieve flow',
  },
}

export function useUitgavenKeuze(props: UitgavenKeuzeProps) {
  const router = useRouter()

  const [method, setMethod] = useState<RetirementExpenseMethod>(props.initialMethod)
  const [answers, setAnswers] = useState<AspirationAnswers>(() => hydrateAspirations(props.savedAspirations))
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const breakdown = useMemo(() => computeAspirationTotal(answers), [answers])

  /** Eindbedrag dat we opslaan: handmatige override wint van berekend totaal. */
  const finalAmount = answers.manualOverride != null && answers.manualOverride > 0
    ? answers.manualOverride
    : breakdown.total

  // Live preview-bedragen voor de drie methode-kaarten.
  const previewByMethod: Record<RetirementExpenseMethod, number> = {
    essential_budgets: props.yearlyMustExpenses > 0
      ? props.yearlyMustExpenses
      : props.estimatedYearlyExpenses,
    current_income: props.yearlyIncome,
    custom_amount: method === 'custom_amount'
      ? finalAmount
      : Number(props.customAmount ?? 0),
  }

  const dailyPrice = props.currentRetirementExpense / 365
  const heroAmount = method === 'custom_amount' ? finalAmount : props.currentRetirementExpense

  async function save(
    targetMethod: RetirementExpenseMethod,
    targetAmount: number | null,
    aspirationsToPersist: AspirationAnswers | null,
  ) {
    setSaving(true)
    setError(null)
    try {
      // Eerst huidige eindstrategie ophalen (we mogen die niet overschrijven).
      const current = await fetch('/api/fire-settings').then(r => r.json())
      const fireRes = await fetch('/api/fire-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fire_end_strategy: current.fire_end_strategy ?? 'deplete',
          fire_end_age: current.fire_end_age ?? 90,
          fire_legacy_amount: current.fire_legacy_amount ?? null,
          retirement_expense_method: targetMethod,
          retirement_expense_custom_amount: targetAmount,
        }),
      })
      if (!fireRes.ok) {
        const j = await fireRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'Opslaan mislukt')
      }

      // Bij custom_amount ook de breakdown-antwoorden bewaren.
      if (aspirationsToPersist) {
        const aspRes = await fetch('/api/retirement-aspirations', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ aspirations: aspirationsToPersist }),
        })
        if (!aspRes.ok) {
          const j = await aspRes.json().catch(() => ({}))
          throw new Error(j.error ?? 'Opslaan instellingen mislukt')
        }
      }

      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2400)
      router.refresh()
      // In pane-context: laat de wrapper weten dat opslaan klaar is, zodat
      // de pane direct sluit. De sluiting zelf is de success-feedback. We
      // roepen dit ALLEEN aan in de custom-flow (Opslaan-knop) en NIET in
      // de directe methode-pick-flow (`pickMethod` → `save(m, null, null)`),
      // omdat de gebruiker daar nog op de methode-kaart moet kunnen blijven
      // om het preview-bedrag te zien zonder dat de pane wegvalt.
      if (targetMethod === 'custom_amount' && aspirationsToPersist) {
        props.onSaved?.()
      } else {
        // Niet-custom methode-pick: pane blijft open. `router.refresh()` raakt
        // alleen server-props (SSR), niet de client-`fetch()`-ctx van de pane —
        // dus vraag de wrapper expliciet zijn ctx te herladen zodat het
        // hero-bedrag de nieuwe methode volgt (WF-TOEK-02-bug2, ctx-staleness).
        props.onSaveComplete?.()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  function pickMethod(m: RetirementExpenseMethod) {
    setMethod(m)
    if (m !== 'custom_amount' && props.opslaanBijKiezen !== false) {
      void save(m, null, null)
    }
  }

  function saveCustom() {
    void save('custom_amount', finalAmount, answers)
  }

  /**
   * TPR-15 — het concept opslaan (wizard). Zelf samenstellen = dezelfde save als de
   * pane-footer; een andere methode schrijft de methode en laat een eerder opgeslagen
   * eigen bedrag staan (bevestigen hoort een sluimerend bedrag niet stil te wissen, zelfde
   * regel als `lib/plan-review/overzicht.ts` stap 2).
   */
  function slaConceptOp() {
    if (method === 'custom_amount') saveCustom()
    else void save(method, props.customAmount ?? null, null)
  }

  /**
   * Wijkt het concept af van wat er opgeslagen staat? Bij zelf samenstellen telt een
   * wijziging in de ANTWOORDEN, niet het verschil tussen het vragenlijst-totaal en het
   * opgeslagen bedrag: de onboarding zet een eigen bedrag zónder antwoorden, dus dat
   * totaal wijkt bij openen al af — dan zou "Opslaan en bevestigen" zonder enige
   * handeling het onboarding-bedrag overschrijven (review 13 sep 2026, H1).
   */
  const [beginAntwoorden] = useState(() => JSON.stringify(hydrateAspirations(props.savedAspirations)))
  const changed =
    method !== props.initialMethod ||
    (method === 'custom_amount' && JSON.stringify(answers) !== beginAntwoorden)

  // Publiceer save-state aan een eventuele pane-wrapper. We gebruiken een
  // stabiele ref voor `saveCustom` zodat we de callback niet hoeven te
  // memoriseren — dit voorkomt dat consumers per render her-renderen.
  // Ref-update gaat via useEffect i.p.v. tijdens render (lint-regel
  // `react-hooks/refs`). De effect-deps bevatten `saveCustom` zelf, dus
  // de ref blijft synchrone met de meest recente snapshot.
  const saveCustomRef = useRef(saveCustom)
  useEffect(() => {
    saveCustomRef.current = saveCustom
  }, [saveCustom])
  useEffect(() => {
    if (!props.onActionsChange) return
    props.onActionsChange({
      canSave: method === 'custom_amount' && finalAmount > 0 && !saving,
      saving,
      savedFlash,
      isCustom: method === 'custom_amount',
      // Wrapper-fn houdt de identiteit stabiel maar roept altijd de laatste
      // save-handler aan (state-snapshots zouden anders verouderen).
      save: () => saveCustomRef.current(),
      finalAmount,
    })
  }, [method, finalAmount, saving, savedFlash, props.onActionsChange])

  // Zodra de pane de footer overneemt (`onActionsChange` aanwezig) onderdrukken
  // we het inline save-blok om dubbele CTAs te voorkomen.
  const showInlineSaveBlock = !props.onActionsChange

  return {
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
    save,
    pickMethod,
    saveCustom,
    slaConceptOp,
    changed,
    showInlineSaveBlock,
  }
}

/** ── Methode-keuze ─────────────────────────────────────────── */
export function UitgavenMethodeKeuze({
  method,
  previewByMethod,
  budgetingActive,
  saving,
  onPick,
  kop: Kop = 'h2',
}: {
  method: RetirementExpenseMethod
  previewByMethod: Record<RetirementExpenseMethod, number>
  budgetingActive: boolean
  saving: boolean
  onPick: (m: RetirementExpenseMethod) => void
  /** Kopniveau van "Hoe bepaal je het?" — de wizard hangt hem onder zijn h4 (ADR 0110). */
  kop?: 'h2' | 'h5'
}) {
  return (
    <section className="mt-10">
      <Kop className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--ink-3)] mb-3">
        Hoe bepaal je het?
      </Kop>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(Object.keys(METHOD_DESCRIPTIONS) as RetirementExpenseMethod[]).map(m => {
          const meta = METHOD_DESCRIPTIONS[m]
          const active = method === m
          const preview = previewByMethod[m]
          const sub =
            m === 'essential_budgets' && !budgetingActive
              ? 'Geschat — activeer Budgetteren voor preciezere berekening'
              : meta.sub
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(m)}
              disabled={saving}
              className={`text-left p-4 border-2 rounded-lg transition-all min-h-[120px] flex flex-col gap-2 ${
                active
                  ? 'border-[var(--module-active-700)] bg-[var(--module-active-50)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
              }`}
            >
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
                {meta.title}
              </div>
              <div
                className="text-2xl font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {preview > 0 ? (
                  <MaskedAmount value={preview} tone="horizon" monoWhenVisible={false} />
                ) : (
                  <span className="text-[var(--ink-4)] text-base font-normal italic">
                    Nog niet ingevuld
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--ink-3)] mt-auto">{sub}</div>
            </button>
          )
        })}
      </div>
      {!budgetingActive && (
        <p className="mt-3 text-xs text-[var(--ink-3)]">
          Budgetteren staat uit.{' '}
          <Link href="/mijn/geavanceerd" className="underline">
            Activeer in Instellingen
          </Link>{' '}
          voor preciezere essentiële-budgetten-berekening.
        </p>
      )}
    </section>
  )
}

/** ── Reflectieve flow (alleen bij Zelf samenstellen) ───────── */
export function UitgavenEigenBedrag({
  answers,
  setAnswers,
  showInlineSaveBlock,
  savedFlash,
  finalAmount,
  saving,
  masked,
  onSaveCustom,
  error,
  kop = 'h3',
}: {
  /** Kopniveau van de vragenlijst — de wizard zet h5 onder zijn stap-h4 (ADR 0110). */
  kop?: 'h3' | 'h5'
  answers: AspirationAnswers
  setAnswers: Dispatch<SetStateAction<AspirationAnswers>>
  showInlineSaveBlock: boolean
  savedFlash: boolean
  finalAmount: number
  saving: boolean
  masked: boolean
  onSaveCustom: () => void
  error: string | null
}) {
  return (
    <div className="mt-12 space-y-6">
      {/* Reflectieve secties + receipt + handmatige override — herbruikbaar
          gemaakt zodat de huishoud-pane exact dezelfde flow toont. */}
      <AspirationQuestionnaire answers={answers} setAnswers={setAnswers} kop={kop} />

      {/* ── Save-blok (inline onderaan) ──────────────────────────
          Wordt onderdrukt wanneer een pane-wrapper `onActionsChange`
          meestuurt — dan levert de pane-footer de save-CTA. */}
      {showInlineSaveBlock && (
        <div
          className="mt-8 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-4"
          aria-live="polite"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-[0.18em] font-mono opacity-70">
              {savedFlash ? 'Opgeslagen' : 'Voorlopig totaal'}
            </div>
            <div
              className="text-2xl sm:text-3xl font-black leading-none tracking-[-0.02em] truncate"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              {formatMaskedCurrency(finalAmount, masked)} / jr
            </div>
          </div>
          <button
            type="button"
            onClick={onSaveCustom}
            disabled={saving || finalAmount <= 0}
            className="shrink-0 px-5 py-3 rounded-lg bg-[var(--paper)] text-[var(--ink)] font-semibold text-sm hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Opslaan…' : savedFlash ? 'Klaar ✓' : 'Opslaan als doelbedrag voor vrijheid'}
          </button>
        </div>
      )}
      {error && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
    </div>
  )
}
