'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Link2, ChevronRight } from 'lucide-react'
import { ExportDropdown } from '@/components/app/export-dropdown'

/**
 * GeavanceerdSettings — externe koppelingen, data-export en data-reset.
 * Geëxtraheerd uit de legacy /identity/instellingen-monolith (tab
 * 'gegevens') naar de canonieke /mijn/geavanceerd-pagina (plan A-2).
 *
 * De handmatige module-aan/uit-toggle is bewust verwijderd: modules
 * worden tijdens onboarding ingesteld en daarna niet meer handmatig
 * geschakeld. Hergebruikt ExportDropdown (CSV-export) en
 * /api/onboarding/reset.
 */
export function GeavanceerdSettings() {
  const router = useRouter()
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 space-y-4">
      <header className="mb-2">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Mijn — geavanceerd
        </div>
        <h1 className="font-serif text-2xl text-[var(--ink)] mt-1">
          Gegevens &amp; export
        </h1>
      </header>

      {/* ── Externe koppelingen ─────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <Link
          href="/mijn/koppelingen"
          className="flex w-full items-center justify-between px-4 sm:px-6 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] text-[var(--ink-2)]">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="label-editorial text-[var(--ink-2)]">Externe koppelingen</h2>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Crypto-exchanges, wallets, brokers en bankrekeningen — beheer op de Koppelingen-pagina
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
        </Link>
      </section>

      {/* ── Data Export ─────────────────────────────────────────── */}
      <section id="export" className="card-editorial overflow-hidden scroll-mt-24">
        <div className="px-4 sm:px-6 py-4">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">Data export</h2>
          <p className="mt-1 text-xs text-[var(--ink-4)]">Download je financiële gegevens als CSV-bestand</p>
          <div className="mt-3">
            <ExportDropdown />
          </div>
        </div>
      </section>

      {/* ── Gegevens resetten ───────────────────────────────────── */}
      <section className="rounded-2xl border border-negative/30 bg-[var(--paper)] overflow-hidden">
        <div className="px-4 sm:px-6 py-4">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-negative/70 uppercase">Gegevens resetten</h2>
          <p className="mt-1 text-xs text-[var(--ink-3)]">Alle data permanent verwijderen en opnieuw starten</p>
          <p className="mt-3 text-sm text-[var(--ink-3)]">
            Wis al je financiële gegevens en doorloop de onboarding opnieuw. Dit
            verwijdert al je bankrekeningen, transacties, budgetten, doelen en
            overige data.
          </p>
          <button
            type="button"
            onClick={() => setShowResetDialog(true)}
            disabled={resetting}
            className="mt-3 rounded-lg border border-negative/40 bg-negative/10 px-5 py-2 text-sm font-medium text-negative transition-colors hover:bg-negative/20 disabled:opacity-50"
          >
            {resetting ? 'Bezig met wissen…' : 'Alle gegevens wissen'}
          </button>
          {resetError && <p className="mt-3 text-sm text-negative">{resetError}</p>}
        </div>
      </section>

      {/* Reset-bevestiging */}
      {showResetDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Weet je het zeker?</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Dit wist <span className="font-semibold text-negative">al je financiële data</span> permanent.
              Je wordt teruggeleid naar de onboarding om opnieuw te beginnen.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetDialog(false)}
                className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowResetDialog(false)
                  setResetting(true)
                  try {
                    const res = await fetch('/api/onboarding/reset', { method: 'POST' })
                    if (!res.ok) throw new Error('Reset failed')
                    router.push('/onboarding')
                  } catch {
                    setResetting(false)
                    setResetError('Reset mislukt. Probeer opnieuw.')
                  }
                }}
                className="rounded-lg bg-negative px-4 py-2 text-sm font-medium text-white hover:bg-negative/90 transition-colors"
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
