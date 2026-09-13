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
import type { CanonicalPensionType, LifeEvent } from '@/lib/horizon-data'
import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { bouwStrategieRij, strategieInvoerFout, type StrategieBody } from '@/lib/life-events/strategie-write'
import {
  allowedDuur,
  effectiveMonthly,
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
import { slaStrategieOp, useStrategieImpact, type StrategieImpactBron } from './strategie-impact'

export interface PensioenPotBodyProps {
  /** Beginstand van het concept (bestaande pot via `potFromEvent`, of `newPot`). */
  initialPot: PotDraft
  /**
   * Metadata van de bestaande pot (bv. `mijnpensioenBron` van de UPO-import) — de route
   * bewaart die bij het bijwerken; de preview rekent met dezelfde rij.
   */
  bestaandeMetadata?: Record<string, unknown>
  /** Waarmee het live effect gerekend wordt (zie `strategie-impact.tsx`). */
  impact: StrategieImpactBron
  /** Dagelijkse must-uitgaven, voor vrijheid-tijd framing. */
  dailyExpenses: number
  /** Wettelijke AOW-leeftijd voor validatie-waarschuwingen. */
  aowAge: number
  readOnly?: boolean
  /** Publiceert de save-state aan de host, die er de opslaanknop mee tekent. */
  onActionsChange: (s: RegelEditActionsState) => void
  /** Aanroepen na een geslaagde save; de host keert terug en ververst. */
  onSaved: () => void
  /** De "Alle potten"-knop bovenaan: terug naar de lijst van de host (weglaten = geen knop). */
  onTerug?: () => void
}

export function PensioenPotBody({
  initialPot,
  bestaandeMetadata,
  impact,
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

  const body: StrategieBody = useMemo(() => {
    const { id, ...pot } = draft
    return { event_type: 'pension', ...(id ? { id } : {}), pot }
  }, [draft])
  const invoerFout = strategieInvoerFout(body)
  // Het concept als rij: `eventFromPot` (dezelfde opbouw als de route), bestaande metadata erbij.
  const draftEvent: LifeEvent | null = useMemo(
    () =>
      invoerFout == null
        ? { ...bouwStrategieRij(body, bestaandeMetadata), id: draft.id ?? 'pension-draft', sort_order: 0 }
        : null,
    [body, invoerFout, bestaandeMetadata, draft.id],
  )
  const vervang = useMemo(() => ({ id: initialPot.id }), [initialPot.id])

  // Live vrijheidsleeftijd voor de pot-editor.
  const { savedAge, draftAge, inline, footerInfo, footerKey } = useStrategieImpact(impact, draftEvent, vervang)

  // Gewijzigd = anders dan de beginstand. Ook bij een nieuwe pot: de vooringevulde stand alleen
  // maakt nog geen pensioen aan (in de wizard begint die op € 0).
  const [opgeslagen, setOpgeslagen] = useState<string>(() => JSON.stringify(body))
  const changed = opgeslagen !== JSON.stringify(body)

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
    if (invoerFout != null) {
      setError(invoerFout)
      return
    }
    setSaving(true)
    setError(null)
    const uitkomst = await slaStrategieOp(body)
    setSaving(false)
    if (!uitkomst.ok) {
      setError(`Opslaan mislukt: ${uitkomst.fout}`)
      return
    }
    // Een nieuwe pot heeft nu een id; een volgende save werkt díe bij in plaats van een
    // tweede pot aan te maken.
    setDraft((d) => ({ ...d, id: uitkomst.id }))
    setOpgeslagen(JSON.stringify({ ...body, id: uitkomst.id }))
    onSaved()
  }

  // De host roept `save` aan buiten de render; via de ref leest die altijd het laatste
  // concept, zonder dat elke toetsaanslag een nieuwe publicatie (en render-lus) geeft.
  const saveRef = useRef(async () => {})
  useEffect(() => {
    saveRef.current = savePot
  })

  const canSave = !readOnly && !saving && invoerFout == null
  useEffect(() => {
    // Zonder wijziging schrijft bevestigen niets: dan ook geen effect in de footer (dat zou
    // een concept tonen dat nergens doorkomt).
    onActionsChange({ canSave, saving, save: () => void saveRef.current(), changed, footerInfo: changed ? footerInfo : undefined })
    // footerInfo volgt footerKey (de delta); zo publiceert niet elke render opnieuw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, saving, changed, footerKey])

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
        {onTerug && (
          <button
            type="button"
            onClick={onTerug}
            className="inline-flex items-center gap-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Alle potten
          </button>
        )}

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
          {invoerFout && (
            <div role="alert" className="mt-1 text-xs text-negative">
              {invoerFout}
            </div>
          )}
          {inline && savedRounded != null && draftRounded != null && (
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
