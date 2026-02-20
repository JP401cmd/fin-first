'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HouseholdSection } from '@/components/app/household-section'
import { useModuleColors, useBudgetColors, usePhaseColors } from '@/components/app/module-color-provider'
import { generatePalette, DEFAULT_MODULE_COLORS, DEFAULT_BUDGET_COLORS, DEFAULT_PHASE_COLORS, SHADES } from '@/lib/color-palette'
import type { ModuleColorConfig, ModuleName, BudgetColorConfig, PhaseColorConfig } from '@/lib/color-palette'
import { ColorPickerCard } from '@/components/app/color-picker-card'
import type { ColorPreset } from '@/components/app/color-picker-card'
import { Palette, RotateCcw } from 'lucide-react'

type HouseholdType = 'solo' | 'samen' | 'gezin'

export default function ProfielPage() {
  const supabase = createClient()
  const { setConfig } = useModuleColors()
  const { setBudgetConfig } = useBudgetColors()
  const { setPhaseConfig } = usePhaseColors()

  // Profile state
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [country, setCountry] = useState('NL')
  const [householdType, setHouseholdType] = useState<HouseholdType>('solo')

  // Household profile state (NIBUD matching)
  const [numberOfChildren, setNumberOfChildren] = useState(0)
  const [childrenAges, setChildrenAges] = useState<number[]>([])
  const [housingType, setHousingType] = useState<string | null>(null)
  const [energyLabel, setEnergyLabel] = useState<string | null>(null)
  const [hasCar, setHasCar] = useState(false)
  const [netMonthlyIncome, setNetMonthlyIncome] = useState<string>('')
  const [childAgeInput, setChildAgeInput] = useState('')

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data) {
        setFullName(data.full_name ?? '')
        setDateOfBirth(data.date_of_birth ?? '')
        setCountry(data.country ?? 'NL')
        setHouseholdType(data.household_type ?? 'solo')
        setNumberOfChildren(data.number_of_children ?? 0)
        setChildrenAges(data.children_ages ?? [])
        setHousingType(data.housing_type ?? null)
        setEnergyLabel(data.energy_label ?? null)
        setHasCar(data.has_car ?? false)
        setNetMonthlyIncome(data.net_monthly_income ? String(data.net_monthly_income) : '')
        // Load module colors into the provider
        if (data.module_colors) {
          const mc = data.module_colors as Record<string, string>
          setConfig({
            kern: mc.kern || DEFAULT_MODULE_COLORS.kern,
            wil: mc.wil || DEFAULT_MODULE_COLORS.wil,
            horizon: mc.horizon || DEFAULT_MODULE_COLORS.horizon,
          })
        }
        // Load budget colors into the provider
        if (data.budget_colors) {
          const bc = data.budget_colors as Record<string, string>
          setBudgetConfig({
            income:  bc.income  || DEFAULT_BUDGET_COLORS.income,
            expense: bc.expense || DEFAULT_BUDGET_COLORS.expense,
            savings: bc.savings || DEFAULT_BUDGET_COLORS.savings,
            debt:    bc.debt    || DEFAULT_BUDGET_COLORS.debt,
            other:   bc.other   || DEFAULT_BUDGET_COLORS.other,
          })
        }
        // Load phase colors into the provider
        if (data.phase_colors) {
          const pc = data.phase_colors as Record<string, string>
          setPhaseConfig({
            phase_recovery:  pc.phase_recovery  || DEFAULT_PHASE_COLORS.phase_recovery,
            phase_stability: pc.phase_stability || DEFAULT_PHASE_COLORS.phase_stability,
            phase_momentum:  pc.phase_momentum  || DEFAULT_PHASE_COLORS.phase_momentum,
            phase_mastery:   pc.phase_mastery   || DEFAULT_PHASE_COLORS.phase_mastery,
          })
        }
      }

      setLoading(false)
    }
    loadProfile()
  }, [supabase])

  const saveProfile = useCallback(async () => {
    setSaving(true)
    setSaveMessage(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaveMessage({ type: 'error', text: 'Niet ingelogd.' })
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName || null,
        date_of_birth: dateOfBirth || null,
        country: country || 'NL',
        household_type: householdType,
        number_of_children: numberOfChildren,
        children_ages: childrenAges,
        housing_type: housingType,
        energy_label: energyLabel,
        has_car: hasCar,
        net_monthly_income: netMonthlyIncome ? Number(netMonthlyIncome) : null,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setSaveMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    } else {
      setSaveMessage({ type: 'success', text: 'Opgeslagen!' })
      setTimeout(() => setSaveMessage(null), 3000)
    }
    setSaving(false)
  }, [supabase, fullName, dateOfBirth, country, householdType, numberOfChildren, childrenAges, housingType, energyLabel, hasCar, netMonthlyIncome])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-5 sm:mb-8">
        <h1 className="text-3xl font-bold text-[var(--ink)]">Profiel</h1>
        <p className="mt-2 text-[var(--ink-3)]">
          Je persoonlijke gegevens en huishoudprofiel.
        </p>
      </div>

      {/* ── Persoonlijke Gegevens ─────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Persoonlijke Gegevens
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Basisinformatie over jou en je huishouden.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Volledige naam
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Je naam"
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label htmlFor="dob" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Geboortedatum
            </label>
            <input
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label htmlFor="country" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Land
            </label>
            <input
              id="country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="NL"
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Huishouden
            </span>
            <div className="flex gap-2">
              {(['solo', 'samen', 'gezin'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setHouseholdType(type)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    householdType === type
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-[var(--border-md)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-zinc-400'
                  }`}
                >
                  {type === 'solo' ? 'Solo' : type === 'samen' ? 'Samen' : 'Gezin'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 sm:mt-6 flex items-center gap-3">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {saveMessage.text}
            </span>
          )}
        </div>
      </section>

      {/* ── Huishoudprofiel (NIBUD matching) ─────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Huishoudprofiel
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Deze gegevens worden gebruikt voor je NIBUD Budget Gezondheidscheck.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="numChildren" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Aantal kinderen
            </label>
            <input
              id="numChildren"
              type="number"
              min={0}
              max={10}
              value={numberOfChildren}
              onChange={(e) => {
                const n = Math.max(0, Number(e.target.value))
                setNumberOfChildren(n)
                if (n < childrenAges.length) setChildrenAges(childrenAges.slice(0, n))
              }}
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Leeftijden kinderen
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {childrenAges.map((age, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-[var(--ink-2)]"
                >
                  {age} jaar
                  <button
                    onClick={() => setChildrenAges(childrenAges.filter((_, idx) => idx !== i))}
                    className="ml-0.5 text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            {childrenAges.length < numberOfChildren && (
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={25}
                  value={childAgeInput}
                  onChange={(e) => setChildAgeInput(e.target.value)}
                  placeholder="Leeftijd"
                  className="w-24 rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && childAgeInput) {
                      e.preventDefault()
                      setChildrenAges([...childrenAges, Math.max(0, Number(childAgeInput))])
                      setChildAgeInput('')
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (childAgeInput) {
                      setChildrenAges([...childrenAges, Math.max(0, Number(childAgeInput))])
                      setChildAgeInput('')
                    }
                  }}
                  className="rounded-lg border border-[var(--border-md)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                >
                  Toevoegen
                </button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="housingType" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Woningtype
            </label>
            <select
              id="housingType"
              value={housingType ?? ''}
              onChange={(e) => setHousingType(e.target.value || null)}
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Selecteer...</option>
              <option value="huur_sociaal">Huur (sociaal)</option>
              <option value="huur_vrij">Huur (vrije sector)</option>
              <option value="koop">Koopwoning</option>
            </select>
          </div>

          <div>
            <label htmlFor="energyLabel" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Energielabel
            </label>
            <select
              id="energyLabel"
              value={energyLabel ?? ''}
              onChange={(e) => setEnergyLabel(e.target.value || null)}
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Selecteer...</option>
              {['A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map(label => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Auto</span>
            <div className="flex gap-2">
              {[
                { value: false, label: 'Nee' },
                { value: true, label: 'Ja' },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setHasCar(opt.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    hasCar === opt.value
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-[var(--border-md)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-zinc-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="netIncome" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Netto maandinkomen
              <span className="ml-1 text-xs font-normal text-[var(--ink-3)]">(optioneel)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)]">&euro;</span>
              <input
                id="netIncome"
                type="number"
                min={0}
                step={50}
                value={netMonthlyIncome}
                onChange={(e) => setNetMonthlyIncome(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              Wordt gebruikt voor gepersonaliseerde NIBUD-berekeningen.
            </p>
          </div>
        </div>

        <div className="mt-3 sm:mt-6 flex items-center gap-3">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {saveMessage.text}
            </span>
          )}
        </div>
      </section>

      {/* ── Module Kleuren ────────────────────────────────────────── */}
      <ModuleColorSection />

      {/* ── Budget Categorie Kleuren ──────────────────────────────── */}
      <BudgetColorSection />

      {/* ── Soevereiniteits-Fase Kleuren ──────────────────────────── */}
      <PhaseColorSection />

      {/* ── Huishouden Management ────────────────────────────────── */}
      <HouseholdSection />
    </div>
  )
}

