'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { computeSovereigntyLevel } from '@/lib/feature-phases'

// ── Temporal Balance levels ──────────────────────────────────────────

const temporalLevels = [
  {
    level: 1,
    icon: '\uD83D\uDD25',
    name: 'The Hedonist',
    nameNl: 'De Levensgenieter',
    tagline: 'Burn Bright Now.',
    description:
      'Je wilt niet inleveren op comfort. FIRE is een leuke bonus, geen obsessie. Comfort > Snelheid.',
  },
  {
    level: 2,
    icon: '\uD83E\uDDED',
    name: 'The Voyager',
    nameNl: 'De Reiziger',
    tagline: 'Enjoy the Journey.',
    description:
      'Je spaart wat overblijft. Ervaringen en herinneringen gaan voor. Balans, licht hellend naar nu.',
  },
  {
    level: 3,
    icon: '\u2696\uFE0F',
    name: 'The Architect',
    nameNl: 'De Architect',
    tagline: 'Build with Balance.',
    description:
      'Je optimaliseert bewust. Bereid luxe op te offeren als het tijd oplevert, maar geen kluizenaar. De gulden middenweg.',
  },
  {
    level: 4,
    icon: '\uD83C\uDFDB\uFE0F',
    name: 'The Stoic',
    nameNl: 'De Sto\u00efcijn',
    tagline: 'Discipline is Freedom.',
    description:
      'Je haalt plezier uit soberheid en efficiency. Streng en doelgericht. Snelheid > Comfort.',
  },
  {
    level: 5,
    icon: '\uD83D\uDC8E',
    name: 'The Essentialist',
    nameNl: 'De Essentialist',
    tagline: 'Pure Focus.',
    description:
      'Alles wat niet essentieel is, moet weg. Minimalistisch leven voor maximale snelheid naar vrijheid.',
  },
]

// ── Chronology Scale ─────────────────────────────────────────────────

type ChronologyLevel = {
  level: number
  name: string
  focus: string
  metaphor: string
  phase: number
}

const chronologyPhases = [
  { phase: 1, name: 'Recovery', subtitle: 'Restoring Balance', color: 'rose' },
  { phase: 2, name: 'Stability', subtitle: 'Fortifying Time', color: 'blue' },
  { phase: 3, name: 'Momentum', subtitle: 'Multiplying Time', color: 'teal' },
  { phase: 4, name: 'Mastery', subtitle: 'Owning Time', color: 'amber' },
] as const

const chronologyLevels: ChronologyLevel[] = [
  { level: -2, name: 'Time Deficit', focus: 'Stop the Leak', metaphor: 'Je verliest actief tijd. Elke euro is al eigendom van iemand anders.', phase: 1 },
  { level: -1, name: 'Time Drag', focus: 'Eliminate Drag', metaphor: 'Je sleept het verleden achter je aan. Rente vertraagt je snelheid.', phase: 1 },
  { level: 0, name: 'The Reset', focus: 'Calibration', metaphor: 'Het nulpunt. De teller staat stil. Niet achteruit, nog niet vooruit.', phase: 1 },
  { level: 1, name: 'The Anchor', focus: 'Secure Foundation', metaphor: 'Het anker is uitgeworpen. Je drijft niet meer af bij storm.', phase: 2 },
  { level: 2, name: 'Time Shield', focus: 'Maximum Security', metaphor: 'Een schild van 3\u20136 maanden tijd. Externe schokken raken je niet meer.', phase: 2 },
  { level: 3, name: 'Velocity', focus: 'Acceleration', metaphor: 'Je geld genereert zijn eigen tijd. Sneller dan je alleen kunt lopen.', phase: 3 },
  { level: 4, name: 'Autonomous', focus: 'Gliding', metaphor: 'De motoren kunnen uit. Je huidige vaart bereikt de bestemming vanzelf.', phase: 3 },
  { level: 5, name: 'Sovereign', focus: 'Independence', metaphor: 'Je bezit 100% van je eigen klok. Geen tijd meer ruilen voor geld.', phase: 4 },
  { level: 6, name: 'Timeless', focus: 'Infinity', metaphor: 'Meer tijd dan je op kunt maken. Je bouwt aan de tijdlijnen van anderen.', phase: 4 },
]

