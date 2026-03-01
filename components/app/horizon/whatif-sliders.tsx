'use client'

import { formatCurrency } from '@/lib/format'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

export interface WhatIfOverrides {
  monthlyIncome: number
  workDaysPerWeek: number
  savingsRate: number
  expectedReturn: number
  extraContribution: number
}

interface WhatIfSlidersProps {
  overrides: WhatIfOverrides
  baseline: WhatIfOverrides
  onChange: (overrides: WhatIfOverrides) => void
}

function DeltaBadge({ current, base, format }: { current: number; base: number; format: (v: number) => string }) {
  const diff = current - base
  if (Math.abs(diff) < 0.001) return null
  const isPositive = diff > 0
  return (
    <span className={`ml-2 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${
      isPositive ? 'bg-horizon-50 text-horizon-700' : 'bg-kern-50 text-kern-700'
    }`}>
      {isPositive ? '+' : ''}{format(diff)}
    </span>
  )
}

function SliderRow({
  label,
  value,
  baseValue,
  min,
  max,
  step,
  formatValue,
  formatDelta,
  onChange,
  minLabel,
  maxLabel,
}: {
  label: string
  value: number
  baseValue: number
  min: number
  max: number
  step: number
  formatValue: (v: number) => string
  formatDelta: (v: number) => string
  onChange: (v: number) => void
  minLabel: string
  maxLabel: string
}) {
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {label}
        </span>
        <span className="flex items-center">
          <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
            {formatValue(value)}
          </span>
          <DeltaBadge current={value} base={baseValue} format={formatDelta} />
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-wil-600"
      />
      <div className="flex justify-between font-sans text-[10px] text-[var(--ink-4)]">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}

export function WhatIfSliders({ overrides, baseline, onChange }: WhatIfSlidersProps) {
  const [expanded, setExpanded] = useState(true)

  const set = (key: keyof WhatIfOverrides, value: number) => {
    onChange({ ...overrides, [key]: value })
  }

  // Mobile: collapsed summary
  const summary = `${formatCurrency(overrides.monthlyIncome)} · ${overrides.workDaysPerWeek} dagen · ${Math.round(overrides.savingsRate)}%`

  return (
    <div className="card-editorial overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left md:hidden"
      >
        <div>
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-600">
            Scenario-parameters
          </p>
          {!expanded && (
            <p className="mt-0.5 font-mono text-xs text-[var(--ink-3)]">{summary}</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
        )}
      </button>

      {/* Desktop: always-visible label */}
      <div className="hidden px-4 pb-3 pt-3 md:block">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-600">
          Scenario-parameters
        </p>
      </div>

      {/* Sliders — expandable on mobile, always visible on desktop */}
      <div className={`px-4 pb-4 ${expanded ? 'block' : 'hidden'} md:block`}>
        {/* First 4 sliders: 2-col grid on desktop */}
        <div className="xl:grid xl:grid-cols-2 xl:gap-x-6">
          <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
            <SliderRow
              label="Maandinkomen"
              value={overrides.monthlyIncome}
              baseValue={baseline.monthlyIncome}
              min={0}
              max={15000}
              step={100}
              formatValue={formatCurrency}
              formatDelta={v => formatCurrency(v) + '/mnd'}
              onChange={v => set('monthlyIncome', v)}
              minLabel="€ 0"
              maxLabel="€ 15.000"
            />
          </div>

          <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
            <SliderRow
              label="Werkdagen per week"
              value={overrides.workDaysPerWeek}
              baseValue={baseline.workDaysPerWeek}
              min={1}
              max={5}
              step={1}
              formatValue={v => `${v} dagen`}
              formatDelta={v => `${v} dag${Math.abs(v) !== 1 ? 'en' : ''}`}
              onChange={v => set('workDaysPerWeek', v)}
              minLabel="1 dag"
              maxLabel="5 dagen"
            />
          </div>

          <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
            <SliderRow
              label="Spaarquote"
              value={overrides.savingsRate}
              baseValue={baseline.savingsRate}
              min={0}
              max={80}
              step={1}
              formatValue={v => `${Math.round(v)}%`}
              formatDelta={v => `${Math.round(v)}%`}
              onChange={v => set('savingsRate', v)}
              minLabel="0%"
              maxLabel="80%"
            />
          </div>

          <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
            <SliderRow
              label="Verwacht rendement"
              value={overrides.expectedReturn}
              baseValue={baseline.expectedReturn}
              min={2}
              max={12}
              step={0.5}
              formatValue={v => `${v.toFixed(1)}%`}
              formatDelta={v => `${v.toFixed(1)}%`}
              onChange={v => set('expectedReturn', v)}
              minLabel="2%"
              maxLabel="12%"
            />
          </div>
        </div>

        {/* 5th slider: full width */}
        <SliderRow
          label="Extra maandelijkse inleg"
          value={overrides.extraContribution}
          baseValue={baseline.extraContribution}
          min={0}
          max={5000}
          step={50}
          formatValue={formatCurrency}
          formatDelta={v => formatCurrency(v) + '/mnd'}
          onChange={v => set('extraContribution', v)}
          minLabel="€ 0"
          maxLabel="€ 5.000"
        />

        {/* Reset button */}
        {JSON.stringify(overrides) !== JSON.stringify(baseline) && (
          <button
            type="button"
            onClick={() => onChange(baseline)}
            className="mt-3 w-full rounded-[var(--r)] border border-dashed border-[var(--border-md)] px-3 py-2 font-sans text-xs font-medium text-[var(--ink-3)] transition-colors hover:border-wil-300 hover:text-wil-700"
          >
            Terug naar werkelijkheid
          </button>
        )}
      </div>
    </div>
  )
}
