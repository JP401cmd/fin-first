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

// EditFormState + form-helpers wonen nu in lib/horizon/event-pane-edit-form.ts (UI→lib).
import { buildDraftEvent, initFormState, applyStory, setSharedAge, type EditFormState } from '@/lib/horizon/event-pane-edit-form'
export { buildDraftEvent, initFormState, applyStory }
export type { EditFormState }

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
  // Bovengrens = de door de gebruiker geconfigureerde eind-leeftijd (fireStrategy.endAge,
  // default 90, ruwweg 60-120). Tijdens laden kan `endAge` NaN/undefined zijn (voor de
  // baseline-input klaar is) — val dan terug op een ruime, altijd-geldige bovengrens zodat
  // het formulier niet permanent blokkeert. De grens is bewust dynamisch per gebruiker,
  // geen hardcoded range.
  const maxAge = Number.isFinite(endAge) ? Math.max(currentAge, endAge) : Math.max(currentAge, 120)
  // Leeftijd binnen het toegestane venster? Vangt zowel getypte/geplakte out-of-range
  // waarden als reeds-gepersisteerde onzin (bv. een eerder opgeslagen 421) af — beide
  // moeten "Opslaan" blokkeren.
  // Integer: life_events.target_age is INT — een decimaal zou pas op de DB falen.
  const ageValid =
    Number.isInteger(state.shared_age) && state.shared_age >= currentAge && state.shared_age <= maxAge

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
  const canSave = !saving && hasAnyImpact && state.name.trim().length > 0 && ageValid
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
          <label htmlFor="event-shared-age" className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
            Leeftijd
          </label>
          {/* Bewust géén klem in onChange: die maakte "45" ontypbaar (leeg → nu,
              doortypen → eindleeftijd). Validatie via ageValid + foutmelding. */}
          <NumberField
            id="event-shared-age"
            min={currentAge}
            max={maxAge}
            value={state.shared_age}
            invalid={!ageValid}
            onCommit={n => setState(setSharedAge(state, n))}
            className="mt-1 w-24 px-3 py-2 border bg-[var(--paper)] font-mono tabular-nums focus:outline-none aria-invalid:border-red-500 aria-invalid:focus:border-red-500 border-[var(--border-md)] focus:border-[var(--module-active-700)]"
          />
          {!ageValid && (
            <p className="mt-1 text-[11px] text-red-700">
              Kies een hele leeftijd tussen {currentAge} en {maxAge}.
            </p>
          )}
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

      {/* Sectiekop boven de drie blokken — maakt de rolverdeling expliciet:
          de story-vragen zijn de invoer, de blokken zijn de vertaling naar
          geld (automatisch ingevuld, tweaken mag). Zonder deze kop leek het
          alsof beide ingevuld moesten worden. */}
      <div className="mb-4 mt-2">
        <Kicker>{hasStory(state.event_type) ? 'Stap 2 · In cijfers' : 'In cijfers'}</Kicker>
        <h3
          className="mt-2 text-2xl sm:text-3xl font-black tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          {hasStory(state.event_type) ? 'Zo vertaalt dat zich in geld' : 'Wat verandert er in geld?'}
        </h3>
        <EditorialDeck className="mt-3">
          {hasStory(state.event_type)
            ? 'Automatisch ingevuld op basis van je antwoorden hierboven. Pas alleen aan als jouw situatie anders is.'
            : 'Kies wat past: een eenmalig bedrag, een tijdelijke periode, of een blijvende verandering.'}
        </EditorialDeck>
      </div>

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
              disabled={saving || !hasAnyImpact || !state.name.trim() || !ageValid}
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
        <Kicker>Stap 1 · Vertel even</Kicker>
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
            isAgeQuestion={story.ageKey === q.key}
            value={answers[q.key] ?? q.default}
            onChange={v => update(q.key, v)}
          />
        ))}
      </div>

      <div className="mt-6 mb-2 border-t border-dashed border-[var(--border-ed)]" aria-hidden />
    </div>
  )
}

/**
 * Getalveld dat vrij typen toelaat. Houdt de rauwe tekst lokaal vast en geeft
 * alleen een eindig getal door — zodat een tussenstand ("", "4") niet meteen
 * door een klem in de state wordt overschreven. Optioneel klemt hij pas bij
 * blur op [min, max] (voor velden zonder eigen foutmelding). Loopt de waarde
 * van buiten mee (bv. story-vraag → veld bovenaan), dan volgt de tekst.
 */
function NumberField({
  id,
  value,
  onCommit,
  min,
  max,
  step,
  invalid,
  clampOnBlur,
  className,
}: {
  id?: string
  value: number
  onCommit: (n: number) => void
  min?: number
  max?: number
  step?: number
  invalid?: boolean
  clampOnBlur?: boolean
  className?: string
}) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : ''))
  const [focused, setFocused] = useState(false)
  // Externe wijziging (andere bron voor dezelfde waarde) → tekst volgt — maar
  // nooit terwijl de gebruiker hier zelf typt: een tussenstand ("4") mag niet
  // door een afgeleide waarde overschreven worden. Bij blur wordt alsnog gesynct.
  useEffect(() => {
    if (focused || !Number.isFinite(value)) return
    if (Number(text) === value && text.trim() !== '') return
    setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused])
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      value={text}
      aria-invalid={invalid || undefined}
      onChange={e => {
        const raw = e.target.value
        setText(raw)
        const n = Number(raw)
        if (raw.trim() !== '' && Number.isFinite(n)) onCommit(n)
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        const n = Number(text)
        // Leeg of onleesbaar gelaten → terug naar de laatste waarde in de state
        // (die is nooit leeg; het veld hoort dat na verlaten ook niet te zijn).
        if (text.trim() === '' || !Number.isFinite(n)) {
          if (Number.isFinite(value)) setText(String(value))
          return
        }
        if (!clampOnBlur) return
        const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
        if (clamped !== n) {
          setText(String(clamped))
          onCommit(clamped)
        }
      }}
      className={className}
    />
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
  isAgeQuestion,
  value,
  onChange,
}: {
  question: StoryQuestion
  /** Draagt deze vraag de leeftijd (story.ageKey)? Dan geen blur-klem: het veld bovenaan valideert. */
  isAgeQuestion: boolean
  value: StoryAnswerValue
  onChange: (v: StoryAnswerValue) => void
}) {
  return (
    <div>
      <label
        htmlFor={question.type === 'number' || question.type === 'slider' ? `story-q-${question.key}` : undefined}
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
      <StoryQuestionInput question={question} isAgeQuestion={isAgeQuestion} value={value} onChange={onChange} />
    </div>
  )
}

function StoryQuestionInput({
  question,
  isAgeQuestion,
  value,
  onChange,
}: {
  question: StoryQuestion
  isAgeQuestion: boolean
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
          id={`story-q-${question.key}`}
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
        {/* Vrij typen; het vraag-venster wordt pas bij blur afgedwongen (een
            klem per toetsaanslag maakte tussenwaarden ontypbaar). De leeftijd-
            vraag krijgt géén blur-klem: die loopt via het veld bovenaan, dat
            zijn eigen venster (nu..eindleeftijd) en foutmelding heeft. */}
        <NumberField
          id={`story-q-${question.key}`}
          min={question.min}
          max={question.max}
          step={question.step ?? 1}
          value={num}
          clampOnBlur={!isAgeQuestion}
          onCommit={onChange}
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