// ── Phase color helpers ──────────────────────────────────────────────

const phaseColors: Record<string, { dot: string; activeDot: string; line: string; badge: string; text: string }> = {
  rose: { dot: 'bg-rose-200', activeDot: 'bg-rose-500', line: 'bg-rose-200', badge: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-600' },
  blue: { dot: 'bg-blue-200', activeDot: 'bg-blue-500', line: 'bg-blue-200', badge: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-600' },
  teal: { dot: 'bg-teal-200', activeDot: 'bg-teal-500', line: 'bg-teal-200', badge: 'bg-teal-50 text-teal-700 border-teal-200', text: 'text-teal-600' },
  amber: { dot: 'bg-amber-200', activeDot: 'bg-amber-500', line: 'bg-amber-200', badge: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-600' },
}

// ── Level criteria & progress ────────────────────────────────────────

type LevelCriteria = {
  label: string
  criteria: string[]
  progress: (data: { netWorth: number; monthsCovered: number; freedomPct: number; hasConsumerDebt: boolean }) => number
}

const levelCriteriaMap: Record<number, LevelCriteria> = {
  [-2]: {
    label: 'Voorbij',
    criteria: ['Negatief vermogen', 'Actieve consumptieve schulden (creditcard, persoonlijke lening, etc.)'],
    progress: (d) => d.netWorth < 0 && d.hasConsumerDebt ? 100 : 0,
  },
  [-1]: {
    label: 'Voorbij',
    criteria: ['Negatief vermogen', 'Geen consumptieve schulden'],
    progress: (d) => d.netWorth < 0 && !d.hasConsumerDebt ? 100 : (d.netWorth >= 0 ? 0 : 0),
  },
  [0]: {
    label: 'Nulpunt bereikt',
    criteria: ['Vermogen \u2265 \u20AC0 (geen schulden meer)'],
    progress: (d) => {
      if (d.netWorth >= 0) return 100
      // Show how close to 0 — assume starting from worst observed
      return 0
    },
  },
  [1]: {
    label: '1 maand buffer',
    criteria: ['Minimaal 1 maand aan uitgaven als buffer opzij'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.monthsCovered) / 1) * 100)),
  },
  [2]: {
    label: '3\u20136 maanden noodfonds',
    criteria: ['Minimaal 3 maanden aan uitgaven als noodfonds'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.monthsCovered) / 3) * 100)),
  },
  [3]: {
    label: 'Groeiend vermogen',
    criteria: ['Minimaal 6 maanden buffer', 'Vrijheidspercentage \u2265 10%'],
    progress: (d) => {
      const bufferPct = Math.min(100, (Math.max(0, d.monthsCovered) / 6) * 100)
      const freedomPct = Math.min(100, (Math.max(0, d.freedomPct) / 10) * 100)
      return Math.round((bufferPct + freedomPct) / 2)
    },
  },
  [4]: {
    label: 'Coast FIRE',
    criteria: ['Vrijheidspercentage \u2265 25%'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.freedomPct) / 25) * 100)),
  },
  [5]: {
    label: 'Bijna onafhankelijk',
    criteria: ['Vrijheidspercentage \u2265 75%'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.freedomPct) / 75) * 100)),
  },
  [6]: {
    label: 'Volledige onafhankelijkheid',
    criteria: ['Vrijheidspercentage \u2265 100% (passief inkomen dekt alle uitgaven)'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.freedomPct) / 100) * 100)),
  },
}

// ── Component ────────────────────────────────────────────────────────

type HouseholdType = 'solo' | 'samen' | 'gezin'

