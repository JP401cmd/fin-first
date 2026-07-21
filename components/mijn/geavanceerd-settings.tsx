'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Link2, ChevronRight, Download } from 'lucide-react'
import { ExportDropdown } from '@/components/app/export-dropdown'
import { PageOpening, Button } from '@/components/editorial'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'

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
      <PageOpening
        className="mb-2"
        kicker="Mijn · geavanceerd"
        titleBefore="Je "
        emphasis="gegevens"
        titleAfter=" & export"
      />

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
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            Download al je gegevens in één JSON-bestand (dataportabiliteit), of losse CSV&apos;s per onderdeel voor Excel.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href="/api/account/export"
              download
              className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
            >
              <Download className="h-3.5 w-3.5" />
              Download al mijn gegevens (JSON)
            </a>
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

      {/* Reset-bevestiging — onomkeerbaar, dus kind="confirm" + destructive.
          De rode primaire actie behoudt bewust bg-negative i.p.v. de
          ink-Button (Button kent geen destructive-variant); de secundaire
          annuleer-knop loopt via de gedeelde Button-primitive. */}
      <ShellOverlay
        open={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        kind="confirm"
        destructive
        title="Weet je het zeker?"
        footer={
          <div className="flex items-center gap-2">
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
              className="inline-flex min-h-11 flex-1 items-center justify-center bg-negative px-5 text-sm font-medium text-white transition-colors hover:bg-negative/90"
              style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
            >
              Alles wissen
            </button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowResetDialog(false)}
            >
              Annuleren
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <p className="text-sm text-[var(--ink-2)]">
            Dit wist <span className="font-semibold text-negative">al je financiële data</span> permanent.
            Je wordt teruggeleid naar de onboarding om opnieuw te beginnen.
          </p>
        </div>
      </ShellOverlay>
    </div>
  )
}
