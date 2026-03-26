'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { WillDots } from '@/components/app/will-dots'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { createClient } from '@/lib/supabase/client'

// ── Dutch month names for the krant masthead ─────────────────

const NL_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

function formatKrantDate(): string {
  const now = new Date()
  return `${NL_MONTHS[now.getMonth()]} ${now.getFullYear()}`
}

// ── Component ────────────────────────────────────────────────

export function WelcomeKrant() {
  const { needsActivation } = useFeatureAccess()
  const [showWelcome, setShowWelcome] = useState(false)
  const [firstName, setFirstName] = useState<string | null>(null)
  const dismissedRef = useRef(false)

  useEffect(() => {
    if (!needsActivation) return

    let cancelled = false

    async function check() {
      try {
        const res = await fetch('/api/welcome')
        if (!res.ok || cancelled) return
        const { seen } = await res.json()
        if (seen || cancelled) return

        // Not seen yet — fetch the user's name
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()

        if (cancelled) return

        const name = profile?.full_name
        if (name) {
          setFirstName(name.split(' ')[0])
        }
        setShowWelcome(true)
      } catch {
        // Silently fail — welcome krant is non-critical
      }
    }

    check()
    return () => { cancelled = true }
  }, [needsActivation])

  function handleDismiss() {
    setShowWelcome(false)
    if (dismissedRef.current) return
    dismissedRef.current = true
    // Fire-and-forget persist
    fetch('/api/welcome', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen: true }),
    }).catch(() => {})
  }

  if (!needsActivation || !showWelcome) return null

  const greeting = firstName ? `Welkom, ${firstName}!` : 'Welkom bij De Kern!'

  return (
    <BottomSheet open={showWelcome} onClose={handleDismiss} size="xl" initialMobileHeight="75vh">
      <div className="overflow-y-auto">
        {/* ── Masthead ────────────────────────────────────────── */}
        <div className="flex h-1">
          <div className="flex-1 bg-kern-400" />
          <div className="flex-1 bg-wil-400" />
          <div className="flex-1 bg-horizon-400" />
        </div>

        <div className="px-5 pt-5 pb-6 sm:px-8 sm:pt-6 sm:pb-8">
          {/* Masthead header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <WillDots size={32} />
              <span className="label-editorial text-[var(--ink-3)]">TriFinity Krant</span>
            </div>
            <span className="label-editorial text-[var(--ink-4)]">
              Editie 1 &mdash; {formatKrantDate()}
            </span>
          </div>

          {/* Double rule */}
          <div className="mt-3 space-y-0.5">
            <div className="h-px bg-[var(--ink)]" />
            <div className="h-px bg-[var(--border-md)]" />
          </div>

          {/* ── Headline ──────────────────────────────────────── */}
          <div className="mt-5 sm:mt-6 animate-fade-up" style={{ animationDelay: '80ms' }}>
            <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-[var(--ink)] sm:text-[36px]">
              {greeting}
            </h2>
            <p className="mt-1.5 font-serif text-base italic leading-relaxed text-[var(--ink-2)] sm:text-lg">
              Je bent aanbeland op De Kern &mdash; je financiële fundament.
            </p>
          </div>

          {/* Asterisk divider */}
          <div className="my-5 flex items-center gap-3 sm:my-6">
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
            <span className="font-serif text-xs text-[var(--ink-4)]">&lowast; &lowast; &lowast;</span>
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
          </div>

          {/* ── Two-column body ───────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 md:gap-8 animate-fade-up" style={{ animationDelay: '160ms' }}>
            {/* Column 1: De Invulfase */}
            <div className="md:border-r md:border-[var(--border-ed)] md:pr-8">
              <p className="label-editorial mb-2 text-kern-600">De Invulfase</p>
              <p className="font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                Dit is het moment om je financiële gegevens in te vullen &mdash; zo kan ik je straks de
                beste inzichten geven.
              </p>
              <p className="mt-3 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                Ik heb een <strong className="text-[var(--ink-2)]">checklist</strong> bovenaan de
                pagina gezet die je wat richting geeft. Vul zo veel of zo weinig in als je wilt &mdash;
                elk detail dat je toevoegt maakt je inzichten nauwkeuriger.
              </p>
            </div>

            {/* Column 2: Opties */}
            <div>
              <p className="label-editorial mb-2 text-kern-600">Opties</p>
              <p className="font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                <strong className="text-[var(--ink-2)]">Budgettering:</strong> in de onboarding heb je
                gekozen of je wilt budgetteren. Je kunt dat hier per bankrekening aan- of uitzetten.
                Staat het aan, dan worden transacties automatisch gekoppeld aan je budgetten.
              </p>
              <p className="mt-3 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                <strong className="text-[var(--ink-2)]">Holdings:</strong> bij je bezittingen kun je per
                belegging gedetailleerde holdings bijhouden. Handig als je wilt zien hoe individuele
                posities presteren. De details staan standaard uit.
              </p>
            </div>
          </div>

          {/* Asterisk divider */}
          <div className="my-5 flex items-center gap-3 sm:my-6">
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
            <span className="font-serif text-xs text-[var(--ink-4)]">&lowast; &lowast; &lowast;</span>
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
          </div>

          {/* ── Activeren pull-quote ──────────────────────────── */}
          <div className="animate-fade-up" style={{ animationDelay: '240ms' }}>
            <blockquote className="border-l-2 border-kern-400 pl-4 py-0.5">
              <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
                &ldquo;Als je klaar bent met het invullen van je gegevens, klik je op{' '}
                <strong className="not-italic text-kern-700">Activeren</strong> om De Wil en De Horizon
                te ontgrendelen.&rdquo;
              </p>
            </blockquote>
          </div>

          {/* ── Footer ────────────────────────────────────────── */}
          <div className="mt-6 sm:mt-8 animate-fade-up" style={{ animationDelay: '320ms' }}>
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3.5 sm:px-5 sm:py-4">
              <p className="font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                Veel ontdekkingen! Bij vragen over je financiën of over de app &mdash; stel ze aan mij
                via het chatvenster. Ik ben er om je te helpen.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <WillDots size={20} />
                <span className="font-serif text-sm italic text-[var(--ink-2)]">&mdash; Will</span>
              </div>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleDismiss}
              className="mt-4 min-h-[48px] w-full rounded-[var(--r)] bg-kern-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-kern-700 hover:shadow-md active:bg-kern-800 active:shadow-none sm:mt-5"
            >
              Aan de slag
            </button>

            {/* Gids link */}
            <p className="mt-3 text-center">
              <Link
                href="/identity/gids"
                onClick={handleDismiss}
                className="font-serif text-xs text-[var(--ink-4)] underline decoration-[var(--border-ed)] underline-offset-2 transition-colors hover:text-[var(--ink-3)]"
              >
                Bekijk de Gids voor uitgebreide uitleg &rarr;
              </Link>
            </p>
          </div>
        </div>
      </div>

    </BottomSheet>
  )
}