// ── Budget presets ───────────────────────────────────────────────────────

const BUDGET_INCOME_PRESETS: ColorPreset[] = [
  { hex: '#2d6a4f', name: 'Bos groen' },
  { hex: '#1a7a3b', name: 'Smaragd' },
  { hex: '#3d6b2d', name: 'Olijf' },
  { hex: '#4a7c59', name: 'Salie' },
]
const BUDGET_EXPENSE_PRESETS: ColorPreset[] = [
  { hex: '#6b3a2d', name: 'Terracotta' },
  { hex: '#8b4513', name: 'Chocolade' },
  { hex: '#7a3b2d', name: 'Cognac' },
  { hex: '#6b4c3a', name: 'Kastanje' },
]
const BUDGET_SAVINGS_PRESETS: ColorPreset[] = [
  { hex: '#1d4e6b', name: 'Staalsblauw' },
  { hex: '#1a3a5c', name: 'Marine' },
  { hex: '#2c5282', name: 'Kobalt' },
  { hex: '#234e6b', name: 'Blauwgrijs' },
]
const BUDGET_DEBT_PRESETS: ColorPreset[] = [
  { hex: '#7a2d3a', name: 'Bordeaux' },
  { hex: '#8b2635', name: 'Karmijn' },
  { hex: '#6b2d3a', name: 'Wijnrood' },
  { hex: '#7a2d4a', name: 'Burgunder' },
]
const BUDGET_OTHER_PRESETS: ColorPreset[] = [
  { hex: '#4a4840', name: 'Inkt grijs' },
  { hex: '#5a5650', name: 'Leisteen' },
  { hex: '#6b6660', name: 'Grafiet' },
  { hex: '#3a3830', name: 'Kolen' },
]

