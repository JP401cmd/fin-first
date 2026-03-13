'use client'

import { useState, useCallback, useEffect } from 'react'
import { Building2, X, Plus, Trash2 } from 'lucide-react'
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
  const [ownIbanRows, setOwnIbanRows] = useState<{ id: string; iban: string; label: string | null }[]>([])
  const [newOwnIban, setNewOwnIban] = useState('')
  const [newOwnIbanLabel, setNewOwnIbanLabel] = useState('')

  const loadOwnIbans = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('user_own_ibans')
      .select('id, iban, label')
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
      label: newOwnIbanLabel.trim() || null,
    })
    setNewOwnIban('')
    setNewOwnIbanLabel('')
    loadOwnIbans()
  }

  async function removeOwnIban(id: string) {
    const supabase = createClient()
    await supabase.from('user_own_ibans').delete().eq('id', id)
    loadOwnIbans()
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[var(--r-lg)] bg-[var(--paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-kern-600" />
            <h2 className="text-lg font-bold text-[var(--ink)]">
              {account ? 'Rekening bewerken' : 'Nieuwe rekening'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-[var(--r)] p-1.5 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Naam *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bijv. Hoofdrekening"
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              required
              autoFocus
            />
          </div>

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

          {/* Own IBAN registry */}
          <div className="border-t border-[var(--border-ed)] pt-3">
            <button
              type="button"
              onClick={() => setShowOwnIbans((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-3)] hover:text-[var(--ink-2)]"
            >
              <span>{showOwnIbans ? '\u25BE' : '\u25B8'}</span>
              Mijn andere eigen IBANs
            </button>
            {showOwnIbans && (
              <div className="mt-2 space-y-2">
                {ownIbanRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <span className="flex-1 font-mono text-xs text-[var(--ink-2)]">{row.iban}</span>
                    {row.label && (
                      <span className="text-xs italic text-[var(--ink-3)]">{row.label}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeOwnIban(row.id)}
                      className="rounded p-0.5 text-[var(--ink-4)] hover:bg-red-50 hover:text-red-500"
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
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            {account && canDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Zeker weten?</span>
                  <button
                    type="button"
                    onClick={() => onDelete(account.id)}
                    className="rounded-[var(--r)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
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
                  className="inline-flex items-center gap-1.5 rounded-[var(--r)] px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
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
      </div>
    </div>
  )
}
