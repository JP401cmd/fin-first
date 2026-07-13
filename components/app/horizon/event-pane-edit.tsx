'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Hourglass, Repeat, Trash2, ArrowLeft } from 'lucide-react'
import {
  LIFE_EVENT_CATALOG,
  type LifeEvent,
  type FinancialInput,
  type FireProjection,
} from '@/lib/horizon-data'
import {
  type SimResult,
} from '@/lib/fire-simulation'
import { previewSimResult, EMPTY_SIM_RESULT } from './event-preview-sim'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { ageAtDate } from '@/lib/horizon-data'
import { Kicker, EditorialHeadline, EditorialDeck, CardEditorial } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import {
  LIFE_EVENT_STORIES,
  hasStory,
  defaultStoryAnswers,
  type StoryAnswerValue,
  type StoryQuestion,
} from '@/lib/life-event-stories'
import { EventImpactPreview } from './event-impact-preview'
import { EVENT_ICONS } from './log-timeline'

/** Form-state voor de drie-blokken-edit-flow. */
export interface EditFormState {
  name: string
  event_type: string
  shared_age: number
  // Block 1
  oneTimeAmount: number
  oneTimeDirection: 'income' | 'expense'
  // Block 2 — tijdelijk
  tempEnabled: boolean
  tempAmount: number
  tempDirection: 'income' | 'expense'
  tempDurationYears: number
  tempIndexed: boolean
  // Block 3 — continu
  contEnabled: boolean
  contAmount: number
  contDirection: 'income' | 'expense'
  contIndexed: boolean
  /** Story-antwoorden (alleen voor types met een story-config). */
  storyAnswers?: Record<string, string | number | boolean>
}

/**
 * Pas een story-antwoorden-set toe op de form-state. De story `computeImpact`
 * berekent verse impact-velden (eenmalig/tijdelijk/continu); deze overschrijven
 * de huidige waarden — bewust, omdat de story de bron-van-waarheid is wanneer
 * gebruiker via de story aanvult. Handmatige tweaks in de blokken erna blijven
 * staan tot de gebruiker opnieuw een story-antwoord wijzigt.
 */
export function applyStory(
  state: EditFormState,
  type: string,
  answers: Record<string, StoryAnswerValue>,
  baseAge: number,
): EditFormState {
  const story = LIFE_EVENT_STORIES[type]
  if (!story) return { ...state, storyAnswers: answers }
  const impact = story.computeImpact(answers, baseAge)
  return {
    ...state,
    ...(impact.oneTimeAmount != null && { oneTimeAmount: impact.oneTimeAmount }),
    ...(impact.oneTimeDirection != null && { oneTimeDirection: impact.oneTimeDirection }),
    ...(impact.tempEnabled != null && { tempEnabled: impact.tempEnabled }),
    ...(impact.tempAmount != null && { tempAmount: impact.tempAmount }),
    ...(impact.tempDirection != null && { tempDirection: impact.tempDirection }),
    ...(impact.tempDurationYears != null && { tempDurationYears: impact.tempDurationYears }),
    ...(impact.tempIndexed != null && { tempIndexed: impact.tempIndexed }),
    ...(impact.contEnabled != null && { contEnabled: impact.contEnabled }),
    ...(impact.contAmount != null && { contAmount: impact.contAmount }),
    ...(impact.contDirection != null && { contDirection: impact.contDirection }),
    ...(impact.contIndexed != null && { contIndexed: impact.contIndexed }),
    shared_age: impact.suggestedAge ?? state.shared_age,
    name: impact.suggestedName && (state.name === '' || isCatalogDefaultName(state)) ? impact.suggestedName : state.name,
    storyAnswers: answers,
  }
}

function isCatalogDefaultName(s: EditFormState): boolean {
  return s.name === LIFE_EVENT_CATALOG[s.event_type]?.label
}

