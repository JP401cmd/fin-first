'use client'

import { useState, useMemo } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'
import {
  NL_AOW_AGE,
  NL_AOW_MONTHLY,
  BOX3_DRAG,
} from '@/lib/horizon-data'
import {
  runSimulation,
  type ReturnModel,
  type SimCashflow,
  type SimRow,
  type SimResult,
} from '@/lib/fire-simulation'
import { Info, ChevronDown, ChevronUp, TableProperties, Plus, Trash2, Pencil } from 'lucide-react'
import { SimChart } from '@/components/app/horizon/sim-chart'

// ── ID generator ───────────────────────────────────────────────────────────

let _cfId = 0
function newCfId() { return `cf-${++_cfId}` }

// ── Slider ─────────────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step = 1, onChange, formatValue,
}: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; formatValue?: (v: number) => string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-sans text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</span>
        <span className="font-mono text-sm font-medium text-[var(--ink)]">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[var(--kern-t,#58362d)]" />
      <div className="flex justify-between">
        <span className="font-sans text-[10px] text-[var(--ink-4)]">{formatValue ? formatValue(min) : min}</span>
        <span className="font-sans text-[10px] text-[var(--ink-4)]">{formatValue ? formatValue(max) : max}</span>
      </div>
    </div>
  )
}

// ── NumberInput ────────────────────────────────────────────────────────────

function NumberInput({
  label, value, onChange, prefix = '€', suffix, step = 1000, min = 0,
}: {
  label: string; value: number; onChange: (v: number) => void
  prefix?: string; suffix?: string; step?: number; min?: number
}) {
  return (
    <div className="space-y-1">
      <label className="block font-sans text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </label>
      <div className="flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2">
        {prefix && <span className="font-mono text-sm text-[var(--ink-3)]">{prefix}</span>}
        <input type="number" value={value} min={min} step={step}
          onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
          className="w-full bg-transparent font-mono text-sm text-[var(--ink)] outline-none tabular-nums" />
        {suffix && <span className="font-sans text-[11px] text-[var(--ink-3)]">{suffix}</span>}
      </div>
    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, highlight, onClick,
}: {
  label: string; value: string; sub?: string
  highlight?: 'green' | 'orange' | 'red' | 'neutral'; onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  const colors = { green: 'text-green-700', orange: 'text-orange-600', red: 'text-red-600', neutral: 'text-[var(--ink)]' }
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className="flex flex-col gap-0.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-left shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)]"
    >
      <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</span>
      <span className={`font-mono text-base font-semibold tabular-nums ${colors[highlight ?? 'neutral']}`}>{value}</span>
      {sub && <span className="font-sans text-[10px] text-[var(--ink-4)]">{sub}</span>}
    </Tag>
  )
}

// ── Toggle ─────────────────────────────────────────────────────────────────

function Toggle<T extends string>({
  options, value, onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--subtle)] p-0.5">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`flex-1 rounded-[var(--r-sm)] px-2.5 py-1 font-sans text-[11px] font-medium transition-all ${
            value === opt.id
              ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s0)]'
              : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Cashflow card ───────────────────────────────────────────────────────────

