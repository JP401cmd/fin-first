'use client'

import { useId, useMemo, useState } from 'react'
import { ShieldAlert, AlertCircle, CheckCircle2 } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { isValidWalletAddress } from '@/lib/integrations/wallet-validation'
import type { WalletAddressRow, WalletChain } from '@/lib/connections-data'

interface AddWalletModalProps {
  open: boolean
  onClose: () => void
  /**
   * Asset waaraan de wallet wordt verbonden — verplicht (1-op-1 contract uit
   * R1). De caller weet welk asset gekoppeld moet worden; de modal toont de
   * naam in de header en stuurt het ID mee in de POST.
   */
  linkedAssetId: string
  /** Voor display in de modal-header ("Koppel wallet aan {assetName}"). */
  linkedAssetName: string
  /** Optionele initiële chain — caller kan vooraf bv. Bitcoin selecteren. */
  initialChain?: WalletChain
  /** Called after a successful create met de aangemaakte rij. */
  onConnected: (row: WalletAddressRow) => void
}

interface ChainOption {
  id: WalletChain
  label: string
  ticker: string
  badge: string
  accent: string
  placeholder: string
  hint: string
  family: 'btc' | 'evm' | 'sol'
}

const SUPPORTED_CHAINS: ChainOption[] = [
  {
    id: 'bitcoin',
    label: 'Bitcoin',
    ticker: 'BTC',
    badge: 'BTC',
    accent: '#f7931a',
    placeholder: 'bc1q… of 1… of 3…',
    hint: 'Legacy (1…), SegWit (3…) en bech32 (bc1…) worden ondersteund.',
    family: 'btc',
  },
  {
    id: 'ethereum',
    label: 'Ethereum',
    ticker: 'ETH',
    badge: 'ETH',
    accent: '#627eea',
    placeholder: '0x…',
    hint: '0x gevolgd door 40 hex-tekens. Hoofdletters maken niet uit.',
    family: 'evm',
  },
  {
    id: 'polygon',
    label: 'Polygon',
    ticker: 'MATIC',
    badge: 'POLY',
    accent: '#8247e5',
    placeholder: '0x…',
    hint: 'EVM-adres, zelfde formaat als Ethereum (0x… 40 hex-tekens).',
    family: 'evm',
  },
  {
    id: 'arbitrum',
    label: 'Arbitrum',
    ticker: 'ETH',
    badge: 'ARB',
    accent: '#28a0f0',
    placeholder: '0x…',
    hint: 'EVM-adres op Arbitrum One. Native token = ETH.',
    family: 'evm',
  },
  {
    id: 'base',
    label: 'Base',
    ticker: 'ETH',
    badge: 'BASE',
    accent: '#0052ff',
    placeholder: '0x…',
    hint: 'EVM-adres op Base. Native token = ETH.',
    family: 'evm',
  },
  {
    id: 'solana',
    label: 'Solana',
    ticker: 'SOL',
    badge: 'SOL',
    accent: '#14b58a',
    placeholder: 'base58 (32-44 tekens)',
    hint: 'Base58-publiek adres, hoofdletter-gevoelig.',
    family: 'sol',
  },
]

