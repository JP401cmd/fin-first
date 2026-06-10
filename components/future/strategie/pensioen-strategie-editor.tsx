'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PiggyBank, Landmark, Plus, Trash2, ChevronLeft, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  annuitizePension,
  normalizePensionType,
  type CanonicalPensionType,
  type LifeEvent,
} from '@/lib/horizon-data'
import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { previewFireAge, type PreviewBaseline } from '@/lib/strategy-preview'
import { StrategieModalShell, StrategieFooter } from './strategie-modal-shell'
import { LabeledNumber, TriggerButton } from './fields'

const TYPE_LABEL: Record<CanonicalPensionType, string> = {
  bedrijf: 'Bedrijfspensioen',
  lijfrente_levenslang: 'Levenslange lijfrente',
  lijfrente_bancair: 'Bancaire lijfrente',
  tijdelijke_oudedagslijfrente: 'Tijdelijke oudedagslijfrente',
}

const TYPE_SUB: Record<CanonicalPensionType, string> = {
  bedrijf: 'Levenslange uitkering via je werkgever (mijnpensioenoverzicht.nl).',
  lijfrente_levenslang: 'Pot vervalt bij overlijden tenzij partneruitkering.',
  lijfrente_bancair: 'Wettelijk minimaal 20 jaar; restant gaat naar erfgenamen.',
  tijdelijke_oudedagslijfrente: 'Minimaal 5 jaar vanaf AOW. Plafond € 27.192/jr (2026).',
}

const TYPE_ORDER: CanonicalPensionType[] = [
  'bedrijf',
  'lijfrente_levenslang',
  'lijfrente_bancair',
  'tijdelijke_oudedagslijfrente',
]

const TIJDELIJKE_PLAFOND = 27192

type Duur = 'levenslang' | '20' | '10' | '5'

function allowedDuur(t: CanonicalPensionType): Duur[] {
  switch (t) {
    case 'bedrijf':
    case 'lijfrente_levenslang':
      return ['levenslang']
    case 'lijfrente_bancair':
      return ['20']
    case 'tijdelijke_oudedagslijfrente':
      return ['5', '10']
  }
}

const DUUR_LABEL: Record<Duur, string> = {
  levenslang: 'Levenslang',
  '20': '20 jaar',
  '10': '10 jaar',
  '5': '5 jaar',
}

interface PotDraft {
  id: string | null
  name: string
  pensioenType: CanonicalPensionType
  ingangLeeftijd: number
  invoermodus: 'maand' | 'pot'
  brutoBedrag: number
  inlegBedrag: number
  uitkeringsduur: Duur
  isGeindexeerd: boolean
  partnerUitkeringPct: number
}

function potFromEvent(ev: LifeEvent): PotDraft {
  const m = (ev.metadata ?? {}) as Record<string, unknown>
  return {
    id: ev.id,
    name: ev.name,
    pensioenType: normalizePensionType(m.pensioenType as string | undefined),
    ingangLeeftijd: Number(m.ingangLeeftijd ?? ev.target_age ?? 67),
    invoermodus: Number(m.inlegBedrag ?? 0) > 0 ? 'pot' : 'maand',
    brutoBedrag: Number(m.brutoBedrag ?? ev.monthly_income_change ?? 0),
    inlegBedrag: Number(m.inlegBedrag ?? 0),
    uitkeringsduur: (m.uitkeringsduur as Duur) ?? 'levenslang',
    isGeindexeerd: Boolean(m.isGeindexeerd ?? false),
    partnerUitkeringPct: Number(m.partnerUitkeringPct ?? 70),
  }
}

function newPot(ingang: number): PotDraft {
  return {
    id: null,
    name: 'Bedrijfspensioen',
    pensioenType: 'bedrijf',
    ingangLeeftijd: ingang,
    invoermodus: 'maand',
    brutoBedrag: 675,
    inlegBedrag: 0,
    uitkeringsduur: 'levenslang',
    isGeindexeerd: false,
    partnerUitkeringPct: 70,
  }
}

function effectiveMonthly(p: PotDraft): number {
  if (p.invoermodus === 'pot') {
    return annuitizePension({
      inlegBedrag: p.inlegBedrag,
      ingangLeeftijd: p.ingangLeeftijd,
      uitkeringsduur: p.uitkeringsduur,
      partnerUitkeringPct: p.pensioenType === 'lijfrente_levenslang' ? p.partnerUitkeringPct : undefined,
    })
  }
  return Math.round(p.brutoBedrag)
}

