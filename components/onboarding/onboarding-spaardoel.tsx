'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ShieldCheck,
  Sun,
  Car,
  Home,
  BookOpen,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import {
  SPAARDOEL_PRESETS,
  computeNoodfondsTarget,
  type SpaardoelPresetKey,
} from '@/lib/onboarding-presets'
import type { GoalSlug } from '@/lib/goals/types'

/**
 * Stap v. — Spaardoel.
 *
 * Vraagt de gebruiker laagdrempelig één spaardoel toe te voegen. Eén keuze
 * uit zes presets (incl. "Iets anders" voor vrije invoer), pre-fill van
 * naam + bedrag + horizon, en een prominente skip-link als eerstegraads
 * optie. Het resultaat wordt door de orchestrator als één rij in de
 * `goals`-tabel weggeschreven.
 *
 * Visuele blueprint:
 *   - Identiek tile-grid-patroon als `OnboardingDoel`: scherpe hoeken,
 *     2px border, 3px module-streep boven bij selected, lucide-icoon links,
 *     italic Source-Serif-tagline onder de label.
 *   - Inline form direct onder de tile-grid, alleen zichtbaar wanneer een
 *     preset is gekozen. Naam + bedrag verplicht, target_date optioneel
 *     via een `<details>`-disclosure.
 *   - Twee footer-knoppen: primary `Verder` (disabled bij invalid),
 *     secondary `Sla over →` als italic tekstlink.
 *
 * Pre-select-koppeling met stap i.: als de gebruiker op stap i. de goal
 * `noodfonds` heeft aangevinkt en op deze stap nog niets heeft aangeraakt,
 * dan wordt het Noodfonds-tile bij mount vooraf geselecteerd. Subsequente
 * renders raken de state niet — een useRef-guard zorgt dat dit eenmalig
 * gebeurt.
 *
 * **Geen modal/sheet/overlay** — alles inline binnen `<OnboardingShell>`,
 * conform de no-go-regels uit de spec.
 */

export interface OnboardingSpaardoelData {
  presetKey: SpaardoelPresetKey | null
  name: string
  /** Bedrag als string voor input-binding (NL-locale display). */
  target_value: string
  /** 'YYYY-MM' formaat — leeg = geen target_date. */
  target_date: string
  /** True wanneer de gebruiker bewust "Sla over →" heeft gekozen. */
  skipped: boolean
}

export interface OnboardingSpaardoelProps {
  data: OnboardingSpaardoelData
  onChange: (data: OnboardingSpaardoelData) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  /** Voor smart defaults op het Noodfonds-tile. */
  monthlyIncome: number
  monthlyExpenses: number
  /** Hint-koppeling met stap i. — als 'noodfonds' is gekozen, pre-select. */
  selectedGoals: GoalSlug[]
  currentStep?: number
  totalSteps?: number
}

// ── Icon-lookup per preset-key ─────────────────────────────────────────
// Direct mapping in plaats van een runtime-lookup uit `lucide-react`, zodat
// tree-shaking de andere iconen kan weghalen en de bundle compact blijft.
const PRESET_ICONS: Record<SpaardoelPresetKey, LucideIcon> = {
  noodfonds: ShieldCheck,
  vakantie: Sun,
  auto: Car,
  aanbetaling: Home,
  groei: BookOpen,
  custom: Target,
}

// ── NL-locale display-helpers ──────────────────────────────────────────
// We parsen 'plat' (zonder thousands, decimaal-punt) en displayen 'NL'
// (1.234,56). De `target_value`-state houden we als string zodat de input
// vrij typbaar blijft; conversie naar Number gebeurt bij submit.

/** Verwijder thousand-separators en converteer komma → punt voor parsing. */
function parseDecimal(s: string): number {
  if (!s) return 0
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return isFinite(n) ? n : 0
}