const PHASE_RECOVERY_PRESETS: ColorPreset[] = [
  { hex: '#8b3a3a', name: 'Donkerrood' },
  { hex: '#9b2335', name: 'Karmijn' },
  { hex: '#7a2d2d', name: 'Mahoniebruin' },
  { hex: '#c0392b', name: 'Helder rood' },
]
const PHASE_STABILITY_PRESETS: ColorPreset[] = [
  { hex: '#355a78', name: 'Staalsblauw' },
  { hex: '#2c4a6e', name: 'Marine' },
  { hex: '#1a5276', name: 'Oceaan' },
  { hex: '#2e6da4', name: 'Blauw' },
]
const PHASE_MOMENTUM_PRESETS: ColorPreset[] = [
  { hex: '#3d3048', name: 'Wil paars' },
  { hex: '#4a2d6b', name: 'Indigo' },
  { hex: '#553c7b', name: 'Amethist' },
  { hex: '#2d2040', name: 'Midnacht' },
]
const PHASE_MASTERY_PRESETS: ColorPreset[] = [
  { hex: '#c4a06b', name: 'Horizon goud' },
  { hex: '#b8860b', name: 'Donkergoud' },
  { hex: '#d4a843', name: 'Amberkleurig' },
  { hex: '#a07850', name: 'Brons' },
]

