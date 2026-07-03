'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Home, Sprout, Scissors, KeyRound } from 'lucide-react'
import {
  DEFAULT_DOWNSIZE_CONFIG,
  DEFAULT_REVERSE_MORTGAGE_CONFIG,
  estimateMonthlyHousingCostAfterSale,
  estimateReverseMortgagePayout,
  type HousingStrategyConfig,
  type HousingStrategyMode,
  type HousingStrategyTrigger,
} from '@/lib/housing-strategy'
import {
  type HousingPreviewData,
  type HousingScenarioResult,
} from '@/lib/housing-trigger'
import { runHousingScenarioPreview } from '@/lib/housing-preview'
import { formatCurrency } from '@/lib/format'
import { LabeledNumber, TriggerButton } from '@/components/future/strategie/fields'

interface HousingStrategyContext {
  has_eigen_huis: boolean
  eigen_huis_value: number
  woz_value: number
  mortgage_balance: number
  mortgage_monthly_payment: number
  estimated_equity: number
}

const MODE_META: Record<
  HousingStrategyMode,
  { label: string; description: string; Icon: typeof Home; tag: string }
> = {
  include_full: {
    label: 'Volledig meetellen',
    description:
      'Je eigen woning telt 100% mee in de vrijheidsberekening. Eenvoudig, maar onrealistisch: het geld is niet liquide.',
    Icon: Home,
    tag: 'Huidig gedrag',
  },
  exclude_from_fire: {
    label: 'Uitsluiten',
    description:
      'Eigen woning blijft buiten de vrijheidspot. Conservatief — past bij internationale standaard. Je blijft wonen, kosten ongewijzigd.',
    Icon: Sprout,
    tag: 'Internationale standaard',
  },
  downsize: {
    label: 'Verkopen',
    description:
      'Op een gekozen moment verkoop je het huis. Opbrengst gaat naar belegbaar vermogen; nieuwe woonlast verschijnt als uitgave.',
    Icon: Scissors,
    tag: 'Verkopen + huren',
  },
  reverse_mortgage: {
    label: 'Opeethypotheek',
    description:
      'Je blijft wonen en ontvangt maandelijks geld uit de overwaarde. Rente stapelt zich op tegen je toekomstige schuld.',
    Icon: KeyRound,
    tag: 'Verzilveren',
  },
}

const MODES: HousingStrategyMode[] = [
  'include_full',
  'exclude_from_fire',
  'downsize',
  'reverse_mortgage',
]

/**
 * Eigen-woning-sectie. Wordt nu gerenderd binnen de strategie-modal op
 * /toekomst (geïmporteerd door components/app/horizon/strategie-modal.tsx).
 * De oude /identity/instellingen-monolith is opgeheven; het component-pad
 * blijft historisch onder components/identity/instellingen/ totdat een
 * herschikking van deze map opportuun is.
 *
 * Beheert zijn eigen GET/PUT naar /api/housing-strategy zodat de bestaande
 * instellingen-pagina niet hoeft te weten van housing-strategy-state. De
 * Opslaan-knop is lokaal; bij succes verschijnt een korte bevestiging.
 */
