'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  buildLifeEventDraft,
  type LifeEventImpactKind,
} from '@/lib/calculator/to-life-event'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { noteOverlayNavigation } from '@/lib/overlay-history'
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
  defaultUntilStop = false,
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
  /** Voorgevulde duur in maanden voor maandelijkse impact (0 = geen vaste periode). */
  defaultDurationMonths?: number
  /**
   * Voorgeselecteerd bij een doorlopende maandelijkse impact: stopt het bedrag als je
   * stopt met werken (ADR 0143)? Beslishulp-opties (extra inleg uit je salaris) zetten dit
   * aan; de rekenhulp laat het uit. De keuze staat zichtbaar in het formulier.
   */
  defaultUntilStop?: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [impactKind, setImpactKind] = useState<LifeEventImpactKind>(defaultImpactKind)
  const [amount, setAmount] = useState(String(Math.round(Math.abs(defaultAmount)) || 0))
  const [age, setAge] = useState(defaultAge != null ? String(defaultAge) : '')
  const initialDuration = Math.max(0, Math.round(defaultDurationMonths))
  const [until, setUntil] = useState<'doorlopend' | 'stopmoment' | 'periode'>(
    initialDuration > 0 ? 'periode' : defaultUntilStop ? 'stopmoment' : 'doorlopend',
  )
  const [durationMonths, setDurationMonths] = useState(String(initialDuration > 0 ? initialDuration : 12))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMonthly = impactKind !== 'one_time_cost'

  async function handleSave() {
    const numAmount = Number(amount)
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setError('Vul een positief bedrag in.')
      return
    }
    // "Een vaste periode" zonder geldige duur mag nooit stil een doorlopend event worden
    // (duur 0 = geen eind — precies het lek uit ADR 0143).
    if (isMonthly && until === 'periode' && !(Number(durationMonths) >= 1)) {
      setError('Vul een duur van minstens 1 maand in, of kies een andere optie bij "Tot wanneer".')
      return
    }
    setSaving(true)
    setError(null)
    const draft = buildLifeEventDraft({
      name,
      targetAge: age ? Number(age) : null,
      impactKind,
      amount: numAmount,
      durationMonths: until === 'periode' ? Number(durationMonths) || 0 : 0,
      untilStop: until === 'stopmoment',
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
    // Deze sluiting hoort bij de navigatie eronder: zonder dit signaal
    // consumeert de overlay-history haar entry met een `history.back()` die de
    // nog lopende route-wissel afbreekt (geen link-klik om aan te herkennen —
    // dit is een knop in de sticky footer). Zie lib/overlay-history.ts.
    noteOverlayNavigation()
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
            <div className="space-y-3">
              <div>
                <label htmlFor="life-event-until" className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Tot wanneer</label>
                <select
                  id="life-event-until"
                  aria-describedby="life-event-until-hint"
                  value={until}
                  onChange={(e) => setUntil(e.target.value as typeof until)}
                  className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                >
                  <option value="stopmoment">Tot ik stop met werken</option>
                  <option value="doorlopend">Blijft doorlopen</option>
                  <option value="periode">Een vaste periode</option>
                </select>
                <p id="life-event-until-hint" className="mt-1 text-xs text-[var(--ink-3)]">
                  {until === 'stopmoment'
                    ? 'Het bedrag stopt zodra je stopt met werken: op je vrijheidsleeftijd, of op de stopleeftijd die je zelf koos. Daarna telt het niet meer mee. Kies dit voor geld dat uit je werk komt, zoals extra inleg uit je salaris.'
                    : until === 'doorlopend'
                      ? 'Het bedrag loopt door tot het einde van je plan, ook nadat je gestopt bent met werken. Het telt dus ook mee in de jaren waarin je van je vermogen leeft. Kies dit voor geld dat los van je werk binnenkomt, zoals huurinkomsten.'
                      : 'Het bedrag telt alleen mee gedurende het aantal maanden dat je hieronder invult. Daarna stopt het, of je nu werkt of niet.'}
                </p>
              </div>
              {until === 'periode' && (
                <label className="block">
                  <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Duur (maanden)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                  />
                </label>
              )}
            </div>
          )}
        </div>
      </div>
    </ShellOverlay>
  )
}
