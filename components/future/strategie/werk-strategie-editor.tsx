'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, TrendingUp, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { LifeEvent, WerkMetadata, WerkFase, WerkSprong } from '@/lib/horizon-data'
import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { salaryAt } from '@/lib/werk-strategie'
import { previewFireAge, type PreviewBaseline } from '@/lib/strategy-preview'
import { ScenarioCallout } from '@/components/editorial'
import { StrategieModalShell, StrategieFooter } from './strategie-modal-shell'
import { LabeledNumber } from './fields'

interface Props {
  /** Bestaande werk-rij (event_type='werk') of null wanneer nog niet aangemaakt. */
  event: LifeEvent | null
  /** Alle huidige events (voor de live vrijheidsleeftijd-preview). */
  allEvents: LifeEvent[]
  baseline: PreviewBaseline | null
  /** Dagelijkse must-uitgaven, voor vrijheid-tijd framing. */
  dailyExpenses: number
  /** Huidige leeftijd uit DOB (null = onbekend → editor defaultet naar 40 + waarschuwing). */
  currentAge: number | null
  /** Huidig netto maandinkomen (prefill). */
  currentNetMonthly: number
  /** Wettelijke AOW-leeftijd — mijlpaal voor de inkomenslijn-readout. */
  aowAge: number
  onClose: () => void
  readOnly?: boolean
}

const DEELTIJD_PRESETS = [
  { pct: 80, dagen: '4 dagen' },
  { pct: 60, dagen: '3 dagen' },
  { pct: 40, dagen: '2 dagen' },
]

