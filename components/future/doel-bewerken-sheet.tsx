'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2, TrendingUp, TrendingDown, Minus, Sparkles, ArrowRight, Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { getGoalSuggestions } from '@/lib/goal-suggestions'
import { GoalForm } from '@/components/app/goal-form'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import {
  computeGoalProgress,
  formatGoalValue,
  goalValueLabels,
  isGoalReached,
  GOAL_TYPE_META,
  type Goal,
} from '@/lib/goal-data'

type AssetLite = { id: string; name: string; current_value: number }
type DebtLite = { id: string; name: string; current_balance: number }

/**
 * Mirror van lib/goal-current-value#isAutoSyncMetricGoal — bewust lokaal: die
 * module trekt via de metric-bronnen de complete server-loader-graaf mee, en dit
 * is een triviale tag-check (`metadata.sync === 'auto'`). Houd identiek aan de
 * canonieke bron.
 */
function isAutoSyncMetricGoal(goal: Goal): boolean {
  const m = goal.metadata
  return typeof m === 'object' && m !== null && (m as Record<string, unknown>).sync === 'auto'
}

/**
 * Houdt de app dit doel zélf bij? Dan hoort er geen invoerveld te staan: wat je
 * hier zou typen wordt bij de volgende load overschreven door de koppeling
 * (`goal_links`, of de legacy-kolommen) of door de canonieke motor achter een
 * auto-sync-doel. Zelfde drieslag als de "loopt automatisch mee"-regel op de
 * doelkaart en als de check-in-overslaan-regel.
 */
function isLiveGoal(goal: Goal): boolean {
  return (
    (goal.links?.length ?? 0) > 0 ||
    !!goal.linked_asset_id ||
    !!goal.linked_debt_id ||
    isAutoSyncMetricGoal(goal)
  )
}

/**
 * Waar de live waarde vandaan komt, in gewone taal. Koppelingen winnen van de
 * metric-bron — zelfde voorrang als `syncActiveGoalValues`.
 */
function liveHerkomst(goal: Goal): string {
  if ((goal.links?.length ?? 0) > 0 || goal.linked_asset_id || goal.linked_debt_id) {
    return 'Deze stand komt uit je gekoppelde bezittingen en schulden.'
  }
  return 'Deze stand houdt de app zelf bij, uit je eigen cijfers.'
}

/**
 * DoelBewerkenSheet — quick-update flow per doel op /toekomst Doelen-tab.
 *
 * Plan §6.3 Tab 2: "Detail-pane bij klik (slide-in, edit + bijdrage-
 * monitor + acties van Fin)". MVP-versie: alleen voortgang bijwerken
 * (current_value) + verwijderen. Volledige edit van naam/bedrag/datum
 * blijft op /will (legacy) totdat de detail-pane volledig is.
 *
 * Flow:
 *  1. User klikt op doel-card in Plannen-modus → opent dialog
 *  2. Dialog toont huidige voortgang + input voor nieuwe waarde
 *  3. Submit: supabase.update — router.refresh → card update direct
 *  4. Optioneel: Verwijderen-knop met confirm voor doel-delete
 */