/** Map een form-state naar een LifeEvent (zonder id/sort_order). */
export function buildDraftEvent(
  s: EditFormState,
  existingEvent: LifeEvent | null,
): LifeEvent {
  let monthlyCost = 0
  let monthlyIncome = 0
  let duration = 0
  let indexed = false
  // Block 2 (tijdelijk) wint van Block 3 als beide aan staan
  if (s.tempEnabled && s.tempAmount > 0) {
    if (s.tempDirection === 'expense') monthlyCost = s.tempAmount
    else monthlyIncome = s.tempAmount
    duration = Math.round(s.tempDurationYears * 12)
    indexed = s.tempIndexed
  } else if (s.contEnabled && s.contAmount > 0) {
    if (s.contDirection === 'expense') monthlyCost = s.contAmount
    else monthlyIncome = s.contAmount
    duration = 0
    indexed = s.contIndexed
  }
  const oneTimeSigned =
    s.oneTimeAmount > 0
      ? s.oneTimeDirection === 'expense'
        ? s.oneTimeAmount
        : -s.oneTimeAmount
      : 0

  const catalogEntry = LIFE_EVENT_CATALOG[s.event_type]
  return {
    id: existingEvent?.id ?? 'draft',
    name: s.name,
    event_type: s.event_type,
    target_age: s.shared_age,
    target_date: existingEvent?.target_date ?? null,
    one_time_cost: oneTimeSigned,
    monthly_cost_change: monthlyCost,
    monthly_income_change: monthlyIncome,
    duration_months: duration,
    icon: catalogEntry?.icon ?? 'Calendar',
    is_active: true,
    sort_order: existingEvent?.sort_order ?? 0,
    is_indexed: indexed,
    metadata: {
      ...(existingEvent?.metadata ?? {}),
      ...(s.storyAnswers ? { story_answers: s.storyAnswers } : {}),
    },
  }
}

/** Initialiseer form-state uit catalog-defaults of een bestaand event. */
export function initFormState(
  type: string,
  existing: LifeEvent | null,
  currentAge: number,
): EditFormState {
  if (existing) {
    const savedStoryAnswers =
      (existing.metadata as Record<string, unknown> | undefined)?.story_answers as
        | Record<string, StoryAnswerValue>
        | undefined
    return {
      name: existing.name,
      event_type: existing.event_type,
      shared_age: existing.target_age ?? currentAge,
      oneTimeAmount: Math.abs(existing.one_time_cost),
      oneTimeDirection: existing.one_time_cost >= 0 ? 'expense' : 'income',
      tempEnabled: existing.duration_months > 0,
      tempAmount:
        existing.duration_months > 0
          ? existing.monthly_cost_change || existing.monthly_income_change
          : 0,
      tempDirection: existing.monthly_income_change > 0 ? 'income' : 'expense',
      tempDurationYears:
        existing.duration_months > 0 ? Math.max(1, Math.round(existing.duration_months / 12)) : 5,
      tempIndexed: existing.is_indexed,
      contEnabled:
        existing.duration_months === 0 &&
        (existing.monthly_cost_change > 0 || existing.monthly_income_change > 0),
      contAmount:
        existing.duration_months === 0
          ? existing.monthly_cost_change || existing.monthly_income_change
          : 0,
      contDirection: existing.monthly_income_change > 0 ? 'income' : 'expense',
      contIndexed: existing.is_indexed,
      storyAnswers: savedStoryAnswers,
    }
  }
  const entry = LIFE_EVENT_CATALOG[type]
  if (!entry) {
    return {
      name: 'Eigen gebeurtenis',
      event_type: type,
      shared_age: currentAge + 5,
      oneTimeAmount: 0,
      oneTimeDirection: 'expense',
      tempEnabled: false,
      tempAmount: 0,
      tempDirection: 'expense',
      tempDurationYears: 5,
      tempIndexed: true,
      contEnabled: false,
      contAmount: 0,
      contDirection: 'expense',
      contIndexed: true,
    }
  }
  const oneTimeSigned = entry.defaultCost
  const oneTimeAbs = Math.abs(oneTimeSigned)
  // monthly: pak de niet-nul waarde uit catalog
  const monthlyAmount = Math.abs(entry.defaultMonthlyCost) || Math.abs(entry.defaultMonthlyIncome)
  const monthlyDirection: 'income' | 'expense' =
    entry.defaultMonthlyIncome > 0 || entry.defaultMonthlyIncome < 0 ? 'income' : 'expense'
  const isContinuous = entry.defaultDuration === 0 && monthlyAmount > 0
  const isTemporary = entry.defaultDuration > 0 && monthlyAmount > 0
  const baseState: EditFormState = {
    name: entry.label,
    event_type: type,
    shared_age: entry.defaultAge ?? currentAge + 5,
    oneTimeAmount: oneTimeAbs,
    oneTimeDirection: oneTimeSigned >= 0 ? 'expense' : 'income',
    tempEnabled: isTemporary,
    tempAmount: isTemporary ? monthlyAmount : 0,
    tempDirection: monthlyDirection,
    tempDurationYears: isTemporary ? Math.max(1, Math.round(entry.defaultDuration / 12)) : 5,
    tempIndexed: true,
    contEnabled: isContinuous,
    contAmount: isContinuous ? monthlyAmount : 0,
    contDirection: monthlyDirection,
    contIndexed: true,
  }
  // Als dit type een inspirerende story heeft: initialiseer met story-defaults
  // en pas computeImpact toe — zo zien gebruikers direct de berekende cijfers
  // gebaseerd op de aanbevolen antwoorden i.p.v. ruwe catalog-defaults.
  if (hasStory(type)) {
    const answers = defaultStoryAnswers(type)
    return applyStory(baseState, type, answers, currentAge)
  }
  return baseState
}

