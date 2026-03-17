'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PHASES, levelToPhaseId } from '@/lib/feature-phases'
import { ageAtDate } from '@/lib/horizon-data'
import { ChevronRight, BookOpen, Check } from 'lucide-react'
import {
  temporalLevels,
  chronologyPhases,
  chronologyLevels,
  phaseColors,
  levelCriteriaMap,
  featureIcons,
  getFeaturesPerPhase,
} from '@/lib/identity-constants'
import type { IdentityPageData } from '@/lib/identity-data-loader'

interface IdentityClientProps {
  initialData: IdentityPageData
}

export default function IdentityClient({ initialData }: IdentityClientProps) {
  const router = useRouter()
  const supabase = createClient()

  // Interactive state
  const [temporalBalance, setTemporalBalance] = useState(initialData.temporalBalance)
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null)
  const [showSwitchDialog, setShowSwitchDialog] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  // Static data from server
  const {
    fullName,
    dateOfBirth,
    householdType,
    isDemoUser,
    sovereigntyLevel,
    financialData,
    completedMonths,
  } = initialData

  const featuresPerPhase = getFeaturesPerPhase()

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

  const householdLabel = householdType === 'solo' ? 'Solo' : householdType === 'samen' ? 'Samen' : 'Gezin'
  const age = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const initials = fullName
    ? fullName.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '?'

  // Sovereignty level label
  const levelLabel = sovereigntyLevel <= 0
    ? 'Herstel'
    : sovereigntyLevel <= 2
    ? `Niveau ${sovereigntyLevel}: Stabiliteit`
    : sovereigntyLevel <= 4
    ? `Niveau ${sovereigntyLevel}: Momentum`
    : `Niveau ${sovereigntyLevel}: Meesterschap`

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Page header */}
      <div className="mb-5 sm:mb-8">
        <p className="label-editorial text-[var(--ink-3)] mb-1">Persoonlijk profiel</p>
        <h1 className="font-display text-[32px] font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.03em' }}>
          Identiteit &amp; Vrijheidspad
        </h1>
        <p className="mt-1 font-serif italic text-[13px] text-[var(--ink-3)]">
          Wie ben je en hoe sta je in het leven? Jouw positie op de reis naar vrijheid.
        </p>
      </div>

      {/* ── Demo user banner ──────────────────────────────────────── */}
      {isDemoUser && (
        <section className="mb-3 sm:mb-6 rounded-[var(--r-lg)] border-2 border-wil-200 bg-wil-50/50 p-4 sm:p-6">
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

      {/* ── Profielsamenvatting strip ─────────────────────────────── */}
      <Link href="/identity/profiel" className="group mb-5 sm:mb-8 block card-editorial p-4 transition-all hover:border-wil-300 hover:shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Avatar initiaal cirkel */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-sm font-semibold text-[var(--paper)]">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {fullName || 'Geen naam'}
                {age !== null && <span className="ml-1.5 font-normal text-[var(--ink-3)]">&middot; {age} jaar</span>}
                <span className="ml-1.5 font-normal text-[var(--ink-3)]">&middot; {householdLabel}</span>
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">{levelLabel}</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-colors group-hover:text-wil-500" />
        </div>
      </Link>

      {/* ── Gids link-kaart ──────────────────────────────────────── */}
      <Link
        href="/identity/gids"
        className="group mb-5 sm:mb-8 flex items-center gap-3 card-editorial p-4 transition-colors hover:bg-[var(--subtle)]/50"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] border border-[var(--border-ed)]">
          <BookOpen className="h-4 w-4 text-[var(--ink-2)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">Hoe werkt TriFinity?</p>
          <p className="text-[12px] text-[var(--ink-3)]">Bekijk de interactieve gids</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-colors group-hover:text-wil-500" />
      </Link>

      {/* ── Check-in tijdlijn ─────────────────────────────────────── */}
      <CheckinTimeline completedMonths={completedMonths} />

      {/* ── The Temporal Balance ──────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 card-editorial p-4 sm:p-8">
        <p className="label-editorial text-[var(--ink-3)] mb-1">Temporeel evenwicht</p>
        <h2 className="font-display text-xl font-bold text-[var(--ink)] mb-1" style={{ letterSpacing: '-0.02em' }}>
          Hoeveel &lsquo;Nu&rsquo; ruil je in voor &lsquo;Later&rsquo;?
        </h2>
        <p className="mb-5 sm:mb-8 font-serif italic text-[13px] text-[var(--ink-3)]">
          Jouw persoonlijke balans tussen genieten van het heden en bouwen aan de toekomst.
        </p>

        {/* Slider */}
        <div className="mb-5 sm:mb-8">
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={temporalBalance}
            onChange={(e) => updateTemporalBalance(Number(e.target.value))}
            className="w-full cursor-pointer accent-[var(--ink)]"
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
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-5">
          <div className="flex items-start gap-4">
            <span className="text-4xl">{activeLevel.icon}</span>
            <div>
              <h3 className="font-display text-lg font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.02em' }}>
                {activeLevel.nameNl}
              </h3>
              <p className="text-xs label-editorial text-[var(--ink-3)] mt-0.5">{activeLevel.name}</p>
              <p className="mt-2 font-serif italic text-sm text-[var(--ink-2)] leading-relaxed border-l-2 border-[var(--border-md)] pl-3">
                &ldquo;{activeLevel.tagline}&rdquo;
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                {activeLevel.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Chronologische Schaal ─────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 card-editorial p-4 sm:p-8">
        <p className="label-editorial text-[var(--ink-3)] mb-1">Vrijheidsreis</p>
        <h2 className="font-display text-xl font-bold text-[var(--ink)] mb-1" style={{ letterSpacing: '-0.02em' }}>
          Chronologische Schaal
        </h2>
        <p className="mb-5 sm:mb-6 font-serif italic text-[13px] text-[var(--ink-3)]">
          Elk niveau vertegenwoordigt een stap dichter bij volledige tijdsoevereiniteit.
        </p>

        {/* Progress overview bar */}
        <div className="mb-4 sm:mb-6 rounded-[var(--r-lg)] bg-[var(--subtle)] border border-[var(--border-ed)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-mono text-[var(--ink-3)]">Lvl {chronologyLevels[0].level}: {chronologyLevels[0].name}</span>
            <span className="text-[11px] font-mono text-[var(--ink-3)]">Lvl {chronologyLevels[chronologyLevels.length - 1].level}: {chronologyLevels[chronologyLevels.length - 1].name}</span>
          </div>
          <div className="relative h-[5px] w-full overflow-visible rounded-full bg-[var(--border-ed)]">
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
                  className={`absolute top-0 h-full ${isReached ? colors.activeDot : 'bg-[var(--border-ed)]'}`}
                  style={{ left: `${left}%`, width: `${right - left}%`, opacity: isReached ? 1 : 0.4 }}
                />
              )
            })}
            {(() => {
              const idx = chronologyLevels.findIndex(l => l.level === sovereigntyLevel)
              const pct = idx >= 0 ? (idx / (chronologyLevels.length - 1)) * 100 : 0
              return (
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--paper)] bg-[var(--ink)] shadow-md"
                  style={{ left: `${pct}%` }}
                />
              )
            })()}
          </div>
          <div className="mt-2.5 flex justify-between">
            {chronologyPhases.map((phase) => {
              const colors = phaseColors[phase.color]
              return (
                <span key={phase.phase} style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }} className={colors.text}>
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
          const colors = nextPhase ? phaseColors[nextPhase.color] : phaseColors.wil
          return (
            <div className={`mb-4 sm:mb-6 rounded-[var(--r-lg)] border p-4 ${colors.badge}`}>
              <p className="label-editorial mb-1">Volgende mijlpaal</p>
              <p className="font-display font-bold text-[var(--ink)]" style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>
                Niveau {nextLevel.level}: {nextLevel.name}
              </p>
              <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
                Focus: {nextLevel.focus} — {nextLevel.metaphor}
              </p>
            </div>
          )
        })()}

        <div className="space-y-2" data-testid="chronology-phases">
          {chronologyPhases.map((phase) => {
            const levels = chronologyLevels.filter((l) => l.phase === phase.phase)
            const colors = phaseColors[phase.color]
            const phaseId = PHASES[phase.phase - 1]?.id ?? ''
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
                  <span className={`inline-flex rounded-[var(--r-sm)] border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${colors.badge}`}>
                    Fase {phase.phase}
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
                      {isPhaseUnlocked ? (
                        <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-200">
                          ✓ Beschikbaar
                        </span>
                      ) : (
                        <span className="ml-1 inline-flex items-center rounded-[var(--r-sm)] bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-3)] border border-[var(--border-ed)]">
                          Vergrendeld
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
                            className={`group relative inline-flex items-center gap-1 rounded-[var(--r-sm)] px-2 py-0.5 text-[11px] font-medium border transition-all ${
                              isPhaseUnlocked
                                ? `${colors.badge} opacity-100`
                                : 'bg-[var(--subtle)] text-[var(--ink-3)] border-[var(--border-ed)] opacity-60'
                            }`}
                            data-testid={`feature-pill-${feature.id}`}
                            data-unlocked={isPhaseUnlocked ? 'true' : 'false'}
                          >
                            <span className="text-xs">{icon}</span>
                            <span className="hidden sm:inline">{feature.label}</span>
                            <div className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 w-48 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-2 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                              <p className="text-[11px] font-semibold text-[var(--ink-2)]">{feature.label}</p>
                              <p className="text-[10px] text-[var(--ink-3)]">{feature.description}</p>
                              {isPhaseUnlocked ? (
                                <p className="mt-1 text-[10px] font-semibold text-emerald-600">✓ Ontgrendeld</p>
                              ) : (
                                <p className="mt-1 text-[10px] font-semibold text-[var(--ink-3)]">Beschikbaar vanaf {phase.name}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Expanded feature list */}
                    {isPhaseExpanded && (
                      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3 mb-2" data-testid={`feature-list-${phaseId}`}>
                        <p className="label-editorial text-[var(--ink-3)] mb-2">
                          Features in {phase.name}
                        </p>
                        <div className="space-y-1.5">
                          {phaseFeatures.map((feature) => {
                            const icon = featureIcons[feature.id] ?? '\u26A1'
                            return (
                              <div
                                key={feature.id}
                                className={`flex items-start gap-2 rounded-[var(--r)] p-1.5 ${isPhaseUnlocked ? '' : 'opacity-50'}`}
                                data-testid={`feature-detail-${feature.id}`}
                              >
                                <span className="text-sm shrink-0 mt-0.5">{icon}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-[var(--ink-2)]">{feature.label}</span>
                                    {isPhaseUnlocked ? (
                                      <span className="text-[10px] text-emerald-600 font-medium">✓</span>
                                    ) : (
                                      <span className="text-[10px] text-[var(--ink-3)]">—</span>
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
                            isActive ? colors.activeDot : isPast ? colors.dot : 'bg-[var(--border-md)]'
                          }`}
                          style={isActive ? { boxShadow: `0 0 0 3px var(--paper), 0 0 0 5px currentColor` } : {}}
                        />

                        <div className={`rounded-[var(--r-lg)] p-3 ${isActive ? 'bg-[var(--subtle)] border border-[var(--border-ed)]' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-mono font-bold ${isActive ? colors.text : 'text-[var(--ink-3)]'}`}>
                              Niv. {lvl.level}
                            </span>
                            <span className={`text-sm font-semibold ${isActive ? 'text-[var(--ink)]' : isPast ? 'text-[var(--ink-2)]' : 'text-[var(--ink-3)]'}`}>
                              {lvl.name}
                            </span>
                            {isActive && (
                              <span className={`rounded-[var(--r-sm)] px-2 py-0.5 text-[10px] font-bold uppercase border ${colors.badge}`}>
                                Huidige positie
                              </span>
                            )}
                            {criteria && (
                              <div className="group relative ml-auto shrink-0">
                                <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[var(--border-md)] text-[10px] font-bold text-[var(--ink-3)] transition-colors group-hover:border-[var(--ink-2)] group-hover:text-[var(--ink-2)]">
                                  i
                                </div>
                                <div className="pointer-events-none absolute right-0 bottom-full z-20 mb-2 w-64 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                                  <p className="mb-1.5 text-[11px] font-semibold text-[var(--ink-2)]">
                                    {criteria.label}
                                  </p>
                                  <ul className="mb-2 space-y-0.5">
                                    {criteria.criteria.map((c, i) => (
                                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--ink-3)]">
                                        <span className="mt-0.5 shrink-0">
                                          {progressPct >= 100 ? '✓' : '○'}
                                        </span>
                                        {c}
                                      </li>
                                    ))}
                                  </ul>
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          progressPct >= 100 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-horizon-400' : 'bg-[var(--border-md)]'
                                        }`}
                                        style={{ width: `${Math.min(100, progressPct)}%` }}
                                      />
                                    </div>
                                    <span className={`text-[11px] font-mono font-bold tabular-nums ${
                                      progressPct >= 100 ? 'text-emerald-600' : 'text-[var(--ink-3)]'
                                    }`}>
                                      {Math.min(100, progressPct)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                            <span className="font-medium">Focus:</span> {lvl.focus}
                          </p>
                          {(isActive || isPast) && (
                            <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
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

/* ── CheckinTimeline ─────────────────────────────────────────────────── */
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

function CheckinTimeline({ completedMonths }: { completedMonths: string[] }) {
  const now = new Date()
  const year = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed
  const currentMonthKey = `${year}-${String(currentMonth + 1).padStart(2, '0')}`

  return (
    <section className="mb-5 sm:mb-8 card-editorial p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="label-editorial text-[var(--ink-3)]">Geldcheck-ins {year}</p>
        <Link
          href="/core/checkin/historie"
          className="text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
        >
          Alle bekijken
        </Link>
      </div>
      <div className="flex justify-between">
        {Array.from({ length: 12 }, (_, i) => {
          const monthKey = `${year}-${String(i + 1).padStart(2, '0')}`
          const isCompleted = completedMonths.includes(monthKey)
          const isCurrent = monthKey === currentMonthKey
          const isFuture = i > currentMonth

          let href: string | null = null
          if (isCompleted) {
            href = `/core/checkin?month=${monthKey}&from=/identity`
          } else if (isCurrent) {
            href = '/core/checkin?from=/identity'
          }

          const circle = (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-mono text-[var(--ink-3)]">{MONTH_LETTERS[i]}</span>
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  isCompleted
                    ? 'bg-kern-500 text-white'
                    : isCurrent
                    ? 'ring-2 ring-kern-400 bg-transparent'
                    : 'bg-[var(--subtle)]'
                } ${href ? 'cursor-pointer' : ''}`}
              >
                {isCompleted && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                {isCurrent && !isCompleted && (
                  <div className="h-2 w-2 rounded-full bg-kern-400" />
                )}
              </div>
            </div>
          )

          if (href) {
            return (
              <Link key={monthKey} href={href} className="hover:opacity-80 transition-opacity">
                {circle}
              </Link>
            )
          }

          return (
            <div key={monthKey} className={isFuture ? 'opacity-30' : 'opacity-50'}>
              {circle}
            </div>
          )
        })}
      </div>
    </section>
  )
}
