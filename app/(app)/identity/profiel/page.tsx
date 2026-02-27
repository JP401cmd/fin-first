'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HouseholdSection } from '@/components/app/household-section'
import { useModuleColors, useBudgetColors, usePhaseColors, useFontTheme } from '@/components/app/module-color-provider'
import type { FontTheme } from '@/components/app/module-color-provider'
import { generatePalette, DEFAULT_MODULE_COLORS, DEFAULT_BUDGET_COLORS, DEFAULT_PHASE_COLORS, SHADES } from '@/lib/color-palette'
import type { ModuleColorConfig, ModuleName, BudgetColorConfig, PhaseColorConfig } from '@/lib/color-palette'
import { ColorPickerCard } from '@/components/app/color-picker-card'
import type { ColorPreset } from '@/components/app/color-picker-card'
import { Palette, RotateCcw, Type } from 'lucide-react'
import { type RetirementExpenseMethod } from '@/lib/budget-utils'
import { type FireEndStrategy, STRATEGY_LABELS, parseFireStrategy } from '@/lib/fire-strategy'

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

  // Retirement expense method state
  const [retirementMethod, setRetirementMethod] = useState<RetirementExpenseMethod>('essential_budgets')
  const [retirementCustomAmount, setRetirementCustomAmount] = useState<string>('')

  // FIRE end strategy state
  const [fireEndStrategy, setFireEndStrategy] = useState<FireEndStrategy>('deplete')
  const [fireEndAge, setFireEndAge] = useState(90)
  const [fireLegacyAmount, setFireLegacyAmount] = useState<string>('')

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
        setRetirementMethod((data.retirement_expense_method as RetirementExpenseMethod) ?? 'essential_budgets')
        setRetirementCustomAmount(data.retirement_expense_custom_amount ? String(data.retirement_expense_custom_amount) : '')
        // Load FIRE end strategy
        const fs = parseFireStrategy(data)
        setFireEndStrategy(fs.strategy)
        setFireEndAge(fs.endAge)
        setFireLegacyAmount(fs.legacyAmount ? String(fs.legacyAmount) : '')
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
        retirement_expense_method: retirementMethod,
        retirement_expense_custom_amount: retirementCustomAmount ? Number(retirementCustomAmount) : null,
        fire_end_strategy: fireEndStrategy,
        fire_end_age: fireEndAge,
        fire_legacy_amount: fireLegacyAmount ? Number(fireLegacyAmount) : null,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setSaveMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    } else {
      setSaveMessage({ type: 'success', text: 'Opgeslagen!' })
      setTimeout(() => setSaveMessage(null), 3000)
    }
    setSaving(false)
  }, [supabase, fullName, dateOfBirth, country, householdType, numberOfChildren, childrenAges, housingType, energyLabel, hasCar, netMonthlyIncome, retirementMethod, retirementCustomAmount, fireEndStrategy, fireEndAge, fireLegacyAmount])

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

      {/* ── Jaarlijkse uitgave na retirement ─────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
        <div className="mb-4">
          <h2 className="label-editorial text-[var(--ink-2)]">
            Jaarlijkse uitgave na retirement
          </h2>
          <p className="mt-1 font-sans text-sm text-[var(--ink-3)]">
            Hoeveel je per jaar uitgeeft nadat je financieel vrij bent. Dit bepaalt je FIRE-doel en vrijheidsdagen.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Method 1: Essentiële budgetten */}
          <button
            type="button"
            onClick={() => setRetirementMethod('essential_budgets')}
            className={`min-h-[80px] rounded-[var(--r-lg)] border p-4 text-left transition-all ${
              retirementMethod === 'essential_budgets'
                ? 'border-[var(--kern-m)] bg-[var(--kern-l)] shadow-sm'
                : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Methode 1
              </p>
              {retirementMethod === 'essential_budgets' && (
                <span className="shrink-0 rounded-full bg-[var(--kern-m)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--kern-t)]">
                  Actief
                </span>
              )}
            </div>
            <p className="mt-1 font-medium text-[var(--ink)]">Essentiële budgetten</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
              Gebaseerd op je must-budgetten in De Kern. Automatisch bijgewerkt als je budgetten wijzigt.
            </p>
          </button>

          {/* Method 2: Zelf instellen */}
          <button
            type="button"
            onClick={() => setRetirementMethod('custom_amount')}
            className={`min-h-[80px] rounded-[var(--r-lg)] border p-4 text-left transition-all ${
              retirementMethod === 'custom_amount'
                ? 'border-[var(--kern-m)] bg-[var(--kern-l)] shadow-sm'
                : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Methode 2
              </p>
              {retirementMethod === 'custom_amount' && (
                <span className="shrink-0 rounded-full bg-[var(--kern-m)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--kern-t)]">
                  Actief
                </span>
              )}
            </div>
            <p className="mt-1 font-medium text-[var(--ink)]">Zelf instellen</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
              Geef zelf een jaarlijks bedrag op in huidige prijzen.
            </p>
            {retirementMethod === 'custom_amount' && (
              <div className="mt-3">
                <label htmlFor="retirementCustomAmount" className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Jaarlijks bedrag (€)
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)]">&euro;</span>
                  <input
                    id="retirementCustomAmount"
                    type="number"
                    min={0}
                    step={500}
                    value={retirementCustomAmount}
                    onChange={(e) => setRetirementCustomAmount(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="bijv. 30000"
                    className="w-full rounded-[var(--r-sm)] border border-[var(--border-md)] bg-[var(--subtle)] py-2 pr-3 pl-7 font-mono text-sm tabular-nums"
                  />
                </div>
              </div>
            )}
          </button>

          {/* Method 3: Huidig inkomen */}
          <button
            type="button"
            onClick={() => setRetirementMethod('current_income')}
            className={`min-h-[80px] rounded-[var(--r-lg)] border p-4 text-left transition-all ${
              retirementMethod === 'current_income'
                ? 'border-[var(--kern-m)] bg-[var(--kern-l)] shadow-sm'
                : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Methode 3
              </p>
              {retirementMethod === 'current_income' && (
                <span className="shrink-0 rounded-full bg-[var(--kern-m)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--kern-t)]">
                  Actief
                </span>
              )}
            </div>
            <p className="mt-1 font-medium text-[var(--ink)]">Geschat jaarinkomen</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
              Gebaseerd op je geschat jaarinkomen uit de afgelopen 12 maanden transacties. Voor wie na retirement dezelfde levensstijl wil handhaven.
            </p>
          </button>
        </div>

        <p className="mt-3 text-xs text-[var(--ink-3)]">
          De gekozen methode bepaalt het FIRE-doel, alle vrijheidsdagen-berekeningen en de dagprijs in De Kern, De Horizon en de belastingpagina.
        </p>

        <div className="mt-4 flex items-center gap-3">
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

      {/* ── FIRE Eindstrategie ─────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
        <div className="mb-4">
          <h2 className="label-editorial text-[var(--ink-2)]">
            FIRE Eindstrategie
          </h2>
          <p className="mt-1 font-sans text-sm text-[var(--ink-3)]">
            Wat moet er met je vermogen gebeuren nadat je financieel vrij bent?
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Strategy 1: Deplete */}
          <button
            type="button"
            onClick={() => setFireEndStrategy('deplete')}
            className={`min-h-[80px] rounded-[var(--r-lg)] border p-4 text-left transition-all ${
              fireEndStrategy === 'deplete'
                ? 'border-[var(--hor-m)] bg-[var(--hor-l)] shadow-sm'
                : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Strategie 1
              </p>
              {fireEndStrategy === 'deplete' && (
                <span className="shrink-0 rounded-full bg-[var(--hor-m)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--hor-t)]">
                  Actief
                </span>
              )}
            </div>
            <p className="mt-1 font-medium text-[var(--ink)]">{STRATEGY_LABELS.deplete.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
              {STRATEGY_LABELS.deplete.subtitle}. Het laagste FIRE-doel.
            </p>
            {fireEndStrategy === 'deplete' && (
              <div className="mt-3">
                <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Eindleeftijd
                </label>
                <input
                  type="range"
                  min={60}
                  max={120}
                  step={1}
                  value={fireEndAge}
                  onChange={(e) => setFireEndAge(Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 w-full cursor-pointer accent-[var(--hor-t)]"
                />
                <span className="font-mono text-sm tabular-nums text-[var(--ink-2)]">{fireEndAge} jaar</span>
              </div>
            )}
          </button>

          {/* Strategy 2: Legacy */}
          <button
            type="button"
            onClick={() => setFireEndStrategy('legacy')}
            className={`min-h-[80px] rounded-[var(--r-lg)] border p-4 text-left transition-all ${
              fireEndStrategy === 'legacy'
                ? 'border-[var(--hor-m)] bg-[var(--hor-l)] shadow-sm'
                : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Strategie 2
              </p>
              {fireEndStrategy === 'legacy' && (
                <span className="shrink-0 rounded-full bg-[var(--hor-m)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--hor-t)]">
                  Actief
                </span>
              )}
            </div>
            <p className="mt-1 font-medium text-[var(--ink)]">{STRATEGY_LABELS.legacy.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
              {STRATEGY_LABELS.legacy.subtitle}. Tussenliggend FIRE-doel.
            </p>
            {fireEndStrategy === 'legacy' && (
              <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Eindleeftijd
                  </label>
                  <input
                    type="range"
                    min={60}
                    max={120}
                    step={1}
                    value={fireEndAge}
                    onChange={(e) => setFireEndAge(Number(e.target.value))}
                    className="mt-1 w-full cursor-pointer accent-[var(--hor-t)]"
                  />
                  <span className="font-mono text-sm tabular-nums text-[var(--ink-2)]">{fireEndAge} jaar</span>
                </div>
                <div>
                  <label htmlFor="fireLegacyAmount" className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Erfenisbedrag (€)
                  </label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)]">&euro;</span>
                    <input
                      id="fireLegacyAmount"
                      type="number"
                      min={0}
                      step={10000}
                      value={fireLegacyAmount}
                      onChange={(e) => setFireLegacyAmount(e.target.value)}
                      placeholder="bijv. 200000"
                      className="w-full rounded-[var(--r-sm)] border border-[var(--border-md)] bg-[var(--subtle)] py-2 pr-3 pl-7 font-mono text-sm tabular-nums"
                    />
                  </div>
                </div>
              </div>
            )}
          </button>

          {/* Strategy 3: Perpetual */}
          <button
            type="button"
            onClick={() => setFireEndStrategy('perpetual')}
            className={`min-h-[80px] rounded-[var(--r-lg)] border p-4 text-left transition-all ${
              fireEndStrategy === 'perpetual'
                ? 'border-[var(--hor-m)] bg-[var(--hor-l)] shadow-sm'
                : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Strategie 3
              </p>
              {fireEndStrategy === 'perpetual' && (
                <span className="shrink-0 rounded-full bg-[var(--hor-m)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--hor-t)]">
                  Actief
                </span>
              )}
            </div>
            <p className="mt-1 font-medium text-[var(--ink)]">{STRATEGY_LABELS.perpetual.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
              {STRATEGY_LABELS.perpetual.subtitle}. Het hoogste FIRE-doel.
            </p>
          </button>
        </div>

        <p className="mt-3 text-xs text-[var(--ink-3)]">
          De gekozen strategie bepaalt hoeveel vermogen je nodig hebt voor FIRE en hoe de simulatiegrafiek eruitziet.
        </p>

        <div className="mt-4 flex items-center gap-3">
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

      {/* ── Typografie ────────────────────────────────────────────── */}
      <TypographieSection />

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

// ── Typography Theme Section ─────────────────────────────────────────────

const FONT_THEMES: { id: FontTheme; label: string; description: string; headingSample: string; bodySample: string; headingStyle: React.CSSProperties; bodyStyle: React.CSSProperties }[] = [
  {
    id: 'editorial',
    label: 'Redactioneel',
    description: 'Playfair Display + Source Serif 4 — krantenstijl, klassiek',
    headingSample: 'Geld is opgeslagen tijd',
    bodySample: 'Elke euro vertegenwoordigt een stukje levenstijd.',
    headingStyle: { fontFamily: 'var(--font-playfair-orig, var(--font-playfair))', fontWeight: 700 },
    bodyStyle: { fontFamily: 'var(--font-source-serif-orig, var(--font-source-serif))', fontStyle: 'italic' },
  },
  {
    id: 'andada',
    label: 'Andada Pro',
    description: 'Andada Pro — humanistisch serif, scherm-geoptimaliseerd',
    headingSample: 'Geld is opgeslagen tijd',
    bodySample: 'Elke euro vertegenwoordigt een stukje levenstijd.',
    headingStyle: { fontFamily: 'var(--font-andada)', fontWeight: 700 },
    bodyStyle: { fontFamily: 'var(--font-andada)', fontStyle: 'italic' },
  },
  {
    id: 'digital',
    label: 'Digitaal',
    description: 'Inter — helder, modern schreefloos',
    headingSample: 'Geld is opgeslagen tijd',
    bodySample: 'Elke euro vertegenwoordigt een stukje levenstijd.',
    headingStyle: { fontFamily: 'var(--font-inter)', fontWeight: 700 },
    bodyStyle: { fontFamily: 'var(--font-inter)' },
  },
]

function TypographieSection() {
  const supabase = createClient()
  const { fontTheme, setFontTheme } = useFontTheme()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load from DB on mount
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('typography_theme').eq('id', user.id).single()
      if (data?.typography_theme) {
        setFontTheme(data.typography_theme as FontTheme)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelect = (theme: FontTheme) => {
    setFontTheme(theme)
  }

  const saveTheme = async () => {
    setSaving(true)
    setMessage(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMessage({ type: 'error', text: 'Niet ingelogd.' }); setSaving(false); return }
    const { error } = await supabase.from('profiles').update({ typography_theme: fontTheme }).eq('id', user.id)
    if (error) {
      setMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    } else {
      setMessage({ type: 'success', text: 'Typografie opgeslagen!' })
      setTimeout(() => setMessage(null), 3000)
    }
    setSaving(false)
  }

  return (
    <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
      <div className="flex items-center gap-2">
        <Type className="h-4 w-4 text-[var(--ink-3)]" />
        <h2 className="label-editorial text-[var(--ink-2)]">Typografie</h2>
      </div>
      <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
        Kies een letterstijl die past bij jou. De preview werkt direct.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FONT_THEMES.map((theme) => {
          const isSelected = fontTheme === theme.id
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleSelect(theme.id)}
              className={`rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-[var(--kern-m)] bg-[var(--kern-l)] shadow-sm'
                  : 'border-[var(--border-ed)] bg-[var(--subtle)] hover:border-[var(--border-md)] hover:shadow-sm'
              }`}
            >
              <div className="mb-3 border-b border-dashed border-[var(--border-ed)] pb-3">
                <p className="mb-0.5 text-lg leading-tight text-[var(--ink)]" style={theme.headingStyle}>
                  {theme.headingSample}
                </p>
                <p className="text-[13px] leading-relaxed text-[var(--ink-3)]" style={theme.bodyStyle}>
                  {theme.bodySample}
                </p>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">{theme.label}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">{theme.description}</p>
                </div>
                {isSelected && (
                  <span className="mt-0.5 shrink-0 rounded-full bg-[var(--kern-m)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--kern-t)]">
                    Actief
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 sm:mt-6 flex items-center gap-3">
        <button
          onClick={saveTheme}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? 'Opslaan...' : 'Typografie opslaan'}
        </button>
        {message && (
          <span className={`text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </section>
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
