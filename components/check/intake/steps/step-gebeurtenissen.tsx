'use client'

import { useState, useId, useCallback, useEffect } from 'react'
import {
  Plus,
  Trash2,
  Heart,
  Palmtree,
  Baby,
  Gift,
  HandCoins,
  Hammer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import type { CheckIntakeLifeEvent } from '@/lib/check/types'
import { parseBedrag } from '@/lib/check/use-check-draft'
import { formatCurrency, dailyExpenseRate, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { primaryBtn, backBtn, ghostBtn, inlineAddBtn, inputBase } from '../intake-styles'
import { usePendingRows } from '../use-pending-rows'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
  onBack: () => void
}

const MAX_EVENTS = 10

/**
 * Gecuratreerde levensgebeurtenissen-catalogus voor de publieke check.
 * `sign` bepaalt of het bedrag in de intake als kost (negatief) of meevaller (positief)
 * wordt weggeschreven — conform CheckIntakeLifeEvent (amount < 0 = kost, > 0 = meevaller).
 * Labels/defaults zijn afgestemd op LIFE_EVENT_CATALOG (lib/horizon-data.ts) waar praktisch.
 */
type EventPreset = {
  key: string
  label: string
  icon: LucideIcon
  /** 'cost' = uitgave (amount negatief), 'windfall' = meevaller (amount positief). */
  sign: 'cost' | 'windfall'
  hint: string
  defaultAmount: number
  /** Default leeftijd relatief t.o.v. huidige leeftijd (jaren erbij). */
  defaultAgeOffset: number
}

const EVENT_PRESETS: EventPreset[] = [
  { key: 'huwelijk',      label: 'Huwelijk / trouwerij',   icon: Heart,     sign: 'cost',     hint: 'Bruiloft en huwelijk',                 defaultAmount: 20000,  defaultAgeOffset: 2 },
  { key: 'sabbatical',    label: 'Sabbatical',             icon: Palmtree,  sign: 'cost',     hint: 'Loopbaanonderbreking, onbetaald verlof', defaultAmount: 18000,  defaultAgeOffset: 5 },
  { key: 'kind',          label: 'Kind',                   icon: Baby,      sign: 'cost',     hint: 'Eenmalige uitzet + opvoedkosten',      defaultAmount: 5000,   defaultAgeOffset: 3 },
  { key: 'erfenis',       label: 'Erfenis',                icon: Gift,      sign: 'windfall', hint: 'Vermogen dat je ontvangt',             defaultAmount: 50000,  defaultAgeOffset: 15 },
  { key: 'woningverkoop', label: 'Woningverkoop',          icon: HandCoins, sign: 'windfall', hint: 'Overwaarde die vrijvalt',              defaultAmount: 75000,  defaultAgeOffset: 20 },
  { key: 'grote_aankoop', label: 'Grote aankoop / verbouwing', icon: Hammer, sign: 'cost',   hint: 'Verbouwing, auto, grote uitgave',      defaultAmount: 30000,  defaultAgeOffset: 4 },
]

function calcAge(dob: string | undefined | null): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

interface EventRowFormProps {
  preset: EventPreset
  currentAge: number | null
  dailyRate: number
  onAdd: (event: CheckIntakeLifeEvent) => void
  /** Meldt de openstaande, geldige invoer aan de stap zodat "Verder" hem meeneemt (C4). */
  onPendingChange: (key: string, pending: CheckIntakeLifeEvent | null) => void
}

function EventRowForm({ preset, currentAge, dailyRate, onAdd, onPendingChange }: EventRowFormProps) {
  const baseAge = (currentAge ?? 35) + preset.defaultAgeOffset
  const [open, setOpen] = useState(false)
  const [rawAge, setRawAge] = useState(String(baseAge))
  const [rawAmount, setRawAmount] = useState(String(preset.defaultAmount))
  const Icon = preset.icon
  const ageId = useId()
  const amtId = useId()

  const amountVal = parseBedrag(rawAmount)
  const ageVal = Math.round(parseBedrag(rawAge))

  // Vrijheidstijd-equivalent van het bedrag (informatief, in de modulekleur-context).
  const freedomLabel =
    amountVal > 0 && dailyRate > 0
      ? formatFreedomTimeString(calculateFreedomTime(amountVal, dailyRate), 'short')
      : null

  /** Zet de huidige invoer om naar een gebeurtenis — `null` bij een ongeldig bedrag of leeftijd. */
  const buildEvent = useCallback((): CheckIntakeLifeEvent | null => {
    if (amountVal <= 0) return null
    if (!ageVal || ageVal < 16 || ageVal > 100) return null
    return {
      key: preset.key,
      label: preset.label,
      age: ageVal,
      amount: preset.sign === 'cost' ? -amountVal : amountVal,
    }
  }, [amountVal, ageVal, preset.key, preset.label, preset.sign])

  // Houd de stap op de hoogte van openstaande invoer (C4 — niets gaat meer verloren).
  useEffect(() => {
    onPendingChange(preset.key, open ? buildEvent() : null)
  }, [open, buildEvent, onPendingChange, preset.key])

  // Verdwijnt de rij zelf (bv. bij het maximum), dan verdwijnt ook zijn melding.
  useEffect(() => () => onPendingChange(preset.key, null), [onPendingChange, preset.key])

  function handleAdd() {
    const event = buildEvent()
    if (!event) return
    onAdd(event)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 border border-dashed border-[var(--border-ed)] px-4 py-3 text-left text-sm text-[var(--ink-2)] transition-colors hover:border-horizon-400 hover:bg-horizon-50/50"
      >
        <Plus className="h-4 w-4 shrink-0 text-[var(--ink-meta)]" aria-hidden="true" />
        <Icon className="h-4 w-4 shrink-0 text-horizon-600" aria-hidden="true" />
        <span className="font-display font-medium">{preset.label}</span>
        <span className="font-serif text-xs italic text-[var(--ink-3)]">{preset.hint}</span>
      </button>
    )
  }

  return (
    <div className="border border-horizon-300 bg-horizon-50/30 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-horizon-600" aria-hidden="true" />
        <p className="font-display text-sm font-semibold text-[var(--ink)]">{preset.label}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {/* Leeftijd */}
        <div>
          <label htmlFor={ageId} className="mb-1 block text-xs font-medium text-[var(--ink-3)]">
            Op welke leeftijd?
          </label>
          <div className="relative">
            <input
              id={ageId}
              type="text"
              inputMode="numeric"
              value={rawAge}
              autoFocus
              onChange={(e) => setRawAge(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') setOpen(false)
              }}
              className={`${inputBase('horizon')} px-3 py-2 pr-8 font-mono text-sm tabular-nums`}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-meta)]">
              jr
            </span>
          </div>
        </div>
        {/* Bedrag */}
        <div>
          <label htmlFor={amtId} className="mb-1 block text-xs font-medium text-[var(--ink-3)]">
            {preset.sign === 'cost' ? 'Kosten' : 'Bedrag'}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-meta)]">
              &euro;
            </span>
            <input
              id={amtId}
              type="text"
              inputMode="decimal"
              value={rawAmount}
              onChange={(e) => setRawAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') setOpen(false)
              }}
              className={`${inputBase('horizon')} py-2 pr-2 pl-6 font-mono text-sm tabular-nums`}
            />
          </div>
        </div>
      </div>
      {freedomLabel && (
        <p className="font-serif text-xs italic text-[var(--ink-3)]">
          {preset.sign === 'cost' ? 'Kost ongeveer' : 'Levert ongeveer'}{' '}
          <span className="font-mono not-italic tabular-nums text-[var(--ink-2)]">{freedomLabel}</span>{' '}
          {preset.sign === 'cost' ? 'aan vrijheid' : 'extra vrijheid'}.
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={handleAdd} className={inlineAddBtn('horizon')}>
          Toevoegen
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-2 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          Annuleren
        </button>
      </div>
    </div>
  )
}