function eventFromPot(p: PotDraft): LifeEvent {
  return {
    id: p.id ?? 'pension-draft',
    name: p.name,
    event_type: 'pension',
    target_age: p.ingangLeeftijd,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: effectiveMonthly(p),
    duration_months: p.uitkeringsduur === 'levenslang' ? 0 : Number(p.uitkeringsduur) * 12,
    icon: p.pensioenType === 'bedrijf' ? 'Landmark' : 'PiggyBank',
    is_active: true,
    sort_order: 0,
    is_indexed: p.isGeindexeerd,
    metadata: {
      pensioenType: p.pensioenType,
      ingangLeeftijd: p.ingangLeeftijd,
      brutoBedrag: p.brutoBedrag,
      inlegBedrag: p.invoermodus === 'pot' ? p.inlegBedrag : 0,
      uitkeringsduur: p.uitkeringsduur,
      isGeindexeerd: p.isGeindexeerd,
      partnerUitkeringPct: p.partnerUitkeringPct,
      source: 'pension-strategy',
    },
  }
}

function schatJaarruimte(brutoJaarinkomen: number): number {
  const FRANCHISE = 17545
  const PCT = 0.133
  const MAX = 34950
  const grondslag = Math.max(0, brutoJaarinkomen - FRANCHISE)
  return Math.min(MAX, Math.round(grondslag * PCT))
}

interface Props {
  pensionEvents: LifeEvent[]
  allEvents: LifeEvent[]
  baseline: PreviewBaseline | null
  dailyExpenses: number
  /** Wettelijke AOW-leeftijd voor validatie-waarschuwingen. */
  aowAge: number
  /** Bruto jaarinkomen voor de jaarruimte-schatting (0 = verbergen). */
  grossYearlyIncome: number
  onClose: () => void
  readOnly?: boolean
}