export default function IdentityPage() {
  const router = useRouter()
  const supabase = createClient()

  // Profile state
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [country, setCountry] = useState('NL')
  const [householdType, setHouseholdType] = useState<HouseholdType>('solo')
  const [temporalBalance, setTemporalBalance] = useState(3)

  // Household profile state (NIBUD matching)
  const [numberOfChildren, setNumberOfChildren] = useState(0)
  const [childrenAges, setChildrenAges] = useState<number[]>([])
  const [housingType, setHousingType] = useState<string | null>(null)
  const [energyLabel, setEnergyLabel] = useState<string | null>(null)
  const [hasCar, setHasCar] = useState(false)
  const [netMonthlyIncome, setNetMonthlyIncome] = useState<string>('')
  const [childAgeInput, setChildAgeInput] = useState('')

  // Financial state for sovereignty level
  const [sovereigntyLevel, setSovereigntyLevel] = useState(0)
  const [financialData, setFinancialData] = useState({ netWorth: 0, monthsCovered: 0, freedomPct: 0, hasConsumerDebt: false })

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Load profile on mount
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
        setTemporalBalance(data.temporal_balance ?? 3)
        setNumberOfChildren(data.number_of_children ?? 0)
        setChildrenAges(data.children_ages ?? [])
        setHousingType(data.housing_type ?? null)
        setEnergyLabel(data.energy_label ?? null)
        setHasCar(data.has_car ?? false)
        setNetMonthlyIncome(data.net_monthly_income ? String(data.net_monthly_income) : '')
      }

      // Fetch financial data for sovereignty level calculation
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const dateStr = threeMonthsAgo.toISOString().split('T')[0]

      const [assetsRes, debtsRes, txRes] = await Promise.all([
        supabase.from('assets').select('current_value').eq('is_active', true),
        supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
        supabase.from('transactions').select('amount, is_income').gte('date', dateStr),
      ])

      const totalAssets = (assetsRes.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
      const debts = debtsRes.data ?? []
      const totalDebts = debts.reduce((s, d) => s + Number(d.current_balance), 0)
      const netWorth = totalAssets - totalDebts

      const expenses = (txRes.data ?? [])
        .filter(t => !t.is_income)
        .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
      const months = Math.max(1, 3)
      const monthlyExpenses = expenses / months
      const monthsCovered = monthlyExpenses > 0 ? netWorth / monthlyExpenses : 0

      const yearlyExpenses = monthlyExpenses * 12
      const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / 0.04 : 0
      const freedomPct = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0

      const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
      const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debt_type) && Number(d.current_balance) > 0)

      setSovereigntyLevel(computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, hasConsumerDebt))
      setFinancialData({ netWorth, monthsCovered, freedomPct, hasConsumerDebt })
      setLoading(false)
    }
    loadProfile()
  }, [supabase])

  // Save personal details
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
        temporal_balance: temporalBalance,
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
  }, [supabase, fullName, dateOfBirth, country, householdType, temporalBalance, numberOfChildren, childrenAges, housingType, energyLabel, hasCar, netMonthlyIncome])

  // Save temporal balance immediately on change
  const updateTemporalBalance = useCallback(async (value: number) => {
    setTemporalBalance(value)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        temporal_balance: value,
        updated_at: new Date().toISOString(),
      })
  }, [supabase])

  const activeLevel = temporalLevels[temporalBalance - 1]

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Page header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900">Identiteit</h1>
        <p className="mt-2 text-zinc-500">
          Wie ben je en hoe sta je in het leven? Deze instellingen vormen je persoonlijke profiel.
        </p>
      </div>

      {/* ── A. Persoonlijke Gegevens ─────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Persoonlijke Gegevens
        </h2>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Basisinformatie over jou en je huishouden.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Naam */}
          <div>
            <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Volledige naam
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Je naam"
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          {/* Geboortedatum */}
          <div>
            <label htmlFor="dob" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Geboortedatum
            </label>
            <input
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          {/* Land */}
          <div>
            <label htmlFor="country" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Land
            </label>
            <input
              id="country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="NL"
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          {/* Huishoudtype */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-zinc-700">
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
                      : 'border-zinc-300 bg-zinc-50 text-zinc-600 hover:border-zinc-400'
                  }`}
                >
                  {type === 'solo' ? 'Solo' : type === 'samen' ? 'Samen' : 'Gezin'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="mt-6 flex items-center gap-3">
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

      {/* ── A2. Huishoudprofiel (NIBUD matching) ─────────────────────── */}
      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Huishoudprofiel
        </h2>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Deze gegevens worden gebruikt voor je NIBUD Budget Gezondheidscheck.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Aantal kinderen */}
          <div>
            <label htmlFor="numChildren" className="mb-1.5 block text-sm font-medium text-zinc-700">
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
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          {/* Leeftijden kinderen */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              Leeftijden kinderen
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {childrenAges.map((age, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
                >
                  {age} jaar
                  <button
                    onClick={() => setChildrenAges(childrenAges.filter((_, idx) => idx !== i))}
                    className="ml-0.5 text-zinc-400 hover:text-zinc-600"
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
                  className="w-24 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
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
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
                >
                  Toevoegen
                </button>
              </div>
            )}
          </div>

          {/* Woningtype */}
          <div>
            <label htmlFor="housingType" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Woningtype
            </label>
            <select
              id="housingType"
              value={housingType ?? ''}
              onChange={(e) => setHousingType(e.target.value || null)}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Selecteer...</option>
              <option value="huur_sociaal">Huur (sociaal)</option>
              <option value="huur_vrij">Huur (vrije sector)</option>
              <option value="koop">Koopwoning</option>
            </select>
          </div>

          {/* Energielabel */}
          <div>
            <label htmlFor="energyLabel" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Energielabel
            </label>
            <select
              id="energyLabel"
              value={energyLabel ?? ''}
              onChange={(e) => setEnergyLabel(e.target.value || null)}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Selecteer...</option>
              {['A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map(label => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </div>

          {/* Auto */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-zinc-700">Auto</span>
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
                      : 'border-zinc-300 bg-zinc-50 text-zinc-600 hover:border-zinc-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Netto maandinkomen */}
          <div>
            <label htmlFor="netIncome" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Netto maandinkomen
              <span className="ml-1 text-xs font-normal text-zinc-400">(optioneel)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">&euro;</span>
              <input
                id="netIncome"
                type="number"
                min={0}
                step={50}
                value={netMonthlyIncome}
                onChange={(e) => setNetMonthlyIncome(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 py-2 pr-3 pl-7 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-400">
              Wordt gebruikt voor gepersonaliseerde NIBUD-berekeningen.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
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

      {/* ── B. The Temporal Balance ──────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          The Temporal Balance
        </h2>
        <p className="mt-1 mb-8 text-sm text-zinc-500">
          How much &lsquo;Now&rsquo; are you willing to trade for &lsquo;Later&rsquo;?
        </p>

        {/* Slider */}
        <div className="mb-8">
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={temporalBalance}
            onChange={(e) => updateTemporalBalance(Number(e.target.value))}
            className="w-full cursor-pointer accent-zinc-900"
          />
          <div className="mt-2 flex justify-between text-xs text-zinc-400">
            {temporalLevels.map((l) => (
              <span
                key={l.level}
                className={temporalBalance === l.level ? 'font-semibold text-zinc-900' : ''}
              >
                {l.icon}
              </span>
            ))}
          </div>
        </div>

        {/* Active level card */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5">
          <div className="flex items-start gap-4">
            <span className="text-4xl">{activeLevel.icon}</span>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">{activeLevel.name}</h3>
              <p className="text-sm font-medium text-zinc-500">{activeLevel.nameNl}</p>
              <p className="mt-1 text-sm font-semibold italic text-zinc-700">
                &ldquo;{activeLevel.tagline}&rdquo;
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                {activeLevel.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── C. The Chronology Scale ──────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          The Chronology Scale
        </h2>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Jouw positie op de reis naar financiele soevereiniteit.
        </p>

        {/* Progress overview bar */}
        <div className="mb-6 rounded-xl bg-zinc-50 p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>Lvl {chronologyLevels[0].level}: {chronologyLevels[0].name}</span>
            <span>Lvl {chronologyLevels[chronologyLevels.length - 1].level}: {chronologyLevels[chronologyLevels.length - 1].name}</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-200">
            {/* Phase segments */}
            {chronologyPhases.map((phase, pi) => {
              const levels = chronologyLevels.filter(l => l.phase === phase.phase)
              const startIdx = chronologyLevels.indexOf(levels[0])
              const endIdx = chronologyLevels.indexOf(levels[levels.length - 1])
              const total = chronologyLevels.length
              const step = total - 1
              // Extend segments to midpoints between phases so they're contiguous
              const left = pi === 0 ? 0 : ((startIdx - 0.5) / step) * 100
              const right = pi === chronologyPhases.length - 1 ? 100 : ((endIdx + 0.5) / step) * 100
              const activeIdx = chronologyLevels.findIndex(l => l.level === sovereigntyLevel)
              const isReached = activeIdx >= startIdx
              const colors = phaseColors[phase.color]
              return (
                <div
                  key={pi}
                  className={`absolute top-0 h-full transition-opacity ${isReached ? colors.activeDot : 'bg-zinc-300'}`}
                  style={{ left: `${left}%`, width: `${right - left}%`, opacity: isReached ? 1 : 0.3 }}
                />
              )
            })}
            {/* Current position indicator */}
            {(() => {
              const idx = chronologyLevels.findIndex(l => l.level === sovereigntyLevel)
              const pct = idx >= 0 ? (idx / (chronologyLevels.length - 1)) * 100 : 0
              return (
                <div
                  className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-900 shadow-md"
                  style={{ left: `${pct}%` }}
                />
              )
            })()}
          </div>
          <div className="mt-2 flex justify-between">
            {chronologyPhases.map((phase) => {
              const colors = phaseColors[phase.color]
              return (
                <span key={phase.phase} className={`text-[10px] font-medium ${colors.text}`}>
                  {phase.name}
                </span>
              )
            })}
          </div>
        </div>

        {/* Next milestone card */}
        {(() => {
          const nextLevel = chronologyLevels.find(l => l.level === sovereigntyLevel + 1)
          if (!nextLevel) return null
          const nextPhase = chronologyPhases.find(p => p.phase === nextLevel.phase)
          const colors = nextPhase ? phaseColors[nextPhase.color] : phaseColors.teal
          return (
            <div className={`mb-6 rounded-xl border p-4 ${colors.badge}`}>
              <p className="text-xs font-bold uppercase">Volgende mijlpaal</p>
              <p className="mt-1 text-sm font-semibold">
                Lvl {nextLevel.level}: {nextLevel.name}
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                Focus: {nextLevel.focus} &mdash; {nextLevel.metaphor}
              </p>
            </div>
          )
        })()}

        <div className="space-y-2">
          {chronologyPhases.map((phase) => {
            const levels = chronologyLevels.filter((l) => l.phase === phase.phase)
            const colors = phaseColors[phase.color]

            return (
              <div key={phase.phase}>
                {/* Phase header */}
                <div className="mb-3 flex items-center gap-2">
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${colors.badge}`}>
                    Phase {phase.phase}
                  </span>
                  <span className="text-sm font-semibold text-zinc-700">{phase.name}</span>
                  <span className="text-xs text-zinc-400">&mdash; {phase.subtitle}</span>
                </div>

                {/* Levels in this phase */}
                <div className="ml-3 border-l-2 border-zinc-100 pl-6 pb-6">
                  {levels.map((lvl) => {
                    const isActive = lvl.level === sovereigntyLevel
                    const isPast = lvl.level < sovereigntyLevel
                    const isFuture = lvl.level > sovereigntyLevel
                    const criteria = levelCriteriaMap[lvl.level]
                    const progressPct = isPast ? 100 : criteria ? criteria.progress(financialData) : 0

                    return (
                      <div
                        key={lvl.level}
                        className={`relative mb-4 last:mb-0 ${isFuture ? 'opacity-40' : ''}`}
                      >
                        {/* Dot on the timeline */}
                        <div
                          className={`absolute -left-[calc(1.5rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full ${
                            isActive ? colors.activeDot : isPast ? colors.dot : 'bg-zinc-200'
                          } ${isActive ? 'ring-4 ring-offset-1 ring-offset-white ring-' + phase.color + '-200' : ''}`}
                          style={isActive ? { boxShadow: `0 0 0 4px color-mix(in srgb, currentColor 20%, transparent)` } : {}}
                        />

                        <div className={`rounded-lg p-3 ${isActive ? 'bg-zinc-50 border border-zinc-200' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${isActive ? colors.text : 'text-zinc-400'}`}>
                              Lvl {lvl.level}
                            </span>
                            <span className={`text-sm font-semibold ${isActive ? 'text-zinc-900' : isPast ? 'text-zinc-700' : 'text-zinc-400'}`}>
                              {lvl.name}
                            </span>
                            {isActive && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${colors.badge}`}>
                                Huidige positie
                              </span>
                            )}
                            {/* Info tooltip */}
                            {criteria && (
                              <div className="group relative ml-auto shrink-0">
                                <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-zinc-300 text-[10px] font-bold text-zinc-400 transition-colors group-hover:border-zinc-500 group-hover:text-zinc-600">
                                  i
                                </div>
                                <div className="pointer-events-none absolute right-0 bottom-full z-20 mb-2 w-64 rounded-lg border border-zinc-200 bg-white p-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-700">
                                    {criteria.label}
                                  </p>
                                  <ul className="mb-2 space-y-0.5">
                                    {criteria.criteria.map((c, i) => (
                                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-500">
                                        <span className="mt-0.5 shrink-0">
                                          {progressPct >= 100 ? '\u2705' : '\u25CB'}
                                        </span>
                                        {c}
                                      </li>
                                    ))}
                                  </ul>
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          progressPct >= 100 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-amber-400' : 'bg-zinc-300'
                                        }`}
                                        style={{ width: `${Math.min(100, progressPct)}%` }}
                                      />
                                    </div>
                                    <span className={`text-[11px] font-bold ${
                                      progressPct >= 100 ? 'text-emerald-600' : 'text-zinc-500'
                                    }`}>
                                      {Math.min(100, progressPct)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <p className={`mt-0.5 text-xs ${isActive ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            <span className="font-medium">Focus:</span> {lvl.focus}
                          </p>
                          {(isActive || isPast) && (
                            <p className="mt-1 text-xs italic text-zinc-400">
                              {lvl.metaphor}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── D. Prestaties & Badges ───────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Prestaties & Badges
        </h2>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Verdien badges naarmate je groeit op je reis naar financiele vrijheid.
        </p>

        <div className="flex items-center gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-zinc-200 bg-zinc-50"
            >
              <svg className="h-6 w-6 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
              </svg>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-zinc-400">
          Badges worden binnenkort ontgrendeld.
        </p>
      </section>

      {/* ── E. Gegevens resetten ──────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-red-200 bg-white p-6 sm:p-8">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-red-400 uppercase">
          Gegevens Resetten
        </h2>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Wis al je financiele gegevens en doorloop de onboarding opnieuw.
          Dit verwijdert al je bankrekeningen, transacties, budgetten, doelen en overige data.
        </p>

        <button
          onClick={() => setShowResetDialog(true)}
          disabled={resetting}
          className="rounded-lg border border-red-300 bg-red-50 px-5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          {resetting ? 'Bezig met wissen...' : 'Alle gegevens wissen'}
        </button>
      </section>

      {/* Reset confirmation dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Weet je het zeker?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Dit wist <span className="font-semibold text-red-600">al je financiele data</span> permanent.
              Je wordt teruggeleid naar de onboarding om opnieuw te beginnen.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowResetDialog(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={async () => {
                  setShowResetDialog(false)
                  setResetting(true)
                  try {
                    const res = await fetch('/api/onboarding/reset', { method: 'POST' })
                    if (!res.ok) throw new Error('Reset failed')
                    router.push('/onboarding')
                  } catch {
                    setResetting(false)
                    setSaveMessage({ type: 'error', text: 'Reset mislukt. Probeer opnieuw.' })
                  }
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Alles wissen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