// ── Budget Color Picker Section ──────────────────────────────────────────

const BUDGET_ROWS: { key: keyof BudgetColorConfig; label: string; sublabel: string; presets: ColorPreset[] }[] = [
  { key: 'income',  label: 'Inkomen',   sublabel: 'Inkomsten, salaris',         presets: BUDGET_INCOME_PRESETS },
  { key: 'expense', label: 'Uitgaven',  sublabel: 'Dagelijkse kosten',           presets: BUDGET_EXPENSE_PRESETS },
  { key: 'savings', label: 'Sparen',    sublabel: 'Spaargeld, opbouw',           presets: BUDGET_SAVINGS_PRESETS },
  { key: 'debt',    label: 'Schulden',  sublabel: 'Aflossingen, rente',          presets: BUDGET_DEBT_PRESETS },
  { key: 'other',   label: 'Overig',    sublabel: 'Overige categorieën',         presets: BUDGET_OTHER_PRESETS },
]

function BudgetColorSection() {
  const supabase = createClient()
  const { budgetConfig, setBudgetConfig } = useBudgetColors()
  const [localColors, setLocalColors] = useState<BudgetColorConfig>(budgetConfig)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const isLocalChange = useRef(false)

  useEffect(() => {
    if (isLocalChange.current) {
      isLocalChange.current = false
      return
    }
    setLocalColors(budgetConfig)
  }, [budgetConfig])

  const handleChange = (key: keyof BudgetColorConfig, hex: string) => {
    const updated = { ...localColors, [key]: hex }
    setLocalColors(updated)
    isLocalChange.current = true
    setBudgetConfig(updated)
  }

  const handleReset = () => {
    setLocalColors(DEFAULT_BUDGET_COLORS)
    isLocalChange.current = true
    setBudgetConfig(DEFAULT_BUDGET_COLORS)
  }

  const saveColors = async () => {
    setSaving(true)
    setMessage(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMessage({ type: 'error', text: 'Niet ingelogd.' }); setSaving(false); return }

    const { error } = await supabase.from('profiles').update({ budget_colors: localColors }).eq('id', user.id)
    if (error) {
      setMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    } else {
      setMessage({ type: 'success', text: 'Kleuren opgeslagen!' })
      setTimeout(() => setMessage(null), 3000)
    }
    setSaving(false)
  }

  const isDefault = JSON.stringify(localColors) === JSON.stringify(DEFAULT_BUDGET_COLORS)

  return (
    <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-[var(--ink-3)]" />
        <h2 className="label-editorial text-[var(--ink-2)]">Budget Categorieën</h2>
      </div>
      <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
        Kies accentkleuren voor elke budgetcategorie. Alle tinten worden automatisch gegenereerd.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BUDGET_ROWS.map(({ key, label, sublabel, presets }) => (
          <ColorPickerCard
            key={key}
            label={label}
            sublabel={sublabel}
            value={localColors[key]}
            defaultValue={DEFAULT_BUDGET_COLORS[key]}
            presets={presets}
            onChange={(hex) => handleChange(key, hex)}
          />
        ))}
      </div>

      <div className="mt-3 sm:mt-6 flex items-center gap-3">
        <button
          onClick={saveColors}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? 'Opslaan...' : 'Kleuren opslaan'}
        </button>
        {!isDefault && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
        {message && (
          <span className={`text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </section>
  )
}

// ── Phase Color Picker Section ───────────────────────────────────────────

const PHASE_ROWS: { key: keyof PhaseColorConfig; label: string; sublabel: string; presets: ColorPreset[] }[] = [
  { key: 'phase_recovery',  label: 'Herstel',      sublabel: 'Niv. -2 t/m 0 — Balans herstellen',    presets: PHASE_RECOVERY_PRESETS },
  { key: 'phase_stability', label: 'Stabiliteit',  sublabel: 'Niv. 1–2 — Fundament leggen',            presets: PHASE_STABILITY_PRESETS },
  { key: 'phase_momentum',  label: 'Momentum',     sublabel: 'Niv. 3–4 — Tijd vermenigvuldigen',       presets: PHASE_MOMENTUM_PRESETS },
  { key: 'phase_mastery',   label: 'Meesterschap', sublabel: 'Niv. 5–6 — Volledige tijdsoevereiniteit', presets: PHASE_MASTERY_PRESETS },
]

function PhaseColorSection() {
  const supabase = createClient()
  const { phaseConfig, setPhaseConfig } = usePhaseColors()
  const [localColors, setLocalColors] = useState<PhaseColorConfig>(phaseConfig)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [currentPhase, setCurrentPhase] = useState<string | null>(null)
  const isLocalChange = useRef(false)

  useEffect(() => {
    if (isLocalChange.current) {
      isLocalChange.current = false
      return
    }
    setLocalColors(phaseConfig)
  }, [phaseConfig])

  // Detect active phase from profile
  useEffect(() => {
    async function loadPhase() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('last_known_phase').eq('id', user.id).single()
      if (data?.last_known_phase) {
        // Map phase id to config key
        const phaseMap: Record<string, keyof PhaseColorConfig> = {
          recovery: 'phase_recovery', stability: 'phase_stability',
          momentum: 'phase_momentum', mastery: 'phase_mastery',
        }
        setCurrentPhase(phaseMap[data.last_known_phase] ?? null)
      }
    }
    loadPhase()
  }, [supabase])

  const handleChange = (key: keyof PhaseColorConfig, hex: string) => {
    const updated = { ...localColors, [key]: hex }
    setLocalColors(updated)
    isLocalChange.current = true
    setPhaseConfig(updated)
  }

  const handleReset = () => {
    setLocalColors(DEFAULT_PHASE_COLORS)
    isLocalChange.current = true
    setPhaseConfig(DEFAULT_PHASE_COLORS)
  }

  const saveColors = async () => {
    setSaving(true)
    setMessage(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMessage({ type: 'error', text: 'Niet ingelogd.' }); setSaving(false); return }

    const { error } = await supabase.from('profiles').update({ phase_colors: localColors }).eq('id', user.id)
    if (error) {
      setMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    } else {
      setMessage({ type: 'success', text: 'Kleuren opgeslagen!' })
      setTimeout(() => setMessage(null), 3000)
    }
    setSaving(false)
  }

  const isDefault = JSON.stringify(localColors) === JSON.stringify(DEFAULT_PHASE_COLORS)

  return (
    <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-[var(--ink-3)]" />
        <h2 className="label-editorial text-[var(--ink-2)]">Soevereiniteits-Fases</h2>
      </div>
      <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
        Kies accentkleuren per vrijheidsfase. Onafhankelijk van de module-kleuren.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PHASE_ROWS.map(({ key, label, sublabel, presets }) => (
          <ColorPickerCard
            key={key}
            label={label}
            sublabel={sublabel}
            value={localColors[key]}
            defaultValue={DEFAULT_PHASE_COLORS[key]}
            presets={presets}
            onChange={(hex) => handleChange(key, hex)}
            activeBadge={currentPhase === key ? 'Jij zit hier →' : undefined}
          />
        ))}
      </div>

      <div className="mt-3 sm:mt-6 flex items-center gap-3">
        <button
          onClick={saveColors}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? 'Opslaan...' : 'Kleuren opslaan'}
        </button>
        {!isDefault && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
        {message && (
          <span className={`text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </section>
  )
}

// ── Module Color Picker Section ──────────────────────────────────────────

const MODULE_ROWS: { key: ModuleName; label: string; icon: string }[] = [
  { key: 'kern', label: 'De Kern', icon: '&#9670;' },
  { key: 'wil', label: 'De Wil', icon: '&#9671;' },
  { key: 'horizon', label: 'De Horizon', icon: '&#9672;' },
]

function ModuleColorSection() {
  const supabase = createClient()
  const { config, setConfig } = useModuleColors()
  const [localColors, setLocalColors] = useState<ModuleColorConfig>(config)
  const [colorSaving, setColorSaving] = useState(false)
  const [colorMessage, setColorMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const isLocalChange = useRef(false)

  // Sync if config changes externally (e.g. profile load in parent)
  useEffect(() => {
    if (isLocalChange.current) {
      isLocalChange.current = false
      return
    }
    setLocalColors(config)
  }, [config])

  const handleColorChange = (module: ModuleName, hex: string) => {
    const updated = { ...localColors, [module]: hex }
    setLocalColors(updated)
    // Live preview — update CSS variables immediately
    isLocalChange.current = true
    setConfig(updated)
  }

  const handleReset = () => {
    setLocalColors(DEFAULT_MODULE_COLORS)
    isLocalChange.current = true
    setConfig(DEFAULT_MODULE_COLORS)
  }

  const saveColors = async () => {
    setColorSaving(true)
    setColorMessage(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setColorMessage({ type: 'error', text: 'Niet ingelogd.' })
      setColorSaving(false)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({ module_colors: localColors })
      .eq('id', user.id)

    if (error) {
      setColorMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    } else {
      setColorMessage({ type: 'success', text: 'Kleuren opgeslagen!' })
      setTimeout(() => setColorMessage(null), 3000)
    }
    setColorSaving(false)
  }

  const isDefault = localColors.kern === DEFAULT_MODULE_COLORS.kern
    && localColors.wil === DEFAULT_MODULE_COLORS.wil
    && localColors.horizon === DEFAULT_MODULE_COLORS.horizon

  return (
    <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-[var(--ink-3)]" />
        <h2 className="label-editorial text-[var(--ink-2)]">
          Module Kleuren
        </h2>
      </div>
      <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
        Kies een accentkleur per module. Alle tinten worden automatisch gegenereerd.
      </p>

      <div className="space-y-5">
        {MODULE_ROWS.map(({ key, label }) => {
          const hex = localColors[key]
          const palette = generatePalette(hex)

          return (
            <div key={key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              {/* Module name + color picker */}
              <div className="flex items-center gap-3 sm:w-44">
                <label
                  htmlFor={`color-${key}`}
                  className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-[var(--border-ed)] transition-shadow hover:shadow-md"
                  style={{ backgroundColor: hex }}
                >
                  <input
                    id={`color-${key}`}
                    type="color"
                    value={hex}
                    onChange={(e) => handleColorChange(key, e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
                <div>
                  <span className="block text-sm font-medium text-[var(--ink-2)]">{label}</span>
                  {key === 'wil' && (
                    <span className="block text-[10px] text-[var(--ink-3)]">Identiteit volgt De Wil</span>
                  )}
                </div>
              </div>

              {/* Palette preview */}
              <div className="flex flex-1 gap-0.5">
                {SHADES.map((shade) => (
                  <div
                    key={shade}
                    className="h-6 flex-1 first:rounded-l last:rounded-r"
                    style={{ backgroundColor: palette[shade].hex }}
                    title={`${key}-${shade}: ${palette[shade].hex}`}
                  />
                ))}
              </div>

              {/* Hex value */}
              <span className="hidden text-[11px] font-mono text-[var(--ink-3)] sm:block">
                {hex}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 sm:mt-6 flex items-center gap-3">
        <button
          onClick={saveColors}
          disabled={colorSaving}
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {colorSaving ? 'Opslaan...' : 'Kleuren opslaan'}
        </button>
        {!isDefault && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
        {colorMessage && (
          <span className={`text-sm ${colorMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {colorMessage.text}
          </span>
        )}
      </div>
    </section>
  )
}
