'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PERSONAS, PERSONA_KEYS, type PersonaKey, type PersonaMeta } from '@/lib/test-personas'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { PHASES } from '@/lib/feature-phases'
import { useMobilePreview, DEVICE_PRESETS } from '@/components/app/beheer/mobile-preview-provider'

const TABLE_LABELS: Record<string, string> = {
  profiles: 'Profiel',
  bank_accounts: 'Bankrekeningen',
  assets: 'Bezittingen',
  debts: 'Schulden',
  budgets: 'Budgetten',
  transactions: 'Transacties',
  goals: 'Doelen',
  life_events: 'Levensgebeurtenissen',
  recommendations: 'Aanbevelingen',
  actions: 'Acties',
  net_worth_snapshots: 'Vermogenssnapshots',
}

interface SeedStep {
  step: string
  progress: number
  table: string
  action: 'delete' | 'insert' | 'update'
  count?: number
}

interface SeedSummary {
  done: true
  summary: Record<string, number>
}

type SeedEvent = SeedStep | SeedSummary | { error: string }

export default function BeheerTestdataPage() {
  const router = useRouter()
  const featureAccess = useFeatureAccess()
  const mobilePreview = useMobilePreview()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Phase transition test state
  const [simulatingPhase, setSimulatingPhase] = useState(false)

  // Seed state
  const [seeding, setSeeding] = useState(false)
  const [seedProgress, setSeedProgress] = useState(0)
  const [seedStep, setSeedStep] = useState('')
  const [seedSteps, setSeedSteps] = useState<SeedStep[]>([])
  const [seedSummary, setSeedSummary] = useState<Record<string, number> | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [confirmPersona, setConfirmPersona] = useState<PersonaKey | null>(null)
  const [showOnboardingConfirm, setShowOnboardingConfirm] = useState(false)
  const [resettingOnboarding, setResettingOnboarding] = useState(false)

  async function handleSeed(personaKey: PersonaKey) {
    setConfirmPersona(null)
    setSeeding(true)
    setSeedProgress(0)
    setSeedStep('Starten...')
    setSeedSteps([])
    setSeedSummary(null)
    setSeedError(null)

    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: personaKey }),
      })

      if (!res.ok || !res.body) {
        throw new Error('Seed request mislukt')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          const event: SeedEvent = JSON.parse(line)

          if ('error' in event) {
            setSeedError(event.error)
            setSeeding(false)
            return
          }

          if ('done' in event && event.done) {
            setSeedSummary(event.summary)
            setSeedProgress(100)
            setSeedStep('Klaar!')
            setSeeding(false)
            return
          }

          if ('step' in event && 'progress' in event) {
            setSeedProgress(event.progress)
            setSeedStep(event.step)
            setSeedSteps((prev) => [...prev, event as SeedStep])
          }
        }
      }
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Testdata Personas */}
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-zinc-900">Testdata laden</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Selecteer een persona om de applicatie te vullen met testdata. Dit wist alle huidige data.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PERSONA_KEYS.map((key) => {
            const meta = PERSONAS[key].meta
            return (
              <PersonaCard
                key={key}
                personaKey={key}
                meta={meta}
                disabled={seeding}
                onSelect={() => setConfirmPersona(key)}
              />
            )
          })}
        </div>

        {/* Confirmation dialog */}
        {confirmPersona && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-zinc-900">Bevestiging</h3>
              <p className="mt-2 text-sm text-zinc-600">
                Dit wist <span className="font-semibold text-red-600">AL</span> je huidige financiele data en vervangt het met de gegevens van{' '}
                <span className="font-semibold">{PERSONAS[confirmPersona].meta.name}</span>. Doorgaan?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setConfirmPersona(null)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  onClick={() => handleSeed(confirmPersona)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                >
                  Bevestigen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {(seeding || seedSummary || seedError) && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">
                {seeding ? 'Bezig met laden...' : seedError ? 'Fout opgetreden' : 'Voltooid'}
              </span>
              <span className="text-sm text-zinc-500">{seedProgress}%</span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  seedError ? 'bg-red-500' : seedProgress === 100 ? 'bg-green-500' : 'bg-amber-500'
                }`}
                style={{ width: `${seedProgress}%` }}
              />
            </div>

            <p className="mt-2 text-sm text-zinc-500">{seedStep}</p>

            {seedError && (
              <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
                {seedError}
              </div>
            )}

            {seedSummary && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold text-zinc-700">Samenvatting</h4>
                <div className="overflow-hidden rounded-lg border border-zinc-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50">
                        <th className="px-3 py-2 text-left font-medium text-zinc-600">Tabel</th>
                        <th className="px-3 py-2 text-left font-medium text-zinc-600">Actie</th>
                        <th className="px-3 py-2 text-right font-medium text-zinc-600">Records</th>
                        <th className="px-3 py-2 text-center font-medium text-zinc-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {seedSteps
                        .filter((s) => s.action === 'insert' || s.action === 'update')
                        .map((s, i) => (
                        <tr key={i} className="hover:bg-zinc-50">
                          <td className="px-3 py-1.5 text-zinc-700 font-mono text-xs">{TABLE_LABELS[s.table] ?? s.table}</td>
                          <td className="px-3 py-1.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              s.action === 'insert' ? 'bg-green-50 text-green-700' :
                              'bg-blue-50 text-blue-700'
                            }`}>
                              {s.action === 'insert' ? 'Gevuld' : 'Bijgewerkt'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-zinc-700 font-mono text-xs">
                            {s.count ?? '-'}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <svg className="inline h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                  {Object.entries(seedSummary).map(([key, count]) => (
                    <span key={key}>
                      <span className="font-medium text-zinc-700">{TABLE_LABELS[key] ?? key}:</span> {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Onboarding flow testen */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-zinc-900">Onboarding flow testen</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Wis alle data en doorloop de onboarding opnieuw als nieuwe gebruiker.
        </p>
        <button
          onClick={() => setShowOnboardingConfirm(true)}
          disabled={resettingOnboarding || seeding}
          className="mt-4 rounded-lg border border-teal-300 bg-teal-50 px-5 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resettingOnboarding ? 'Bezig met resetten...' : 'Onboarding starten'}
        </button>
      </div>

      {/* Onboarding confirmation dialog */}
      {showOnboardingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Onboarding testen</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Dit wist <span className="font-semibold text-red-600">al je financiele data</span> en
              stuurt je naar de onboarding flow als nieuwe gebruiker. Doorgaan?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowOnboardingConfirm(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={async () => {
                  setShowOnboardingConfirm(false)
                  setResettingOnboarding(true)
                  try {
                    const res = await fetch('/api/onboarding/reset', { method: 'POST' })
                    if (!res.ok) throw new Error('Reset failed')
                    router.push('/onboarding')
                  } catch {
                    setResettingOnboarding(false)
                    setMessage({ type: 'error', text: 'Onboarding reset mislukt.' })
                  }
                }}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
              >
                Bevestigen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fase-overgang testen */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-zinc-900">Fase-overgang testen</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Simuleer een fase-overgang om de celebratie-modal te testen.
        </p>

        <div className="mt-4">
          <p className="text-sm text-zinc-600">
            Huidige fase:{' '}
            <span className="font-semibold capitalize">{featureAccess.phase}</span>
            <span className="text-zinc-400 ml-1">(berekend)</span>
          </p>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-zinc-700 mb-2">Simuleer overgang vanaf:</p>
          <div className="flex flex-wrap gap-2">
            {PHASES.map(phase => {
              const currentIndex = PHASES.findIndex(p => p.id === featureAccess.phase)
              const phaseIndex = PHASES.findIndex(p => p.id === phase.id)
              const isLower = phaseIndex < currentIndex
              const colorMap: Record<string, string> = {
                rose: 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200',
                blue: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200',
                teal: 'bg-teal-100 text-teal-700 border-teal-200 hover:bg-teal-200',
                amber: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200',
              }

              return (
                <button
                  key={phase.id}
                  disabled={!isLower || simulatingPhase || seeding}
                  onClick={async () => {
                    setSimulatingPhase(true)
                    try {
                      const res = await fetch('/api/admin/test-phase-transition', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ oldPhase: phase.id }),
                      })
                      if (!res.ok) throw new Error('Fase-overgang test mislukt')
                      router.push('/')
                    } catch {
                      setSimulatingPhase(false)
                      setMessage({ type: 'error', text: 'Fase-overgang simulatie mislukt.' })
                    }
                  }}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isLower ? colorMap[phase.color] ?? '' : 'bg-zinc-100 text-zinc-400 border-zinc-200'
                  }`}
                >
                  {phase.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Alleen fasen lager dan je huidige fase zijn klikbaar.
          </p>
        </div>

        {simulatingPhase && (
          <p className="mt-3 text-sm text-teal-600 animate-pulse">Bezig met simuleren...</p>
        )}

        <div className="mt-6 border-t border-zinc-200 pt-4">
          <p className="text-sm font-medium text-zinc-700 mb-2">Activatie testen</p>
          <button
            disabled={simulatingPhase || seeding}
            onClick={async () => {
              setSimulatingPhase(true)
              try {
                const res = await fetch('/api/admin/test-phase-transition', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ oldPhase: null }),
                })
                if (!res.ok) throw new Error('Reset activatie mislukt')
                router.push('/')
              } catch {
                setSimulatingPhase(false)
                setMessage({ type: 'error', text: 'Reset activatie mislukt.' })
              }
            }}
            className="rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset activatie
          </button>
          <p className="mt-2 text-xs text-zinc-400">
            Zet last_known_phase op NULL zodat de activatieknop weer verschijnt.
          </p>
        </div>
      </div>

      {/* Mobile Preview */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-zinc-900">Mobile Preview</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Bekijk de app in een telefoon-frame om de mobile layout te testen op desktop.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => mobilePreview.setEnabled(!mobilePreview.enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              mobilePreview.enabled ? 'bg-amber-500' : 'bg-zinc-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                mobilePreview.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm font-medium text-zinc-700">
            {mobilePreview.enabled ? 'Actief' : 'Uit'}
          </span>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-zinc-700 mb-2">Device</p>
          <div className="flex flex-wrap gap-2">
            {DEVICE_PRESETS.map(d => (
              <button
                key={d.name}
                onClick={() => mobilePreview.setDevice(d)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  mobilePreview.device.name === d.name
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                {d.name}
                <span className="ml-1 text-xs text-zinc-400">{d.width}&times;{d.height}</span>
              </button>
            ))}
          </div>
        </div>

        {mobilePreview.enabled && (
          <p className="mt-4 text-xs text-amber-600">
            Preview is actief. Navigeer naar een pagina (bijv. /core) om de mobile weergave te testen.
          </p>
        )}
      </div>
    </div>
  )
}

function PersonaCard({
  personaKey,
  meta,
  disabled,
  onSelect,
}: {
  personaKey: PersonaKey
  meta: PersonaMeta
  disabled: boolean
  onSelect: () => void
}) {
  const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  }
  const colors = colorClasses[meta.color] ?? colorClasses.amber

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-5 transition-all hover:shadow-md`}>
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold"
          style={{ backgroundColor: meta.avatarColor }}
        >
          {meta.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`font-semibold ${colors.text}`}>{meta.name}</h3>
          <p className="text-xs font-medium text-zinc-500">{meta.subtitle}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-zinc-600 line-clamp-2">{meta.description}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>Vermogen: <span className={`font-semibold ${meta.netWorth < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(meta.netWorth)}</span></span>
        <span>Inkomen: <span className="font-medium text-zinc-700">{formatCurrency(meta.income)}/mnd</span></span>
        <span>Uitgaven: <span className="font-medium text-zinc-700">{formatCurrency(meta.expenses)}/mnd</span></span>
      </div>

      <button
        onClick={onSelect}
        disabled={disabled}
        className="mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: disabled ? '#a1a1aa' : meta.avatarColor }}
      >
        {disabled ? 'Bezig...' : 'Laden'}
      </button>
    </div>
  )
}
