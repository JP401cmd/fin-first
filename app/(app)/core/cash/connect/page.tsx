'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Building2, ExternalLink, Shield, Clock, AlertTriangle } from 'lucide-react'
import { BankSelector } from '@/components/app/bank-connect/bank-selector'

type Provider = {
  id: string
  name: string
  logo: string
}

type Step = 'select' | 'confirm' | 'redirect'

export default function ConnectBankPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const [step, setStep] = useState<Step>('select')
  const [selectedBank, setSelectedBank] = useState<Provider | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(
    error === 'missing_reference' ? 'Ontbrekende referentie in callback'
    : error === 'requisition_not_found' ? 'Verbindingsverzoek niet gevonden'
    : error === 'not_authorized' ? 'Bankautorizatie niet voltooid'
    : error === 'callback_failed' ? 'Callback verwerking mislukt'
    : null
  )

  function handleSelectBank(provider: Provider) {
    setSelectedBank(provider)
    setStep('confirm')
    setConnectError(null)
  }

  async function handleConnect() {
    if (!selectedBank) return
    setConnecting(true)
    setConnectError(null)

    try {
      const res = await fetch('/api/bank-connect/auth-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: selectedBank.id,
          provider_name: selectedBank.name,
          provider_logo: selectedBank.logo,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Verbinding maken mislukt')
      }

      // Redirect to bank authorization
      setStep('redirect')
      window.location.href = data.auth_url
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Verbinding maken mislukt')
      setConnecting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Back link */}
      <Link
        href="/core/cash"
        className="mb-6 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        <ChevronLeft className="h-3 w-3" />
        Terug naar Kas
      </Link>

      {/* Editorial header — blueprint Type 7 (Wizard) */}
      <header className="mb-8 space-y-2">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Cash · automatisch synchroniseren
        </div>
        <h1
          className="font-bold text-2xl sm:text-3xl tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Bank{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            koppelen
          </em>
        </h1>
        <p
          className="italic text-[14px] leading-snug text-[var(--ink-2)] pl-4"
          style={{
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            borderLeft: '2px solid var(--module-active-500)',
          }}
        >
          Koppel je bankrekening om transacties automatisch te synchroniseren.
        </p>
      </header>

      {/* Error message */}
      {connectError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {connectError}
        </div>
      )}

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {(['select', 'confirm', 'redirect'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-zinc-200" />}
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              step === s
                ? 'bg-kern-500 text-white'
                : i < ['select', 'confirm', 'redirect'].indexOf(step)
                  ? 'bg-kern-100 text-kern-700'
                  : 'bg-zinc-100 text-[var(--ink-3)]'
            }`}>
              {i + 1}
            </div>
            <span className={`text-xs font-medium ${
              step === s ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'
            }`}>
              {s === 'select' ? 'Kies bank' : s === 'confirm' ? 'Bevestig' : 'Autoriseer'}
            </span>
          </div>
        ))}
      </div>

      {/* Step: Select bank */}
      {step === 'select' && (
        <BankSelector onSelect={handleSelectBank} />
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && selectedBank && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 rounded-[var(--r-lg)] border border-kern-200 bg-kern-50 p-4">
            {selectedBank.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedBank.logo} alt={selectedBank.name} className="h-12 w-12 rounded-lg object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-kern-100">
                <Building2 className="h-6 w-6 text-kern-600" />
              </div>
            )}
            <div>
              <p className="font-semibold text-[var(--ink)]">{selectedBank.name}</p>
              <p className="text-sm text-[var(--ink-3)]">Je wordt doorgestuurd om in te loggen</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-[var(--subtle)] p-3">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
              <div>
                <p className="text-sm font-medium text-[var(--ink-2)]">Veilige verbinding</p>
                <p className="text-xs text-[var(--ink-3)]">
                  Je inloggegevens worden nooit met ons gedeeld. De verbinding loopt via TrueLayer, een door de FCA gereguleerde dienst.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-[var(--subtle)] p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
              <div>
                <p className="text-sm font-medium text-[var(--ink-2)]">90 dagen geldig</p>
                <p className="text-xs text-[var(--ink-3)]">
                  De autorisatie is 90 dagen geldig. Daarna kun je eenvoudig opnieuw verbinden.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-[var(--subtle)] p-3">
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
              <div>
                <p className="text-sm font-medium text-[var(--ink-2)]">Alleen lezen</p>
                <p className="text-xs text-[var(--ink-3)]">
                  Wij kunnen alleen transacties en saldo&apos;s bekijken. Geen overboekingen of wijzigingen.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setStep('select'); setSelectedBank(null) }}
              className="rounded-lg border border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Andere bank
            </button>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex-1 rounded-lg bg-kern-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            >
              {connecting ? 'Verbinden...' : `Verbind met ${selectedBank.name}`}
            </button>
          </div>
        </div>
      )}

      {/* Step: Redirect */}
      {step === 'redirect' && (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-[var(--ink-2)]">
            Je wordt doorgestuurd naar je bank...
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Dit kan een moment duren. Sluit dit venster niet.
          </p>
        </div>
      )}
    </div>
  )
}
