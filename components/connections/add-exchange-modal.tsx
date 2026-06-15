'use client'

import { useId, useState } from 'react'
import { ExternalLink, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { CategoryTabs } from '@/components/core/category-tabs'
import type { ExchangeConnectionRow } from '@/lib/connections-data'

export type ExchangeKey = 'bitvavo' | 'kraken' | 'coinbase'

interface AddExchangeModalProps {
  open: boolean
  onClose: () => void
  /**
   * Asset waaraan deze koppeling wordt verbonden — verplicht (1-op-1 contract
   * uit R1). De caller weet welk asset gekoppeld moet worden; de modal toont
   * de naam in de header en stuurt het ID mee in de POST.
   */
  linkedAssetId: string
  /** Voor display in de modal-header ("Koppel Bitvavo aan {assetName}"). */
  linkedAssetName: string
  /**
   * Optionele initial exchange-tab. Caller kan vooraf bv. "Bitvavo" kiezen
   * via de type-picker zodat de modal direct op de juiste tab opent.
   */
  initialExchange?: ExchangeKey
  /**
   * Called after a successful connect met de aangemaakte rij. Parent kan
   * hiermee `router.refresh()` triggeren én de `linkedAssetName` (uit de
   * eigen scope) gebruiken voor een toast.
   */
  onConnected: (row: ExchangeConnectionRow) => void
}

interface ExchangeProfile {
  key: ExchangeKey
  /** Display name used in the title, CTA label, default label, success msg. */
  display: string
  /** Label for the secret field. Bitvavo "API-secret", Kraken/Coinbase "Private key". */
  secretLabel: string
  /** API endpoints for this exchange. */
  validateEndpoint: string
  connectEndpoint: string
  /** Step-by-step instructions rendered as <ol> children. */
  instructions: React.ReactNode
  /** External help-link URL. */
  helpUrl: string
  /** Visible label for the help-link. */
  helpLabel: string
  /** Render secret as multi-line textarea (Coinbase PEM). Default: single-line password. */
  secretMultiline?: boolean
  /** Minimum secret length for client-side guard. Coinbase PEMs are ~225 chars. */
  minSecretLen: number
  /** Helper hint shown below the secret field. */
  secretHint: string
  /** Optional placeholder for the secret textarea / input. */
  secretPlaceholder?: string
}

const PROFILES: Record<ExchangeKey, ExchangeProfile> = {
  bitvavo: {
    key: 'bitvavo',
    display: 'Bitvavo',
    secretLabel: 'API-secret',
    validateEndpoint: '/api/integrations/exchanges/bitvavo/validate',
    connectEndpoint: '/api/integrations/exchanges/bitvavo/connect',
    instructions: (
      <>
        <li>Open Bitvavo &rarr; profiel &rarr; <em>API</em>.</li>
        <li>Kies <em>Nieuwe API-key</em> en geef hem een naam (bv. &ldquo;TriFinity&rdquo;).</li>
        <li>
          Vink alleen <strong>View information</strong> aan. Laat <em>Trade</em> en{' '}
          <em>Withdraw</em> uit &mdash; wij plaatsen nooit orders en kunnen niets opnemen.
        </li>
        <li>Bevestig met je 2FA-code en kopieer de key + secret.</li>
      </>
    ),
    helpUrl: 'https://support.bitvavo.com/hc/en-us/articles/39972791184401',
    helpLabel: 'Bitvavo-handleiding openen',
    minSecretLen: 16,
    secretHint: 'Wordt versleuteld opgeslagen (AES-256-GCM) en is na koppeling niet meer leesbaar — ook niet voor ons.',
  },
  kraken: {
    key: 'kraken',
    display: 'Kraken',
    secretLabel: 'Private key',
    validateEndpoint: '/api/integrations/exchanges/kraken/validate',
    connectEndpoint: '/api/integrations/exchanges/kraken/connect',
    instructions: (
      <>
        <li>Log in op Kraken &rarr; <em>Settings</em> &rarr; <em>API</em>.</li>
        <li>Klik <em>Generate New Key</em> en geef een beschrijving (bv. &ldquo;TriFinity&rdquo;).</li>
        <li>
          Vink onder <em>Key Permissions</em> alleen <strong>Query Funds</strong> aan
          (en eventueel <em>Query Open/Closed Orders</em>). Laat alle <em>Modify</em>-,{' '}
          <em>Trade</em>- en <em>Withdraw</em>-rechten uit.
        </li>
        <li>Bevestig met 2FA en kopieer de <em>API Key</em> + <em>Private Key</em>.</li>
      </>
    ),
    helpUrl: 'https://www.kraken.com/u/security/api',
    helpLabel: 'Kraken API-pagina openen',
    minSecretLen: 16,
    secretHint: 'Wordt versleuteld opgeslagen (AES-256-GCM) en is na koppeling niet meer leesbaar — ook niet voor ons.',
  },
  coinbase: {
    key: 'coinbase',
    display: 'Coinbase',
    secretLabel: 'Private key (PEM)',
    validateEndpoint: '/api/integrations/exchanges/coinbase/validate',
    connectEndpoint: '/api/integrations/exchanges/coinbase/connect',
    instructions: (
      <>
        <li>
          Open <em>Coinbase Settings</em> &rarr; <em>API</em> en kies{' '}
          <em>Create new API key</em> (Advanced Trade).
        </li>
        <li>
          Geef de key een naam (bv. &ldquo;TriFinity&rdquo;) en selecteer
          alleen de portefeuilles die je wilt synchroniseren.
        </li>
        <li>
          Vink onder permissies alleen <strong>View</strong> aan. Laat{' '}
          <em>Trade</em> en <em>Transfer</em> uit &mdash; wij plaatsen nooit
          orders en kunnen niets opnemen.
        </li>
        <li>
          Bevestig met 2FA en kopieer de <strong>API key naam</strong>
          (organizations/&hellip;/apiKeys/&hellip;) en de{' '}
          <strong>private key</strong> in PEM-formaat &mdash; inclusief de
          <code className="mx-1 px-1 font-mono text-[11px]">-----BEGIN-----</code>
          en <code className="mx-1 px-1 font-mono text-[11px]">-----END-----</code> regels.
        </li>
      </>
    ),
    helpUrl: 'https://www.coinbase.com/settings/api',
    helpLabel: 'Coinbase API-instellingen openen',
    secretMultiline: true,
    // PEM EC PRIVATE KEY ≈ 225 chars; Ed25519 base64 ≈ 88 chars.
    minSecretLen: 80,
    secretHint: 'Plak de volledige PEM — inclusief de BEGIN- en END-regels. Wordt versleuteld opgeslagen (AES-256-GCM) en is na koppeling niet meer leesbaar.',
    secretPlaceholder: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----',
  },
}

const TABS = [
  { key: 'bitvavo', label: 'Bitvavo' },
  { key: 'kraken', label: 'Kraken' },
  { key: 'coinbase', label: 'Coinbase' },
]

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string }

