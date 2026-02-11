'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

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

// Hardcoded current sovereignty level (later computed from financial data)
const CURRENT_SOVEREIGNTY_LEVEL = 1

// ── Phase color helpers ──────────────────────────────────────────────

const phaseColors: Record<string, { dot: string; activeDot: string; line: string; badge: string; text: string }> = {
  rose: { dot: 'bg-rose-200', activeDot: 'bg-rose-500', line: 'bg-rose-200', badge: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-600' },
  blue: { dot: 'bg-blue-200', activeDot: 'bg-blue-500', line: 'bg-blue-200', badge: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-600' },
  teal: { dot: 'bg-teal-200', activeDot: 'bg-teal-500', line: 'bg-teal-200', badge: 'bg-teal-50 text-teal-700 border-teal-200', text: 'text-teal-600' },
  amber: { dot: 'bg-amber-200', activeDot: 'bg-amber-500', line: 'bg-amber-200', badge: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-600' },
}

// ── Component ────────────────────────────────────────────────────────

type HouseholdType = 'solo' | 'samen' | 'gezin'

export default function IdentityPage() {
  const supabase = createClient()

  // Profile state
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [country, setCountry] = useState('NL')
  const [householdType, setHouseholdType] = useState<HouseholdType>('solo')
  const [temporalBalance, setTemporalBalance] = useState(3)

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
      }
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
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setSaveMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    } else {
      setSaveMessage({ type: 'success', text: 'Opgeslagen!' })
      setTimeout(() => setSaveMessage(null), 3000)
    }
    setSaving(false)
  }, [supabase, fullName, dateOfBirth, country, householdType, temporalBalance])

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
        <p className="mt-1 mb-8 text-sm text-zinc-500">
          Jouw positie op de reis naar financiele soevereiniteit.
        </p>

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
                    const isActive = lvl.level === CURRENT_SOVEREIGNTY_LEVEL
                    const isPast = lvl.level < CURRENT_SOVEREIGNTY_LEVEL
                    const isFuture = lvl.level > CURRENT_SOVEREIGNTY_LEVEL

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
                          <div className="flex items-baseline gap-2">
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
    </div>
  )
}