export function WerkStrategieEditor({
  event,
  allEvents,
  baseline,
  dailyExpenses,
  currentAge,
  currentNetMonthly,
  aowAge,
  onClose,
  readOnly,
}: Props) {
  const router = useRouter()
  const effectiveAge = currentAge ?? 40

  const meta = (event?.metadata ?? {}) as WerkMetadata

  const [huidigNettoMaand, setHuidigNettoMaand] = useState<number>(
    Math.round(meta.huidigNettoMaand ?? currentNetMonthly ?? 0),
  )
  // Reële groei intern als decimaal; UI toont procenten.
  const [groeiPct, setGroeiPct] = useState<number>(Math.round((meta.reeleGroeiPct ?? 0.01) * 1000) / 10)
  const [groeiStop, setGroeiStop] = useState<boolean>(meta.groeiTotLeeftijd != null)
  const [groeiTotLeeftijd, setGroeiTotLeeftijd] = useState<number>(
    meta.groeiTotLeeftijd ?? Math.min(67, effectiveAge + 15),
  )
  const [plafond, setPlafond] = useState<number>(Math.round(meta.plafondNettoMaand ?? 0))
  const [faseStappen, setFaseStappen] = useState<WerkFase[]>(meta.faseStappen ?? [])
  const [sprongen, setSprongen] = useState<WerkSprong[]>(meta.sprongen ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // WerkMetadata uit de huidige form-state.
  const draftMeta: WerkMetadata = useMemo(
    () => ({
      huidigNettoMaand,
      reeleGroeiPct: groeiPct / 100,
      groeiTotLeeftijd: groeiStop ? groeiTotLeeftijd : undefined,
      plafondNettoMaand: plafond > 0 ? plafond : undefined,
      faseStappen: [...faseStappen].sort((a, b) => a.fromAge - b.fromAge),
      sprongen: [...sprongen].sort((a, b) => a.atAge - b.atAge),
      source: 'werk-strategy',
      schemaVersie: 1,
    }),
    [huidigNettoMaand, groeiPct, groeiStop, groeiTotLeeftijd, plafond, faseStappen, sprongen],
  )

  function buildDraftEvent(): LifeEvent {
    return {
      id: event?.id ?? 'werk-draft',
      name: 'Werk & inkomen',
      event_type: 'werk',
      target_age: effectiveAge,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      icon: 'Briefcase',
      is_active: true,
      sort_order: event?.sort_order ?? 0,
      is_indexed: true,
      metadata: draftMeta as unknown as Record<string, unknown>,
    }
  }

  // Live vrijheidsleeftijd: huidige (opgeslagen) staat → concept-staat.
  const { savedAge, draftAge } = useMemo(() => {
    if (!baseline) return { savedAge: null as number | null, draftAge: null as number | null }
    const others = allEvents.filter((e) => e.event_type !== 'werk')
    return {
      savedAge: previewFireAge(baseline, allEvents),
      draftAge: previewFireAge(baseline, [...others, buildDraftEvent()]),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, allEvents, draftMeta, effectiveAge, event?.id])

  // Inkomenslijn-mijlpalen (reëel, huidige euro's).
  const nu = Math.round(salaryAt(draftMeta, effectiveAge, effectiveAge))
  const over10 = Math.round(salaryAt(draftMeta, effectiveAge, effectiveAge + 10))
  const opAow = Math.round(salaryAt(draftMeta, effectiveAge, Math.max(effectiveAge, aowAge - 1)))

  const savedRounded = savedAge != null ? Math.round(savedAge) : null
  const draftRounded = draftAge != null ? Math.round(draftAge) : null

  function addFase() {
    const lastAge = faseStappen.length > 0 ? Math.max(...faseStappen.map((f) => f.fromAge)) : effectiveAge + 20
    setFaseStappen([...faseStappen, { fromAge: Math.min(70, lastAge + 5), pct: 80 }])
  }
  function updateFase(i: number, patch: Partial<WerkFase>) {
    setFaseStappen(faseStappen.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }
  function removeFase(i: number) {
    setFaseStappen(faseStappen.filter((_, idx) => idx !== i))
  }

  function addSprong() {
    const lastAge = sprongen.length > 0 ? Math.max(...sprongen.map((s) => s.atAge)) : effectiveAge
    setSprongen([...sprongen, { atAge: Math.min(70, lastAge + 3), deltaNettoMaand: 250 }])
  }
  function updateSprong(i: number, patch: Partial<WerkSprong>) {
    setSprongen(sprongen.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function removeSprong(i: number) {
    setSprongen(sprongen.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const payload = {
      name: 'Werk & inkomen',
      event_type: 'werk',
      target_age: effectiveAge,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      icon: 'Briefcase',
      is_active: true,
      is_indexed: true,
      metadata: draftMeta,
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
        setError('Niet ingelogd — kan Werk-strategie niet opslaan.')
        setSaving(false)
        return
      }
      const { error: e } = await supabase
        .from('life_events')
        .insert({ ...payload, user_id: user.id, sort_order: 0 })
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

  async function handleDelete() {
    if (!event) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: e } = await supabase.from('life_events').delete().eq('id', event.id)
    if (e) {
      setError(`Verwijderen mislukt: ${e.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
    router.refresh()
  }

  return (
    <StrategieModalShell
      open
      onClose={onClose}
      title="Werk-strategie"
      intro="Je loopbaan is opgeslagen tijd in wording. Schets je inkomenslijn — groei, een plafond, minder werken — en zie wat het met je vrijheidsdatum doet. Elke euro die je extra verdient, spaar je volledig."
      error={error}
      readOnly={readOnly}
      footer={
        readOnly ? undefined : (
          <StrategieFooter
            onCancel={onClose}
            onSave={handleSave}
            saving={saving}
            saveLabel="Werk-strategie opslaan"
            leading={
              event ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="inline-flex items-center gap-1 text-xs text-negative hover:underline disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Verwijder
                </button>
              ) : null
            }
          />
        )
      }
    >
      <div className="space-y-6">
        {currentAge == null && (
          <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Geen geboortedatum bekend — we rekenen vanaf leeftijd {effectiveAge}. Vul je
            geboortedatum in bij Profiel voor een nauwkeurige inkomenslijn.
          </div>
        )}

        {/* 1. Huidig inkomen */}
        <div>
          <LabeledNumber
            label="Huidig netto maandinkomen"
            unit="€"
            value={huidigNettoMaand}
            min={0}
            max={50000}
            step={50}
            onChange={setHuidigNettoMaand}
            disabled={readOnly}
            hint="Je inkomen uit werk nu. Wijzigingen hieronder zijn delta's hierop."
          />
        </div>

        {/* 2. Salarisgroei */}
        <div className="space-y-3 border-t border-[var(--border-ed)] pt-5">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Salarisgroei
          </div>
          <LabeledNumber
            label="Verwachte reële stijging"
            unit="%/jaar"
            value={groeiPct}
            min={0}
            max={15}
            step={0.5}
            onChange={setGroeiPct}
            disabled={readOnly}
            hint="Bovenop inflatie. Carrièregroei zit doorgaans rond 1–3% reëel per jaar."
          />
          <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
            <input
              type="checkbox"
              checked={groeiStop}
              disabled={readOnly}
              onChange={(e) => setGroeiStop(e.target.checked)}
              className="h-4 w-4 border-[var(--border-md)]"
            />
            Groei stopt op een bepaalde leeftijd
          </label>
          {groeiStop && (
            <LabeledNumber
              label="Groei stopt op leeftijd"
              unit="jaar"
              value={groeiTotLeeftijd}
              min={effectiveAge}
              max={71}
              step={1}
              onChange={setGroeiTotLeeftijd}
              disabled={readOnly}
            />
          )}
          <LabeledNumber
            label="Salarisplafond (optioneel)"
            unit="€"
            value={plafond}
            min={0}
            max={50000}
            step={100}
            onChange={setPlafond}
            disabled={readOnly}
            hint="Maximaal netto maandinkomen in huidige koopkracht. 0 = geen plafond."
          />
        </div>

        {/* 3. Minder werken */}
        <div className="space-y-3 border-t border-[var(--border-ed)] pt-5">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            <Clock className="h-3.5 w-3.5" aria-hidden /> Minder werken
          </div>
          {faseStappen.length === 0 && (
            <p className="text-xs text-[var(--ink-3)]">
              Geen stappen. Voeg er een toe om bijvoorbeeld vanaf je 55e vier dagen te werken.
            </p>
          )}
          {faseStappen.map((f, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-3 border border-[var(--border-ed)] p-3"
            >
              <LabeledNumber
                label="Vanaf leeftijd"
                unit="jaar"
                value={f.fromAge}
                min={effectiveAge}
                max={71}
                step={1}
                onChange={(v) => updateFase(i, { fromAge: v })}
                disabled={readOnly}
              />
              <div className="flex-1 min-w-[180px]">
                <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Nog werken
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DEELTIJD_PRESETS.map((p) => (
                    <button
                      key={p.pct}
                      type="button"
                      disabled={readOnly}
                      onClick={() => updateFase(i, { pct: p.pct })}
                      className={`border-2 px-2.5 py-1.5 text-xs transition-all ${
                        f.pct === p.pct
                          ? 'border-[var(--ink)] text-[var(--ink)]'
                          : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)]'
                      } ${readOnly ? 'opacity-50' : ''}`}
                    >
                      {p.pct}% · {p.dagen}
                    </button>
                  ))}
                </div>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeFase(i)}
                  className="mb-1 inline-flex items-center text-[var(--ink-4)] hover:text-negative"
                  aria-label="Stap verwijderen"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={addFase}
              className="inline-flex items-center gap-1.5 border border-dashed border-[var(--border-md)] px-3 py-2 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
            >
              <Plus className="h-4 w-4" aria-hidden /> Deeltijd-stap toevoegen
            </button>
          )}
        </div>

        {/* 4. Promotie-/salarissprongen */}
        <div className="space-y-3 border-t border-[var(--border-ed)] pt-5">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Promotie-sprongen
          </div>
          {sprongen.length === 0 && (
            <p className="text-xs text-[var(--ink-3)]">
              Geen sprongen. Voeg een eenmalige sprong toe voor bijvoorbeeld een promotie.
            </p>
          )}
          {sprongen.map((s, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-3 border border-[var(--border-ed)] p-3"
            >
              <LabeledNumber
                label="Op leeftijd"
                unit="jaar"
                value={s.atAge}
                min={effectiveAge}
                max={71}
                step={1}
                onChange={(v) => updateSprong(i, { atAge: v })}
                disabled={readOnly}
              />
              <LabeledNumber
                label="Erbij (netto/mnd)"
                unit="€"
                value={s.deltaNettoMaand}
                min={-10000}
                max={10000}
                step={50}
                onChange={(v) => updateSprong(i, { deltaNettoMaand: v })}
                disabled={readOnly}
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeSprong(i)}
                  className="mb-1 inline-flex items-center text-[var(--ink-4)] hover:text-negative"
                  aria-label="Sprong verwijderen"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={addSprong}
              className="inline-flex items-center gap-1.5 border border-dashed border-[var(--border-md)] px-3 py-2 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
            >
              <Plus className="h-4 w-4" aria-hidden /> Sprong toevoegen
            </button>
          )}
        </div>

        {/* Live readout: inkomenslijn + vrijheidsleeftijd */}
        <div className="border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Jouw inkomenslijn (reëel, netto/mnd)
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--ink-2)]">
            <span>
              Nu: <span className="font-mono tabular-nums">{formatCurrency(nu)}</span>
            </span>
            <span>
              +10 jaar: <span className="font-mono tabular-nums">{formatCurrency(over10)}</span>
            </span>
            <span>
              Rond AOW: <span className="font-mono tabular-nums">{formatCurrency(opAow)}</span>
            </span>
          </div>
          {dailyExpenses > 0 && over10 > nu && (
            <div className="mt-1 text-xs text-[var(--ink-3)]">
              De groei tot +10 jaar is {formatWithFreedom((over10 - nu) * 12, dailyExpenses)} extra
              vrijheid per jaar — volledig gespaard.
            </div>
          )}
          {baseline && savedRounded != null && draftRounded != null && (
            <div className="mt-3 border-t border-[var(--border-ed)] pt-3 text-sm text-[var(--ink-2)]">
              Vrijheidsleeftijd:{' '}
              <span className="font-mono tabular-nums">{savedRounded}</span>
              {' → '}
              <span className="font-mono tabular-nums font-semibold">{draftRounded}</span> jaar
              {draftRounded !== savedRounded && (
                <span className={draftRounded < savedRounded ? 'text-positive' : 'text-amber-700'}>
                  {' '}
                  ({draftRounded < savedRounded ? 'eerder vrij' : 'later vrij'})
                </span>
              )}
            </div>
          )}
        </div>

        <ScenarioCallout title="Hoe dit meerekent">
          Salarisgroei en sprongen verhogen je spaarvermogen (je uitgaven blijven gelijk); minder
          werken verlaagt het. De inkomenslijn telt mee zolang je werkt — daarna nemen je vermogen,
          AOW en pensioen het over.
        </ScenarioCallout>
      </div>
    </StrategieModalShell>
  )
}
