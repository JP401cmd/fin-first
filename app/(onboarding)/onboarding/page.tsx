'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from '@/lib/test-personas'
import { FhinAvatar, FinnAvatar, FfinAvatar } from '@/components/app/avatars'

// ── Types ────────────────────────────────────────────────────

type Step = 'intro' | 'choose' | 'persona-select'
  | 'ai-step-1' | 'ai-step-2' | 'ai-step-3' | 'ai-step-4'
  | 'seeding' | 'success'

interface SeedEvent {
  step?: string
  progress?: number
  table?: string
  action?: string
  count?: number
  done?: boolean
  summary?: Record<string, number>
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }
  error?: string
}

// ── Speech Bubble Helpers ────────────────────────────────────

function SpeechBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-teal-200 bg-teal-50/60 px-5 py-4 text-sm text-zinc-700">
      {/* Arrow pointing left */}
      <div className="absolute top-5 -left-2 h-3 w-3 rotate-45 border-b border-l border-teal-200 bg-teal-50/60" />
      {children}
    </div>
  )
}

function SpeechBubbleCentered({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/60 px-5 py-4 text-sm text-zinc-700">
      {children}
    </div>
  )
}

// ── Seeding Messages ─────────────────────────────────────────

const SEEDING_MESSAGES = [
  'Je profiel wordt aangemaakt...',
  'Bankrekeningen en budgetten instellen...',
  'Bezittingen en schulden in kaart brengen...',
  'Transactiehistorie genereren...',
  'Doelen en aanbevelingen opstellen...',
  'Bijna klaar, alles wordt opgeslagen...',
]