export function StepGebeurtenissen({ intake, onChange, onNext, onBack }: Props) {
  const events = intake.lifeEvents ?? []
  const currentAge = calcAge(intake.dateOfBirth)
  const dailyRate = dailyExpenseRate(intake.expenses?.totaalMaand ?? 0)
  const atMax = events.length >= MAX_EVENTS
  const pending = usePendingRows<CheckIntakeLifeEvent>()

  const handleAdd = useCallback(
    (event: CheckIntakeLifeEvent) => {
      onChange({ lifeEvents: [...events, event].slice(0, MAX_EVENTS) })
    },
    [events, onChange],
  )

  /** Commit eerst elke openstaande, ingevulde rij en navigeer dan pas (C4). */
  const commitThen = useCallback(
    (navigate: () => void) => {
      const rows = pending.flush()
      if (rows.length > 0) onChange({ lifeEvents: [...events, ...rows].slice(0, MAX_EVENTS) })
      navigate()
    },
    [events, onChange, pending.flush],
  )

  const handleRemove = useCallback(
    (idx: number) => {
      onChange({ lifeEvents: events.filter((_, i) => i !== idx) })
    },
    [events, onChange],
  )

  return (
    <div className="space-y-4">
      <p className="font-serif text-sm italic text-[var(--ink-3)]">
        Optioneel — grote gebeurtenissen die je vrijheidspad veranderen. Voeg toe wat je verwacht;
        je kunt alles in de app later fijn afstellen.
      </p>

      {/* Lijst bestaande gebeurtenissen */}
      {events.length > 0 && (
        <ul className="space-y-1" aria-label="Toegevoegde levensgebeurtenissen">
          {events.map((ev, idx) => {
            const isCost = (ev.amount ?? 0) < 0
            return (
              <li
                key={idx}
                className="flex items-center justify-between border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-serif text-sm text-[var(--ink)]">{ev.label}</span>
                  <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
                    {ev.age} jr
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {typeof ev.amount === 'number' && ev.amount !== 0 && (
                    <span
                      className={`font-mono text-sm tabular-nums ${
                        isCost ? 'text-negative' : 'text-positive'
                      }`}
                    >
                      {isCost ? '−' : '+'}
                      {formatCurrency(Math.abs(ev.amount))}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    aria-label={`Verwijder ${ev.label}`}
                    className="text-[var(--ink-meta)] transition-colors hover:text-negative"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Voeg-toe rijen */}
      {atMax ? (
        <p className="border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3 font-serif text-xs italic text-[var(--ink-3)]">
          Je hebt het maximum van {MAX_EVENTS} gebeurtenissen bereikt voor de check.
        </p>
      ) : (
        <div className="space-y-2">
          {EVENT_PRESETS.map((preset) => (
            <EventRowForm
              key={preset.key}
              preset={preset}
              currentAge={currentAge}
              dailyRate={dailyRate}
              onAdd={handleAdd}
              onPendingChange={pending.report}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <p className="min-h-4 font-serif text-xs italic text-[var(--ink-3)]" aria-live="polite">
          {pending.hasPending ? 'Je openstaande invoer nemen we mee als je verdergaat.' : ''}
        </p>
        <button type="button" onClick={() => commitThen(onNext)} className={primaryBtn('horizon')}>
          Verder
        </button>
        {events.length === 0 && !pending.hasPending && (
          <button type="button" onClick={onNext} className={ghostBtn}>
            Overslaan (geen gebeurtenissen)
          </button>
        )}
        <button type="button" onClick={() => commitThen(onBack)} className={backBtn}>
          Terug
        </button>
      </div>
    </div>
  )
}
