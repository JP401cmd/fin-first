'use client'

/**
 * PensioenPotBody — de bewerkweergave van één pensioenpot (type, naam, ingangsleeftijd,
 * invoermodus, bedrag, uitkeringsduur, indexatie, partner, live impact) met de
 * opslagroute, los van de modal-chrome (TPR-15). `PensioenStrategieEditor` host 'm in
 * de pot-view van de strategie-modal en houdt daar zelf de lijst en het verwijderen; de
 * plan-review kan dezelfde body inline renderen. De body houdt het concept zelf bij en
 * publiceert de save-state via `onActionsChange` (contract `RegelEditActionsState`).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CanonicalPensionType, LifeEvent } from '@/lib/horizon-data'
import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { previewFireAge, type PreviewBaseline } from '@/lib/strategy-preview'
import {
  allowedDuur,
  effectiveMonthly,
  eventFromPot,
  DUUR_LABEL,
  TIJDELIJKE_PLAFOND,
  TYPE_LABEL,
  TYPE_ORDER,
  TYPE_SUB,
  type Duur,
  type PotDraft,
} from '@/lib/pension/pot-draft'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { LabeledNumber, TriggerButton } from './fields'

export interface PensioenPotBodyProps {
  /** Beginstand van het concept (bestaande pot via `potFromEvent`, of `newPot`). */
  initialPot: PotDraft
  /** Alle pension-events — voor de sort_order van een nieuwe pot. */
  pensionEvents: LifeEvent[]
  /** Alle huidige events (voor de live vrijheidsleeftijd-preview). */
  allEvents: LifeEvent[]
  baseline: PreviewBaseline | null
  /** Dagelijkse must-uitgaven, voor vrijheid-tijd framing. */
  dailyExpenses: number
  /** Wettelijke AOW-leeftijd voor validatie-waarschuwingen. */
  aowAge: number
  readOnly?: boolean
  /** Publiceert de save-state aan de host, die er de opslaanknop mee tekent. */
  onActionsChange: (s: RegelEditActionsState) => void
  /** Aanroepen na een geslaagde save; de host keert terug en ververst. */
  onSaved: () => void
  /** De "Alle potten"-knop bovenaan: terug naar de lijst van de host. */
  onTerug: () => void
}