/**
 * Save-state die de edit-flow exposeert aan de pane-wrapper. Wordt elke
 * render gepubliceerd via `onActionsChange` zodat de pane-footer
 * (primary "Bijwerken/Toevoegen" + secondary "Annuleren") realtime
 * `disabled`/`loading` kan volgen zonder dubbele state-bron.
 */
export interface EventEditActionsState {
  /** True wanneer de gebruiker mag opslaan (naam ingevuld + minstens één
   *  van de drie blokken heeft een waarde + niet al saving). */
  canSave: boolean
  /** True tijdens lopende Supabase-call. */
  saving: boolean
  /** True wanneer een bestaand event wordt bewerkt — bepaalt het label
   *  ("Bijwerken" vs "Toevoegen") in de pane-footer. */
  isEditing: boolean
  /** Aanroepbaar door de pane-footer wanneer de gebruiker op de primary
   *  CTA klikt. Bouwt zelf de draftEvent op en delegeert naar `onSave`. */
  save: () => void
}

interface Props {
  state: EditFormState
  setState: (next: EditFormState) => void
  existingEvent: LifeEvent | null
  /** Voor de chart: alle bestaande events behalve de huidige edit. */
  baselineEvents: LifeEvent[]
  baselineInput: FinancialInput
  baselineFire: FireProjection | null
  fireParams: FireParams
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  endAge: number
  /**
   * Per-asset kernel-context (rauwe convergentie-context, zelfde assemblage als de
   * Tijdas-grafiek). Wanneer gezet, draait de live impact-preview via `previewSimResult`
   * (→ computeConvergentieProjection) op DEZELFDE motor als de grafiek (de horizon-
   * kernel). Zonder context is er geen doorrekening — de preview toont dan zijn lege
   * staat (geen tweede motor sinds de v2-verwijdering).
   */
  previewBaseline?: PreviewBaseline | null
  saving: boolean
  saveError: string | null
  onSave: (event: LifeEvent) => void
  onDelete: () => void
  onBackToCatalog?: () => void
  /** Wanneer aanwezig: child publiceert save-state aan de pane-wrapper en
   *  het inline save-blok onderaan wordt onderdrukt — pane-footer is dan
   *  de enige primaire CTA. De delete- en error-blokken blijven inline
   *  staan omdat ze contextueel relevanter zijn binnen de form-content. */
  onActionsChange?: (state: EventEditActionsState) => void
}

