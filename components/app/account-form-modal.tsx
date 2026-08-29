'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import { useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'
import { AccountVisibilityToggle } from '@/components/app/account-visibility-toggle'
import {
  normalizePartnerVisibility,
  ownershipForVisibility,
  type PartnerVisibility,
} from '@/lib/bank-account-visibility'

export type Account = {
  id: string
  name: string
  iban: string | null
  bank_name: string | null
  account_type: string
  balance: number
  is_active: boolean
  sort_order: number
  linked_asset_id?: string | null
  ownership?: OwnershipType
  /**
   * Wat de huishoudpartner van deze rekening ziet (ADR 0118). Gekoppeld aan
   * `ownership` via een CHECK in de database; schrijven gaat uitsluitend als
   * blok via `PATCH /api/bank-accounts/[id]`.
   */
  partner_visibility?: PartnerVisibility
}

// ACCOUNT_TYPES woont nu in lib/account-types.ts (import-richting UI→lib).
import { ACCOUNT_TYPES } from '@/lib/account-types'
export { ACCOUNT_TYPES }

export function AccountFormModal({
  account,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  account: Account | null
  canDelete: boolean
  onSave: (data: { name: string; iban: string; bank_name: string; account_type: string; balance: number; partner_visibility: PartnerVisibility }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [iban, setIban] = useState(account?.iban ?? '')
  const [bankName, setBankName] = useState(account?.bank_name ?? '')
  const [accountType, setAccountType] = useState(account?.account_type ?? 'checking')
  const [balance, setBalance] = useState(account ? String(account.balance) : '')
  // Eigendom en zichtbaarheid zijn EEN gekoppelde toestand (ADR 0118); dit
  // formulier draagt daarom de driewegkeuze en leidt `ownership` eruit af.
  const [visibility, setVisibility] = useState<PartnerVisibility>(() =>
    normalizePartnerVisibility(account?.partner_visibility, account?.ownership ?? 'personal'),
  )
  const ownership: OwnershipType = ownershipForVisibility(visibility)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { hasHousehold } = useHouseholdStatus()

  // Backfill-bevestiging bij eigendomsflip van een bestaande rekening met historie.
  const [pendingBackfill, setPendingBackfill] = useState<{ next: OwnershipType; count: number } | null>(null)
  const [backfillChecked, setBackfillChecked] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)

  function persist() {
    onSave({
      name: name.trim(),
      iban: iban.trim(),
      bank_name: bankName.trim(),
      account_type: accountType,
      balance: Number(balance) || 0,
      partner_visibility: visibility,
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    // Bij het bewerken van een bestaande rekening waarvan het eigendom wijzigt:
    // tel de bestaande transacties met het oude eigendom. Zijn die er, vraag dan
    // eerst of ze meeverhuizen (standaard niet — historie blijft ongemoeid).
    const ownershipChanged = !!account && (account.ownership ?? 'personal') !== ownership
    if (ownershipChanged && account && !pendingBackfill) {
      const supabase = createClient()
      const prev: OwnershipType = ownership === 'shared' ? 'personal' : 'shared'
      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', account.id)
        .eq('ownership', prev)
      if ((count ?? 0) > 0) {
        setPendingBackfill({ next: ownership, count: count ?? 0 })
        return
      }
    }

    persist()
  }

  // Voer de optionele backfill uit en sluit daarna af via onSave. RLS beperkt de
  // UPDATE tot eigen rijen; de DB-trigger herstempelt household_id per rij.
  async function confirmBackfill() {
    if (!pendingBackfill || !account) return
    if (backfillChecked) {
      setBackfilling(true)
      const supabase = createClient()
      const { error } = await supabase
        .from('transactions')
        .update({ ownership: pendingBackfill.next })
        .eq('account_id', account.id)
      setBackfilling(false)
      if (error) {
        setBackfillResult('Bijwerken van transacties mislukt: ' + error.message)
        return
      }
    }
    setPendingBackfill(null)
    persist()
  }

  return (
    <BottomSheet open={true} onClose={onClose} title={account ? 'Rekening bewerken' : 'Nieuwe rekening'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Naam *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={accountType === 'contant_geld' ? 'Bijv. Portemonnee' : 'Bijv. Hoofdrekening'}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              required
              autoFocus
            />
          </div>

          {accountType !== 'contant_geld' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">IBAN</label>
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value.toUpperCase())}
                  placeholder="NL91ABNA..."
                  className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Bank</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bijv. ING"
                  className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Huidig saldo</label>
              <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              />
            </div>
          </div>

          {/* Eigendom — alleen relevant met een huishouden. */}
          {hasHousehold && (
            <div>
              <AccountVisibilityToggle
                value={visibility}
                onChange={(v) => { setVisibility(v); setBackfillResult(null) }}
                hasHousehold={hasHousehold}
              />
            </div>
          )}

          {/* Eigen rekeningen \u2014 het beheer zat hier als inklapblok en muteerde
              `user_own_ibans` rechtstreeks vanuit de browser (ADR 0058: muteren
              hoort via een API-route). Het woont nu op \u00E9\u00E9n plek, m\u00E9t de lijst van
              werkelijk voorkomende tegenpartijen: Budgetten \u2192 Eigen rekening. */}
          {accountType !== 'contant_geld' && (
            <p className="border-t border-[var(--border-ed)] pt-3 text-[11px] leading-relaxed text-[var(--ink-4)]">
              Heb je meer eigen rekeningen \u2014 een tweede bank, PayPal, een broker? Beheer die bij
              Budgetten \u2192 Eigen rekening. Overboekingen ertussen tellen dan niet mee als uitgave of
              inkomst.
            </p>
          )}

          {/* Backfill-bevestiging bij eigendomsflip met bestaande transacties. */}
          {pendingBackfill && (
            <div className="space-y-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
              <label className="flex items-start gap-2 text-xs text-[var(--ink-2)]">
                <input
                  type="checkbox"
                  checked={backfillChecked}
                  onChange={(e) => setBackfillChecked(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-kern-600"
                />
                <span>
                  {pendingBackfill.next === 'shared'
                    ? `Zet ook bestaande transacties van deze rekening op gezamenlijk (${pendingBackfill.count})`
                    : `Zet ook bestaande transacties van deze rekening op persoonlijk (${pendingBackfill.count})`}
                </span>
              </label>
              {backfillResult && (
                <p className="text-[11px] text-negative">{backfillResult}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setPendingBackfill(null); setBackfillChecked(false); setBackfillResult(null) }}
                  className="rounded-[var(--r)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-zinc-100"
                >
                  Annuleer
                </button>
                <button
                  type="button"
                  onClick={confirmBackfill}
                  disabled={backfilling}
                  className="rounded-[var(--r)] bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                >
                  {backfilling ? 'Bezig…' : 'Opslaan'}
                </button>
              </div>
            </div>
          )}

          <div className={`flex items-center justify-between pt-2${pendingBackfill ? ' hidden' : ''}`}>
            {account && canDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-negative">Zeker weten?</span>
                  <button
                    type="button"
                    onClick={() => onDelete(account.id)}
                    className="rounded-[var(--r)] bg-negative px-3 py-1.5 text-xs font-medium text-white hover:bg-negative/90"
                  >
                    Verwijderen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-[var(--r)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-zinc-100"
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r)] px-3 py-1.5 text-xs font-medium text-negative hover:bg-negative/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Verwijderen
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--r)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-zinc-100"
              >
                Annuleer
              </button>
              <button
                type="submit"
                className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
              >
                {account ? 'Opslaan' : 'Toevoegen'}
              </button>
            </div>
          </div>
        </form>
    </BottomSheet>
  )
}
