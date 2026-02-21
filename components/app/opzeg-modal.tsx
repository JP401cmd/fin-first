'use client'

import { useState, useMemo, useEffect } from 'react'
import { Bot, X, BookmarkCheck } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import type { CancellationMetadata } from '@/lib/cancellation-types'

type SubscriptionItem = {
  id: string
  name: string
  averageAmount: number
  monthlyAmount: number
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  nextDate: string | null
  confidence: 'high' | 'medium' | 'low'
  isVariableAmount: boolean
  occurrences: number
  alreadyConfirmed: boolean
}

type OpzegModalProps = {
  open: boolean
  onClose: () => void
  subscription: SubscriptionItem | null
  initialMetadata?: CancellationMetadata
  userProfile: { full_name: string | null }
  onSavedToActionList: (actionId: string) => void
}

export function OpzegModal({
  open,
  onClose,
  subscription,
  initialMetadata,
  userProfile,
  onSavedToActionList,
}: OpzegModalProps) {
  const [naam, setNaam] = useState('')
  const [adres, setAdres] = useState('')
  const [postcode, setPostcode] = useState('')
  const [woonplaats, setWoonplaats] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Pre-fill when subscription or initialMetadata changes
  useEffect(() => {
    if (initialMetadata) {
      setNaam(initialMetadata.user_name)
      setAdres(initialMetadata.user_address)
      setPostcode(initialMetadata.user_postcode)
      setWoonplaats(initialMetadata.user_city)
    } else {
      setNaam(userProfile.full_name ?? '')
      setAdres('')
      setPostcode('')
      setWoonplaats('')
    }
    setError(null)
  }, [subscription, initialMetadata, userProfile.full_name])

  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const letter = useMemo(() => {
    const sub = subscription?.name ?? '…'
    const nameVal = naam.trim() || '[naam]'
    const adresVal = adres.trim() || '[adres]'
    const postcodeVal = postcode.trim() || '[postcode]'
    const woonplaatsVal = woonplaats.trim() || '[woonplaats]'

    return `${woonplaatsVal}, ${today}

Betreft: Opzegging abonnement ${sub}

Geachte heer/mevrouw,

Hierbij zeg ik mijn abonnement bij ${sub} op
per de vroegst mogelijke datum.

Naam: ${nameVal}
Adres: ${adresVal}
${postcodeVal} ${woonplaatsVal}

Ik verzoek u de opzegging schriftelijk te bevestigen.

Met vriendelijke groet,
${nameVal}`
  }, [subscription?.name, naam, adres, postcode, woonplaats, today])

  async function handleSaveToDraft() {
    if (!naam.trim() || !woonplaats.trim()) {
      setError('Naam en woonplaats zijn verplicht.')
      return
    }
    if (!subscription) return

    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Niet ingelogd')

      const metadata: CancellationMetadata = {
        type: 'subscription_cancellation',
        subscription_name: subscription.name,
        monthly_amount: subscription.monthlyAmount,
        frequency: subscription.frequency,
        user_name: naam.trim(),
        user_address: adres.trim(),
        user_postcode: postcode.trim(),
        user_city: woonplaats.trim(),
      }

      const { data, error: insertError } = await supabase
        .from('actions')
        .insert({
          user_id: user.id,
          source: 'manual',
          status: 'open',
          title: `Afronden van opzeggen ${subscription.name} abonnement`,
          description: `Opzegbrief klaargezet voor ${subscription.name} (${formatCurrency(subscription.monthlyAmount)}/mnd). Open deze actie om de opzegging af te ronden.`,
          freedom_days_impact: 0,
          euro_impact_monthly: subscription.monthlyAmount,
          metadata,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      onSavedToActionList(data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er is iets misgegaan.')
    } finally {
      setSaving(false)
    }
  }

  if (!subscription) return null

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Opzegbrief — ${subscription.name}`}
    >
      <div className="space-y-5">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-wil-600">OPZEGBRIEF</p>
          <p className="mt-1 text-[11px] text-[var(--ink-3)]">{subscription.name} — {formatCurrency(subscription.monthlyAmount)}/mnd</p>
        </div>

        {/* NAW-sectie */}
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-2)]">Uw gegevens</p>
          <div className="space-y-3">
            {[
              { label: 'Naam', value: naam, setter: setNaam, placeholder: 'Volledige naam' },
              { label: 'Adres', value: adres, setter: setAdres, placeholder: 'Straat + huisnummer' },
              { label: 'Postcode', value: postcode, setter: setPostcode, placeholder: '1234 AB' },
              { label: 'Woonplaats', value: woonplaats, setter: setWoonplaats, placeholder: 'Stad' },
            ].map(({ label, value, setter, placeholder }) => (
              <div key={label}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{label}</p>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  className="w-full border-b border-zinc-200 bg-transparent pb-1 font-sans text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-wil-400 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Opzegbrief preview */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-3)]">Opzegbrief preview</p>
          <pre className="overflow-hidden whitespace-pre-wrap rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-[11px] leading-relaxed text-[var(--ink-2)]">
            {letter}
          </pre>
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-[var(--r-sm)] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {error}
          </p>
        )}

        {/* Actieknoppen */}
        <div className="space-y-2">
          {/* Primair — opslaan in actielijst */}
          <button
            type="button"
            onClick={handleSaveToDraft}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] bg-wil-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-600 disabled:opacity-50"
          >
            <BookmarkCheck className="h-4 w-4" />
            {saving ? 'Opslaan…' : 'Opzegbrief bewaren voor later'}
          </button>

          {/* Secundair — coming soon: Will regelt het */}
          <button
            type="button"
            disabled
            title="Binnenkort beschikbaar"
            className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] border border-wil-200 px-4 py-3 text-sm font-medium text-wil-400 cursor-not-allowed opacity-60"
          >
            <Bot className="h-4 w-4" />
            Laat Will het opzeggen
            <span className="ml-1 rounded-full bg-wil-100 px-1.5 py-px text-[10px] uppercase tracking-wide text-wil-500">binnenkort</span>
          </button>

          {/* Tertiair — annuleer */}
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            <X className="h-4 w-4" />
            Annuleer
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
