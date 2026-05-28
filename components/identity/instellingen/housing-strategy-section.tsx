'use client'

import { useEffect, useMemo, useState } from 'react'
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
export function HousingStrategySection() {
  const [config, setConfig] = useState<HousingStrategyConfig>({ mode: 'include_full' })
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
    } catch {
      setMessage({ type: 'error', text: 'Netwerkfout — probeer opnieuw' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="housing-strategy" className="mb-6">
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
          subtitle="Pas activeren als liquide vermogen krap wordt."
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
            label="Drempel"
            unit="jaar uitgaven"
            value={config.depletionThresholdYears}
            min={0}
            max={10}
            step={0.5}
            onChange={(depletionThresholdYears) =>
              onChange({ ...config, depletionThresholdYears })
            }
            hint="Activeer zodra liquide vermogen onder dit aantal jaarinkomens zakt."
          />
          <LabeledNumber
            label="Fallback-leeftijd"
            unit="jaar"
            value={config.triggerAge}
            min={50}
            max={95}
            step={1}
            onChange={(triggerAge) => onChange({ ...config, triggerAge })}
            hint="Uiterste leeftijd waarop strategie sowieso wordt geactiveerd."
          />
        </div>
      )}

      {config.mode === 'downsize' && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledNumber
            label="Verkoopprijs"
            unit="% van WOZ"
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

// ── kleine UI-helpers ──

function TriggerButton({
  selected,
  onClick,
  title,
  subtitle,
}: {
  selected: boolean
  onClick: () => void
  title: string
  subtitle: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border-2 p-3 text-left transition-all ${
        selected
          ? 'border-[var(--ink)] bg-[var(--paper)]'
          : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
      }`}
    >
      <span
        className={`text-sm font-semibold ${selected ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
      >
        {title}
      </span>
      <p className="mt-1 text-[11px] text-[var(--ink-3)]">{subtitle}</p>
    </button>
  )
}

function LabeledNumber({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div>
      <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-[var(--ink)]"
        />
        <span className="text-sm text-[var(--ink-3)]">{unit}</span>
      </div>
      {hint && <p className="mt-1 text-[10px] text-[var(--ink-3)]">{hint}</p>}
    </div>
  )
}
