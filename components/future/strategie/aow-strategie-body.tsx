'use client'

/**
 * AowStrategieBody — de velden, live readout en opslag van de AOW-strategie, los van de
 * modal-chrome (TPR-15). `AowStrategieEditor` host 'm in de strategie-modal; de
 * plan-review-wizard rendert dezelfde body inline (stap 3). De host tekent de opslaanknop
 * uit wat de body via `onActionsChange` publiceert (contract `RegelEditActionsState`).
 *
 * Opslaan gaat via `PUT /api/life-events/strategie`. Bestaat er nog geen AOW-rij, dan maakt
 * pas opslaan hem aan (besluit eigenaar 13 sep 2026): tot dan is het formulier vooringevuld
 * en telt het concept als gewijzigd.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { LifeEvent } from '@/lib/horizon-data'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { lookupAowAge, formatAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { ScenarioCallout } from '@/components/editorial'
import { bouwStrategieRij, strategieInvoerFout, type StrategieBody } from '@/lib/life-events/strategie-write'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { LabeledNumber, TriggerButton } from './fields'
import { slaStrategieOp, useStrategieImpact, type StrategieImpactBron } from './strategie-impact'

const VERVANG_AOW = { eventType: 'aow' } as const

export interface AowStrategieBodyProps {
  /** Bestaande AOW-rij (event_type='aow') of null wanneer nog niet aangemaakt. */
  event: LifeEvent | null
  /** Waarmee het live effect gerekend wordt (zie `strategie-impact.tsx`). */
  impact: StrategieImpactBron
  /** Dagelijkse must-uitgaven, voor vrijheid-tijd framing. */
  dailyExpenses: number
  aowRows: AowLeeftijdRow[]
  dateOfBirth: string | null
  readOnly?: boolean
  /** Publiceert de save-state aan de host, die er de opslaanknop mee tekent. */
  onActionsChange: (s: RegelEditActionsState) => void
  /** Aanroepen na een geslaagde save; de host sluit en ververst. */
  onSaved: () => void
}

export function AowStrategieBody({
  event,
  impact,
  dailyExpenses,
  aowRows,
  dateOfBirth,
  readOnly,
  onActionsChange,
  onSaved,
}: AowStrategieBodyProps) {
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

  const body: StrategieBody = useMemo(
    () => ({ event_type: 'aow', target_age: targetAge, leefsituatie, jarenBuitenNL }),
    [targetAge, leefsituatie, jarenBuitenNL],
  )
  const invoerFout = strategieInvoerFout(body)
  // Het concept als rij, via dezelfde opbouw als de route (maandbedrag incl.).
  const draft: LifeEvent | null = useMemo(
    () =>
      invoerFout == null
        ? { ...bouwStrategieRij(body, event?.metadata), id: event?.id ?? 'aow-draft', sort_order: 0 }
        : null,
    [body, invoerFout, event?.id, event?.metadata],
  )
  const monthly = draft?.monthly_income_change ?? 0

  // Live vrijheidsleeftijd: huidige (opgeslagen) staat → concept-staat.
  const { savedAge, draftAge, inline, footerInfo, footerKey } = useStrategieImpact(impact, draft, VERVANG_AOW)

  // Wat staat er opgeslagen? Zonder AOW-rij is er niets: opslaan maakt 'm aan.
  const [opgeslagen, setOpgeslagen] = useState<string | null>(() => (event ? JSON.stringify(body) : null))
  const changed = opgeslagen !== JSON.stringify(body)

  const kortingPct = Math.round(Math.min(50, Math.max(0, jarenBuitenNL)) * 2)

  async function handleSave() {
    if (invoerFout != null) return
    setSaving(true)
    setError(null)
    const uitkomst = await slaStrategieOp(body)
    setSaving(false)
    if (!uitkomst.ok) {
      setError(`Opslaan mislukt: ${uitkomst.fout}`)
      return
    }
    setOpgeslagen(JSON.stringify(body))
    onSaved()
  }

  // De host roept `save` aan buiten de render; via de ref leest die altijd de laatste
  // concept-staat, zonder dat elke toetsaanslag een nieuwe publicatie (en render-lus) geeft.
  const saveRef = useRef(async () => {})
  useEffect(() => {
    saveRef.current = handleSave
  })

  const canSave = !readOnly && !saving && invoerFout == null
  useEffect(() => {
    // Zonder wijziging schrijft bevestigen niets: dan ook geen effect in de footer (dat zou
    // een concept tonen dat nergens doorkomt).
    onActionsChange({ canSave, saving, save: () => void saveRef.current(), changed, footerInfo: changed ? footerInfo : undefined })
    // footerInfo volgt footerKey (de delta); zo publiceert niet elke render opnieuw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, saving, changed, footerKey])

  const draftRounded = draftAge != null ? Math.round(draftAge) : null
  const savedRounded = savedAge != null ? Math.round(savedAge) : null
  const showGap = draftAge != null && draftAge < targetAge

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
          {invoerFout && (
            <div role="alert" className="mt-0.5 text-xs text-negative">
              {invoerFout}
            </div>
          )}
          {inline && savedRounded != null && draftRounded != null && (
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
    </>
  )
}