export function PensioenPotBody({
  initialPot,
  pensionEvents,
  allEvents,
  baseline,
  dailyExpenses,
  aowAge,
  readOnly,
  onActionsChange,
  onSaved,
  onTerug,
}: PensioenPotBodyProps) {
  const [draft, setDraft] = useState<PotDraft>(initialPot)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live vrijheidsleeftijd voor de pot-editor.
  const { savedAge, draftAge } = useMemo(() => {
    if (!baseline) return { savedAge: null as number | null, draftAge: null as number | null }
    const others = allEvents.filter((e) => e.id !== draft.id)
    return {
      savedAge: previewFireAge(baseline, allEvents),
      draftAge: previewFireAge(baseline, [...others, eventFromPot(draft)]),
    }
  }, [baseline, allEvents, draft])

  function setType(t: CanonicalPensionType) {
    setDraft((d) => {
      const allowed = allowedDuur(t)
      const uitkeringsduur = allowed.includes(d.uitkeringsduur) ? d.uitkeringsduur : allowed[0]!
      // Naam meebewegen als die nog de oude type-default was.
      const name = d.name === TYPE_LABEL[d.pensioenType] ? TYPE_LABEL[t] : d.name
      return { ...d, pensioenType: t, uitkeringsduur, name }
    })
  }

  async function savePot() {
    if (!draft.name.trim()) {
      setError('Geef de pot een naam.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const ev = eventFromPot(draft)
    const payload = {
      name: ev.name.trim(),
      event_type: 'pension',
      target_age: ev.target_age,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: ev.monthly_income_change,
      duration_months: ev.duration_months,
      icon: ev.icon,
      is_active: true,
      is_indexed: ev.is_indexed,
      metadata: ev.metadata,
    }
    let dbError: { message: string } | null = null
    if (draft.id) {
      const { error: e } = await supabase.from('life_events').update(payload).eq('id', draft.id)
      dbError = e
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Niet ingelogd — kan pensioenpot niet opslaan.')
        setSaving(false)
        return
      }
      const maxSort = pensionEvents.reduce((m, e) => Math.max(m, e.sort_order ?? 0), 1000)
      const { error: e } = await supabase
        .from('life_events')
        .insert({ ...payload, user_id: user.id, sort_order: maxSort + 1 })
      dbError = e
    }
    if (dbError) {
      setError(`Opslaan mislukt: ${dbError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onSaved()
  }

  // De host roept `save` aan buiten de render; via de ref leest die altijd het laatste
  // concept, zonder dat elke toetsaanslag een nieuwe publicatie (en render-lus) geeft.
  const saveRef = useRef(async () => {})
  useEffect(() => {
    saveRef.current = savePot
  })

  const canSave = !readOnly && !saving
  useEffect(() => {
    onActionsChange({ canSave, saving, save: () => void saveRef.current() })
  }, [onActionsChange, canSave, saving])

  const allowed = allowedDuur(draft.pensioenType)
  const duurLocked = allowed.length === 1
  const showPartner = draft.pensioenType === 'lijfrente_levenslang'
  const effMonthly = effectiveMonthly(draft)
  const tijdelijkPlafondOverschreden =
    draft.pensioenType === 'tijdelijke_oudedagslijfrente' && effMonthly * 12 > TIJDELIJKE_PLAFOND
  const tijdelijkVoorAow =
    draft.pensioenType === 'tijdelijke_oudedagslijfrente' && draft.ingangLeeftijd < aowAge
  const savedRounded = savedAge != null ? Math.round(savedAge) : null
  const draftRounded = draftAge != null ? Math.round(draftAge) : null

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {error}
        </div>
      )}

      <div className="space-y-5">
        <button
          type="button"
          onClick={onTerug}
          className="inline-flex items-center gap-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Alle potten
        </button>

        {/* Type */}
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Type pensioen
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TYPE_ORDER.map((t) => (
              <TriggerButton
                key={t}
                selected={draft.pensioenType === t}
                onClick={() => setType(t)}
                title={TYPE_LABEL[t]}
                subtitle={TYPE_SUB[t]}
                disabled={readOnly}
              />
            ))}
          </div>
        </div>

        {/* Naam */}
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Naam van deze pot
          </span>
          <input
            type="text"
            value={draft.name}
            maxLength={60}
            disabled={readOnly}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-50"
          />
        </label>

        {/* Ingangsleeftijd */}
        <div>
          <LabeledNumber
            label="Gaat in op leeftijd"
            unit="jaar"
            value={draft.ingangLeeftijd}
            min={55}
            max={75}
            step={1}
            onChange={(v) => setDraft((d) => ({ ...d, ingangLeeftijd: v }))}
            disabled={readOnly}
            hint={`AOW-leeftijd is ${aowAge}. Eerder = actuariële korting.`}
          />
          {tijdelijkVoorAow && (
            <p className="mt-1 text-[11px] text-amber-700">
              Tijdelijke oudedagslijfrente gaat wettelijk pas in vanaf je AOW-leeftijd ({aowAge}).
            </p>
          )}
        </div>

        {/* Invoermodus */}
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Ik ken…
          </label>
          <div className="grid grid-cols-2 gap-2">
            <TriggerButton
              selected={draft.invoermodus === 'maand'}
              onClick={() => setDraft((d) => ({ ...d, invoermodus: 'maand' }))}
              title="Maandbedrag"
              subtitle="Ik weet het bruto bedrag per maand."
              disabled={readOnly}
            />
            <TriggerButton
              selected={draft.invoermodus === 'pot'}
              onClick={() => setDraft((d) => ({ ...d, invoermodus: 'pot' }))}
              title="Opgebouwde pot"
              subtitle="Ik weet het opgebouwde kapitaal."
              disabled={readOnly}
            />
          </div>
        </div>

        {draft.invoermodus === 'maand' ? (
          <div>
            <LabeledNumber
              label="Bruto per maand"
              unit="€"
              value={draft.brutoBedrag}
              min={0}
              max={20000}
              step={25}
              onChange={(v) => setDraft((d) => ({ ...d, brutoBedrag: v }))}
              disabled={readOnly}
            />
            {dailyExpenses > 0 && effMonthly > 0 && (
              <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                {formatWithFreedom(effMonthly * 12, dailyExpenses)} per jaar
              </p>
            )}
          </div>
        ) : (
          <div>
            <LabeledNumber
              label="Opgebouwd kapitaal"
              unit="€"
              value={draft.inlegBedrag}
              min={0}
              max={2000000}
              step={1000}
              onChange={(v) => setDraft((d) => ({ ...d, inlegBedrag: v }))}
              disabled={readOnly}
            />
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">
              ≈ <span className="font-mono tabular-nums">{formatCurrency(effMonthly)}</span>/maand
              bruto ({draft.uitkeringsduur === 'levenslang' ? 'levenslang' : `${draft.uitkeringsduur} jaar`}, 1,5% reëel).
            </p>
          </div>
        )}

        {/* Uitkeringsduur */}
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Uitkeringsduur
          </label>
          <select
            value={draft.uitkeringsduur}
            disabled={readOnly || duurLocked}
            onChange={(e) => setDraft((d) => ({ ...d, uitkeringsduur: e.target.value as Duur }))}
            className="w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-60"
          >
            {allowed.map((d) => (
              <option key={d} value={d}>
                {DUUR_LABEL[d]}
              </option>
            ))}
          </select>
          {tijdelijkPlafondOverschreden && (
            <p className="mt-1 text-[11px] text-amber-700">
              Boven het wettelijk plafond van € 27.192/jaar (2026) voor tijdelijke oudedagslijfrente.
            </p>
          )}
        </div>

        {/* Indexatie */}
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input
            type="checkbox"
            checked={draft.isGeindexeerd}
            disabled={readOnly}
            onChange={(e) => setDraft((d) => ({ ...d, isGeindexeerd: e.target.checked }))}
            className="h-4 w-4 border-[var(--border-md)]"
          />
          Wordt jaarlijks geïndexeerd (koopkracht blijft op peil)
        </label>

        {/* Partner */}
        {showPartner && (
          <LabeledNumber
            label="Partner ontvangt na overlijden"
            unit="%"
            value={draft.partnerUitkeringPct}
            min={0}
            max={100}
            step={10}
            onChange={(v) => setDraft((d) => ({ ...d, partnerUitkeringPct: v }))}
            disabled={readOnly}
            hint="Hoger partnerpercentage → lagere eigen uitkering (de pot moet langer doorlopen)."
          />
        )}

        {/* Live impact */}
        <div className="border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Impact op je tijdas
          </div>
          <div className="mt-1 text-sm text-[var(--ink-2)]">
            Bruto: <span className="font-mono tabular-nums">{formatCurrency(effMonthly)}</span>/mnd vanaf{' '}
            {draft.ingangLeeftijd}
          </div>
          {baseline && savedRounded != null && draftRounded != null && (
            <div className="mt-1 text-sm text-[var(--ink-2)]">
              Vrijheidsleeftijd:{' '}
              <span className="font-mono tabular-nums">{savedRounded}</span>
              {' → '}
              <span className="font-mono tabular-nums font-semibold">{draftRounded}</span> jaar
              {draftRounded !== savedRounded && (
                <span className={draftRounded < savedRounded ? 'text-positive' : 'text-amber-700'}>
                  {' '}({draftRounded < savedRounded ? 'eerder vrij' : 'later vrij'})
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