// ── Main Component ───────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('intro')
  const [loading, setLoading] = useState(true)

  // Seed state
  const [seedProgress, setSeedProgress] = useState(0)
  const [seedStep, setSeedStep] = useState('')
  const [seedError, setSeedError] = useState<string | null>(null)
  const [seedPath, setSeedPath] = useState<'empty' | 'persona' | 'ai'>('empty')
  const [seedingMessageIndex, setSeedingMessageIndex] = useState(0)

  // Multi-step AI inputs
  const [aiInputs, setAiInputs] = useState({ profile: '', assets: '', spending: '', goals: '' })

  // Token usage tracking
  const [tokenUsage, setTokenUsage] = useState<{ inputTokens: number; outputTokens: number; totalTokens: number } | null>(null)

  // Prefetch state: AI Step 1 runs in background while user fills steps 2-4
  const [prefetchResult, setPrefetchResult] = useState<{
    data: unknown
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number }
    profileDesc: string // the input it was generated from
  } | null>(null)
  const [prefetchDone, setPrefetchDone] = useState(false)

  // Check if already onboarded
  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()

      if (profile?.onboarding_completed) {
        router.replace('/dashboard')
        return
      }
      setLoading(false)
    }
    check()
  }, [supabase, router])

  // Cycle seeding messages
  useEffect(() => {
    if (step !== 'seeding' || seedError) return
    const interval = setInterval(() => {
      setSeedingMessageIndex((i) => (i + 1) % SEEDING_MESSAGES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [step, seedError])

  // ── Handlers ─────────────────────────────────────────────────

  async function handleEmptyStart() {
    setSeedPath('empty')
    try {
      const res = await fetch('/api/onboarding/complete', { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      setStep('success')
    } catch {
      setSeedError('Er ging iets mis. Probeer opnieuw.')
    }
  }

  function triggerPrefetch(profileText: string) {
    if (profileText.trim().length < 20) return
    setPrefetchDone(false)
    fetch('/api/onboarding/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: profileText }),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setPrefetchResult({
            data: result.data,
            tokenUsage: result.tokenUsage,
            profileDesc: profileText,
          })
          setPrefetchDone(true)
        }
      })
      .catch(() => {}) // silent fail — seed endpoint will generate step 1 itself
  }

  async function handlePersonaSeed(personaKey: PersonaKey) {
    setSeedPath('persona')
    setStep('seeding')
    setSeedProgress(0)
    setSeedStep('Starten...')
    setSeedError(null)
    setSeedingMessageIndex(0)

    try {
      const res = await fetch('/api/onboarding/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'persona', persona: personaKey }),
      })

      if (!res.ok || !res.body) throw new Error('Seed request mislukt')
      await processStream(res.body)
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : 'Onbekende fout')
    }
  }

  async function handleAISeed() {
    setSeedPath('ai')
    setStep('seeding')
    setSeedProgress(0)
    setSeedStep('AI genereert je persoonlijke dataset...')
    setSeedError(null)
    setSeedingMessageIndex(0)

    // Only use prefetch if the profile input hasn't changed since prefetch
    const usePrefetch = prefetchResult && prefetchResult.profileDesc === aiInputs.profile

    try {
      const res = await fetch('/api/onboarding/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ai',
          descriptions: aiInputs,
          ...(usePrefetch ? { prefetchedStep1: prefetchResult.data } : {}),
        }),
      })

      if (!res.ok || !res.body) throw new Error('Seed request mislukt')
      await processStream(res.body, usePrefetch ? prefetchResult.tokenUsage : undefined)
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : 'Onbekende fout')
    }
  }

  async function processStream(
    body: ReadableStream,
    prefetchTokens?: { inputTokens: number; outputTokens: number; totalTokens: number },
  ) {
    const reader = body.getReader()
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

        if (event.error) {
          setSeedError(event.error)
          return
        }

        if (event.done) {
          setSeedProgress(100)
          setSeedStep('Klaar!')
          if (event.tokenUsage) {
            // Combine prefetch tokens with seed tokens
            const combined = prefetchTokens
              ? {
                  inputTokens: event.tokenUsage.inputTokens + prefetchTokens.inputTokens,
                  outputTokens: event.tokenUsage.outputTokens + prefetchTokens.outputTokens,
                  totalTokens: event.tokenUsage.totalTokens + prefetchTokens.totalTokens,
                }
              : event.tokenUsage
            setTokenUsage(combined)
          }
          setStep('success')
          return
        }

        if (event.step && event.progress !== undefined) {
          setSeedProgress(event.progress)
          setSeedStep(event.step)
        }
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    )
  }

  const showHeader = step !== 'intro' && step !== 'success' && step !== 'seeding'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Logo / Header — hidden on intro and success */}
        {showHeader && (
          <div className="mb-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-teal-400 to-purple-500">
              <span className="text-2xl font-black text-white">T</span>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900">TriFinity</h1>
          </div>
        )}

        {/* ── Step: Intro ──────────────────────────────────── */}
        {step === 'intro' && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-6">
              <FinnAvatar size={120} />
            </div>

            <SpeechBubbleCentered>
              <p className="font-medium text-zinc-900">Hoi! Ik ben Will, je financiele gids.</p>
              <p className="mt-2">
                Bij TriFinity kijken we anders naar geld. Geld is opgeslagen tijd &mdash;
                elke euro vertegenwoordigt vrijheid die je hebt verdiend. Samen maken we
                je financiele reis zichtbaar.
              </p>
            </SpeechBubbleCentered>

            {/* Three-module preview */}
            <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <div className="shrink-0"><FhinAvatar size={32} /></div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-amber-700">De Kern</p>
                  <p className="text-xs text-zinc-500">Je financiele fundament</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
                <div className="shrink-0"><FinnAvatar size={32} /></div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-teal-700">De Wil</p>
                  <p className="text-xs text-zinc-500">Bewuste keuzes maken</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50/50 p-3">
                <div className="shrink-0"><FfinAvatar size={32} /></div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-purple-700">De Horizon</p>
                  <p className="text-xs text-zinc-500">Je pad naar vrijheid</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('choose')}
              className="mt-8 rounded-lg bg-teal-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700"
            >
              Laten we beginnen
            </button>
            <p className="mt-3 text-xs text-zinc-400">Dit duurt nog geen 2 minuten</p>
          </div>
        )}

        {/* ── Step: Choose ──────────────────────────────────── */}
        {step === 'choose' && (
          <div>
            {/* FINN guidance */}
            <div className="mb-6 flex items-start gap-3">
              <div className="shrink-0"><FinnAvatar size={48} /></div>
              <SpeechBubble>
                Top, daar gaan we! Je hebt drie manieren om te starten &mdash; kies wat het beste bij je past.
              </SpeechBubble>
            </div>

            <div className="space-y-4">
              {/* Option 1: Empty start */}
              <button
                onClick={handleEmptyStart}
                className="group w-full rounded-2xl border-2 border-zinc-200 bg-white p-6 text-left transition-all hover:border-zinc-400 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-xl group-hover:bg-zinc-200">
                    <svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">Zelf vullen</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Begin met een leeg dashboard en voer je gegevens stap voor stap zelf in.
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 2: Persona */}
              <button
                onClick={() => setStep('persona-select')}
                className="group w-full rounded-2xl border-2 border-zinc-200 bg-white p-6 text-left transition-all hover:border-teal-300 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xl group-hover:bg-teal-100">
                    <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">Voorbeeldprofiel laden</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Kies een van 4 voorbeeldprofielen om de app direct gevuld te verkennen.
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 3: AI */}
              <button
                onClick={() => setStep('ai-step-1')}
                className="group w-full rounded-2xl border-2 border-zinc-200 bg-white p-6 text-left transition-all hover:border-purple-300 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-xl group-hover:bg-purple-100">
                    <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">AI-profiel op maat</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Vul je basisgegevens in en laat AI een realistisch financieel profiel genereren.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Persona Select ──────────────────────────── */}
        {step === 'persona-select' && (
          <div>
            <button
              onClick={() => setStep('choose')}
              className="mb-6 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Terug
            </button>

            {/* FINN guidance */}
            <div className="mb-6 flex items-start gap-3">
              <div className="shrink-0"><FinnAvatar size={48} /></div>
              <SpeechBubble>
                Elk profiel vertegenwoordigt een andere levensfase. Kies er een die bij je past &mdash; je kunt later altijd wisselen.
              </SpeechBubble>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PERSONA_KEYS.map((key) => {
                const meta = PERSONAS[key].meta
                const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
                  red: { bg: 'bg-red-50', border: 'border-red-200 hover:border-red-400', text: 'text-red-700' },
                  teal: { bg: 'bg-teal-50', border: 'border-teal-200 hover:border-teal-400', text: 'text-teal-700' },
                  amber: { bg: 'bg-amber-50', border: 'border-amber-200 hover:border-amber-400', text: 'text-amber-700' },
                  purple: { bg: 'bg-purple-50', border: 'border-purple-200 hover:border-purple-400', text: 'text-purple-700' },
                }
                const colors = colorClasses[meta.color] ?? colorClasses.amber

                const formatCurrency = (n: number) =>
                  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

                return (
                  <button
                    key={key}
                    onClick={() => handlePersonaSeed(key)}
                    className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-5 text-left transition-all hover:shadow-md`}
                  >
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
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>Vermogen: <span className={`font-semibold ${meta.netWorth < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(meta.netWorth)}</span></span>
                      <span>Inkomen: <span className="font-medium text-zinc-700">{formatCurrency(meta.income)}/mnd</span></span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Steps: AI Wizard (4 steps) ─────────────────── */}
        {(step === 'ai-step-1' || step === 'ai-step-2' || step === 'ai-step-3' || step === 'ai-step-4') && (() => {
          const aiSteps: { key: 'ai-step-1' | 'ai-step-2' | 'ai-step-3' | 'ai-step-4'; field: keyof typeof aiInputs; label: string; question: string; hints: string[]; required: boolean; prev: Step }[] = [
            {
              key: 'ai-step-1', field: 'profile', label: '1 van 4 \u2014 Over jou',
              question: 'Vertel me over jezelf \u2014 wie ben je en wat verdien je?',
              hints: [
                'Ik ben [naam], [leeftijd] jaar',
                'Ik woon alleen / samen / met gezin in [stad]',
                'Ik verdien netto \u20AC[bedrag] per maand',
                'Mijn partner verdient \u20AC[bedrag] per maand',
              ],
              required: true, prev: 'choose',
            },
            {
              key: 'ai-step-2', field: 'assets', label: '2 van 4 \u2014 Vermogen & schulden',
              question: 'Wat bezit je en welke schulden heb je?',
              hints: [
                'Ik heb \u20AC[bedrag] spaargeld',
                'Ik heb \u20AC[bedrag] belegd',
                'Ik heb een koophuis van \u20AC[bedrag] met hypotheek van \u20AC[bedrag]',
                'Ik heb een studielening van \u20AC[bedrag]',
              ],
              required: false, prev: 'ai-step-1',
            },
            {
              key: 'ai-step-3', field: 'spending', label: '3 van 4 \u2014 Uitgaven',
              question: 'Hoe geef je je geld uit? Ben je zuinig of geniet je graag?',
              hints: [
                'Mijn huur/hypotheek is \u20AC[bedrag] per maand',
                'Ik geef ~\u20AC[bedrag] uit aan boodschappen',
                'Ik ga graag uit eten / op vakantie / shoppen',
                'Ik ben zuinig / ik geniet graag',
              ],
              required: false, prev: 'ai-step-2',
            },
            {
              key: 'ai-step-4', field: 'goals', label: '4 van 4 \u2014 Doelen',
              question: 'Wat wil je bereiken? Wat staat er op de planning?',
              hints: [
                'Ik wil over [x] jaar financieel vrij zijn',
                'Ik wil een huis kopen',
                'Ik ben van plan kinderen te krijgen',
                'Ik wil eerder stoppen met werken',
              ],
              required: false, prev: 'ai-step-3',
            },
          ]

          const currentIdx = aiSteps.findIndex(s => s.key === step)
          const current = aiSteps[currentIdx]
          const isLast = currentIdx === aiSteps.length - 1
          const canProceed = !current.required || aiInputs[current.field].trim().length >= 20

          return (
            <div>
              <button
                onClick={() => setStep(current.prev)}
                className="mb-6 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Terug
              </button>

              {/* Step indicator */}
              <div className="mb-6 flex items-center gap-3">
                <div className="flex gap-1.5">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={`h-1.5 w-8 rounded-full transition-colors ${
                      i === 0 && currentIdx > 0 && prefetchDone ? 'bg-teal-500' :
                      i < currentIdx ? 'bg-teal-500' :
                      i === currentIdx ? 'bg-teal-300' : 'bg-zinc-200'
                    }`} />
                  ))}
                </div>
                <span className="text-xs text-zinc-400">{current.label}</span>
                {currentIdx > 0 && prefetchDone && (
                  <span className="text-xs text-teal-500">&#10003; AI klaar</span>
                )}
              </div>

              {/* FINN question */}
              <div className="mb-6 flex items-start gap-3">
                <div className="shrink-0"><FinnAvatar size={48} /></div>
                <SpeechBubble>{current.question}</SpeechBubble>
              </div>

              <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
                <textarea
                  value={aiInputs[current.field]}
                  onChange={(e) => setAiInputs(prev => ({ ...prev, [current.field]: e.target.value }))}
                  rows={5}
                  placeholder="Beschrijf in je eigen woorden..."
                  className="w-full resize-none rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                />

                {/* Hints */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-zinc-500">Bijvoorbeeld:</p>
                  {current.hints.map((hint) => (
                    <p key={hint} className="text-xs text-zinc-400 pl-2 before:content-['\u2022'] before:mr-1.5 before:text-zinc-300">
                      {hint}
                    </p>
                  ))}
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  {!current.required && (
                    <button
                      onClick={() => {
                        if (isLast) { handleAISeed() } else {
                          // Trigger prefetch when leaving step 1
                          if (current.key === 'ai-step-1') triggerPrefetch(aiInputs.profile)
                          setStep(aiSteps[currentIdx + 1].key)
                        }
                      }}
                      className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                    >
                      Sla over
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (isLast) { handleAISeed() } else {
                        // Trigger prefetch when leaving step 1
                        if (current.key === 'ai-step-1') triggerPrefetch(aiInputs.profile)
                        setStep(aiSteps[currentIdx + 1].key)
                      }
                    }}
                    disabled={!canProceed}
                    className="flex-1 rounded-lg bg-teal-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLast ? 'AI-profiel genereren' : 'Volgende'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Step: Seeding ─────────────────────────────────── */}
        {step === 'seeding' && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
            {!seedError ? (
              <>
                <div className="mx-auto mb-4">
                  <FinnAvatar size={80} />
                </div>

                <SpeechBubbleCentered>
                  <p className="font-medium text-zinc-900">
                    {SEEDING_MESSAGES[seedingMessageIndex]}
                  </p>
                </SpeechBubbleCentered>

                <p className="mt-3 text-sm text-zinc-500">{seedStep}</p>

                {/* Progress bar */}
                <div className="mx-auto mt-6 max-w-md">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-300"
                      style={{ width: `${seedProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">{seedProgress}%</p>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-zinc-900">Er ging iets mis</h2>
                <p className="mt-2 text-sm text-red-600">{seedError}</p>
                <button
                  onClick={() => {
                    setSeedError(null)
                    setStep('choose')
                  }}
                  className="mt-6 rounded-lg border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Opnieuw proberen
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Step: Success ─────────────────────────────────── */}
        {step === 'success' && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-4">
              <FinnAvatar size={80} />
            </div>

            <h2 className="text-2xl font-bold text-zinc-900">Welkom bij TriFinity!</h2>
            <p className="mt-2 text-sm text-zinc-500">Ontmoet je team</p>

            {/* Three avatar cards */}
            <div className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col items-center rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-5">
                <FhinAvatar size={48} />
                <p className="mt-2 text-sm font-semibold text-amber-700">De Kern</p>
                <p className="mt-1 text-xs text-zinc-500">Je financiele fundament</p>
              </div>
              <div className="flex flex-col items-center rounded-2xl border-2 border-teal-200 bg-teal-50/50 p-5">
                <FinnAvatar size={48} />
                <p className="mt-2 text-sm font-semibold text-teal-700">De Wil</p>
                <p className="mt-1 text-xs text-zinc-500">Bewuste keuzes. Ik ben bereikbaar via het chatknopje</p>
              </div>
              <div className="flex flex-col items-center rounded-2xl border-2 border-purple-200 bg-purple-50/50 p-5">
                <FfinAvatar size={48} />
                <p className="mt-2 text-sm font-semibold text-purple-700">De Horizon</p>
                <p className="mt-1 text-xs text-zinc-500">Je pad naar het &infin;-symbool</p>
              </div>
            </div>

            {/* FINN closing message */}
            <div className="mt-6 w-full">
              <SpeechBubbleCentered>
                Veel ontdekkingen! Elke bewuste keuze brengt je dichter bij vrijheid.
              </SpeechBubbleCentered>
            </div>

            {tokenUsage && (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-500">
                <span className="font-medium text-zinc-600">AI tokens gebruikt:</span>{' '}
                {tokenUsage.totalTokens.toLocaleString('nl-NL')} totaal
                <span className="mx-1.5 text-zinc-300">|</span>
                {tokenUsage.inputTokens.toLocaleString('nl-NL')} input
                <span className="mx-1.5 text-zinc-300">|</span>
                {tokenUsage.outputTokens.toLocaleString('nl-NL')} output
              </div>
            )}

            <button
              onClick={() => router.push('/dashboard')}
              className="mt-8 rounded-lg bg-teal-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700"
            >
              Ontdek je dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