export function DoelBewerkenSheet({
  goal,
  onClose,
  onCompleted,
}: {
  /** Volledig Goal-object — nodig voor GoalForm (volledig-bewerken-flow). */
  goal: Goal
  onClose: () => void
  /**
   * Aangeroepen wanneer dit doel bij deze save de 100%-overgang maakt (van
   * niet-voltooid naar voltooid). De parent viert de mijlpaal ingetogen
   * (MilestoneCelebration). Wordt niet aangeroepen bij een re-save van een al
   * voltooid doel.
   *
   * `goalType` gaat mee zodat de viering de brug naar een volgend doel kan
   * leggen (suggestie uit `lib/goal-suggestions`) zonder het doel-object
   * opnieuw op te hoeven zoeken. Kan `null` zijn bij een doel zonder type.
   */
  onCompleted?: (goal: { id: string; name: string; goalType: string | null }) => void
}) {
  const goalId = goal.id
  const goalName = goal.name
  const currentValue = Number(goal.current_value)
  const targetValue = Number(goal.target_value)
  const goalType = goal.goal_type
  const suggestions = getGoalSuggestions(goalType)
  // Defensief: legacy-rijen kunnen een type dragen dat niet (meer) in
  // GOAL_TYPE_META staat. Zonder meta valt de weergave terug op euro's — het
  // gedrag van vóór deze wijziging.
  const meta = GOAL_TYPE_META[goalType] as (typeof GOAL_TYPE_META)[keyof typeof GOAL_TYPE_META] | undefined
  const fmtValue = (v: number) => (meta ? formatGoalValue(v, goalType, goal.custom_unit) : formatCurrency(v))
  const valueLabels = goalValueLabels(goalType)
  const isEuroGoal = !meta || meta.unit === 'EUR' || meta.unit === 'EUR/mnd'
  // Euro-doelen houden hun bestaande stap van €100; andere eenheden (procenten,
  // maanden, jaren) volgen de stap van hun type — 100 zou daar onzin zijn.
  const stepForInput = isEuroGoal ? 100 : (meta?.step ?? 1)
  /** Vanaf welk verschil de bijdrage-monitor iets te melden heeft. */
  const deltaDrempel = isEuroGoal ? 0.5 : 0.005
  // Live doel = geen invoerveld: wat je typt wordt bij de volgende load door de
  // koppeling of de motor overschreven.
  const live = isLiveGoal(goal)
  const [newValue, setNewValue] = useState(String(currentValue))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Volledig-bewerken-modus (GoalForm overlay). Bij open laden we lazy
  // assets+debts uit de DB zodat de koppeling-selects compleet zijn.
  const [fullEditOpen, setFullEditOpen] = useState(false)
  const [assets, setAssets] = useState<AssetLite[]>([])
  const [debts, setDebts] = useState<DebtLite[]>([])
  const router = useRouter()

  // Laad assets+debts on-demand wanneer de gebruiker voor 'Volledig
  // bewerken' kiest. Niet bij eerste mount — anders maken we een
  // overbodige DB-query voor de gebruikers die alleen quick-update doen.
  useEffect(() => {
    if (!fullEditOpen) return
    let cancelled = false
    async function load() {
      const supabase = createClient()
      // EIGEN rijen, expliciet — zie de gelijkluidende toelichting in
      // doel-toevoegen-sheet.tsx: de SELECT-policies op `assets`/`debts` zijn
      // huishoud-verbreed en de privacy-voorkeuren van de partner worden pas in
      // de perspectief-laag toegepast, die hier niet tussen zit.
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return
      const [aRes, dRes] = await Promise.all([
        supabase.from('assets').select('id, name, current_value').eq('user_id', user.id).order('name'),
        supabase.from('debts').select('id, name, current_balance').eq('user_id', user.id).order('name'),
      ])
      if (cancelled) return
      setAssets(((aRes.data ?? []) as AssetLite[]))
      setDebts(((dRes.data ?? []) as DebtLite[]))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [fullEditOpen])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const numeric = Number(newValue)
    if (!Number.isFinite(numeric)) {
      setError('Vul een geldig getal in.')
      return
    }
    // Ondergrens uit het type (`GOAL_TYPE_META.min`), niet hardcoded 0: een
    // schuldenvrij-datum loopt in decimale jaren (min 1900) en een leeftijd in
    // jaren (min 18). De 0-ondergrens houdt zijn bestaande tekst.
    const minValue = meta?.min ?? 0
    if (numeric < minValue) {
      setError(
        minValue === 0
          ? 'Waarde moet een getal ≥ 0 zijn.'
          : `Waarde moet minimaal ${fmtValue(minValue)} zijn.`,
      )
      return
    }
    setSaving(true)
    setError(null)
    // Behaald? RICHTING-BEWUST via `isGoalReached` (lib/goal-data.ts), niet via
    // een kale `numeric >= targetValue`. Bij een 'down'-doel (belastingdruk,
    // vrijheidsleeftijd, schuldenvrij-datum) draait de toets om: 35% tegen een
    // doel van 30% zou anders METEEN "behaald" zijn — mét viering en een
    // onomkeerbare regel in het mijlpalen-logboek — en een vrijheidsleeftijd van
    // 46 tegen doel 55 zou het nooit worden.
    const willBeCompleted = isGoalReached(goalType, numeric, targetValue)
    // `completed_at` volgt de OVERGANG, niet de stand (kaart #19). Alleen bij de
    // échte 0→100%-overgang stempelen we de datum; bij heropenen van een
    // voltooid doel wissen we 'm; bij een re-save van een al voltooid doel gaat
    // het veld NIET mee in de update, zodat de oorspronkelijke behaald-datum
    // blijft staan (anders schuift het Bereikt-archief bij elke save op).
    const justCompleted = willBeCompleted && !goal.is_completed
    const justReopened = !willBeCompleted && !!goal.is_completed
    const patch: {
      current_value: number
      is_completed: boolean
      completed_at?: string | null
    } = {
      current_value: numeric,
      is_completed: willBeCompleted,
    }
    if (justCompleted) patch.completed_at = new Date().toISOString()
    else if (justReopened) patch.completed_at = null
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('goals')
      .update(patch)
      .eq('id', goalId)
    if (updateError) {
      setError(`Opslaan mislukt: ${updateError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    // Mijlpaal: alleen bij de échte 100%-overgang (niet bij re-save van een al
    // voltooid doel). De parent viert 'm ingetogen; de once-guard per doel-id
    // voorkomt herhaling.
    if (justCompleted) {
      onCompleted?.({ id: goalId, name: goalName, goalType: goalType ?? null })
    }
    onClose()
    router.refresh()
  }

  async function handleDelete() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('goals')
      .delete()
      .eq('id', goalId)
    if (deleteError) {
      setError(`Verwijderen mislukt: ${deleteError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
    router.refresh()
  }

  const parsedNew = Number(newValue)
  const validNew = Number.isFinite(parsedNew) ? parsedNew : currentValue
  // Voortgang via de CANONIEKE motor i.p.v. een eigen `current / target`: die
  // laatste klopt niet voor 'down'-doelen (lager-is-beter), waar voortgang
  // `target / current` is. Consume, don't recompute.
  const progressFor = (value: number) =>
    computeGoalProgress({
      goal_type: goalType,
      current_value: value,
      target_value: targetValue,
      target_date: null,
    }).pct
  const pct = progressFor(validNew)
  const oldPct = progressFor(currentValue)
  // Bijdrage-delta vs. originele waarde — voedt de monitor onder de input
  // zodat de user de wijziging ziet vóór "Opslaan". Plan §6.3 "bijdrage-
  // monitor". MVP-versie: alleen verschil-bedrag + delta in percentage-
  // punten. Volledige bijdrage-historie blijft toekomstig werk.
  const delta = validNew - currentValue
  const deltaPct = pct - oldPct

  return (
    <>
    <ShellOverlay
      // Eén venster tegelijk (M35): zodra "Volledig bewerken" openstaat, sluit
      // de quick-update-sheet. Vroeger bleef hij open en stapelden twee sheets
      // op elkaar — dat brak de focus-afhandeling en week af van de
      // één-overlay-regel (ADR 0039). Sluit de gebruiker GoalForm, dan komt
      // deze sheet weer terug (`fullEditOpen` → false).
      open={!fullEditOpen}
      onClose={onClose}
      kind="sheet"
      size="md"
      title="Voortgang bijwerken"
      footer={
        live ? (
          // Niets bij te werken: dit doel loopt mee. Een "Opslaan"-knop zou hier
          // een wijziging suggereren die niet bestaat; de vervolgactie is
          // uitkomst-gemodelleerd i.p.v. een kale "Sluiten".
          <ModalFooter primary={{ label: 'Terug naar je doelen', onClick: onClose }} />
        ) : (
          <ModalFooter
            primary={{ label: 'Opslaan', onClick: () => handleSubmit(), loading: saving }}
            secondary={{ label: 'Annuleer', onClick: onClose }}
          />
        )
      }
    >
      <form onSubmit={handleSubmit} className="p-5 sm:p-6">
        <h2 className="font-serif text-lg text-[var(--ink)] mb-4 truncate">
          {goalName}
        </h2>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {error}
          </div>
        )}

        {live ? (
          /* Live doel: geen invoerveld. De waarde komt van je koppelingen of
             van een canonieke motor; hier iets laten typen belooft invloed die
             er niet is (de eerstvolgende load overschrijft 'm). */
          <div data-testid="doel-loopt-mee" className="mb-3">
            <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
              {valueLabels.current}
            </span>
            <p className="font-mono text-lg tabular-nums text-[var(--ink)]">
              {fmtValue(currentValue)}
            </p>
            <p className="mt-1 text-[11px] italic text-[var(--ink-3)]">
              {liveHerkomst(goal)} Je hoeft hier niets bij te werken.
            </p>
          </div>
        ) : (
          <label className="block mb-3">
            <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
              {valueLabels.current}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={meta?.min ?? 0}
              max={meta?.max}
              step={stepForInput}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:border-[var(--ink-3)]"
              required
              autoFocus
            />
          </label>
        )}

        <div className="mb-1 flex items-baseline justify-between text-[11px] text-[var(--ink-3)]">
          <span>Voortgang</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
        <div
          className="relative h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden mb-2"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {/* Originele waarde als spook-balk onder de nieuwe — geeft visueel
              de delta weer (Wealthfolio-stijl bijdrage-monitor). */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-positive/20"
            style={{ width: `${oldPct}%` }}
          />
          <div
            className="relative h-full bg-positive transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Bijdrage-monitor — toont de wijziging vóór opslaan. Alleen
            zichtbaar als er een delta is, zodat de standaard-state rustig
            blijft. Bij een live doel is er niets te vergelijken (geen invoer),
            dus dan valt het hele blok weg. */}
        {!live && Math.abs(delta) >= deltaDrempel && (
          <div
            data-testid="bijdrage-monitor"
            className={`mb-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              delta > 0
                ? 'bg-positive/10 text-positive'
                : 'bg-amber-50 text-amber-800'
            }`}
          >
            {delta > 0 ? (
              <TrendingUp className="w-3 h-3" aria-hidden="true" />
            ) : (
              <TrendingDown className="w-3 h-3" aria-hidden="true" />
            )}
            <span className="tabular-nums">
              {delta > 0 ? '+' : '−'}{fmtValue(Math.abs(delta))}
            </span>
            <span className="text-[var(--ink-3)]">·</span>
            <span className="tabular-nums">
              {deltaPct >= 0 ? '+' : '−'}{Math.abs(Math.round(deltaPct * 10) / 10)} pp
            </span>
          </div>
        )}
        {!live && Math.abs(delta) < deltaDrempel && (
          <div
            data-testid="bijdrage-monitor"
            className="mb-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[var(--subtle)] text-[var(--ink-3)]"
          >
            <Minus className="w-3 h-3" aria-hidden="true" />
            <span>Nog geen wijziging</span>
          </div>
        )}

        {/* Doel-behaald-bevestiging: zichtbaar zodra de gebruiker een waarde
            invoert die het doel haalt. Vóór submit zodat 't voelt als
            bevestiging tijdens typen. Ingetogen en feitelijk (geen
            emoji/confetti — de échte viering volgt ná opslaan via
            MilestoneCelebration). RICHTING-BEWUST via `isGoalReached`: dezelfde
            toets als de save, zodat scherm en schrijfactie nooit iets anders
            zeggen. */}
        {!live && isGoalReached(goalType, validNew, targetValue) && (
          <div
            data-testid="doel-behaald"
            className="mb-4 flex items-center gap-2 border-l-[3px] border-positive bg-positive/10 px-3 py-2 text-xs text-positive"
          >
            <span aria-hidden="true" className="text-[13px] leading-none">✦</span>
            <span>
              <strong>Doel behaald.</strong> Opslaan markeert dit doel als
              voltooid.
            </span>
          </div>
        )}

        {/* Fin-suggesties — plan §6.3 "acties van Fin" op doel-detail.
            Statische tips per goal_type uit lib/goal-suggestions; geen
            DB-fetch nodig. Verschijnt alleen wanneer er suggesties zijn
            voor het type (savings/wealth/debt). */}
        {suggestions.length > 0 && (
          <section
            data-testid="will-suggesties"
            aria-label="Fin-suggesties"
            className="mb-4 rounded-xl border border-horizon-100 bg-horizon-50/40 p-3"
          >
            <header className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-horizon-700" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-horizon-700">
                Fin-suggesties
              </span>
            </header>
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s.key} className="text-xs text-[var(--ink-2)] leading-snug">
                  <p>{s.text}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {s.impact && (
                      <span className="inline-flex items-center rounded-full bg-positive/10 text-positive px-1.5 py-0.5 text-[10px] font-semibold">
                        {s.impact}
                      </span>
                    )}
                    {s.href && s.ctaLabel && (
                      <Link
                        href={s.href}
                        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-horizon-700 hover:underline"
                      >
                        {s.ctaLabel}
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {confirmDelete ? (
          <div className="mb-3 rounded-xl border border-negative/30 bg-negative/10 px-3 py-3">
            <p className="text-xs text-negative mb-2">
              Weet je zeker dat je &quot;{goalName}&quot; wilt verwijderen?
              Voortgang gaat verloren.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-lg bg-negative px-3 py-1.5 text-xs font-semibold text-white hover:bg-negative/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Verwijderen…' : 'Ja, verwijder'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]"
              >
                Annuleer
              </button>
            </div>
          </div>
        ) : null}

        {/* Volledig-bewerken-link — opent GoalForm met alle velden +
            asset/debt-koppeling + alle goal_types (netto vermogen,
            schuldratio via debt_payoff, spaarquote, etc.). */}
        <button
          type="button"
          onClick={() => setFullEditOpen(true)}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-horizon-700 hover:text-horizon-800 hover:underline"
        >
          <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
          Volledig bewerken (naam, bedrag, datum, koppeling…)
        </button>

        {!confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1 text-xs text-negative hover:underline"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Verwijder doel
          </button>
        )}
      </form>
    </ShellOverlay>

      {/* GoalForm sheet — vervángt de quick-update dialog (die staat op
          `open={!fullEditOpen}`), hij stapelt er niet meer bovenop. BEWUST
          buiten de backdrop-<div onClick={onClose}> gerenderd: GoalForm is
          geen kind van de quick-update <form> (die stopPropagation doet),
          dus binnen de backdrop zou élke klik in GoalForm naar onClose
          bubbelen en de hele sheet sluiten (React-events bubbelen langs de
          component-tree, óók over createPortal). GoalForm/ShellOverlay
          regelen hun eigen backdrop + Escape + focus-trap. */}
      {fullEditOpen && (
        <GoalForm
          goal={goal}
          assets={assets}
          debts={debts}
          onClose={() => setFullEditOpen(false)}
          onSaved={() => {
            setFullEditOpen(false)
            onClose()
            router.refresh()
          }}
        />
      )}
    </>
  )
}
