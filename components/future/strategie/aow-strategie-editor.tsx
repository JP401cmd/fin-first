'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { computeAowMonthly, type LifeEvent } from '@/lib/horizon-data'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { lookupAowAge, formatAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { ScenarioCallout } from '@/components/editorial'
import { previewFireAge, type PreviewBaseline } from '@/lib/strategy-preview'
import { StrategieModalShell, StrategieFooter } from './strategie-modal-shell'
import { LabeledNumber, TriggerButton } from './fields'

interface Props {
  /** Bestaande AOW-rij (event_type='aow') of null wanneer nog niet aangemaakt. */
  event: LifeEvent | null
  /** Alle huidige events (voor de live vrijheidsleeftijd-preview). */
  allEvents: LifeEvent[]
  baseline: PreviewBaseline | null
  /** Dagelijkse must-uitgaven, voor vrijheid-tijd framing. */
  dailyExpenses: number
  aowRows: AowLeeftijdRow[]
  dateOfBirth: string | null
  onClose: () => void
  readOnly?: boolean
}

export function AowStrategieEditor({
  event,
  allEvents,
  baseline,
  dailyExpenses,
  aowRows,
  dateOfBirth,
  onClose,
  readOnly,
}: Props) {
  const router = useRouter()
  const statutoryAge = useMemo(
    () => Math.ceil(lookupAowAge(aowRows, dateOfBirth).fractional),
    [aowRows, dateOfBirth],
  )
  const statutoryLabel = useMemo(
    () => formatAowAge(lookupAowAge(aowRows, dateOfBirth)),
    [aowRows, dateOfBirth],
  )

  const meta = (event?.metadata ?? {}) as {
    leefsituatie?: 'alleenstaand' | 'samenwonend'
    jarenBuitenNL?: number
    jarenInNL?: number
  }

  const [targetAge, setTargetAge] = useState<number>(event?.target_age ?? statutoryAge)
  const [leefsituatie, setLeefsituatie] = useState<'alleenstaand' | 'samenwonend'>(
    meta.leefsituatie ?? 'alleenstaand',
  )
  const [jarenBuitenNL, setJarenBuitenNL] = useState<number>(
    Number(meta.jarenBuitenNL ?? meta.jarenInNL ?? 0),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monthly = computeAowMonthly(leefsituatie, jarenBuitenNL)

  // Live vrijheidsleeftijd: huidige (opgeslagen) staat → concept-staat.
  const { savedAge, draftAge } = useMemo(() => {
    if (!baseline) return { savedAge: null as number | null, draftAge: null as number | null }
    const others = allEvents.filter((e) => e.event_type !== 'aow')
    const draft: LifeEvent = {
      id: event?.id ?? 'aow-draft',
      name: 'AOW',
      event_type: 'aow',
      target_age: targetAge,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: monthly,
      duration_months: 0,
      icon: 'Landmark',
      is_active: true,
      sort_order: 0,
      is_indexed: true,
      metadata: { leefsituatie, jarenBuitenNL },
    }
    return {
      savedAge: previewFireAge(baseline, allEvents),
      draftAge: previewFireAge(baseline, [...others, draft]),
    }
  }, [baseline, allEvents, event?.id, targetAge, monthly, leefsituatie, jarenBuitenNL])

  const kortingPct = Math.round(Math.min(50, Math.max(0, jarenBuitenNL)) * 2)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const payload = {
      name: 'AOW',
      event_type: 'aow',
      target_age: targetAge,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: monthly,
      duration_months: 0,
      icon: 'Landmark',
      is_active: true,
      sort_order: 0,
      is_indexed: true,
      metadata: { leefsituatie, jarenBuitenNL },
    }
    let dbError: { message: string } | null = null
    if (event) {
      const { error: e } = await supabase.from('life_events').update(payload).eq('id', event.id)
      dbError = e
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Niet ingelogd — kan AOW niet opslaan.')
        setSaving(false)
        return
      }
      const { error: e } = await supabase
        .from('life_events')
        .insert({ ...payload, user_id: user.id })
      dbError = e
    }
    if (dbError) {
      setError(`Opslaan mislukt: ${dbError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
    router.refresh()
  }

  const draftRounded = draftAge != null ? Math.round(draftAge) : null
  const savedRounded = savedAge != null ? Math.round(savedAge) : null
  const showGap = draftAge != null && draftAge < targetAge

  return (
    <StrategieModalShell
      open
      onClose={onClose}
      title="AOW-strategie"
      intro="AOW is opgeslagen tijd die de staat teruggeeft — gegarandeerde vrijheid vanaf je pensioenleeftijd."
      error={error}
      readOnly={readOnly}
      footer={
        readOnly ? undefined : (
          <StrategieFooter
            onCancel={onClose}
            onSave={handleSave}
            saving={saving}
            saveLabel="AOW opslaan"
          />
        )
      }
    >
      <div className="space-y-5">
        {/* Ingangsleeftijd */}
        <div>
          <div className="flex items-end gap-3">
            <LabeledNumber
              label="AOW-ingangsleeftijd"
              unit="jaar"
              value={targetAge}
              min={65}
              max={71}
              step={1}
              onChange={setTargetAge}
              disabled={readOnly}
            />
            {targetAge !== statutoryAge && !readOnly && (
              <button
                type="button"
                onClick={() => setTargetAge(statutoryAge)}
                className="mb-2 inline-flex items-center gap-1 rounded-full border border-[var(--border-ed)] px-2.5 py-1 text-[11px] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]"
              >
                <RotateCcw className="h-3 w-3" aria-hidden /> Wettelijk
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[var(--ink-3)]">
            Jouw wettelijke AOW-leeftijd: {statutoryLabel}.
            {!dateOfBirth && ' Vul je geboortedatum in bij Profiel voor de exacte leeftijd.'}
          </p>
        </div>

        {/* Leefsituatie */}
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Leefsituatie
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TriggerButton
              selected={leefsituatie === 'alleenstaand'}
              onClick={() => setLeefsituatie('alleenstaand')}
              title="Alleenstaand"
              subtitle={`${formatCurrency(NL_AOW_MONTHLY)} / mnd`}
              disabled={readOnly}
            />
            <TriggerButton
              selected={leefsituatie === 'samenwonend'}
              onClick={() => setLeefsituatie('samenwonend')}
              title="Samenwonend of getrouwd"
              subtitle={`${formatCurrency(NL_AOW_MONTHLY_SAMENWONEND)} p.p. — samen vaak meer`}
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Jaren buiten NL */}
        <div>
          <LabeledNumber
            label="Jaren buiten Nederland gewoond (15–67 jr)"
            unit="jaar"
            value={jarenBuitenNL}
            min={0}
            max={50}
            step={1}
            onChange={setJarenBuitenNL}
            hint={`Je bouwt 2% AOW op per jaar in NL. ${jarenBuitenNL} jaar buiten NL = ${kortingPct}% korting.`}
            disabled={readOnly}
          />
        </div>

        {/* Live readout */}
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Maandelijkse AOW
          </div>
          <div className="mt-1 font-mono text-2xl tabular-nums text-[var(--ink)]">
            {formatCurrency(monthly)}
            <span className="ml-1 text-sm text-[var(--ink-3)]">/ mnd</span>
          </div>
          {dailyExpenses > 0 && monthly > 0 && (
            <div className="mt-0.5 text-xs text-[var(--ink-3)]">
              {formatWithFreedom(monthly * 12, dailyExpenses)} per jaar aan gegarandeerde vrijheid
            </div>
          )}
          {monthly === 0 && (
            <div className="mt-0.5 text-xs text-amber-700">Geen AOW-opbouw bij 50 jaar buiten NL.</div>
          )}
          {baseline && savedRounded != null && draftRounded != null && (
            <div className="mt-3 border-t border-[var(--border-ed)] pt-3 text-sm text-[var(--ink-2)]">
              Vrijheidsleeftijd:{' '}
              <span className="font-mono tabular-nums">{savedRounded}</span>
              {' → '}
              <span className="font-mono tabular-nums font-semibold">{draftRounded}</span> jaar
              {draftRounded !== savedRounded && (
                <span className={draftRounded < savedRounded ? 'text-emerald-700' : 'text-amber-700'}>
                  {' '}({draftRounded < savedRounded ? 'eerder vrij' : 'later vrij'})
                </span>
              )}
            </div>
          )}
        </div>

        {/* AOW-gat */}
        {showGap && (
          <ScenarioCallout title="AOW-gat">
            {targetAge - (draftRounded ?? targetAge)} jaar tussen je vrijheidsleeftijd (
            {draftRounded}) en je AOW ({targetAge}). In die periode draagt je vermogen 100% van je
            uitgaven; daarna neemt AOW een deel over. Geen losse gebeurtenis nodig — de tijdas
            rekent dit gat al mee.
          </ScenarioCallout>
        )}
      </div>
    </StrategieModalShell>
  )
}
