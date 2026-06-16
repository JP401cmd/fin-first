'use client'

import { useId, useState } from 'react'
import { ExternalLink, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import type { BrokerConnectionRow, BrokerId } from '@/lib/broker-connections-data'

export type BrokerKey = BrokerId

interface AddBrokerModalProps {
  open: boolean
  onClose: () => void
  /**
   * Asset waaraan deze broker-koppeling wordt verbonden — verplicht (1-op-1
   * contract, gespiegeld op de exchange-tak). De caller weet welk asset
   * gekoppeld moet worden; de modal toont de naam in de header en stuurt het
   * ID mee in de POST.
   */
  linkedAssetId: string
  /** Voor display in de modal-header ("Koppel Trading 212 aan {assetName}"). */
  linkedAssetName: string
  /**
   * Called after a successful connect met de aangemaakte rij. Parent kan
   * hiermee `router.refresh()` triggeren én de `linkedAssetName` (uit de
   * eigen scope) gebruiken voor een toast.
   */
  onConnected: (row: BrokerConnectionRow) => void
}

interface BrokerProfile {
  key: BrokerKey
  /** Display name used in the title, CTA label, default label, success msg. */
  display: string
  /** API endpoints for this broker. */
  validateEndpoint: string
  connectEndpoint: string
  /** Step-by-step instructions rendered as <ol> children. */
  instructions: React.ReactNode
  /** External help-link URL. */
  helpUrl: string
  /** Visible label for the help-link. */
  helpLabel: string
  /** Minimum API-key length for client-side guard. */
  minKeyLen: number
  /** Helper hint shown below the key field. */
  keyHint: string
}

const PROFILES: Record<BrokerKey, BrokerProfile> = {
  trading212: {
    key: 'trading212',
    display: 'Trading 212',
    validateEndpoint: '/api/integrations/brokers/trading212/validate',
    connectEndpoint: '/api/integrations/brokers/trading212/connect',
    instructions: (
      <>
        <li>
          Open de Trading 212-app &rarr; <em>Instellingen</em> &rarr;{' '}
          <em>API (Beta)</em>.
        </li>
        <li>
          Genereer een nieuwe API-key en geef alleen <strong>leesrechten</strong>{' '}
          op je <em>posities</em> en <em>historie</em>. Laat order- en
          opname-rechten uit &mdash; wij plaatsen nooit orders.
        </li>
        <li>
          Werkt alleen voor je <strong>Invest</strong>- of{' '}
          <strong>Stocks ISA</strong>-account (niet voor CFD).
        </li>
        <li>Kopieer de gegenereerde API-key en plak hem hieronder.</li>
      </>
    ),
    helpUrl: 'https://helpcentre.trading212.com/hc/en-us/articles/14584770928157',
    helpLabel: 'Trading 212 API-handleiding openen',
    minKeyLen: 16,
    keyHint:
      'Wordt versleuteld opgeslagen (AES-256-GCM) en is na koppeling niet meer leesbaar — ook niet voor ons.',
  },
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string }

export function AddBrokerModal({
  open,
  onClose,
  linkedAssetId,
  linkedAssetName,
  onConnected,
}: AddBrokerModalProps) {
  // Eén broker (Trading 212) — geen tab-strip nodig zoals bij exchanges. Het
  // profiel-patroon blijft staan zodat een tweede broker later trivieel is.
  const profile = PROFILES.trading212

  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' })
  const [submitError, setSubmitError] = useState<string | null>(null)

  const labelId = useId()
  const keyId = useId()

  function resetForm() {
    setLabel('')
    setApiKey('')
    setTestState({ kind: 'idle' })
    setSubmitError(null)
    setSubmitting(false)
  }

  function handleClose() {
    if (submitting) return
    resetForm()
    onClose()
  }

  async function handleTest() {
    if (apiKey.trim().length < profile.minKeyLen) {
      setTestState({ kind: 'error', message: 'Vul eerst je API-key in.' })
      return
    }
    setTestState({ kind: 'testing' })
    try {
      const res = await fetch(profile.validateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      // Guard: een 5xx van de infra (timeout/proxy) kan een niet-JSON body geven.
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setTestState({
          kind: 'error',
          message: typeof json?.error === 'string' ? json.error : `Validatie mislukt (status ${res.status}).`,
        })
        return
      }
      setTestState({ kind: 'ok' })
    } catch {
      setTestState({ kind: 'error', message: 'Netwerkfout — probeer opnieuw.' })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    // Het groene "Verbinding werkt"-bericht hoort bij de Test-actie. Zodra je
    // Koppelt is het submit-resultaat de enige relevante status.
    setTestState({ kind: 'idle' })
    if (apiKey.trim().length < profile.minKeyLen) {
      setSubmitError('API-key is te kort. Controleer of je de volledige key hebt geplakt.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(profile.connectEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          label: label.trim() || null,
          linkedAssetId,
        }),
      })
      // Guard: een 5xx van de infra (timeout/proxy) kan een niet-JSON body geven —
      // toon dan de status i.p.v. 'm verkeerd als "Netwerkfout" te labelen.
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setSubmitError(typeof json?.error === 'string' ? json.error : `Koppelen mislukt (status ${res.status}).`)
        setSubmitting(false)
        return
      }
      // Server geeft { connection: {...} } met alleen publieke velden terug.
      // We rijgen de linked-asset-naam erbij vanuit de prop zodat de caller
      // niet extra hoeft te queryen.
      const c = json?.connection ?? {}
      const row: BrokerConnectionRow = {
        id: c.id,
        broker: c.broker ?? profile.key,
        label: c.label ?? null,
        apiKeyLast4: c.apiKeyLast4 ?? null,
        lastSyncedAt: c.lastSyncedAt ?? null,
        lastSyncError: c.lastSyncError ?? null,
        createdAt: c.createdAt,
        linkedAssetId: c.linkedAssetId ?? linkedAssetId,
        linkedAssetName,
        linkedAssetType: 'investment',
      }
      onConnected(row)
      resetForm()
      onClose()
    } catch {
      setSubmitError('Netwerkfout — probeer opnieuw.')
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={`Koppel ${profile.display} aan ${linkedAssetName}`} size="lg">
      <div className="px-1 pb-4">
        {/* ── Uitleg: hoe maak je een read-only key ──────────────────── */}
        <section className="mb-6 border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-2)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">Maak een lees-alleen API-key</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-[var(--ink-2)]">
                {profile.instructions}
              </ol>
              <a
                href={profile.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink)] underline underline-offset-4 hover:text-[var(--ink-2)]"
              >
                {profile.helpLabel}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        {/* ── Form ───────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={labelId} className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Label <span className="font-normal normal-case tracking-normal text-[var(--ink-4)]">(optioneel)</span>
            </label>
            <input
              id={labelId}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Hoofdaccount"
              maxLength={60}
              className="mt-1 w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)]"
            />
            <p className="mt-1 text-[11px] text-[var(--ink-4)]">
              Voor jezelf — onderscheidt meerdere {profile.display}-koppelingen op de overzichtspagina.
            </p>
          </div>

          <div>
            <label htmlFor={keyId} className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              API-key <span className="text-[var(--negative,_#b91c1c)]">*</span>
            </label>
            <input
              id={keyId}
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); if (testState.kind !== 'idle') setTestState({ kind: 'idle' }) }}
              required
              minLength={profile.minKeyLen}
              className="mt-1 w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)]"
            />
            <p className="mt-1 text-[11px] text-[var(--ink-4)]">
              {profile.keyHint}
            </p>
          </div>

          {/* ── Inline status ───────────────────────────────────────── */}
          {testState.kind === 'error' && (
            <div role="alert" className="flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{testState.message}</span>
            </div>
          )}
          {testState.kind === 'ok' && (
            <div role="status" className="flex items-start gap-2 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Verbinding werkt. Klik op &ldquo;Koppel {profile.display}&rdquo; om op te slaan.</span>
            </div>
          )}
          {submitError && (
            <div role="alert" className="flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}

          {/* ── Acties ──────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-ed)] pt-4">
            <button
              type="submit"
              disabled={submitting || testState.kind === 'testing'}
              className="inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Koppelen…' : `Koppel ${profile.display}`}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={submitting || testState.kind === 'testing' || apiKey.length < profile.minKeyLen}
              className="inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-all hover:-translate-y-px hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testState.kind === 'testing' ? 'Testen…' : 'Test verbinding'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="ml-auto px-3 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Annuleer
            </button>
          </div>
        </form>
      </div>
    </BottomSheet>
  )
}
