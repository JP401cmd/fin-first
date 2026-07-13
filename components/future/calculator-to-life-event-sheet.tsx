'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  buildLifeEventDraft,
  type LifeEventImpactKind,
} from '@/lib/calculator/to-life-event'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'

/**
 * CalculatorToLifeEventSheet — optionele eindstap: destilleer de
 * calculator-uitkomst tot een levensgebeurtenis op de tijdas. De
 * gebruiker kiest impact-type (eenmalig / maandelijks kost / maandelijks
 * inkomen), bedrag (voorgevuld vanuit de gekozen scenario-output),
 * leeftijd en eventueel duur. Insert in life_events → navigeert naar de
 * Gebeurtenissen-tab.
 */
export function CalculatorToLifeEventSheet({
  defaultName,
  defaultAmount,
  defaultAge,
  defaultImpactKind = 'one_time_cost',
  defaultDurationMonths = 0,
  onClose,
}: {
  defaultName: string
  defaultAmount: number
  defaultAge: number | null
  /**
   * Voorgeselecteerd impact-type. Standaard 'one_time_cost' (rekenhulp-uitkomst).
   * Beslishulp-opties zetten dit expliciet: beleggen → monthly_income,
   * noodfonds → monthly_cost, etc.
   */
  defaultImpactKind?: LifeEventImpactKind
  /** Voorgevulde duur in maanden voor maandelijkse impact (0 = doorlopend). */
  defaultDurationMonths?: number
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [impactKind, setImpactKind] = useState<LifeEventImpactKind>(defaultImpactKind)
  const [amount, setAmount] = useState(String(Math.round(Math.abs(defaultAmount)) || 0))
  const [age, setAge] = useState(defaultAge != null ? String(defaultAge) : '')
  const [durationMonths, setDurationMonths] = useState(String(Math.max(0, Math.round(defaultDurationMonths))))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMonthly = impactKind !== 'one_time_cost'

  async function handleSave() {
    const numAmount = Number(amount)
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setError('Vul een positief bedrag in.')
      return
    }
    setSaving(true)
    setError(null)
    const draft = buildLifeEventDraft({
      name,
      targetAge: age ? Number(age) : null,
      impactKind,
      amount: numAmount,
      durationMonths: Number(durationMonths) || 0,
    })
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd.')
      setSaving(false)
      return
    }
    const { error: insertError } = await supabase.from('life_events').insert({
      user_id: user.id,
      is_active: true,
      ...draft,
    })
    setSaving(false)
    if (insertError) {
      setError(`Opslaan mislukt: ${insertError.message}`)
      return
    }
    onClose()
    router.push('/toekomst?tab=gebeurtenissen')
    router.refresh()
  }

  return (
    <ShellOverlay
      open
      onClose={onClose}
      kind="sheet"
      size="md"
      title="Maak een levensgebeurtenis"
      footer={
        <ModalFooter
          primary={{ label: 'Naar tijdas', onClick: handleSave, loading: saving }}
          secondary={{ label: 'Annuleer', onClick: onClose }}
        />
      }
    >
      <div className="p-5 sm:p-6">
        {error && (
          <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Naam</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Soort impact</span>
            <select
              value={impactKind}
              onChange={(e) => setImpactKind(e.target.value as LifeEventImpactKind)}
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
            >
              <option value="one_time_cost">Eenmalige uitgave</option>
              <option value="monthly_cost">Maandelijkse uitgave</option>
              <option value="monthly_income">Maandelijks inkomen</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Bedrag (€)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Leeftijd</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="bv. 40"
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
              />
            </label>
          </div>

          {isMonthly && (
            <label className="block">
              <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                Duur (maanden, 0 = doorlopend)
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
              />
            </label>
          )}
        </div>
      </div>
    </ShellOverlay>
  )
}