export function EventPaneEdit({
  state,
  setState,
  existingEvent,
  baselineEvents,
  baselineInput,
  endAge,
  previewBaseline,
  saving,
  saveError,
  onSave,
  onDelete,
  onBackToCatalog,
  onActionsChange,
}: Props) {
  const { masked } = useMaskedAmounts()
  const debouncedState = useDebouncedValue(state, 200)
  const currentAge = baselineInput.dateOfBirth ? Math.floor(ageAtDate(baselineInput.dateOfBirth)) : 30

  const draftEvent = useMemo(
    () => buildDraftEvent(debouncedState, existingEvent),
    [debouncedState, existingEvent],
  )

  const { baselineSim, draftSim } = useMemo(() => {
    const eventsWithoutEditing = existingEvent
      ? baselineEvents.filter(e => e.id !== existingEvent.id)
      : baselineEvents

    // Kernel-only: beide runs draaien door DEZELFDE motor als de Tijdas-grafiek
    // (`previewSimResult` → computeConvergentieProjection). Zonder kernel-context
    // (`previewBaseline`) is er geen doorrekening — lege resultaten tonen de lege
    // staat i.p.v. een eigen (verwijderde) tweede motor.
    if (!previewBaseline) {
      return { baselineSim: EMPTY_SIM_RESULT, draftSim: EMPTY_SIM_RESULT }
    }
    return {
      baselineSim: previewSimResult(previewBaseline, eventsWithoutEditing),
      draftSim: previewSimResult(previewBaseline, [...eventsWithoutEditing, draftEvent]),
    }
  }, [
    draftEvent,
    existingEvent,
    baselineEvents,
    previewBaseline,
  ])

  const fireDeltaMonths =
    baselineSim.fireAgeFractional != null && draftSim.fireAgeFractional != null
      ? Math.round((draftSim.fireAgeFractional - baselineSim.fireAgeFractional) * 12)
      : null

  const catalogEntry = LIFE_EVENT_CATALOG[state.event_type]
  const eventIcon = catalogEntry?.icon ?? 'Calendar'

  // Sanity-check: minimum 1 dimensie heeft een waarde
  const hasAnyImpact =
    state.oneTimeAmount > 0 ||
    (state.tempEnabled && state.tempAmount > 0) ||
    (state.contEnabled && state.contAmount > 0)

  // Publiceer save-state naar pane-wrapper (zelfde patroon als UitgavenPane).
  // Een ref voor de save-handler voorkomt stale closures: de wrapper roept
  // altijd de meest recente builder + handler aan zonder dat we de callback-
  // identity hoeven te invalideren bij elke state-mutatie. Ref-update gaat
  // via useEffect (lint-regel `react-hooks/refs` verbiedt schrijven tijdens
  // render).
  const saveHandlerRef = useRef(() => onSave(buildDraftEvent(state, existingEvent)))
  useEffect(() => {
    saveHandlerRef.current = () => onSave(buildDraftEvent(state, existingEvent))
  }, [onSave, state, existingEvent])
  const canSave = !saving && hasAnyImpact && state.name.trim().length > 0
  useEffect(() => {
    if (!onActionsChange) return
    onActionsChange({
      canSave,
      saving,
      isEditing: Boolean(existingEvent),
      save: () => saveHandlerRef.current(),
    })
  }, [onActionsChange, canSave, saving, existingEvent])

  // Inline save-blok onderdrukken wanneer pane-footer de CTA overneemt.
  const showInlineSaveBlock = !onActionsChange

  return (
    // Outer padding wordt geleverd door SlideInPane (driewegregel — ui-ux skill).
    // Extra `pb-6` voor lucht onder content; horizontale padding komt van de pane.
    <div className="pb-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        {onBackToCatalog && (
          <button
            type="button"
            onClick={onBackToCatalog}
            className="mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-[var(--subtle)] text-[var(--ink-3)]"
            aria-label="Terug naar keuze"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--module-active-50)] text-[var(--module-active-700)]">
          {EVENT_ICONS[eventIcon] ?? EVENT_ICONS['Calendar']}
        </span>
        <div className="flex-1 min-w-0">
          <Kicker>{catalogEntry?.label ?? 'Eigen gebeurtenis'}</Kicker>
          <h2
            className="mt-1 text-2xl sm:text-3xl font-black tracking-[-0.02em] truncate"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
          >
            {existingEvent ? 'Bewerken' : 'Toevoegen'}
          </h2>
        </div>
      </div>

      {/* Naam + leeftijd */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
            Naam
          </label>
          <input
            type="text"
            value={state.name}
            onChange={e => setState({ ...state, name: e.target.value })}
            className="mt-1 w-full px-3 py-2 border border-[var(--border-md)] bg-[var(--paper)] focus:border-[var(--module-active-700)] focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
            Leeftijd
          </label>
          <input
            type="number"
            min={currentAge}
            max={endAge}
            value={state.shared_age}
            onChange={e =>
              setState({ ...state, shared_age: Math.max(currentAge, Number(e.target.value) || currentAge) })
            }
            className="mt-1 w-24 px-3 py-2 border border-[var(--border-md)] bg-[var(--paper)] font-mono tabular-nums focus:border-[var(--module-active-700)] focus:outline-none"
          />
        </div>
      </div>

      {/* Story-sectie (alleen voor types met een story) */}
      {hasStory(state.event_type) && (
        <StorySection
          type={state.event_type}
          answers={state.storyAnswers ?? defaultStoryAnswers(state.event_type)}
          onChange={next => setState(applyStory(state, state.event_type, next, currentAge))}
        />
      )}

      {/* Block 1: Eenmalig */}
      <CardEditorial accent className="p-5 mb-4">
        <header className="flex items-center gap-3 mb-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--module-active-50)] text-[var(--module-active-700)]">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
              01 · Eenmalig
            </div>
            <h3
              className="mt-0.5 text-lg italic font-normal"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              Een eenmalige gebeurtenis op die leeftijd
            </h3>
          </div>
        </header>
        <p className="text-sm text-[var(--ink-2)] mb-4">
          Bedrag dat je in één keer betaalt of ontvangt — denk aan overdrachtskosten,
          een erfenis, een uitvaart.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
              Bedrag (€)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={500}
                value={state.oneTimeAmount}
                onChange={e =>
                  setState({ ...state, oneTimeAmount: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-36 px-3 py-2 border border-[var(--border-md)] bg-[var(--paper)] font-mono tabular-nums focus:border-[var(--module-active-700)] focus:outline-none"
              />
            </div>
          </div>
          <DirectionToggle
            value={state.oneTimeDirection}
            onChange={v => setState({ ...state, oneTimeDirection: v })}
          />
        </div>
      </CardEditorial>

      {/* Block 2: Tijdelijk */}
      <CardEditorial accent={state.tempEnabled} className="p-5 mb-4">
        <header className="flex items-start gap-3 mb-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--module-active-50)] text-[var(--module-active-700)]">
            <Hourglass className="h-4 w-4" aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
              02 · Tijdelijk
            </div>
            <h3
              className="mt-0.5 text-lg italic font-normal"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              Een periode met andere maandelijkse impact
            </h3>
          </div>
          <ToggleSwitch
            checked={state.tempEnabled}
            onChange={v =>
              setState({
                ...state,
                tempEnabled: v,
                contEnabled: v ? false : state.contEnabled,
              })
            }
            label="Tijdelijk"
          />
        </header>
        {state.tempEnabled && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--ink-2)]">
              Een periode waarin je inkomen of uitgaven anders zijn — bijvoorbeeld kinderopvang,
              studie, een sabbatical.
            </p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
                  Per maand (€)
                </label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={state.tempAmount}
                  onChange={e =>
                    setState({ ...state, tempAmount: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-36 px-3 py-2 border border-[var(--border-md)] bg-[var(--paper)] font-mono tabular-nums focus:border-[var(--module-active-700)] focus:outline-none"
                />
              </div>
              <DirectionToggle
                value={state.tempDirection}
                onChange={v => setState({ ...state, tempDirection: v })}
              />
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
                  Duur (jaar)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={state.tempDurationYears}
                  onChange={e =>
                    setState({
                      ...state,
                      tempDurationYears: Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                    })
                  }
                  className="mt-1 w-24 px-3 py-2 border border-[var(--border-md)] bg-[var(--paper)] font-mono tabular-nums focus:border-[var(--module-active-700)] focus:outline-none"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={state.tempIndexed}
                onChange={e => setState({ ...state, tempIndexed: e.target.checked })}
              />
              Stijgt mee met inflatie
            </label>
          </div>
        )}
      </CardEditorial>

      {/* Block 3: Continu */}
      <CardEditorial accent={state.contEnabled} className="p-5 mb-4">
        <header className="flex items-start gap-3 mb-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--module-active-50)] text-[var(--module-active-700)]">
            <Repeat className="h-4 w-4" aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
              03 · Blijvend
            </div>
            <h3
              className="mt-0.5 text-lg italic font-normal"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              Een blijvende verandering vanaf die leeftijd
            </h3>
          </div>
          <ToggleSwitch
            checked={state.contEnabled}
            onChange={v =>
              setState({
                ...state,
                contEnabled: v,
                tempEnabled: v ? false : state.tempEnabled,
              })
            }
            label="Blijvend"
          />
        </header>
        {state.contEnabled && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--ink-2)]">
              Een structurele verandering die vanaf die leeftijd niet meer weggaat — bijvoorbeeld
              pensioen, AOW, een hypotheekverandering.
            </p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
                  Per maand (€)
                </label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={state.contAmount}
                  onChange={e =>
                    setState({ ...state, contAmount: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-36 px-3 py-2 border border-[var(--border-md)] bg-[var(--paper)] font-mono tabular-nums focus:border-[var(--module-active-700)] focus:outline-none"
                />
              </div>
              <DirectionToggle
                value={state.contDirection}
                onChange={v => setState({ ...state, contDirection: v })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={state.contIndexed}
                onChange={e => setState({ ...state, contIndexed: e.target.checked })}
              />
              Stijgt mee met inflatie
            </label>
          </div>
        )}
      </CardEditorial>

      {/* Live impact-chart */}
      <div className="mt-8 mb-6">
        <Kicker>Voorlopige impact</Kicker>
        <h3
          className="mt-2 text-xl font-black tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          Wat doet dit met je vrijheidspad?
        </h3>
        <div className="mt-4">
          <EventImpactPreview
            baselineRows={baselineSim.rows}
            draftRows={draftSim.rows}
            baselineFireAge={baselineSim.fireAgeFractional}
            draftFireAge={draftSim.fireAgeFractional}
          />
        </div>
      </div>

      {/* Save-blok — inline variant met FIRE-vertraging samenvatting + save-CTA.
          Onderdrukt wanneer pane-footer de CTA overneemt; in dat geval tonen we
          alleen een compacte FIRE-vertraging-card + delete-knop, en blijft de
          save-CTA in de pane-footer. */}
      {showInlineSaveBlock ? (
        <div className="mt-6 bg-[var(--ink)] text-[var(--paper)] px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0" aria-live="polite">
            <div className="text-[9px] uppercase tracking-[0.18em] font-mono opacity-70">
              FIRE-vertraging
            </div>
            <div
              className="text-2xl sm:text-3xl font-black leading-none tracking-[-0.02em] truncate"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              {fireDeltaMonths == null
                ? '—'
                : fireDeltaMonths === 0
                  ? 'geen vertraging'
                  : `${fireDeltaMonths > 0 ? '+' : '−'}${Math.abs(fireDeltaMonths)} mnd`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {existingEvent && (
              <button
                type="button"
                onClick={onDelete}
                className="px-3 py-3 bg-transparent border border-white/30 text-white/80 hover:bg-white/10"
                aria-label="Verwijderen"
                title="Verwijderen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onSave(buildDraftEvent(state, existingEvent))}
              disabled={saving || !hasAnyImpact || !state.name.trim()}
              className="shrink-0 px-5 py-3 bg-[var(--paper)] text-[var(--ink)] font-semibold text-sm hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Opslaan…' : existingEvent ? 'Opslaan' : 'Toevoegen'}
            </button>
          </div>
        </div>
      ) : (
        // Pane-footer-variant: behoud de FIRE-vertraging-samenvatting en delete-
        // affordance, maar zonder save-CTA (die zit nu in de footer).
        <div className="mt-6 bg-[var(--ink)] text-[var(--paper)] px-5 py-4 sm:px-6 sm:py-5 flex items-center gap-4">
          <div className="flex-1 min-w-0" aria-live="polite">
            <div className="text-[9px] uppercase tracking-[0.18em] font-mono opacity-70">
              FIRE-vertraging
            </div>
            <div
              className="text-2xl sm:text-3xl font-black leading-none tracking-[-0.02em] truncate"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              {fireDeltaMonths == null
                ? '—'
                : fireDeltaMonths === 0
                  ? 'geen vertraging'
                  : `${fireDeltaMonths > 0 ? '+' : '−'}${Math.abs(fireDeltaMonths)} mnd`}
            </div>
          </div>
          {existingEvent && (
            <button
              type="button"
              onClick={onDelete}
              className="shrink-0 px-3 py-3 bg-transparent border border-white/30 text-white/80 hover:bg-white/10"
              aria-label="Verwijderen"
              title="Verwijderen"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {saveError && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2">
          {saveError}
        </div>
      )}
      {!hasAnyImpact && (
        <p className="mt-3 text-xs text-[var(--ink-3)]">
          Vul minstens één van de drie blokken in om op te kunnen slaan.
        </p>
      )}
    </div>
  )
}

// ─── Sub-componenten ──────────────────────────────────────────────

// ─── Story-sectie ─────────────────────────────────────────────────

function StorySection({
  type,
  answers,
  onChange,
}: {
  type: string
  answers: Record<string, StoryAnswerValue>
  onChange: (next: Record<string, StoryAnswerValue>) => void
}) {
  const story = LIFE_EVENT_STORIES[type]
  if (!story) return null

  function update(key: string, value: StoryAnswerValue) {
    onChange({ ...answers, [key]: value })
  }

  return (
    <div className="mb-6">
      <div className="mb-5">
        <Kicker>Vertel even</Kicker>
        <h3
          className="mt-2 text-2xl sm:text-3xl font-black tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          {story.headlineEmphasis ? (
            renderHeadlineWithEmphasis(story.headline, story.headlineEmphasis)
          ) : (
            story.headline
          )}
        </h3>
        <EditorialDeck className="mt-3">{story.intro}</EditorialDeck>
      </div>

      <div className="space-y-5">
        {story.questions.map(q => (
          <StoryQuestionRenderer
            key={q.key}
            question={q}
            value={answers[q.key] ?? q.default}
            onChange={v => update(q.key, v)}
          />
        ))}
      </div>

      <div className="mt-5 mb-7 border-t border-dashed border-[var(--border-ed)] pt-4">
        <p className="text-xs italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
          Op basis van je antwoorden hebben we de drie blokken hieronder ingevuld.
          Je mag ze nog tweaken.
        </p>
      </div>
    </div>
  )
}

function renderHeadlineWithEmphasis(text: string, emphasis: string): React.ReactNode {
  const parts = text.split(emphasis)
  return parts.map((part, idx) => (
    <span key={idx}>
      {part}
      {idx < parts.length - 1 && (
        <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
          {emphasis}
        </em>
      )}
    </span>
  ))
}

function StoryQuestionRenderer({
  question,
  value,
  onChange,
}: {
  question: StoryQuestion
  value: StoryAnswerValue
  onChange: (v: StoryAnswerValue) => void
}) {
  return (
    <div>
      <label
        className="block text-base sm:text-lg italic font-normal text-[var(--ink)] mb-2"
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {question.label}
      </label>
      {question.microcopy && (
        <p className="text-xs text-[var(--ink-3)] mb-3 italic" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
          {question.microcopy}
        </p>
      )}
      <StoryQuestionInput question={question} value={value} onChange={onChange} />
    </div>
  )
}

function StoryQuestionInput({
  question,
  value,
  onChange,
}: {
  question: StoryQuestion
  value: StoryAnswerValue
  onChange: (v: StoryAnswerValue) => void
}) {
  if (question.type === 'tile') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {question.options.map(opt => {
          const active = value === opt.value
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`text-left p-3 border-2 transition-all ${
                active
                  ? 'border-[var(--module-active-700)] bg-[var(--module-active-50)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)] hover:-translate-y-px'
              }`}
            >
              {opt.emoji && <div className="text-xl mb-1.5">{opt.emoji}</div>}
              <div className="text-sm font-semibold leading-tight">{opt.label}</div>
              {opt.sublabel && (
                <div className="text-[11px] text-[var(--ink-3)] mt-0.5">{opt.sublabel}</div>
              )}
            </button>
          )
        })}
      </div>
    )
  }
  if (question.type === 'segmented') {
    return (
      <div className="inline-flex border border-[var(--border-md)] overflow-hidden flex-wrap">
        {question.options.map(opt => {
          const active = value === opt.value
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-4 py-2 text-sm transition-colors ${
                active
                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                  : 'bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    )
  }
  if (question.type === 'slider') {
    const num = typeof value === 'number' ? value : Number(value) || question.default
    return (
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-mono tabular-nums text-base text-[var(--ink)]">
            {num}
            {question.suffix ? ` ${question.suffix}` : ''}
          </span>
        </div>
        <input
          type="range"
          min={question.min}
          max={question.max}
          step={question.step ?? 1}
          value={num}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full accent-[var(--module-active-700)]"
        />
      </div>
    )
  }
  if (question.type === 'number') {
    const num = typeof value === 'number' ? value : Number(value) || question.default
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={question.min}
          max={question.max}
          step={question.step ?? 1}
          value={num}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className="w-40 px-3 py-2 border border-[var(--border-md)] bg-[var(--paper)] font-mono tabular-nums focus:border-[var(--module-active-700)] focus:outline-none"
        />
        {question.suffix && (
          <span className="text-sm text-[var(--ink-3)]">{question.suffix}</span>
        )}
      </div>
    )
  }
  // toggle
  const checked = typeof value === 'boolean' ? value : Boolean(value)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors ${
        checked
          ? 'bg-[var(--ink)] text-[var(--paper)]'
          : 'bg-transparent text-[var(--ink-3)] border border-[var(--border-md)]'
      }`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          checked ? 'bg-[var(--paper)]' : 'bg-[var(--ink-3)]'
        }`}
        aria-hidden
      />
      {checked ? 'Ja' : 'Nee'}
    </button>
  )
}

function DirectionToggle({
  value,
  onChange,
}: {
  value: 'income' | 'expense'
  onChange: (v: 'income' | 'expense') => void
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
        Type
      </label>
      <div className="mt-1 inline-flex border border-[var(--border-md)] overflow-hidden">
        {(['expense', 'income'] as const).map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 py-2 text-sm transition-colors ${
              value === opt
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
            }`}
          >
            {opt === 'expense' ? 'Uitgave' : 'Inkomst'}
          </button>
        ))}
      </div>
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`shrink-0 inline-flex items-center gap-2 px-2 py-1.5 rounded-full text-[10px] uppercase tracking-[0.15em] font-mono font-semibold transition-colors ${
        checked
          ? 'bg-[var(--ink)] text-[var(--paper)]'
          : 'bg-transparent text-[var(--ink-3)] border border-[var(--border-md)]'
      }`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          checked ? 'bg-[var(--paper)]' : 'bg-[var(--ink-3)]'
        }`}
        aria-hidden
      />
      {label}
    </button>
  )
}

// Re-export voor tests
export type { SimResult }