export function AddExchangeModal({
  open,
  onClose,
  linkedAssetId,
  linkedAssetName,
  initialExchange = 'bitvavo',
  onConnected,
}: AddExchangeModalProps) {
  const [activeKey, setActiveKey] = useState<ExchangeKey>(initialExchange)
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' })
  const [submitError, setSubmitError] = useState<string | null>(null)

  const labelId = useId()
  const keyId = useId()
  const secretId = useId()

  const profile = PROFILES[activeKey]

  function resetForm() {
    setLabel('')
    setApiKey('')
    setApiSecret('')
    setTestState({ kind: 'idle' })
    setSubmitError(null)
    setSubmitting(false)
  }

  function handleClose() {
    if (submitting) return
    resetForm()
    setActiveKey(initialExchange)
    onClose()
  }

  function handleTabChange(nextKey: string) {
    if (submitting) return
    if (nextKey !== 'bitvavo' && nextKey !== 'kraken' && nextKey !== 'coinbase') return
    if (nextKey === activeKey) return
    // Switching tabs resets credentials so a key entered for one exchange
    // never gets POSTed to the other (privacy + correctness).
    setActiveKey(nextKey)
    resetForm()
  }

  async function handleTest() {
    if (apiKey.trim().length < 16 || apiSecret.trim().length < profile.minSecretLen) {
      setTestState({ kind: 'error', message: `Vul eerst je API-key en ${profile.secretLabel.toLowerCase()} in.` })
      return
    }
    setTestState({ kind: 'testing' })
    try {
      const res = await fetch(profile.validateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() }),
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
    // Koppelt is het submit-resultaat de enige relevante status — anders staan
    // groen "werkt" + een rood foutbericht tegelijk in beeld (verwarrend).
    setTestState({ kind: 'idle' })
    if (apiKey.trim().length < 16) {
      setSubmitError('API-key is te kort. Controleer of je de volledige key hebt geplakt.')
      return
    }
    if (apiSecret.trim().length < profile.minSecretLen) {
      setSubmitError(`${profile.secretLabel} is te kort. Controleer of je de volledige waarde hebt geplakt${profile.secretMultiline ? ' (incl. BEGIN/END-regels)' : ''}.`)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(profile.connectEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
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
      const row: ExchangeConnectionRow = {
        id: c.id,
        exchange: c.exchange,
        label: c.label ?? null,
        apiKeyLast4: c.apiKeyLast4 ?? null,
        lastSyncedAt: c.lastSyncedAt ?? null,
        lastSyncError: c.lastSyncError ?? null,
        createdAt: c.createdAt,
        linkedAssetId: c.linkedAssetId ?? linkedAssetId,
        linkedAssetName,
        linkedAssetType: 'crypto',
      }
      onConnected(row)
      resetForm()
      setActiveKey(initialExchange)
      onClose()
    } catch {
      setSubmitError('Netwerkfout — probeer opnieuw.')
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={`Koppel exchange aan ${linkedAssetName}`} size="lg">
      <div className="px-1 pb-4">
        {/* ── Tab-strip: kies exchange ─────────────────────────────── */}
        <CategoryTabs
          tabs={TABS}
          activeKey={activeKey}
          onChange={handleTabChange}
          className="mb-5"
        />

        {/* ── Uitleg: hoe maak je een read-only key ──────────────────── */}
        <section
          role="tabpanel"
          id={`category-tabpanel-${profile.key}`}
          aria-labelledby={`category-tab-${profile.key}`}
          className="mb-6 border border-[var(--border-ed)] bg-[var(--subtle)] p-4"
        >
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
              minLength={16}
              className="mt-1 w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)]"
            />
          </div>

          <div>
            <label htmlFor={secretId} className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {profile.secretLabel} <span className="text-[var(--negative,_#b91c1c)]">*</span>
            </label>
            {profile.secretMultiline ? (
              <textarea
                id={secretId}
                autoComplete="off"
                spellCheck={false}
                value={apiSecret}
                onChange={(e) => { setApiSecret(e.target.value); if (testState.kind !== 'idle') setTestState({ kind: 'idle' }) }}
                required
                minLength={profile.minSecretLen}
                rows={6}
                placeholder={profile.secretPlaceholder}
                className="mt-1 block w-full resize-y border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-[12px] leading-[1.5] text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)]"
              />
            ) : (
              <input
                id={secretId}
                type="password"
                autoComplete="off"
                value={apiSecret}
                onChange={(e) => { setApiSecret(e.target.value); if (testState.kind !== 'idle') setTestState({ kind: 'idle' }) }}
                required
                minLength={profile.minSecretLen}
                className="mt-1 w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)]"
              />
            )}
            <p className="mt-1 text-[11px] text-[var(--ink-4)]">
              {profile.secretHint}
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
              disabled={submitting || testState.kind === 'testing' || apiKey.length < 16 || apiSecret.length < profile.minSecretLen}
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
