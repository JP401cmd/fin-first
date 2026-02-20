'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { computeSovereigntyLevel, PHASES, levelToPhaseId } from '@/lib/feature-phases'
import { ChevronRight, User, Trophy, Share2, Settings } from 'lucide-react'
import {
  temporalLevels,
  chronologyPhases,
  chronologyLevels,
  phaseColors,
  levelCriteriaMap,
  featureIcons,
  getFeaturesPerPhase,
} from '@/lib/identity-constants'

export default function IdentityPage() {
  const router = useRouter()
  const supabase = createClient()

  // Profile state (minimal for overview)
  const [fullName, setFullName] = useState('')
  const [householdType, setHouseholdType] = useState('solo')
  const [temporalBalance, setTemporalBalance] = useState(3)

  // Financial state for sovereignty level
  const [sovereigntyLevel, setSovereigntyLevel] = useState(0)
  const [financialData, setFinancialData] = useState({ netWorth: 0, monthsCovered: 0, freedomPct: 0, hasConsumerDebt: false })

  // Feature roadmap
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null)
  const featuresPerPhase = getFeaturesPerPhase()

  // Preview card data
  const [badgeCount, setBadgeCount] = useState(0)
  const [activeNotifCount, setActiveNotifCount] = useState(0)

  // Demo user state
  const [isDemoUser, setIsDemoUser] = useState(false)
  const [showSwitchDialog, setShowSwitchDialog] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Profile data
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, household_type, temporal_balance, is_demo_user')
        .eq('id', user.id)
        .single()

      if (profile) {
        setFullName(profile.full_name ?? '')
        setHouseholdType(profile.household_type ?? 'solo')
        setTemporalBalance(profile.temporal_balance ?? 3)
        setIsDemoUser(profile.is_demo_user ?? false)
      }

      // Financial data for sovereignty level
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const dateStr = threeMonthsAgo.toISOString().split('T')[0]

      const [assetsRes, debtsRes, txRes, badgesRes, notifRes] = await Promise.all([
        supabase.from('assets').select('current_value').eq('is_active', true),
        supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
        supabase.from('transactions').select('amount, is_income').gte('date', dateStr),
        supabase.from('user_badges').select('id', { count: 'exact', head: true }),
        supabase.from('app_settings').select('value').eq('key', `notifications_preferences_${user.id}`).maybeSingle(),
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

      // Badge count
      setBadgeCount(badgesRes.count ?? 0)

      // Notification prefs count
      if (notifRes.data?.value) {
        try {
          const parsed = JSON.parse(notifRes.data.value)
          const active = Object.values(parsed).filter(v => v !== false).length
          setActiveNotifCount(active)
        } catch {
          setActiveNotifCount(7)
        }
      } else {
        setActiveNotifCount(7)
      }

      setLoading(false)
    }
    loadData()
  }, [supabase])

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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
        </div>
      </div>
    )
  }

  const householdLabel = householdType === 'solo' ? 'Solo' : householdType === 'samen' ? 'Samen' : 'Gezin'

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Page header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-[var(--ink)]">Identiteit</h1>
        <p className="mt-2 text-[var(--ink-3)]">
          Wie ben je en hoe sta je in het leven? Jouw positie op de reis naar vrijheid.
        </p>
      </div>

      {/* ── Demo user banner ──────────────────────────────────────── */}
      {isDemoUser && (
        <section className="mb-6 rounded-[var(--r-lg)] border-2 border-wil-200 bg-wil-50/50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wil-100">
              <svg className="h-5 w-5 text-wil-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-wil-800">
                Je verkent de app met voorbeelddata
              </h3>
              <p className="mt-1 text-sm text-wil-700">
                Klaar om je eigen gegevens in te voeren? Je demo data wordt gewist en je doorloopt de onboarding met je eigen informatie.
              </p>
              <button
                onClick={() => setShowSwitchDialog(true)}
                disabled={switching}
                className="mt-3 rounded-lg bg-wil-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-700 disabled:opacity-50"
              >
                {switching ? 'Bezig...' : 'Eigen data invoeren'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Switch from demo dialog */}
      {showSwitchDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Overstappen naar eigen data?</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Alle demo data wordt gewist. Je doorloopt de onboarding opnieuw met je eigen informatie.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowSwitchDialog(false)}
                className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={async () => {
                  setShowSwitchDialog(false)
                  setSwitching(true)
                  try {
                    const res = await fetch('/api/onboarding/reset', { method: 'POST' })
                    if (!res.ok) throw new Error('Reset failed')
                    router.push('/onboarding')
                  } catch {
                    setSwitching(false)
                    setSwitchError('Overstappen mislukt. Probeer opnieuw.')
                  }
                }}
                className="rounded-lg bg-wil-600 px-4 py-2 text-sm font-medium text-white hover:bg-wil-700 transition-colors"
              >
                Overstappen
              </button>
            </div>
          </div>
        </div>
      )}

      {switchError && (
        <p className="mb-4 text-sm text-red-600">{switchError}</p>
      )}

      {/* ── Preview-kaarten ──────────────────────────────────────── */}
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/identity/profiel"
          className="group rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 transition-all hover:border-wil-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-wil-50">
                <User className="h-4 w-4 text-wil-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Profiel</h3>
                <p className="text-xs text-[var(--ink-3)]">
                  {fullName || 'Geen naam'} &middot; {householdLabel}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-wil-500" />
          </div>
        </Link>

        <Link
          href="/identity/voortgang"
          className="group rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 transition-all hover:border-wil-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-wil-50">
                <Trophy className="h-4 w-4 text-wil-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Voortgang</h3>
                <p className="text-xs text-[var(--ink-3)]">
                  {badgeCount} badge{badgeCount !== 1 ? 's' : ''} behaald
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-wil-500" />
          </div>
        </Link>

        <Link
          href="/identity/delen"
          className="group rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 transition-all hover:border-wil-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-wil-50">
                <Share2 className="h-4 w-4 text-wil-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Delen</h3>
                <p className="text-xs text-[var(--ink-3)]">
                  Vrijheidskaart & Jaaroverzicht
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-wil-500" />
          </div>
        </Link>

        <Link
          href="/identity/instellingen"
          className="group rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 transition-all hover:border-wil-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-wil-50">
                <Settings className="h-4 w-4 text-wil-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Instellingen</h3>
                <p className="text-xs text-[var(--ink-3)]">
                  {activeNotifCount} van 7 notificaties actief
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-wil-500" />
          </div>
        </Link>
      </div>

      {/* ── The Temporal Balance ──────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          The Temporal Balance
        </h2>
        <p className="mt-1 mb-8 text-sm text-[var(--ink-3)]">
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
          <div className="mt-2 flex justify-between text-xs text-[var(--ink-3)]">
            {temporalLevels.map((l) => (
              <span
                key={l.level}
                className={temporalBalance === l.level ? 'font-semibold text-[var(--ink)]' : ''}
              >
                {l.icon}
              </span>
            ))}
          </div>
        </div>

        {/* Active level card */}
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-5">
          <div className="flex items-start gap-4">
            <span className="text-4xl">{activeLevel.icon}</span>
            <div>
              <h3 className="text-lg font-bold text-[var(--ink)]">{activeLevel.name}</h3>
              <p className="text-sm font-medium text-[var(--ink-3)]">{activeLevel.nameNl}</p>
              <p className="mt-1 text-sm font-semibold italic text-[var(--ink-2)]">
                &ldquo;{activeLevel.tagline}&rdquo;
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                {activeLevel.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Chronology Scale ──────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          The Chronology Scale
        </h2>
        <p className="mt-1 mb-6 text-sm text-[var(--ink-3)]">
          Jouw positie op de reis naar financiele soevereiniteit.
        </p>

        {/* Progress overview bar */}
        <div className="mb-6 rounded-xl bg-[var(--subtle)] p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-[var(--ink-3)]">
            <span>Lvl {chronologyLevels[0].level}: {chronologyLevels[0].name}</span>
            <span>Lvl {chronologyLevels[chronologyLevels.length - 1].level}: {chronologyLevels[chronologyLevels.length - 1].name}</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-200">
            {chronologyPhases.map((phase, pi) => {
              const levels = chronologyLevels.filter(l => l.phase === phase.phase)
              const startIdx = chronologyLevels.indexOf(levels[0])
              const endIdx = chronologyLevels.indexOf(levels[levels.length - 1])
              const step = chronologyLevels.length - 1
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
            <div className={`mb-6 rounded-[var(--r-lg)] border p-4 ${colors.badge}`}>
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

        <div className="space-y-2" data-testid="chronology-phases">
          {chronologyPhases.map((phase) => {
            const levels = chronologyLevels.filter((l) => l.phase === phase.phase)
            const colors = phaseColors[phase.color]
            const phaseId = PHASES.find(p => p.color === phase.color)?.id ?? ''
            const phaseFeatures = featuresPerPhase[phaseId] ?? []
            const currentPhaseId = levelToPhaseId(sovereigntyLevel)
            const currentPhaseIdx = PHASES.findIndex(p => p.id === currentPhaseId)
            const thisPhaseIdx = PHASES.findIndex(p => p.id === phaseId)
            const isPhaseUnlocked = thisPhaseIdx <= currentPhaseIdx
            const isPhaseExpanded = expandedPhase === phaseId

            return (
              <div key={phase.phase} data-testid={`phase-${phaseId}`}>
                {/* Phase header */}
                <div className="mb-3 flex items-center gap-2">
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${colors.badge}`}>
                    Phase {phase.phase}
                  </span>
                  <span className="text-sm font-semibold text-[var(--ink-2)]">{phase.name}</span>
                  <span className="text-xs text-[var(--ink-3)]">&mdash; {phase.subtitle}</span>
                </div>

                {/* Feature roadmap icons for this phase */}
                {phaseFeatures.length > 0 && (
                  <div className="mb-3 ml-3" data-testid={`feature-roadmap-${phaseId}`}>
                    <button
                      onClick={() => setExpandedPhase(isPhaseExpanded ? null : phaseId)}
                      className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
                      data-testid={`feature-roadmap-toggle-${phaseId}`}
                    >
                      <span className="text-xs">{isPhaseExpanded ? '\u25BC' : '\u25B6'}</span>
                      <span>{phaseFeatures.length} feature{phaseFeatures.length !== 1 ? 's' : ''} worden ontgrendeld</span>
                      {isPhaseUnlocked && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-200">
                          \u2713 Beschikbaar
                        </span>
                      )}
                      {!isPhaseUnlocked && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-3)] border border-[var(--border-ed)]">
                          \uD83D\uDD12 Vergrendeld
                        </span>
                      )}
                    </button>

                    {/* Feature icon pills */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {phaseFeatures.map((feature) => {
                        const icon = featureIcons[feature.id] ?? '\u26A1'
                        return (
                          <div
                            key={feature.id}
                            className={`group relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-all ${
                              isPhaseUnlocked
                                ? `${colors.badge} opacity-100`
                                : 'bg-[var(--subtle)] text-[var(--ink-3)] border-[var(--border-ed)] opacity-60'
                            }`}
                            data-testid={`feature-pill-${feature.id}`}
                            data-unlocked={isPhaseUnlocked ? 'true' : 'false'}
                          >
                            <span className="text-xs">{icon}</span>
                            <span className="hidden sm:inline">{feature.label}</span>
                            {!isPhaseUnlocked && <span className="text-[9px] ml-0.5">\uD83D\uDD12</span>}
                            <div className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 w-48 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-2 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                              <p className="text-[11px] font-semibold text-[var(--ink-2)]">{feature.label}</p>
                              <p className="text-[10px] text-[var(--ink-3)]">{feature.description}</p>
                              {isPhaseUnlocked ? (
                                <p className="mt-1 text-[10px] font-semibold text-emerald-600">\u2713 Ontgrendeld</p>
                              ) : (
                                <p className="mt-1 text-[10px] font-semibold text-[var(--ink-3)]">\uD83D\uDD12 Beschikbaar vanaf {phase.name}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Expanded feature list */}
                    {isPhaseExpanded && (
                      <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 p-3 mb-2" data-testid={`feature-list-${phaseId}`}>
                        <p className="mb-2 text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wide">
                          Features in {phase.name}
                        </p>
                        <div className="space-y-1.5">
                          {phaseFeatures.map((feature) => {
                            const icon = featureIcons[feature.id] ?? '\u26A1'
                            return (
                              <div
                                key={feature.id}
                                className={`flex items-start gap-2 rounded-md p-1.5 ${
                                  isPhaseUnlocked ? '' : 'opacity-50'
                                }`}
                                data-testid={`feature-detail-${feature.id}`}
                              >
                                <span className="text-sm shrink-0 mt-0.5">{icon}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-[var(--ink-2)]">{feature.label}</span>
                                    {isPhaseUnlocked ? (
                                      <span className="text-[10px] text-emerald-600 font-medium">\u2713</span>
                                    ) : (
                                      <span className="text-[10px] text-[var(--ink-3)]">\uD83D\uDD12</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-[var(--ink-3)] leading-snug">{feature.description}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Levels in this phase */}
                <div className="ml-3 border-l-2 border-[var(--border-ed)] pl-6 pb-6">
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
                        <div
                          className={`absolute -left-[calc(1.5rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full ${
                            isActive ? colors.activeDot : isPast ? colors.dot : 'bg-zinc-200'
                          } ${isActive ? 'ring-4 ring-offset-1 ring-offset-white ring-' + phase.color + '-200' : ''}`}
                          style={isActive ? { boxShadow: `0 0 0 4px color-mix(in srgb, currentColor 20%, transparent)` } : {}}
                        />

                        <div className={`rounded-lg p-3 ${isActive ? 'bg-[var(--subtle)] border border-[var(--border-ed)]' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${isActive ? colors.text : 'text-[var(--ink-3)]'}`}>
                              Lvl {lvl.level}
                            </span>
                            <span className={`text-sm font-semibold ${isActive ? 'text-[var(--ink)]' : isPast ? 'text-[var(--ink-2)]' : 'text-[var(--ink-3)]'}`}>
                              {lvl.name}
                            </span>
                            {isActive && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${colors.badge}`}>
                                Huidige positie
                              </span>
                            )}
                            {criteria && (
                              <div className="group relative ml-auto shrink-0">
                                <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[var(--border-md)] text-[10px] font-bold text-[var(--ink-3)] transition-colors group-hover:border-zinc-500 group-hover:text-[var(--ink-2)]">
                                  i
                                </div>
                                <div className="pointer-events-none absolute right-0 bottom-full z-20 mb-2 w-64 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                                  <p className="mb-1.5 text-[11px] font-semibold text-[var(--ink-2)]">
                                    {criteria.label}
                                  </p>
                                  <ul className="mb-2 space-y-0.5">
                                    {criteria.criteria.map((c, i) => (
                                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--ink-3)]">
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
                                      progressPct >= 100 ? 'text-emerald-600' : 'text-[var(--ink-3)]'
                                    }`}>
                                      {Math.min(100, progressPct)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <p className={`mt-0.5 text-xs ${isActive ? 'text-[var(--ink-3)]' : 'text-[var(--ink-3)]'}`}>
                            <span className="font-medium">Focus:</span> {lvl.focus}
                          </p>
                          {(isActive || isPast) && (
                            <p className="mt-1 text-xs italic text-[var(--ink-3)]">
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

    </div>
  )
}