export function PensioenStrategieEditor({
  pensionEvents,
  allEvents,
  baseline,
  dailyExpenses,
  aowAge,
  grossYearlyIncome,
  onClose,
  readOnly,
}: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<PotDraft | null>(null) // null = list-view
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showJaarruimte, setShowJaarruimte] = useState(false)

  const totalBruto = useMemo(
    () => pensionEvents.reduce((s, ev) => s + Number(ev.monthly_income_change ?? 0), 0),
    [pensionEvents],
  )

  // Live vrijheidsleeftijd voor de pot-editor.
  const { savedAge, draftAge } = useMemo(() => {
    if (!baseline || !draft) return { savedAge: null as number | null, draftAge: null as number | null }
    const others = allEvents.filter((e) => e.id !== draft.id)
    return {
      savedAge: previewFireAge(baseline, allEvents),
      draftAge: previewFireAge(baseline, [...others, eventFromPot(draft)]),
    }
  }, [baseline, allEvents, draft])

  function openNew() {
    setError(null)
    setDraft(newPot(aowAge || 67))
  }
  function openEdit(ev: LifeEvent) {
    setError(null)
    setDraft(potFromEvent(ev))
  }
  function backToList() {
    setError(null)
    setDraft(null)
  }

  function setType(t: CanonicalPensionType) {
    setDraft((d) => {
      if (!d) return d
      const allowed = allowedDuur(t)
      const uitkeringsduur = allowed.includes(d.uitkeringsduur) ? d.uitkeringsduur : allowed[0]!
      // Naam meebewegen als die nog de oude type-default was.
      const name = d.name === TYPE_LABEL[d.pensioenType] ? TYPE_LABEL[t] : d.name
      return { ...d, pensioenType: t, uitkeringsduur, name }
    })
  }

  async function savePot() {
    if (!draft) return
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
    setDraft(null)
    router.refresh()
  }

  async function deletePot() {
    if (!draft?.id) {
      setDraft(null)
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: e } = await supabase.from('life_events').delete().eq('id', draft.id)
    if (e) {
      setError(`Verwijderen mislukt: ${e.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    setDraft(null)
    router.refresh()
  }

  // ── LIST VIEW ──
  if (!draft) {
    const jaarruimte = schatJaarruimte(grossYearlyIncome)
    return (
      <StrategieModalShell
        open
        onClose={onClose}
        title="Pensioen-strategie"
        intro="Werknemerspensioen, lijfrente en banksparen — elke pot verschijnt als gebeurtenis op je tijdas."
        error={error}
        readOnly={readOnly}
        footer={<StrategieFooter onCancel={onClose} cancelLabel="Sluiten" />}
      >
        <div className="space-y-3">
          {pensionEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 text-center">
              <p className="mb-3 text-sm leading-relaxed text-[var(--ink-2)]">
                Nog geen pensioenpotten. Voeg je werknemerspensioen of lijfrente toe — je vindt de
                bedragen op{' '}
                <span className="font-medium">mijnpensioenoverzicht.nl</span>.
              </p>
            </div>
          ) : (
            pensionEvents.map((ev) => {
              const t = normalizePensionType((ev.metadata as Record<string, unknown>)?.pensioenType as string)
              const Icon = t === 'bedrijf' ? Landmark : PiggyBank
              const bruto = Number(ev.monthly_income_change ?? 0)
              return (
                <button
                  key={ev.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() => openEdit(ev)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:border-[var(--ink-3)] disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] text-[var(--ink-2)]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
                      <span className="truncate">{ev.name}</span>
                      {!readOnly && <Pencil className="h-3 w-3 shrink-0 text-[var(--ink-4)]" aria-hidden />}
                    </div>
                    <div className="text-xs text-[var(--ink-3)]">
                      Vanaf {ev.target_age} ·{' '}
                      {ev.duration_months ? `${ev.duration_months / 12} jaar` : 'levenslang'} ·{' '}
                      <span className="font-mono tabular-nums">{formatCurrency(bruto)}</span>/mnd bruto
                    </div>
                  </div>
                </button>
              )
            })
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={openNew}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--border-md)] px-4 py-3 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
            >
              <Plus className="h-4 w-4" aria-hidden /> Pensioenpot toevoegen
            </button>
          )}

          {pensionEvents.length > 0 && (
            <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Samen — totaal bruto pensioen
              </div>
              <div className="mt-1 font-mono text-xl tabular-nums text-[var(--ink)]">
                {formatCurrency(totalBruto)}
                <span className="ml-1 text-sm text-[var(--ink-3)]">/ mnd</span>
              </div>
              {dailyExpenses > 0 && totalBruto > 0 && (
                <div className="mt-0.5 text-xs text-[var(--ink-3)]">
                  {formatWithFreedom(totalBruto * 12, dailyExpenses)} per jaar
                </div>
              )}
            </div>
          )}

          {grossYearlyIncome > 0 && (
            <div className="rounded-xl border border-[var(--border-ed)] p-3 text-xs text-[var(--ink-2)]">
              <button
                type="button"
                onClick={() => setShowJaarruimte((s) => !s)}
                className="font-medium text-[var(--ink-2)] hover:underline"
              >
                💡 Jaarruimte berekenen {showJaarruimte ? '−' : '→'}
              </button>
              {showJaarruimte && (
                <p className="mt-2 leading-relaxed text-[var(--ink-3)]">
                  Je mag dit jaar naar schatting{' '}
                  <span className="font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(jaarruimte)}
                  </span>{' '}
                  fiscaalvriendelijk in lijfrente inleggen (13,3% van je premiegrondslag).
                  Niet-benutte ruimte van eerdere jaren (reserveringsruimte) vind je op
                  mijnpensioenoverzicht.nl.
                </p>
              )}
            </div>
          )}
        </div>
      </StrategieModalShell>
    )
  }

  // ── POT EDITOR VIEW ──
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
    <StrategieModalShell
      open
      onClose={onClose}
      kicker="Toekomst — pensioenpot"
      title="Pensioenpot"
      error={error}
      readOnly={readOnly}
      footer={
        <StrategieFooter
          onCancel={backToList}
          cancelLabel="Terug"
          onSave={readOnly ? undefined : savePot}
          saving={saving}
          saveLabel="Pot bewaren"
          leading={
            draft.id && !readOnly ? (
              <button
                type="button"
                onClick={deletePot}
                disabled={saving}
                className="inline-flex items-center gap-1 text-xs text-negative hover:underline disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Verwijder pot
              </button>
            ) : null
          }
        />
      }
    >
      <div className="space-y-5">
        <button
          type="button"
          onClick={backToList}
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
            onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-50"
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
            onChange={(v) => setDraft((d) => (d ? { ...d, ingangLeeftijd: v } : d))}
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
              onClick={() => setDraft((d) => (d ? { ...d, invoermodus: 'maand' } : d))}
              title="Maandbedrag"
              subtitle="Ik weet het bruto bedrag per maand."
              disabled={readOnly}
            />
            <TriggerButton
              selected={draft.invoermodus === 'pot'}
              onClick={() => setDraft((d) => (d ? { ...d, invoermodus: 'pot' } : d))}
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
              onChange={(v) => setDraft((d) => (d ? { ...d, brutoBedrag: v } : d))}
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
              onChange={(v) => setDraft((d) => (d ? { ...d, inlegBedrag: v } : d))}
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
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, uitkeringsduur: e.target.value as Duur } : d))
            }
            className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-60"
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
            onChange={(e) => setDraft((d) => (d ? { ...d, isGeindexeerd: e.target.checked } : d))}
            className="h-4 w-4 rounded border-[var(--border-md)]"
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
            onChange={(v) => setDraft((d) => (d ? { ...d, partnerUitkeringPct: v } : d))}
            disabled={readOnly}
            hint="Hoger partnerpercentage → lagere eigen uitkering (de pot moet langer doorlopen)."
          />
        )}

        {/* Live impact */}
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
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
    </StrategieModalShell>
  )
}
