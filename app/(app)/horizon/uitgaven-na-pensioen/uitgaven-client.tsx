'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Kicker, EditorialHeadline, EditorialDeck, ScenarioCallout } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { AspirationQuestionnaire } from '@/components/app/horizon/aspiration-questionnaire'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
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

interface Props {
  initialMethod: RetirementExpenseMethod
  customAmount: number | null
  yearlyMustExpenses: number
  yearlyIncome: number
  estimatedYearlyExpenses: number
  currentRetirementExpense: number
  budgetingActive: boolean
  savedAspirations?: unknown
  /** Wanneer true: geen back-link en geen page-level padding (pane regelt header). */
  inPane?: boolean
  /** Wanneer aanwezig: child rapporteert save-state aan de pane-wrapper, en het
   *  inline save-blok wordt onderdrukt zodat de pane-footer de enige CTA is. */
  onActionsChange?: (state: UitgavenPaneActionsState) => void
  /** Optionele callback die wordt aangeroepen ná een succesvolle save. De
   *  pane-wrapper gebruikt dit om bij Opslaan-klik óók direct te sluiten — de
   *  pane-sluiting is dan zelf de success-feedback. Niet gezet vanuit de
   *  standalone route, daar blijft het inline save-blok met "Klaar ✓"-flash
   *  het feedback-kanaal. */
  onSaved?: () => void
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

export default function UitgavenNaPensioenClient(props: Props) {
  const router = useRouter()
  const { masked } = useMaskedAmounts()

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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  function pickMethod(m: RetirementExpenseMethod) {
    setMethod(m)
    if (m !== 'custom_amount') {
      void save(m, null, null)
    }
  }

  function saveCustom() {
    void save('custom_amount', finalAmount, answers)
  }

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

      {/* ── Methode-keuze ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--ink-3)] mb-3">
          Hoe bepaal je het?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.keys(METHOD_DESCRIPTIONS) as RetirementExpenseMethod[]).map(m => {
            const meta = METHOD_DESCRIPTIONS[m]
            const active = method === m
            const preview = previewByMethod[m]
            const sub =
              m === 'essential_budgets' && !props.budgetingActive
                ? 'Geschat — activeer Budgetteren voor preciezere berekening'
                : meta.sub
            return (
              <button
                key={m}
                type="button"
                onClick={() => pickMethod(m)}
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
        {!props.budgetingActive && (
          <p className="mt-3 text-xs text-[var(--ink-3)]">
            Budgetteren staat uit.{' '}
            <Link href="/mijn/geavanceerd" className="underline">
              Activeer in Instellingen
            </Link>{' '}
            voor preciezere essentiële-budgetten-berekening.
          </p>
        )}
      </section>

      {/* ── Reflectieve flow (alleen bij Zelf samenstellen) ───────── */}
      {method === 'custom_amount' && (
        <div className="mt-12 space-y-6">
          {/* Reflectieve secties + receipt + handmatige override — herbruikbaar
              gemaakt zodat de huishoud-pane exact dezelfde flow toont. */}
          <AspirationQuestionnaire answers={answers} setAnswers={setAnswers} />

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
                onClick={saveCustom}
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
      )}
    </div>
  )
}