export function HousingStrategySection({
  showHeader = true,
  preview = null,
  onSaved,
}: {
  showHeader?: boolean
  /** Live-preview-basis (zelfde engine-input als de grafiek); null = geen preview. */
  preview?: HousingPreviewData | null
  onSaved?: () => void
} = {}) {
  const [config, setConfig] = useState<HousingStrategyConfig>({ mode: 'include_full' })
  const [savedConfig, setSavedConfig] = useState<HousingStrategyConfig | null>(null)
  const [context, setContext] = useState<HousingStrategyContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/housing-strategy')
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            config: HousingStrategyConfig
            context: HousingStrategyContext
          }
          setConfig(data.config)
          setSavedConfig(data.config)
          setContext(data.context)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const hasEigenHuis = context?.has_eigen_huis ?? false
  const estimatedWoz = context?.woz_value ?? 0
  const estimatedEquity = context?.estimated_equity ?? 0

  // ── Live preview ────────────────────────────────────────────
  // Zelfde resolver + engine als de grafiek (lib/housing-trigger.ts) — wat
  // hier staat verschijnt na opslaan 1-op-1 op de tijdas. useDeferredValue
  // houdt het typen in de invoervelden vloeiend (de engine-runs volgen).
  const deferredConfig = useDeferredValue(config)
  const canPreview = preview != null && preview.context.hasEigenHuis && !loading
  // Dezelfde motor als de grafiek via `runHousingScenarioPreview`: op de
  // convergentie-vlag de horizon-kernel (M6), anders byte-identiek v2-grootboek (M2)
  // of v1. Eén vlag-beslissing per preview-bundel — beide scenario-kaarten (concept +
  // opgeslagen) draaien door dezelfde helper, dus nooit een engine-mix.
  const draftScenario = useMemo<HousingScenarioResult | null>(() => {
    if (!canPreview || !preview) return null
    try {
      return runHousingScenarioPreview(deferredConfig, preview)
    } catch {
      return null
    }
  }, [canPreview, preview, deferredConfig])
  const savedScenario = useMemo<HousingScenarioResult | null>(() => {
    if (!canPreview || !preview || !savedConfig) return null
    try {
      return runHousingScenarioPreview(savedConfig, preview)
    } catch {
      return null
    }
  }, [canPreview, preview, savedConfig])

  const setMode = (mode: HousingStrategyMode) => {
    setMessage(null)
    if (mode === 'include_full' || mode === 'exclude_from_fire') {
      setConfig({ mode })
      return
    }
    if (mode === 'downsize') {
      setConfig({ ...DEFAULT_DOWNSIZE_CONFIG })
      return
    }
    setConfig({ ...DEFAULT_REVERSE_MORTGAGE_CONFIG })
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/housing-strategy', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        setMessage({ type: 'error', text: err.error ?? 'Opslaan mislukt' })
        return
      }
      setMessage({ type: 'success', text: 'Eigen-woning-strategie opgeslagen.' })
      setSavedConfig(config)
      onSaved?.()
    } catch {
      setMessage({ type: 'error', text: 'Netwerkfout — probeer opnieuw' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="housing-strategy" className="mb-6">
      {showHeader && (
        <>
          <p className="mb-1 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
            <span
              aria-hidden
              className="inline-block h-px w-7 shrink-0"
              style={{ background: 'var(--module-active-500)' }}
            />
            Eigen woning in pensioenplanning
          </p>
          <p
            className="mb-4 font-serif text-base leading-relaxed text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            Bepaal hoe je eigen{' '}
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              woning
            </em>{' '}
            meedoet in de FIRE-berekening. Een huis is geen liquide vermogen — je kunt er pas uit
            putten door te verkopen of een opeethypotheek af te sluiten.
          </p>
        </>
      )}

      {!hasEigenHuis && (
        <div className="mb-4 rounded-lg border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-4 py-3 text-xs text-[var(--ink-3)]">
          Je hebt nog geen eigen woning toegevoegd. Voeg er één toe via{' '}
          <Link href="/core/assets/eigen_huis" className="underline hover:text-[var(--ink-2)]">
            Kern → Eigen woning
          </Link>{' '}
          om deze instelling effect te laten hebben.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MODES.map((mode) => {
          const meta = MODE_META[mode]
          const isSelected = config.mode === mode
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setMode(mode)}
              disabled={loading}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                isSelected
                  ? 'border-[var(--ink)] bg-[var(--subtle)]'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
              } ${loading ? 'opacity-60' : ''}`}
            >
              <div className="mb-1 flex items-center gap-2">
                <meta.Icon className="h-4 w-4 text-[var(--ink-3)]" />
                <span
                  className={`text-sm font-semibold ${isSelected ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
                >
                  {meta.label}
                </span>
                <span className="ml-auto rounded-full bg-[var(--subtle)] px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  {meta.tag}
                </span>
              </div>
              <p className="text-xs text-[var(--ink-3)]">{meta.description}</p>
            </button>
          )
        })}
      </div>

      {(config.mode === 'downsize' || config.mode === 'reverse_mortgage') && (
        <StrategyDetailsPanel
          config={config}
          onChange={setConfig}
          estimatedWoz={estimatedWoz}
          estimatedEquity={estimatedEquity}
        />
      )}

      {draftScenario && (
        <ScenarioPreviewPanel
          config={config}
          draft={draftScenario}
          saved={savedScenario}
          isDirty={savedConfig != null && JSON.stringify(config) !== JSON.stringify(savedConfig)}
        />
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="rounded-lg bg-[var(--ink)] px-5 py-2 text-sm font-medium text-[var(--paper)] transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Opslaan…' : 'Eigen-woning-strategie opslaan'}
        </button>
        {message && (
          <span
            className={`text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {message.text}
          </span>
        )}
      </div>

      <p className="mt-3 font-sans text-[11px] text-[var(--ink-3)]">
        Deze keuze beïnvloedt zowel de FIRE-leeftijd op je dashboard als de prognose-grafieken in
        de Horizon-module.
      </p>
    </div>
  )
}

// ── Live preview: trigger-moment + vrijheidsleeftijd vóór opslaan ──

function ScenarioPreviewPanel({
  config,
  draft,
  saved,
  isDirty,
}: {
  config: HousingStrategyConfig
  draft: HousingScenarioResult
  saved: HousingScenarioResult | null
  isDirty: boolean
}) {
  const hasTrigger = config.mode === 'downsize' || config.mode === 'reverse_mortgage'
  const event = draft.events[0]
  const meta = (event?.metadata ?? {}) as Record<string, unknown>
  const triggerAge = event?.target_age ?? draft.depletion?.triggerAge ?? null
  const ageDisplay = triggerAge != null ? Math.round(triggerAge) : null

  const triggerLabel = !hasTrigger
    ? null
    : hasTrigger && 'trigger' in config && config.trigger === 'fixed_age'
      ? 'op je gekozen leeftijd'
      : draft.depletion?.reason === 'immediate'
        ? 'direct — je liquide vermogen zit al op de drempel'
        : draft.depletion?.reason === 'crossover'
          ? 'wanneer nodig — moment berekend uit je volledige projectie'
          : 'uiterste leeftijd — je vermogen raakt niet eerder op'

  const saleProceeds = Number(meta.saleProceeds)
  const monthlyPayout = Number(meta.monthlyPayout)

  const draftFire = draft.fireAgeFractional != null ? Math.round(draft.fireAgeFractional) : null
  const savedFire =
    saved?.fireAgeFractional != null ? Math.round(saved.fireAgeFractional) : null

  return (
    <div className="mt-4 rounded-xl border border-l-4 border-l-[var(--module-active-500)] border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        Live preview — dit verschijnt op je tijdas
      </p>
      <div className="space-y-1.5 text-sm text-[var(--ink-2)]">
        {hasTrigger && ageDisplay != null && draft.events.length > 0 && (
          <div>
            {config.mode === 'downsize' ? 'Verkoop' : 'Uitkering start'}:{' '}
            <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
              rond je {ageDisplay}e
            </span>
            {triggerLabel && (
              <span className="text-[11px] text-[var(--ink-3)]"> ({triggerLabel})</span>
            )}
          </div>
        )}
        {config.mode === 'downsize' && Number.isFinite(saleProceeds) && (
          <div>
            Verkoopopbrengst naar belegbaar vermogen:{' '}
            <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
              {formatCurrency(saleProceeds)}
            </span>
          </div>
        )}
        {config.mode === 'reverse_mortgage' && Number.isFinite(monthlyPayout) && monthlyPayout > 0 && (
          <div>
            Maandelijkse uitkering:{' '}
            <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
              {formatCurrency(monthlyPayout)}
            </span>
          </div>
        )}
        {hasTrigger && draft.events.length === 0 && (
          <div className="text-[12px] text-amber-700">
            Deze instellingen leveren geen gebeurtenis op (geen opbrengst/uitkering te
            verwachten).
          </div>
        )}
        <div className="border-t border-[var(--border-ed)] pt-1.5">
          Vrijheidsleeftijd:{' '}
          {savedFire != null && isDirty && savedFire !== draftFire && (
            <>
              <span className="font-mono tabular-nums">{savedFire}</span>
              {' → '}
            </>
          )}
          <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
            {draftFire != null ? `${draftFire} jaar` : 'niet haalbaar binnen je horizon'}
          </span>
          {savedFire != null && draftFire != null && isDirty && draftFire !== savedFire && (
            <span className={draftFire < savedFire ? 'text-emerald-700' : 'text-amber-700'}>
              {' '}({draftFire < savedFire ? 'eerder vrij' : 'later vrij'})
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] italic text-[var(--ink-3)]">
        Berekend met dezelfde projectie als de grafiek — AOW, pensioen, gebeurtenissen,
        rendement en box 3 tellen mee.
      </p>
    </div>
  )
}

// ── Details-paneel: trigger + strategie-specifieke parameters ──

interface StrategyDetailsPanelProps {
  config: Extract<HousingStrategyConfig, { mode: 'downsize' | 'reverse_mortgage' }>
  onChange: (next: HousingStrategyConfig) => void
  estimatedWoz: number
  estimatedEquity: number
}

function StrategyDetailsPanel({
  config,
  onChange,
  estimatedWoz,
  estimatedEquity,
}: StrategyDetailsPanelProps) {
  const setTrigger = (trigger: HousingStrategyTrigger) => onChange({ ...config, trigger })

  // Auto-schattingen tonen we ook als de gebruiker een override invult,
  // zodat duidelijk is wat het systeem anders zou rekenen.
  const autoMonthlyHousingCost = useMemo(
    () => (estimatedWoz > 0 ? estimateMonthlyHousingCostAfterSale(estimatedWoz) : null),
    [estimatedWoz],
  )
  const autoMonthlyPayout = useMemo(() => {
    if (config.mode !== 'reverse_mortgage') return null
    if (estimatedEquity <= 0) return null
    const remainingYears = Math.max(1, 95 - config.triggerAge) // gok van levensduur
    return estimateReverseMortgagePayout(estimatedEquity, config.maxLoanPct, remainingYears)
  }, [config, estimatedEquity])

  return (
    <div className="mt-5 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Wanneer activeert de strategie?
      </p>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TriggerButton
          selected={config.trigger === 'fixed_age'}
          onClick={() => setTrigger('fixed_age')}
          title="Op vaste leeftijd"
          subtitle="Plan een specifieke leeftijd voor verkoop / opeethypotheek."
        />
        <TriggerButton
          selected={config.trigger === 'on_depletion'}
          onClick={() => setTrigger('on_depletion')}
          title="Wanneer nodig"
          subtitle="Automatisch op het moment dat je vermogen op raakt — berekend uit je volledige projectie."
        />
      </div>

      {config.trigger === 'fixed_age' && (
        <LabeledNumber
          label="Doelleeftijd"
          unit="jaar"
          value={config.triggerAge}
          min={50}
          max={95}
          step={1}
          onChange={(triggerAge) => onChange({ ...config, triggerAge })}
        />
      )}

      {config.trigger === 'on_depletion' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledNumber
            label="Veiligheidsmarge"
            unit="jaar uitgaven"
            value={config.depletionThresholdYears}
            min={0}
            max={10}
            step={0.5}
            onChange={(depletionThresholdYears) =>
              onChange({ ...config, depletionThresholdYears })
            }
            hint="Extra buffer bovenop de verkoopkosten: activeer zoveel jaar uitgaven vóór je vermogen op is. 0 = pas wanneer het echt nodig is."
          />
          <LabeledNumber
            label={
              config.mode === 'downsize'
                ? 'Verkoop uiterlijk op leeftijd'
                : 'Opeethypotheek uiterlijk op leeftijd'
            }
            unit="jaar"
            // V8 — schrijft zowel `triggerAge` (waarop de huidige v2-engine + preview
            // terugvallen) als het nieuwe kernel-veld `fallbackAge`, zodat beide
            // rekenkernen dezelfde uiterste leeftijd gebruiken. Eén veld i.p.v. twee
            // (triggerAge/fallbackAge convergeren) — F6 verwijdert de dubbeling.
            value={config.fallbackAge ?? config.triggerAge}
            min={50}
            max={95}
            step={1}
            onChange={(age) => onChange({ ...config, triggerAge: age, fallbackAge: age })}
            hint={
              config.mode === 'downsize'
                ? 'Blijft je vermogen op koers, dan verkoop je uiterlijk op deze leeftijd. Standaard 75.'
                : 'Blijft je vermogen op koers, dan start de opeethypotheek uiterlijk op deze leeftijd. Standaard 75.'
            }
          />
        </div>
      )}

      {config.mode === 'downsize' && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Grondslag verkoopwaarde
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <TriggerButton
                selected={(config.saleValuationBasis ?? 'market') === 'market'}
                onClick={() => onChange({ ...config, saleValuationBasis: 'market' })}
                title="Marktwaarde"
                subtitle="Rekent met de huidige marktwaarde van je woning (zoals op je dashboard), met waardegroei."
              />
              <TriggerButton
                selected={config.saleValuationBasis === 'woz'}
                onClick={() => onChange({ ...config, saleValuationBasis: 'woz' })}
                title="WOZ-waarde"
                subtitle="Conservatiever: rekent met de WOZ-waarde (vaak lager), met waardegroei."
              />
            </div>
            {config.saleValuationBasis === 'woz' && (
              <p className="mt-1.5 text-[10px] text-[var(--ink-3)]">
                De huiswaarde in deze projectie ligt dan lager dan op je dashboard (dat blijft
                marktwaarde tonen) — een bewuste, conservatieve planningskeuze.
              </p>
            )}
          </div>
          <LabeledNumber
            label="Verkoopprijs"
            unit="% van verkoopwaarde"
            value={config.salePricePct * 100}
            min={50}
            max={150}
            step={5}
            onChange={(v) => onChange({ ...config, salePricePct: v / 100 })}
          />
          <LabeledNumber
            label="Verkoopkosten"
            unit="%"
            value={config.salesCostsPct * 100}
            min={0}
            max={15}
            step={0.5}
            onChange={(v) => onChange({ ...config, salesCostsPct: v / 100 })}
            hint="Makelaar, notaris, verhuiskosten."
          />
          <div className="sm:col-span-2">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Nieuwe maandlast na verkoop (€)
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={20000}
                step={50}
                value={config.newMonthlyHousingCost ?? ''}
                placeholder={
                  autoMonthlyHousingCost != null
                    ? `auto-schatting: € ${autoMonthlyHousingCost}`
                    : 'auto-schatting'
                }
                onChange={(e) => {
                  const raw = e.target.value
                  onChange({
                    ...config,
                    newMonthlyHousingCost: raw === '' ? null : Number(raw),
                  })
                }}
                className="w-40 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-[var(--ink)]"
              />
              <span className="text-[11px] text-[var(--ink-3)]">
                Leeg = auto-schatting (4% van WOZ / 12).
              </span>
            </div>
          </div>
        </div>
      )}

      {config.mode === 'reverse_mortgage' && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledNumber
            label="Max % overwaarde"
            unit="%"
            value={config.maxLoanPct * 100}
            min={10}
            max={80}
            step={5}
            onChange={(v) => onChange({ ...config, maxLoanPct: v / 100 })}
            hint="Hoeveel van je overwaarde je beschikbaar maakt."
          />
          <LabeledNumber
            label="Rente opeethypotheek"
            unit="%"
            value={config.interestRate * 100}
            min={0}
            max={15}
            step={0.25}
            onChange={(v) => onChange({ ...config, interestRate: v / 100 })}
          />
          <div className="sm:col-span-2">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Maandelijkse uitkering (€)
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={20000}
                step={50}
                value={config.monthlyPayout ?? ''}
                placeholder={
                  autoMonthlyPayout != null
                    ? `auto-schatting: € ${autoMonthlyPayout}`
                    : 'auto-schatting'
                }
                onChange={(e) => {
                  const raw = e.target.value
                  onChange({ ...config, monthlyPayout: raw === '' ? null : Number(raw) })
                }}
                className="w-40 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-[var(--ink)]"
              />
              <span className="text-[11px] text-[var(--ink-3)]">
                Leeg = lineair berekend op basis van max %.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// TriggerButton + LabeledNumber zijn verplaatst naar
// components/future/strategie/fields.tsx (gedeeld met de AOW/Pensioen-editors).