function CashflowCard({
  cf, onEdit, onRemove,
}: {
  cf: SimCashflow
  onEdit: () => void
  onRemove: () => void
}) {
  const sign = cf.direction === 'income' ? '+' : '-'
  const color = cf.direction === 'income' ? 'text-green-700' : 'text-orange-600'

  return (
    <div className="flex items-start justify-between gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 shadow-[var(--s0)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-sans text-[12px] font-medium text-[var(--ink)] truncate">{cf.name}</span>
          <span className={`font-mono text-[12px] font-semibold tabular-nums shrink-0 ${color}`}>
            {sign}{formatCurrency(cf.amount)}
            {cf.type === 'recurring' ? '/mnd' : ' eenmalig'}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="font-sans text-[10px] text-[var(--ink-4)]">
            {cf.type === 'one_time'
              ? `op leeftijd ${cf.fromAge}`
              : cf.toAge !== null
              ? `leeftijd ${cf.fromAge}–${cf.toAge}`
              : `vanaf leeftijd ${cf.fromAge}`}
          </span>
          <span className={`rounded-[var(--r-sm)] border px-1.5 py-px font-sans text-[9px] uppercase tracking-[0.06em] ${
            cf.indexed
              ? 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-3)]'
              : 'border-[var(--border-ed)] text-[var(--ink-4)]'
          }`}>
            {cf.indexed ? 'Geïndexeerd' : 'Nominaal'}
          </span>
        </div>
      </div>
      <div className="mt-0.5 flex shrink-0 gap-0.5">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-[var(--r-sm)] p-1 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
          aria-label="Bewerk kasstroom"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-[var(--r-sm)] p-1 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-500"
          aria-label="Verwijder kasstroom"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── CashflowForm ────────────────────────────────────────────────────────────

const TEMPLATES: Omit<SimCashflow, 'id'>[] = [
  { name: 'Erfenis', type: 'one_time', direction: 'income', amount: 50_000, fromAge: 65, toAge: null, indexed: false },
  { name: 'Bijverdienste', type: 'recurring', direction: 'income', amount: 500, fromAge: 55, toAge: 67, indexed: true },
  { name: 'Extra pensioen', type: 'recurring', direction: 'income', amount: 500, fromAge: 65, toAge: null, indexed: true },
  { name: 'Grote uitgave', type: 'one_time', direction: 'expense', amount: 20_000, fromAge: 55, toAge: null, indexed: false },
]

function CashflowSection({
  cashflows,
  onAdd,
  onUpdate,
  onRemove,
  currentAge,
  endAge,
}: {
  cashflows: SimCashflow[]
  onAdd: (cf: SimCashflow) => void
  onUpdate: (cf: SimCashflow) => void
  onRemove: (id: string) => void
  currentAge: number
  endAge: number
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [type, setType] = useState<'recurring' | 'one_time'>('one_time')
  const [direction, setDirection] = useState<'income' | 'expense'>('income')
  const [amount, setAmount] = useState(10_000)
  const [fromAge, setFromAge] = useState(currentAge + 10)
  const [toAge, setToAge] = useState<number | ''>(currentAge + 20)
  const [indexed, setIndexed] = useState(false)

  function openForm(cf?: SimCashflow) {
    if (cf) {
      setEditingId(cf.id)
      setName(cf.name)
      setType(cf.type)
      setDirection(cf.direction)
      setAmount(cf.amount)
      setFromAge(cf.fromAge)
      setToAge(cf.toAge ?? '')
      setIndexed(cf.indexed)
    } else {
      setEditingId(null)
      setName('')
      setType('one_time')
      setDirection('income')
      setAmount(10_000)
      setFromAge(currentAge + 10)
      setToAge(currentAge + 20)
      setIndexed(false)
    }
    setShowForm(true)
  }

  function applyTemplate(tmpl: Omit<SimCashflow, 'id'>) {
    setEditingId(null)
    setName(tmpl.name)
    setType(tmpl.type)
    setDirection(tmpl.direction)
    setAmount(tmpl.amount)
    setFromAge(tmpl.fromAge)
    setToAge(tmpl.toAge ?? '')
    setIndexed(tmpl.indexed)
    setShowForm(true)
  }

  function handleSave() {
    if (!name.trim() || amount <= 0) return
    const cf: SimCashflow = {
      id: editingId ?? newCfId(),
      name: name.trim(),
      type,
      direction,
      amount,
      fromAge,
      toAge: type === 'recurring' && toAge !== '' ? Number(toAge) : null,
      indexed,
    }
    if (editingId) {
      onUpdate(cf)
    } else {
      onAdd(cf)
    }
    setShowForm(false)
    setEditingId(null)
    setName('')
    setAmount(10_000)
    setFromAge(currentAge + 10)
    setToAge(currentAge + 20)
    setIndexed(false)
    setType('one_time')
    setDirection('income')
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setName('')
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]">
      <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        Aanvullende kasstromen
      </p>

      {/* List */}
      {cashflows.length === 0 && !showForm && (
        <p className="mb-3 font-sans text-[11px] text-[var(--ink-4)]">
          Nog geen kasstromen — voeg een erfenis, bijverdienste of grote uitgave toe.
        </p>
      )}

      {cashflows.length > 0 && (
        <div className="mb-3 space-y-2">
          {cashflows.map(cf => (
            <CashflowCard
              key={cf.id}
              cf={cf}
              onEdit={() => openForm(cf)}
              onRemove={() => onRemove(cf.id)}
            />
          ))}
        </div>
      )}

      {/* Templates — only when adding new, not when editing */}
      {!showForm && (
        <div className="mb-3">
          <p className="mb-1.5 font-sans text-[10px] text-[var(--ink-4)]">Snelle templates:</p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map(tmpl => (
              <button
                key={tmpl.name}
                type="button"
                onClick={() => applyTemplate(tmpl)}
                className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 font-sans text-[10px] text-[var(--ink-3)] transition-all hover:border-[var(--border-md)] hover:text-[var(--ink-2)]"
              >
                {tmpl.direction === 'income' ? '+' : '−'} {tmpl.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline form — used for both adding and editing */}
      {showForm && (
        <div className="mb-3 space-y-3 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 p-3">
          {editingId && (
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Kasstroom bewerken
            </p>
          )}
          {/* Name */}
          <div className="space-y-1">
            <label className="block font-sans text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Naam</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="bijv. Erfenis, Bijverdienste…"
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-sans text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-4)] focus:border-[var(--kern-t,#58362d)]"
            />
          </div>

          {/* Type + Direction */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="font-sans text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Type</p>
              <Toggle
                options={[
                  { id: 'one_time' as const, label: 'Eenmalig' },
                  { id: 'recurring' as const, label: 'Terugkerend' },
                ]}
                value={type}
                onChange={setType}
              />
            </div>
            <div className="space-y-1">
              <p className="font-sans text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Richting</p>
              <Toggle
                options={[
                  { id: 'income' as const, label: 'Inkomen' },
                  { id: 'expense' as const, label: 'Uitgave' },
                ]}
                value={direction}
                onChange={setDirection}
              />
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <label className="block font-sans text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {type === 'recurring' ? 'Maandelijks bedrag' : 'Bedrag'}
            </label>
            <div className="flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2">
              <span className="font-mono text-sm text-[var(--ink-3)]">€</span>
              <input
                type="number"
                value={amount}
                min={0}
                step={type === 'recurring' ? 100 : 1000}
                onChange={e => setAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full bg-transparent font-mono text-sm text-[var(--ink)] outline-none tabular-nums"
              />
            </div>
          </div>

          {/* Ages */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block font-sans text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Vanaf leeftijd
              </label>
              <input
                type="number"
                value={fromAge}
                min={currentAge}
                max={endAge}
                step={1}
                onChange={e => setFromAge(Math.max(currentAge, Math.min(endAge, Number(e.target.value) || currentAge)))}
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-sm text-[var(--ink)] outline-none tabular-nums"
              />
            </div>
            {type === 'recurring' && (
              <div className="space-y-1">
                <label className="block font-sans text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Tot leeftijd
                </label>
                <input
                  type="number"
                  value={toAge}
                  min={fromAge + 1}
                  max={endAge}
                  step={1}
                  placeholder="leeg = eindleeftijd"
                  onChange={e => setToAge(e.target.value === '' ? '' : Math.max(fromAge + 1, Number(e.target.value) || fromAge + 1))}
                  className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-sm text-[var(--ink)] outline-none tabular-nums placeholder:text-[var(--ink-4)] placeholder:font-sans placeholder:text-[10px]"
                />
              </div>
            )}
          </div>

          {/* Indexed toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-sans text-[11px] text-[var(--ink-2)]">Geïndexeerd</p>
              <p className="font-sans text-[10px] text-[var(--ink-4)]">Ja: bedrag groeit mee met inflatie</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={indexed}
              onClick={() => setIndexed(v => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                indexed ? 'bg-[var(--kern-t,#58362d)]' : 'bg-[var(--border-md)]'
              }`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                indexed ? 'left-4' : 'left-0.5'
              }`} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || amount <= 0}
              className="flex-1 rounded-[var(--r)] bg-[var(--kern-t,#58362d)] px-3 py-2 font-sans text-[12px] font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
            >
              Opslaan
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 font-sans text-[12px] text-[var(--ink-3)] transition-all hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!showForm && (
        <button
          type="button"
          onClick={() => openForm()}
          className="flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] px-3 py-2 font-sans text-[11px] text-[var(--ink-3)] transition-all hover:border-[var(--kern-t,#58362d)] hover:text-[var(--ink-2)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Eigen kasstroom toevoegen
        </button>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FireSimPage() {
  const [currentAge, setCurrentAge] = useState(35)
  const [endAge, setEndAge] = useState(90)
  const [currentPortfolio, setCurrentPortfolio] = useState(100_000)
  const [yearlyExpenses, setYearlyExpenses] = useState(30_000)
  const [monthlySavings, setMonthlySavings] = useState(1_000)
  const [grossReturn, setGrossReturn] = useState(7)
  const [returnModel, setReturnModel] = useState<ReturnModel>('classic')
  const [inflation, setInflation] = useState(2)
  const [cashflows, setCashflows] = useState<SimCashflow[]>([
    {
      id: 'aow-prefill',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: NL_AOW_MONTHLY,
      fromAge: NL_AOW_AGE,
      toAge: null,
      indexed: true,
    },
  ])

  const [showTable, setShowTable] = useState(false)
  const [showKassabon, setShowKassabon] = useState(false)
  const [showInputDetails, setShowInputDetails] = useState(false)

  const safeEndAge = Math.max(currentAge + 2, endAge)
  const annualSavings = monthlySavings * 12

  // Derive AOW marker age from the pre-filled AOW cashflow (for chart vertical line)
  const aowMarkerAge = cashflows.find(cf => cf.id === 'aow-prefill')?.fromAge ?? null

  function addCashflow(cf: SimCashflow) {
    setCashflows(prev => [...prev, cf])
  }

  function updateCashflow(cf: SimCashflow) {
    setCashflows(prev => prev.map(existing => existing.id === cf.id ? cf : existing))
  }

  function removeCashflow(id: string) {
    setCashflows(prev => prev.filter(cf => cf.id !== id))
  }

  const result = useMemo(
    () => runSimulation(
      currentAge, safeEndAge, currentPortfolio, yearlyExpenses,
      annualSavings, grossReturn / 100, returnModel, inflation / 100,
      cashflows,
    ),
    [currentAge, safeEndAge, currentPortfolio, yearlyExpenses,
     annualSavings, grossReturn, returnModel, inflation, cashflows],
  )

  const classicDiff = result.requiredFirePortfolio - result.classic25xTarget
  const portReturnPct = returnModel === 'nl_box3'
    ? ((grossReturn / 100 - BOX3_DRAG) * 100).toFixed(2)
    : grossReturn.toString()
  const portReturnLabel = returnModel === 'nl_box3'
    ? `${portReturnPct}% nom. netto (Box 3)`
    : `${portReturnPct}% nominaal`

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-20 md:py-10">
      {/* Header */}
      <div className="mb-6">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          Gereedschappen
        </p>
        <h1 className="mt-1 text-3xl font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, serif)', letterSpacing: '-0.02em' }}>
          FIRE-simulator
        </h1>
        <p className="mt-1 font-sans text-[13px] leading-relaxed text-[var(--ink-3)]">
          De FIRE-leeftijd is een berekende uitkomst: het eerste moment waarop je vermogen
          groot genoeg is om tot eindleeftijd te leven. Doel: portfolio = €0 op eindleeftijd.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left: chart + KPIs */}
        <div className="space-y-4">
          {/* Chart */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]">
            <div className="mb-1 flex items-center justify-between">
              <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Vermogensontwikkeling
              </p>
              <div className="flex items-center gap-3 font-sans text-[10px] text-[var(--ink-4)]">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-4 rounded-full bg-green-400" />
                  Opbouw
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-4 rounded-full bg-orange-400" />
                  Afbouw → €0
                </span>
              </div>
            </div>
            <SimChart
              rows={result.rows}
              fireAge={result.fireAge}
              fireAgeFractional={result.fireAgeFractional}
              currentAge={currentAge}
              endAge={safeEndAge}
              cashflows={cashflows}
            />
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              label="FIRE-leeftijd"
              value={result.fireAgeFractional !== null ? `leeftijd ${result.fireAgeFractional.toFixed(1)}` : 'Niet haalbaar'}
              sub={result.fireAgeFractional !== null
                ? `over ${(result.fireAgeFractional - currentAge).toFixed(1)} jaar`
                : 'Verhoog inleg of verlaag uitgaven'}
              highlight={result.fireReachable ? 'green' : 'red'}
            />
            <KpiCard
              label="Benodigd bij FIRE"
              value={formatCurrency(result.requiredFirePortfolio)}
              sub={`doel: €0 op leeftijd ${safeEndAge}`}
              highlight="neutral"
              onClick={() => setShowKassabon(true)}
            />
            <KpiCard
              label="Impliciete onttrekking"
              value={result.fireReachable ? `${(result.implicitWithdrawalRate * 100).toFixed(1)}%` : '—'}
              sub="vs. klassiek 4% SWR"
              highlight={result.fireReachable
                ? (result.implicitWithdrawalRate > 0.04 ? 'orange' : 'green')
                : 'neutral'}
            />
            <KpiCard
              label="Klassiek 25× model"
              value={formatCurrency(result.classic25xTarget)}
              sub={classicDiff < 0
                ? `${formatCurrency(Math.abs(classicDiff))} minder nodig`
                : `${formatCurrency(classicDiff)} meer nodig`}
              highlight={classicDiff < 0 ? 'green' : 'neutral'}
            />
          </div>

          {/* Status banner */}
          <div className={`rounded-[var(--r)] border px-4 py-3 font-sans text-sm ${
            result.fireReachable
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-orange-200 bg-orange-50 text-orange-700'
          }`}>
            {result.fireReachable && result.fireAgeFractional !== null ? (
              <>
                <span className="font-semibold">FIRE haalbaar op leeftijd {result.fireAgeFractional.toFixed(1)}.</span>{' '}
                {result.fireAgeFractional - currentAge > 0
                  ? `Na ${(result.fireAgeFractional - currentAge).toFixed(1)} jaar sparen bereik je ${formatCurrency(result.firePortfolioAtFire)} — `
                  : 'Je huidige vermogen is al groot genoeg — '}
                genoeg om tot leeftijd {safeEndAge} te leven.
                {cashflows.length > 0 && ` Inclusief ${cashflows.length} kasstroom${cashflows.length !== 1 ? 'en' : ''}.`}
              </>
            ) : (
              <>
                <span className="font-semibold">FIRE niet haalbaar voor leeftijd {safeEndAge}.</span>{' '}
                Je bouwt {formatCurrency(result.firePortfolioAtFire)} op, maar hebt{' '}
                {formatCurrency(result.requiredFirePortfolio)} nodig op leeftijd {safeEndAge - 1}.{' '}
                Verhoog je inleg, verlaag je uitgaven of vergroot je eindleeftijd.
              </>
            )}
          </div>

          {/* Table button */}
          <button type="button" onClick={() => setShowTable(true)}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--subtle)] px-4 py-2.5 font-sans text-sm text-[var(--ink-2)] transition-all hover:bg-[var(--border-ed)]">
            <TableProperties className="h-4 w-4" />
            Jaar-voor-jaar tabel bekijken
          </button>
        </div>

        {/* Right: inputs */}
        <div className="space-y-5">
          {/* Ages */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]">
            <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Leeftijden</p>
            <div className="space-y-5">
              <Slider label="Huidige leeftijd" value={currentAge} min={18} max={70}
                onChange={setCurrentAge} formatValue={v => `${v} jaar`} />
              <Slider label="Eindleeftijd" value={safeEndAge}
                min={currentAge + 2} max={120}
                onChange={v => setEndAge(Math.max(v, currentAge + 2))} formatValue={v => `${v} jaar`} />
            </div>
          </div>

          {/* Financials */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]">
            <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Financieel</p>
            <div className="space-y-3">
              <NumberInput label="Huidig netto vermogen" value={currentPortfolio}
                onChange={setCurrentPortfolio} step={10_000} />
              <NumberInput label="Jaarlijkse uitgaven (pensioen)" value={yearlyExpenses}
                onChange={setYearlyExpenses} step={1_000} />
              <NumberInput label="Maandelijkse inleg" value={monthlySavings}
                onChange={setMonthlySavings} step={100}
                suffix={`= ${formatCurrency(annualSavings)}/jr`} />
            </div>
          </div>

          {/* Cashflows (incl. pre-filled AOW) */}
          <CashflowSection
            cashflows={cashflows}
            onAdd={addCashflow}
            onUpdate={updateCashflow}
            onRemove={removeCashflow}
            currentAge={currentAge}
            endAge={safeEndAge}
          />

          {/* Advanced toggle */}
          <button type="button" onClick={() => setShowInputDetails(v => !v)}
            className="flex w-full items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 font-sans text-[11px] text-[var(--ink-3)] transition-all hover:bg-[var(--subtle)]">
            <span className="uppercase tracking-[0.08em]">Geavanceerde instellingen</span>
            {showInputDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showInputDetails && (
            <div className="space-y-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]">
              {/* Return model */}
              <div className="space-y-1">
                <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Rendementsmodel (opbouw + afbouw)
                </p>
                <div className="flex gap-2">
                  {([
                    {
                      id: 'classic' as ReturnModel,
                      label: 'Klassiek',
                      sub: `${grossReturn}% nominaal`,
                    },
                    {
                      id: 'nl_box3' as ReturnModel,
                      label: 'NL Box 3',
                      sub: `${((grossReturn / 100 - BOX3_DRAG) * 100).toFixed(2)}% nom. netto`,
                    },
                  ]).map(opt => (
                    <button key={opt.id} type="button" onClick={() => setReturnModel(opt.id)}
                      className={`flex-1 rounded-[var(--r)] border px-3 py-2 text-left transition-all ${
                        returnModel === opt.id
                          ? 'border-[var(--kern-t,#58362d)] bg-kern-50/50'
                          : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
                      }`}>
                      <p className="font-sans text-[11px] font-semibold text-[var(--ink)]">{opt.label}</p>
                      <p className="font-mono text-[10px] text-[var(--ink-3)]">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Slider label="Bruto rendement" value={grossReturn} min={1} max={12} step={0.5}
                onChange={setGrossReturn} formatValue={v => `${v}%`} />
              <Slider label="Inflatie" value={inflation} min={0} max={6} step={0.5}
                onChange={setInflation} formatValue={v => `${v}%`} />
            </div>
          )}

          {/* Info */}
          <div className="flex gap-2 rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 p-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />
            <p className="font-sans text-[10px] leading-relaxed text-[var(--ink-3)]">
              De FIRE-leeftijd is een <span className="font-medium text-[var(--ink-2)]">berekende uitkomst</span> —
              het eerste moment waarop je opgebouwde vermogen voldoende is voor de volledige
              afbouwperiode tot €0 op eindleeftijd.{' '}
              <span className="text-green-600 font-medium">Groen</span> = opbouw,{' '}
              <span className="text-orange-500 font-medium">oranje</span> = afbouw naar €0.
            </p>
          </div>
        </div>
      </div>

      {/* ── Detail Table ──────────────────────────────────────────────────────── */}
      <BottomSheet open={showTable} onClose={() => setShowTable(false)} title="Jaar-voor-jaar overzicht">
        <div className="p-5">
          {result.fireAgeFractional !== null && (
            <p className="mb-3 font-sans text-[11px] text-[var(--ink-3)]">
              FIRE op leeftijd <strong>{result.fireAgeFractional.toFixed(1)}</strong> — portfolio van{' '}
              <strong>{formatCurrency(result.firePortfolioAtFire)}</strong> daalt naar{' '}
              <strong>€0</strong> op leeftijd {safeEndAge}.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b-2 border-[var(--ink)]">
                  {['Leeftijd', 'Fase', 'Start', 'Rendement', 'Inleg/Onttrekking', 'Kasstromen', 'Einde'].map(h => (
                    <th key={h} className={`pb-2 font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] ${
                      h === 'Leeftijd' || h === 'Fase' ? 'text-left' : 'text-right'
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.flatMap((row, idx) => {
                  const isFireTransition = result.fireAge !== null
                    && idx > 0
                    && result.rows[idx - 1].phase === 'accumulation'
                    && row.phase !== 'accumulation'
                  const elements: React.ReactNode[] = []

                  if (isFireTransition) {
                    elements.push(
                      <tr key={`fire-sep-${row.age}`} className="bg-kern-50/40">
                        <td colSpan={7} className="py-1.5 pl-2 font-sans text-[10px] text-[var(--kern-t,#58362d)]">
                          ↓ FIRE op leeftijd {result.fireAgeFractional?.toFixed(1)} — {formatCurrency(result.firePortfolioAtFire)}
                        </td>
                      </tr>
                    )
                  }

                  elements.push(
                    <tr key={`row-${row.age}`} className={`border-b border-[var(--border-ed)] ${
                      aowMarkerAge !== null && row.age === aowMarkerAge ? 'bg-[var(--subtle)]/40' : ''
                    }`}>
                      <td className="py-1 text-left tabular-nums text-[var(--ink-2)]">{row.age}</td>
                      <td className="py-1 text-left">
                        <span className={`font-sans text-[9px] uppercase tracking-[0.06em] ${
                          row.phase === 'accumulation' ? 'text-green-600' : 'text-orange-500'
                        }`}>
                          {row.phase === 'accumulation' ? 'Opbouw' : 'Pensioen'}
                        </span>
                      </td>
                      <td className="py-1 text-right tabular-nums text-[var(--ink-3)]">{formatCurrency(row.startPortfolio)}</td>
                      <td className="py-1 text-right tabular-nums text-green-700">+{formatCurrency(row.growth)}</td>
                      <td className="py-1 text-right tabular-nums">
                        {row.phase === 'accumulation'
                          ? <span className="text-green-700">+{formatCurrency(row.savings)}</span>
                          : row.withdrawal > 0
                          ? <span className="text-orange-600">-{formatCurrency(row.withdrawal)}</span>
                          : <span className="text-[var(--ink-4)]">—</span>}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {row.cashflowNet > 0
                          ? <span className="text-green-700">+{formatCurrency(row.cashflowNet)}</span>
                          : row.cashflowNet < 0
                          ? <span className="text-orange-600">{formatCurrency(row.cashflowNet)}</span>
                          : <span className="text-[var(--ink-4)]">—</span>}
                      </td>
                      <td className={`py-1 text-right tabular-nums font-medium ${
                        row.phase !== 'accumulation' && row.endPortfolio <= 1000 && row.age >= safeEndAge - 2
                          ? 'text-orange-600' : 'text-[var(--ink)]'
                      }`}>
                        {formatCurrency(row.endPortfolio)}
                      </td>
                    </tr>
                  )

                  return elements
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
            {result.fireAgeFractional !== null
              ? `FIRE op leeftijd ${result.fireAgeFractional.toFixed(1)} · Doel €0 op leeftijd ${safeEndAge}`
              : `FIRE niet haalbaar · Eindleeftijd ${safeEndAge}`}
            {returnModel === 'nl_box3' ? ' · NL Box 3 nominaal netto' : ' · Klassiek nominaal'}
            {cashflows.length > 0 ? ` · ${cashflows.length} aanvullende kasstroom${cashflows.length !== 1 ? 'en' : ''}` : ''}
          </p>
        </div>
      </BottomSheet>

      {/* ── Kassabon ─────────────────────────────────────────────────────────── */}
      <BottomSheet open={showKassabon} onClose={() => setShowKassabon(false)} title="Benodigd FIRE-vermogen">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                BENODIGD VERMOGEN BIJ FIRE
              </p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {result.fireAgeFractional !== null
                  ? `FIRE-leeftijd ${result.fireAgeFractional.toFixed(1)} · Doel: €0 op leeftijd ${safeEndAge}`
                  : `Doel: €0 op leeftijd ${safeEndAge}`}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Het minimale vermogen op{' '}
              {result.fireAgeFractional !== null ? `leeftijd ${result.fireAgeFractional.toFixed(1)}` : 'eindleeftijd'} zodat de portfolio
              precies op €0 uitkomt op eindleeftijd {safeEndAge}, rekening houdend met nominaal inflaterende
              uitgaven
              {cashflows.length > 0 ? ` en ${cashflows.length} kasstroom${cashflows.length !== 1 ? 'en' : ''}` : ''}.
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse uitgaven</span>
                <span className="tabular-nums text-[var(--ink)]">{formatCurrency(yearlyExpenses)}</span>
              </div>
              {result.fireAgeFractional !== null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Pensioenperiode</span>
                  <span className="tabular-nums text-[var(--ink)]">{(safeEndAge - result.fireAgeFractional).toFixed(1)} jaar</span>
                </div>
              )}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Rendement (nominaal)</span>
                <span className="tabular-nums text-[var(--ink)]">{portReturnLabel}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Inflatie</span>
                <span className="tabular-nums text-[var(--ink)]">{inflation}%</span>
              </div>
              {cashflows.length > 0 && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Kasstromen</span>
                  <span className="tabular-nums text-[var(--ink-3)]">{cashflows.length} item{cashflows.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Klassiek 25× model</span>
                <span className="tabular-nums text-[var(--ink-3)]">{formatCurrency(result.classic25xTarget)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Eindleeftijdmodel</span>
                <span className="tabular-nums font-semibold text-[var(--ink)]">{formatCurrency(result.requiredFirePortfolio)}</span>
              </div>
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Benodigd bij FIRE</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(result.requiredFirePortfolio)}</span>
            </div>

            <div className="mt-2 flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-3)]">
                {classicDiff < 0 ? 'Voordeel vs. klassiek' : 'Extra vs. klassiek'}
              </span>
              <span className={`tabular-nums font-semibold ${classicDiff < 0 ? 'text-green-700' : 'text-orange-600'}`}>
                {classicDiff < 0 ? '-' : '+'}{formatCurrency(Math.abs(classicDiff))}
              </span>
            </div>

            {result.fireReachable && (
              <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                <p>
                  <strong className="font-semibold text-[var(--ink-3)]">Impliciete onttrekkingsratio:</strong>{' '}
                  {(result.implicitWithdrawalRate * 100).toFixed(2)}% —{' '}
                  {result.implicitWithdrawalRate > 0.04
                    ? 'hoger dan 4% SWR (eindleeftijdmodel heeft hogere onttrekking dan perpetueel model)'
                    : 'lager dan of gelijk aan 4% SWR'}
                </p>
              </div>
            )}

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              FIRE-simulator · Eindleeftijdmodel · Nominaal rendementsmodel · Doel €0 op leeftijd {safeEndAge}
            </p>
          </KassabonShell>
        </div>
      </BottomSheet>
    </div>
  )
}