/** Format een number naar NL-locale string voor input-display. */
function formatDecimal(n: number): string {
  if (!isFinite(n) || n <= 0) return ''
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

/** Voeg `months` toe aan vandaag, return 'YYYY-MM' string voor `<input type="month">`. */
function defaultTargetMonth(monthsAhead: number): string {
  const now = new Date()
  const future = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1)
  const year = future.getFullYear()
  const month = String(future.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function OnboardingSpaardoel({
  data,
  onChange,
  onNext,
  onBack,
  onSkip,
  monthlyIncome,
  monthlyExpenses,
  selectedGoals,
  currentStep = 5,
  totalSteps = 6,
}: OnboardingSpaardoelProps) {
  // Mount-only guard voor de pre-select. We mogen de pre-select alleen op de
  // eerste render uitvoeren — anders zou een gebruiker die bewust een ander
  // tile koos terug-geforceerd worden naar Noodfonds bij elke re-render.
  const prefilledRef = useRef(false)

  // Selecteer een preset: zet alle relevante velden tegelijk zodat de
  // gebruiker direct een werkende default ziet zonder dat we partial-state
  // hoeven te handlen.
  const selectPreset = useCallback(
    (key: SpaardoelPresetKey) => {
      const preset = SPAARDOEL_PRESETS[key]
      // Noodfonds krijgt een dynamische default; andere presets gebruiken
      // hun statische defaultTarget. 'custom' heeft beide null → lege input.
      const computedTarget =
        key === 'noodfonds'
          ? computeNoodfondsTarget({ monthlyIncome, monthlyExpenses })
          : (preset.defaultTarget ?? 0)
      onChange({
        presetKey: key,
        name: preset.label,
        target_value: computedTarget > 0 ? formatDecimal(computedTarget) : '',
        target_date:
          preset.defaultMonthsAhead != null
            ? defaultTargetMonth(preset.defaultMonthsAhead)
            : '',
        // Bij actieve keuze nooit als "skipped" markeren; dat veld is
        // alleen relevant voor de Sla over-flow.
        skipped: false,
      })
    },
    [monthlyIncome, monthlyExpenses, onChange],
  )

  // Pre-select-koppeling met stap i. — alleen bij mount, alleen als de
  // gebruiker hier nog niets heeft aangeraakt EN niet eerder heeft geskipt.
  useEffect(() => {
    if (prefilledRef.current) return
    prefilledRef.current = true

    const shouldPrefill =
      data.presetKey === null &&
      data.name === '' &&
      data.target_value === '' &&
      !data.skipped &&
      selectedGoals.includes('noodfonds')
    if (shouldPrefill) {
      selectPreset('noodfonds')
    }
    // We willen bewust géén `data` of `selectPreset` in deps — dit moet één
    // keer draaien bij mount. selectedGoals zou theoretisch kunnen wijzigen
    // tussen mount en remount, maar dat is buiten scope voor mount-prefill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Bedrag-input: behoud de string-waarde zoals de gebruiker typt, maar
  // strip alles wat geen digit, punt, of komma is om gekke input te
  // voorkomen. Het format-en-display gebeurt onBlur via `handleAmountBlur`
  // — zo blijft het veld tijdens typen rustig en zonder cursor-jumps.
  const handleAmountChange = useCallback(
    (raw: string) => {
      const sanitized = raw.replace(/[^0-9.,]/g, '')
      onChange({ ...data, target_value: sanitized })
    },
    [data, onChange],
  )

  const handleAmountBlur = useCallback(() => {
    if (!data.target_value) return
    const n = parseDecimal(data.target_value)
    if (n > 0) {
      onChange({ ...data, target_value: formatDecimal(n) })
    }
  }, [data, onChange])

  // Validatie: naam-tekst (niet leeg na trim) + bedrag > 0. Geen inline
  // error-tekst — disabled-state op Verder-knop is genoeg, conform spec.
  const isValid = useMemo(() => {
    if (data.presetKey === null) return false
    if (data.name.trim().length === 0) return false
    if (parseDecimal(data.target_value) <= 0) return false
    return true
  }, [data.presetKey, data.name, data.target_value])

  // Headline-em: italic Playfair op "sparen" in --module-active-700,
  // gelijk patroon als de andere stappen.
  const headline = (
    <>
      Waar wil je voor{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        sparen
      </em>
      ?
    </>
  )

  // Facts-paneel evolution-slot: zodra een preset gekozen is, toon een
  // "live preview"-regel met label + bedrag in italic Playfair. Match qua
  // typografie de overige stappen' evolution-content.
  const previewLine = useMemo(() => {
    if (!data.presetKey) return null
    const previewAmount = parseDecimal(data.target_value)
    if (previewAmount <= 0) return null
    const formatted = new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(previewAmount)
    const label = data.name.trim() || SPAARDOEL_PRESETS[data.presetKey].label
    return (
      <div>
        <div className="text-[10px] uppercase tracking-[0.20em] font-mono text-[var(--ink-3)] mb-1.5">
          Jouw doel
        </div>
        <div
          className="italic text-[15px] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          {label} <span className="not-italic text-[var(--ink-3)]">·</span>{' '}
          <span className="tabular-nums">{formatted}</span>
        </div>
      </div>
    )
  }, [data.presetKey, data.name, data.target_value])

  return (
    <OnboardingShell
      kicker="Spaardoel"
      romanNum="v."
      title={headline}
      deck="Een spaardoel maakt je richting concreet. Skip kan altijd — je past 'm later aan op /will."
      factsPanel={
        <FactsPanel
          stat="76%"
          sub="van Nederlanders heeft geen concreet spaardoel"
          source="NIBUD Spaaronderzoek, 2024"
          evolution={previewLine}
        />
      }
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={onNext}
            disabled={!isValid}
            className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Verder
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Sla over &rarr;
          </button>
        </div>
      }
    >
      {/* ── Tile-grid — 1 col mobile, 2 cols desktop, scherpe hoeken ──── */}
      <div
        role="radiogroup"
        aria-label="Kies een spaardoel"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {(Object.keys(SPAARDOEL_PRESETS) as SpaardoelPresetKey[]).map((key) => {
          const preset = SPAARDOEL_PRESETS[key]
          const Icon = PRESET_ICONS[key]
          const isSelected = data.presetKey === key
          // Pre-fill amount voor de "ghost" weergave rechtsonder op de tile.
          // Voor noodfonds berekenen we de waarde live; voor anderen tonen
          // we de statische default.
          const previewAmount =
            key === 'noodfonds'
              ? computeNoodfondsTarget({ monthlyIncome, monthlyExpenses })
              : (preset.defaultTarget ?? 0)
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => selectPreset(key)}
              className={`group relative min-h-[88px] border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
                isSelected
                  ? 'border-[var(--module-active-500)] bg-[var(--module-active-50)]/60'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
              }`}
            >
              {/* Selected: 3px module-accent boven de tile (krant-blueprint). */}
              {isSelected && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: 'var(--module-active-500)' }}
                />
              )}

              <div className="flex items-start gap-3">
                <Icon
                  aria-hidden
                  className={`h-5 w-5 shrink-0 mt-0.5 transition-colors ${
                    isSelected
                      ? 'text-[var(--module-active-700)]'
                      : 'text-[var(--ink-3)]'
                  }`}
                  strokeWidth={1.75}
                />

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold leading-tight ${
                      isSelected
                        ? 'text-[var(--module-active-700)]'
                        : 'text-[var(--ink)]'
                    }`}
                  >
                    {preset.label}
                  </p>
                  <p
                    className="mt-1 text-xs italic leading-snug text-[var(--ink-3)]"
                    style={{
                      fontFamily: 'var(--font-source-serif, Georgia, serif)',
                    }}
                  >
                    {preset.tagline}
                  </p>
                  {previewAmount > 0 && (
                    <p
                      className="mt-1.5 text-[12px] tabular-nums text-[var(--ink-3)]"
                      style={{
                        fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular)',
                      }}
                    >
                      €{formatDecimal(previewAmount)}
                    </p>
                  )}
                </div>

                {/* Selected-checkmark rechtsboven — square (krant-stijl). */}
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                    isSelected
                      ? 'border-[var(--module-active-500)] bg-[var(--module-active-500)]'
                      : 'border-[var(--border-md)] bg-[var(--paper)]'
                  }`}
                >
                  {isSelected && (
                    <svg
                      className="h-3 w-3 text-[var(--paper)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  )}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Inline form — alleen wanneer een preset is gekozen ──────── */}
      {data.presetKey !== null && (
        <div className="mt-8 space-y-6">
          {/* Naam-input */}
          <div>
            <label
              htmlFor="ob-spaardoel-name"
              className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
            >
              Naam van je doel
            </label>
            <input
              id="ob-spaardoel-name"
              type="text"
              value={data.name}
              onChange={(e) => onChange({ ...data, name: e.target.value })}
              placeholder={SPAARDOEL_PRESETS[data.presetKey].label}
              maxLength={80}
              className="w-full bg-[var(--subtle)] px-3 py-2.5 text-base text-[var(--ink)] outline-none border border-[var(--border-ed)] focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
            />
          </div>

          {/* Bedrag-input — DM Mono + tabular-nums voor cijfer-uitlijning. */}
          <div>
            <label
              htmlFor="ob-spaardoel-amount"
              className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
            >
              Doelbedrag
            </label>
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-[var(--ink-3)] sm:text-sm"
              >
                €
              </span>
              <input
                id="ob-spaardoel-amount"
                type="text"
                inputMode="decimal"
                value={data.target_value}
                onChange={(e) => handleAmountChange(e.target.value)}
                onBlur={handleAmountBlur}
                placeholder="0"
                className="w-full bg-[var(--subtle)] pl-7 pr-3 py-2.5 text-base text-[var(--ink)] outline-none border border-[var(--border-ed)] tabular-nums focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
                style={{
                  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular)',
                }}
              />
            </div>
          </div>

          {/* Datum-disclosure — optioneel, klikbaar geopend. */}
          <details className="group">
            <summary
              className="cursor-pointer list-none text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Tijdslijn aanpassen (optioneel)
            </summary>
            <div className="mt-3">
              <label
                htmlFor="ob-spaardoel-date"
                className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
              >
                Doel-datum
              </label>
              <input
                id="ob-spaardoel-date"
                type="month"
                value={data.target_date}
                onChange={(e) => onChange({ ...data, target_date: e.target.value })}
                className="w-full bg-[var(--subtle)] px-3 py-2.5 text-base text-[var(--ink)] outline-none border border-[var(--border-ed)] focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
              />
              <p
                className="mt-1.5 text-xs italic text-[var(--ink-3)]"
                style={{
                  fontFamily: 'var(--font-source-serif, Georgia, serif)',
                }}
              >
                Mag leeg blijven — dan reken je later wanneer je dit doel haalt.
              </p>
            </div>
          </details>
        </div>
      )}
    </OnboardingShell>
  )
}
