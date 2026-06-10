'use client'

import { useState, useCallback, useEffect } from 'react'
import { Building2, X, Plus, Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'

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
}

export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Betaalrekening' },
  { value: 'savings', label: 'Spaarrekening' },
  { value: 'joint', label: 'En/of-rekening' },
  { value: 'business', label: 'Zakelijke rekening' },
  { value: 'contant_geld', label: 'Contant geld' },
  { value: 'other', label: 'Overig' },
] as const

export function AccountFormModal({
  account,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  account: Account | null
  canDelete: boolean
  onSave: (data: { name: string; iban: string; bank_name: string; account_type: string; balance: number }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [iban, setIban] = useState(account?.iban ?? '')
  const [bankName, setBankName] = useState(account?.bank_name ?? '')
  const [accountType, setAccountType] = useState(account?.account_type ?? 'checking')
  const [balance, setBalance] = useState(account ? String(account.balance) : '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showOwnIbans, setShowOwnIbans] = useState(false)
  const [ownIbanRows, setOwnIbanRows] = useState<{ id: string; match_type: string; match_value: string; iban: string | null; label: string | null }[]>([])
  const [newOwnIban, setNewOwnIban] = useState('')
  const [newOwnIbanLabel, setNewOwnIbanLabel] = useState('')
  const [newOwnName, setNewOwnName] = useState('')
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyResult, setReclassifyResult] = useState<string | null>(null)

  const loadOwnIbans = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('user_own_ibans')
      .select('id, match_type, match_value, iban, label')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (data) setOwnIbanRows(data)
  }, [])

  useEffect(() => {
    if (showOwnIbans) { void loadOwnIbans() }
  }, [showOwnIbans, loadOwnIbans]) // eslint-disable-line react-hooks/set-state-in-effect

  async function addOwnIban() {
    const normalized = newOwnIban.replace(/\s/g, '').toUpperCase()
    if (!normalized) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_own_ibans').insert({
      user_id: user.id,
      iban: normalized,
      match_type: 'iban',
      match_value: normalized,
      label: newOwnIbanLabel.trim() || null,
    })
    setNewOwnIban('')
    setNewOwnIbanLabel('')
    loadOwnIbans()
  }

  async function addOwnName() {
    const value = newOwnName.trim()
    if (!value) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_own_ibans').insert({
      user_id: user.id,
      iban: null,
      match_type: 'name',
      match_value: value.toLowerCase(),
      label: value,
    })
    setNewOwnName('')
    loadOwnIbans()
  }

  async function removeOwnIban(id: string) {
    const supabase = createClient()
    await supabase.from('user_own_ibans').delete().eq('id', id)
    loadOwnIbans()
  }

  async function reclassifyTransactions() {
    setReclassifying(true)
    setReclassifyResult(null)
    try {
      const res = await fetch('/api/own-accounts/reclassify', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        const n = json.reclassified ?? 0
        setReclassifyResult(
          n > 0
            ? `${n} transactie${n === 1 ? '' : 's'} omgezet naar eigen rekening.`
            : (json.message ?? 'Geen transacties om om te zetten.'),
        )
      } else {
        setReclassifyResult(json.error ?? 'Herclassificeren mislukt.')
      }
    } catch {
      setReclassifyResult('Herclassificeren mislukt.')
    }
    setReclassifying(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      iban: iban.trim(),
      bank_name: bankName.trim(),
      account_type: accountType,
      balance: Number(balance) || 0,
    })
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

          {/* Own IBAN registry (hidden for contant geld) */}
          {accountType !== 'contant_geld' && <div className="border-t border-[var(--border-ed)] pt-3">
            <button
              type="button"
              onClick={() => setShowOwnIbans((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-3)] hover:text-[var(--ink-2)]"
            >
              <span>{showOwnIbans ? '\u25BE' : '\u25B8'}</span>
              Mijn andere eigen rekeningen
            </button>
            {showOwnIbans && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] leading-relaxed text-[var(--ink-4)]">
                  Markeer rekeningen die van jou zijn (bv. een tweede bank, PayPal of een broker).
                  Overboekingen naar/van deze rekeningen worden bij import herkend als eigen-rekening-verschuiving
                  en tellen nergens mee. Geen IBAN? Voeg een naam toe (bv. &ldquo;PayPal&rdquo;).
                </p>
                {ownIbanRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <span className="flex-1 font-mono text-xs text-[var(--ink-2)]">
                      {row.match_type === 'name'
                        ? <>naam: <span className="not-italic">{row.match_value}</span></>
                        : (row.iban ?? row.match_value)}
                    </span>
                    {row.label && row.match_type !== 'name' && (
                      <span className="text-xs italic text-[var(--ink-3)]">{row.label}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeOwnIban(row.id)}
                      className="rounded p-0.5 text-[var(--ink-4)] hover:bg-negative/10 hover:text-negative"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOwnIban}
                    onChange={(e) => setNewOwnIban(e.target.value.toUpperCase())}
                    placeholder="NL91ABNA..."
                    className="flex-1 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1 font-mono text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                  />
                  <input
                    type="text"
                    value={newOwnIbanLabel}
                    onChange={(e) => setNewOwnIbanLabel(e.target.value)}
                    placeholder="Label (optioneel)"
                    className="w-32 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                  />
                  <button
                    type="button"
                    onClick={addOwnIban}
                    className="rounded-[var(--r)] bg-kern-100 px-2 py-1 text-xs font-medium text-kern-700 hover:bg-kern-200"
                    aria-label="IBAN toevoegen"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOwnName}
                    onChange={(e) => setNewOwnName(e.target.value)}
                    placeholder="Naam, bijv. PayPal"
                    className="flex-1 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                  />
                  <button
                    type="button"
                    onClick={addOwnName}
                    className="rounded-[var(--r)] bg-kern-100 px-2 py-1 text-xs font-medium text-kern-700 hover:bg-kern-200"
                    aria-label="Naam toevoegen"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-[var(--border-ed)] pt-2">
                  <span className="text-[11px] text-[var(--ink-4)]">
                    {reclassifyResult ?? 'Bestaande transacties opnieuw indelen op deze regels?'}
                  </span>
                  <button
                    type="button"
                    onClick={reclassifyTransactions}
                    disabled={reclassifying}
                    className="shrink-0 rounded-[var(--r)] border border-[var(--border-md)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
                  >
                    {reclassifying ? 'Bezig\u2026' : 'Herclassificeer'}
                  </button>
                </div>
              </div>
            )}
          </div>}

          <div className="flex items-center justify-between pt-2">
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