export function AddWalletModal({
  open,
  onClose,
  linkedAssetId,
  linkedAssetName,
  initialChain = 'ethereum',
  onConnected,
}: AddWalletModalProps) {
  const [chain, setChain] = useState<WalletChain>(initialChain)
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showAddressError, setShowAddressError] = useState(false)

  const chainId = useId()
  const addressId = useId()
  const labelId = useId()

  const activeChain = SUPPORTED_CHAINS.find((c) => c.id === chain) ?? SUPPORTED_CHAINS[0]
  const trimmedAddress = address.trim()
  const addressValid = useMemo(
    () => trimmedAddress.length > 0 && isValidWalletAddress(chain, trimmedAddress),
    [chain, trimmedAddress],
  )

  function reset() {
    setChain(initialChain)
    setAddress('')
    setLabel('')
    setSubmitting(false)
    setSubmitError(null)
    setShowAddressError(false)
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!addressValid) {
      setShowAddressError(true)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/integrations/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain,
          address: trimmedAddress,
          label: label.trim() || null,
          linkedAssetId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSubmitError(typeof json?.error === 'string' ? json.error : 'Toevoegen mislukt.')
        setSubmitting(false)
        return
      }
      const w = json?.wallet ?? {}
      const row: WalletAddressRow = {
        id: w.id,
        chain: w.chain,
        address: w.address,
        label: w.label ?? null,
        linkedAssetId: w.linkedAssetId ?? linkedAssetId,
        linkedAssetName,
        linkedAssetType: 'crypto',
        lastSyncedAt: w.lastSyncedAt ?? null,
        lastBalanceNative: w.lastBalanceNative ?? null,
        lastBalanceEur: w.lastBalanceEur ?? null,
        lastSyncError: w.lastSyncError ?? null,
        createdAt: w.createdAt,
      }
      onConnected(row)
      reset()
      onClose()
    } catch {
      setSubmitError('Netwerkfout — probeer opnieuw.')
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={`Koppel wallet aan ${linkedAssetName}`} size="lg">
      <div className="px-1 pb-4">
        {/* ── Privacy waarschuwing — bovenaan, niet wegklikbaar ──────── */}
        <section
          role="note"
          className="mb-6 border border-amber-200 bg-amber-50 p-4"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">Sla nooit je private key of seed phrase op</p>
              <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
                Wij vragen alleen je <strong>publieke adres</strong> — daarmee lezen we je
                saldo on-chain. Wallet-adressen zijn openbaar op de blockchain. Een private
                key of 12/24-woorden seed phrase hoort nooit in een app als deze. Wie ernaar
                vraagt, probeert je geld te stelen.
              </p>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Chain picker ────────────────────────────────────────── */}
          <div>
            <span id={chainId} className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Chain <span className="text-[var(--negative,_#b91c1c)]">*</span>
            </span>
            <div
              role="radiogroup"
              aria-labelledby={chainId}
              className="mt-2 grid grid-cols-3 gap-2"
            >
              {SUPPORTED_CHAINS.map((c) => {
                const selected = chain === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setChain(c.id)
                      setShowAddressError(false)
                    }}
                    className={`flex flex-col items-center gap-1.5 border p-3 text-center transition-all hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)] focus:ring-offset-1 ${
                      selected
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                        : 'border-[var(--border-md)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 items-center justify-center font-mono text-[10px] font-bold tabular-nums"
                      style={{
                        backgroundColor: selected ? c.accent : `${c.accent}1f`,
                        color: selected ? '#ffffff' : c.accent,
                      }}
                    >
                      {c.badge}
                    </span>
                    <span className="block text-[12px] font-semibold leading-tight">{c.label}</span>
                    <span className={`text-[10px] uppercase tracking-[0.08em] ${selected ? 'text-[var(--paper)]/70' : 'text-[var(--ink-3)]'}`}>
                      {c.ticker}
                    </span>
                  </button>
                )
              })}
            </div>
            {activeChain.family === 'evm' && activeChain.id !== 'ethereum' && (
              <p className="mt-2 text-[11px] italic text-[var(--ink-3)]">
                EVM-compatibel — zelfde adresformaat als Ethereum (0x…).
              </p>
            )}
          </div>

          {/* ── Address input met live-validatie ─────────────────────── */}
          <div>
            <label htmlFor={addressId} className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Wallet-adres <span className="text-[var(--negative,_#b91c1c)]">*</span>
            </label>
            <div className="relative mt-1">
              <input
                id={addressId}
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  if (showAddressError) setShowAddressError(false)
                }}
                onBlur={() => {
                  if (trimmedAddress.length > 0 && !addressValid) setShowAddressError(true)
                }}
                placeholder={activeChain.placeholder}
                required
                className="w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 pr-10 font-mono text-sm tabular-nums text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)]"
                aria-invalid={showAddressError}
                aria-describedby={`${addressId}-hint`}
              />
              {addressValid && (
                <CheckCircle2
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600"
                  aria-label="Adres geldig"
                />
              )}
            </div>
            <p id={`${addressId}-hint`} className="mt-1 text-[11px] text-[var(--ink-4)]">
              {activeChain.hint}
            </p>
            {showAddressError && (
              <p role="alert" className="mt-1 flex items-start gap-1 text-[11px] text-red-700">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Dit adres past niet bij het {activeChain.label}-formaat. Controleer of je het juiste netwerk hebt gekozen.
              </p>
            )}
          </div>

          {/* ── Label ───────────────────────────────────────────────── */}
          <div>
            <label htmlFor={labelId} className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Label <span className="font-normal normal-case tracking-normal text-[var(--ink-4)]">(optioneel)</span>
            </label>
            <input
              id={labelId}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="MetaMask hoofd"
              maxLength={60}
              className="mt-1 w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)]"
            />
            <p className="mt-1 text-[11px] text-[var(--ink-4)]">
              Voor jezelf — onderscheidt meerdere adressen op de overzichtspagina.
            </p>
          </div>

          {submitError && (
            <div role="alert" className="flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-ed)] pt-4">
            <button
              type="submit"
              disabled={submitting || !addressValid}
              className="inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Toevoegen…' : 'Voeg wallet toe'}
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
