'use client'

/**
 * OnttrekkingProfielVergelijk — de vier onttrekkingsprofielen naast elkaar (ADR 0179 fase 3).
 *
 * Verhuisd uit de Onttrekking-tab van de opgeheven Strategieën-modal
 * (`components/app/horizon/strategie-modal.tsx`), zodat die functie niet verloren gaat nu
 * de keuze alleen nog in katern Instellingen staat (rij Onttrekking). Gerenderd ín
 * `OnttrekkingsstrategieBody`, ingeklapt: de vier kernel-runs draaien pas bij openklappen.
 *
 * Consume, don't recompute: per profiel één `runRegelProjection` met de override
 * `withdrawalProfileConfig = { ...opgeslagen, profiel }` — hetzelfde injectiepatroon als de
 * modal (`withdrawal_profile_config: { ...rawCfg, profiel }` op dezelfde rauwe context) en
 * dezelfde override-run als de verschilregel. Alle uitkomsten (stopanker, vrijheidsleeftijd,
 * doelbedrag, vermogen op het stopmoment, bereik) komen uit het `SimResult` van die run.
 *
 * Euro-weergave (ADR 0090/0093, review Y1): de runs zijn kernel-override-runs, dus elke
 * run draagt zijn eigen canonieke deflator (`RegelProjection.factorRijen`, jaar 0 = 1.0).
 * In "huidige euro's" gaat elk bedrag hier precies één keer door `lib/euro-display.ts`:
 * de rijen via `deflateRowsByAge` (factor van de eigen leeftijd), puntbedragen via
 * `deflate(…, factorAtAge(…))` op het stopmoment van díe run. Pas daarna de weergave-
 * afleidingen (bestedingsruimte ÷ 12, guardrail-corridor × vloer/plafond).
 *
 * Kleuren (review): categorie-herkenning uit het gevalideerde categorische reekspalet
 * (`--beheer-reeks-*` onder `.beheer-viz`, app/globals.css: > 20° van de statushues,
 * CVD-getoetst, met donkere tegenhangers) — geen losse hexen, geen stoplicht-achtig groen
 * of amber. Vast blijft neutrale inkt.
 */

import { useMemo, useState } from 'react'
import { useEuroView } from '@/lib/hooks/use-euro-view'
import {
  buildFactorByAge,
  deflate,
  deflateRowsByAge,
  euroViewLabel,
  factorAtAge,
  type EuroView,
} from '@/lib/euro-display'
import { SIM_ROW_MONEY_FIELDS } from '@/components/toekomst/state/euro-view-feeds'
import { ChevronDown, Info } from 'lucide-react'
import { runRegelProjection, type RegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { SimRow } from '@/lib/fire-simulation'
import type { WithdrawalProfiel, WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { formatPlanAge } from '@/lib/horizon/plan-draft'
import { ANKER_KPI_LABEL, ankerKort, ankerReachFromSim, ankerReachYear, type AnkerReach } from '@/lib/horizon/anker-copy'
import { MaskedAmount } from '@/components/app/masked-amount'
import { SubsectionLabel } from '@/components/editorial'

export const PROFIEL_VERGELIJK_KOPIJ = {
  knop: 'Vergelijk de vier profielen',
  intro:
    'Je plan vier keer doorgerekend, één keer per profiel. De rest van je plan blijft gelijk. Kiezen en bewaren doe je hierboven.',
  geenBasis:
    'Vul je geboortedatum, je vermogen en je uitgaven in bij Overzicht, dan kan de app de profielen doorrekenen.',
  mislukt: 'De profielen konden niet worden doorgerekend.',
  grafiekKop: 'Vermogen na je stopmoment',
  bestedingKop: 'Bestedingsruimte',
  bestedingZin: (min: React.ReactNode, max: React.ReactNode) => (
    <>
      Je onttrekking beweegt tussen {min} en {max} per maand.
    </>
  ),
  corridorKop: 'Bandbreedte guardrails',
  samenvattingKop: 'Samenvatting',
  actief: 'Je keuze',
  disclaimer: 'Een doorrekening van je eigen cijfers, geen advies. Wat er werkelijk gebeurt, kan afwijken.',
  /** Welke euro's de bedragen hieronder zijn — volgt de euro-weergave van de app. */
  euroRegel: (view: EuroView) => `Bedragen in ${euroViewLabel(view).toLowerCase()}.`,
} as const

/** Reeksnummer (1..6) in het categorische palet `--beheer-reeks-*`; `null` = neutrale inkt. */
export const PROFIEL_REEKS: Record<WithdrawalProfiel, number | null> = {
  vast: null,
  afnemend: 3, // petrol
  oplopend: 2, // roestbruin
  guardrails: 1, // blauw
}

export const PROFIEL_INFO: Record<WithdrawalProfiel, { label: string; stroke: string }> = {
  vast: { label: 'Vast', stroke: 'var(--ink-3)' },
  afnemend: { label: 'Afnemend', stroke: `var(--beheer-reeks-${PROFIEL_REEKS.afnemend})` },
  oplopend: { label: 'Oplopend', stroke: `var(--beheer-reeks-${PROFIEL_REEKS.oplopend})` },
  guardrails: { label: 'Guardrails', stroke: `var(--beheer-reeks-${PROFIEL_REEKS.guardrails})` },
}

const ALLE: WithdrawalProfiel[] = ['vast', 'afnemend', 'oplopend', 'guardrails']

export interface ProfielRun {
  profiel: WithdrawalProfiel
  projectie: RegelProjection
}

/**
 * De vier runs. Geëxporteerd voor de test (gelijkheid met de modal-injectie). `null` =
 * geen snapshot.
 */
export function runProfielVergelijk(snapshot: RegelSimSnapshot | null): ProfielRun[] | null {
  if (!snapshot) return null
  const raw = snapshot.rawContext.profile.withdrawal_profile_config
  const opgeslagen = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return ALLE.map((profiel) => ({
    profiel,
    projectie: runRegelProjection(snapshot, { withdrawalProfileConfig: { ...opgeslagen, profiel } }),
  }))
}

export function OnttrekkingProfielVergelijk({
  snapshot,
  actiefProfiel,
  withdrawalStrategy,
}: {
  snapshot: RegelSimSnapshot | null | undefined
  /** Het opgeslagen profiel (krijgt de markering "Je keuze"). */
  actiefProfiel: WithdrawalProfiel
  /** Opgeslagen guardrail-vloer en -plafond, voor de bandbreedte. */
  withdrawalStrategy?: WithdrawalStrategyConfig
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-6 border-t border-[var(--border-ed)] pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left text-sm font-semibold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        {PROFIEL_VERGELIJK_KOPIJ.knop}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <VergelijkInhoud snapshot={snapshot ?? null} actiefProfiel={actiefProfiel} withdrawalStrategy={withdrawalStrategy} />
      )}
    </div>
  )
}

function VergelijkInhoud({
  snapshot,
  actiefProfiel,
  withdrawalStrategy,
}: {
  snapshot: RegelSimSnapshot | null
  actiefProfiel: WithdrawalProfiel
  withdrawalStrategy?: WithdrawalStrategyConfig
}) {
  const runs = useMemo(() => runProfielVergelijk(snapshot), [snapshot])
  const { view } = useEuroView()
  const [gekozen, setGekozen] = useState<WithdrawalProfiel>(actiefProfiel)

  if (!runs) return <Melding tekst={PROFIEL_VERGELIJK_KOPIJ.geenBasis} />
  const sims = Object.fromEntries(runs.map((r) => [r.profiel, r.projectie.sim ?? null])) as Record<
    WithdrawalProfiel,
    NonNullable<RegelProjection['sim']> | null
  >
  if (ALLE.every((p) => sims[p] == null)) return <Melding tekst={PROFIEL_VERGELIJK_KOPIJ.mislukt} />

  // Euro-weergave: elke run met zijn eigen factor, elk bedrag één keer (ADR 0090/0093).
  const factorRijen = Object.fromEntries(
    runs.map((r) => [r.profiel, r.projectie.factorRijen ?? []]),
  ) as Record<WithdrawalProfiel, NonNullable<RegelProjection['factorRijen']>>
  const viewRijen = Object.fromEntries(
    ALLE.map((p) => [
      p,
      deflateRowsByAge(sims[p]?.rows ?? [], buildFactorByAge(factorRijen[p]), SIM_ROW_MONEY_FIELDS, view),
    ]),
  ) as Record<WithdrawalProfiel, SimRow[]>
  const pensioenRijen = Object.fromEntries(
    ALLE.map((p) => [p, viewRijen[p].filter((r) => r.phase === 'retirement')]),
  ) as Record<WithdrawalProfiel, SimRow[]>
  /** Een puntbedrag uit de run van profiel `p`, gedeflateerd op zijn eigen leeftijd. */
  const opLeeftijd = (p: WithdrawalProfiel, bedrag: number, leeftijd: number | null | undefined) =>
    deflate(bedrag, factorAtAge(factorRijen[p], leeftijd), view)
  const startLeeftijd = sims.vast?.rows[0]?.age ?? runs.find((r) => r.projectie.rows[0])?.projectie.rows[0]?.age ?? null
  const bereik = (p: WithdrawalProfiel): AnkerReach =>
    ankerReachFromSim({
      startAge: startLeeftijd,
      kernelDepletionMonth: sims[p]?.kernelDepletionMonth ?? null,
      endAge: sims[p]?.displayEndAge ?? null,
    })
  const grenzen = chartGrenzen(pensioenRijen)
  const sim = sims[gekozen]
  const rijen = pensioenRijen[gekozen]
  const opnames = rijen.map((r) => r.withdrawal).filter((w) => w > 0)
  const besteding =
    opnames.length > 0
      ? { min: Math.round(Math.min(...opnames) / 12), max: Math.round(Math.max(...opnames) / 12) }
      : null
  const corridor =
    gekozen === 'guardrails' && withdrawalStrategy && rijen.length > 1
      ? rijen.map((r) => ({
          age: r.age,
          floor: Math.round(r.withdrawal * withdrawalStrategy.guardrailFloor),
          target: r.withdrawal,
          ceiling: Math.round(r.withdrawal * withdrawalStrategy.guardrailCeiling),
        }))
      : null
  const markers = (snapshot?.rawContext.lifeEvents ?? [])
    .filter((e) => e.is_active !== false && e.target_age != null)
    .map((e) => ({ naam: e.name, leeftijd: e.target_age as number }))
    .filter((m) => grenzen && m.leeftijd >= grenzen.min && m.leeftijd <= grenzen.max)

  return (
    <div className="beheer-viz mt-3 space-y-5" data-testid="profielvergelijk">
      <p className="text-xs leading-snug text-[var(--ink-3)]">
        {PROFIEL_VERGELIJK_KOPIJ.intro} {PROFIEL_VERGELIJK_KOPIJ.euroRegel(view)}
      </p>

      <div role="group" aria-label="Profiel in de grafiek" className="grid grid-cols-2 gap-2">
        {ALLE.map((p) => {
          const s = sims[p]
          return (
            <button
              key={p}
              type="button"
              aria-pressed={gekozen === p}
              onClick={() => setGekozen(p)}
              className={`relative min-h-[44px] border p-3 text-left transition-colors ${
                gekozen === p ? 'border-[var(--ink)] bg-[var(--subtle)]' : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--ink-3)]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg width="10" height="10" aria-hidden="true">
                  <circle cx="5" cy="5" r="4" fill={PROFIEL_INFO[p].stroke} />
                </svg>
                <span className="text-sm font-semibold text-[var(--ink)]">{PROFIEL_INFO[p].label}</span>
                {p === actiefProfiel && (
                  <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    {PROFIEL_VERGELIJK_KOPIJ.actief}
                  </span>
                )}
              </span>
              {s && (
                <span data-testid={`profiel-uitkomst-${p}`} className="mt-1 block font-mono text-xs tabular-nums text-[var(--ink-2)]">
                  {s.stopAnker != null
                    ? ankerKort(bereik(p))
                    : s.fireReachable && s.fireAge != null
                      ? `vrij op ${s.fireAge}`
                      : 'niet binnen je plan'}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {grenzen && (
        <div>
          <SubsectionLabel>{PROFIEL_VERGELIJK_KOPIJ.grafiekKop}</SubsectionLabel>
          <VergelijkGrafiek rijen={pensioenRijen} grenzen={grenzen} gekozen={gekozen} markers={markers} />
        </div>
      )}

      {besteding && (
        <div>
          <SubsectionLabel>{`${PROFIEL_VERGELIJK_KOPIJ.bestedingKop} (${PROFIEL_INFO[gekozen].label})`}</SubsectionLabel>
          <p className="text-sm text-[var(--ink)]">
            {PROFIEL_VERGELIJK_KOPIJ.bestedingZin(
              <MaskedAmount value={besteding.min} tone="horizon" />,
              <MaskedAmount value={besteding.max} tone="horizon" />,
            )}
          </p>
        </div>
      )}

      {corridor && grenzen && (
        <div>
          <SubsectionLabel>{PROFIEL_VERGELIJK_KOPIJ.corridorKop}</SubsectionLabel>
          <CorridorGrafiek corridor={corridor} grenzen={grenzen} />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--ink-3)]">
            <span>Vloer {Math.round((withdrawalStrategy?.guardrailFloor ?? 0) * 100)}% van je basis</span>
            <span>Plafond {Math.round((withdrawalStrategy?.guardrailCeiling ?? 0) * 100)}% van je basis</span>
          </div>
        </div>
      )}

      {sim && (
        <div>
          <SubsectionLabel>{`${PROFIEL_VERGELIJK_KOPIJ.samenvattingKop} (${PROFIEL_INFO[gekozen].label})`}</SubsectionLabel>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2" data-testid="profiel-samenvatting">
            {sim.stopAnker != null ? (
              <>
                <Regel label="Stopmoment" waarde={sim.stopAnker.soort === 'nu' ? 'nu' : sim.vastStopLeeftijd != null ? `${formatPlanAge(sim.vastStopLeeftijd)} jaar` : '—'} />
                <Regel
                  label={ANKER_KPI_LABEL}
                  waarde={ankerReachYear(bereik(gekozen)) != null ? `${ankerReachYear(bereik(gekozen))} jaar` : 'nog niet te bepalen'}
                />
                <Regel
                  label="Vermogen op je stopmoment"
                  waarde={<MaskedAmount value={opLeeftijd(gekozen, sim.firePortfolioAtFire, sim.vastStopLeeftijd)} tone="horizon" />}
                />
              </>
            ) : (
              <>
                <Regel label="Vrijheidsleeftijd" waarde={sim.fireReachable && sim.fireAge != null ? `${sim.fireAge} jaar` : 'niet binnen je plan'} />
                <Regel
                  label="Doelbedrag"
                  waarde={<MaskedAmount value={opLeeftijd(gekozen, sim.requiredFirePortfolio, sim.fireAgeFractional)} tone="horizon" />}
                />
                <Regel label="Onttrekkingspercentage" waarde={`${(sim.implicitWithdrawalRate * 100).toFixed(1).replace('.', ',')}%`} />
              </>
            )}
            <Regel
              label="Vermogen aan het eind"
              testId="vermogen-eind"
              waarde={
                viewRijen[gekozen].length > 0 ? (
                  <MaskedAmount value={viewRijen[gekozen][viewRijen[gekozen].length - 1].endPortfolio} tone="horizon" />
                ) : (
                  '—'
                )
              }
            />
          </dl>
        </div>
      )}

      <p className="text-[10px] italic text-[var(--ink-3)]">{PROFIEL_VERGELIJK_KOPIJ.disclaimer}</p>
    </div>
  )
}

function Melding({ tekst }: { tekst: string }) {
  return (
    <p className="mt-3 flex items-start gap-2 text-xs leading-snug text-[var(--ink-2)]">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
      {tekst}
    </p>
  )
}

function Regel({ label, waarde, testId }: { label: string; waarde: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-[var(--ink)]">{waarde}</dd>
    </div>
  )
}

// ── Grafieken (uit de modal, ongewijzigd in opzet) ────────────────────────────

type Grenzen = { min: number; max: number; top: number }

function chartGrenzen(rijen: Record<WithdrawalProfiel, SimRow[]>): Grenzen | null {
  let min = Infinity
  let max = -Infinity
  let top = 0
  for (const p of ALLE) {
    const r = rijen[p]
    if (r.length === 0) continue
    min = Math.min(min, r[0].age)
    max = Math.max(max, r[r.length - 1].age)
    for (const row of r) top = Math.max(top, row.endPortfolio)
  }
  if (!Number.isFinite(min) || max <= min || top <= 0) return null
  return { min, max, top }
}

const W = 640
const H = 280
const PL = 56
const PR = 16
const PT = 16
const PB = 32

function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`
  return String(Math.round(v))
}

function VergelijkGrafiek({
  rijen,
  grenzen,
  gekozen,
  markers,
}: {
  rijen: Record<WithdrawalProfiel, SimRow[]>
  grenzen: Grenzen
  gekozen: WithdrawalProfiel
  markers: { naam: string; leeftijd: number }[]
}) {
  const plotW = W - PL - PR
  const plotH = H - PT - PB
  const yMax = grenzen.top * 1.1
  const x = (a: number) => PL + ((a - grenzen.min) / (grenzen.max - grenzen.min)) * plotW
  const y = (v: number) => PT + plotH - (v / yMax) * plotH
  const pad = (r: SimRow[]) => r.map((row, i) => `${i === 0 ? 'M' : 'L'}${x(row.age).toFixed(1)},${y(row.endPortfolio).toFixed(1)}`).join(' ')
  const xLabels: number[] = []
  for (let a = Math.ceil(grenzen.min / 5) * 5; a <= grenzen.max; a += 5) xLabels.push(a)
  const volgorde = [...ALLE.filter((p) => p !== gekozen), gekozen]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Vermogen per onttrekkingsprofiel na je stopmoment">
      {Array.from({ length: 6 }, (_, i) => (yMax / 5) * i).map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={y(v)} x2={W - PR} y2={y(v)} stroke="var(--border-ed)" strokeWidth="0.5" />
          {i > 0 && (
            <text x={PL - 6} y={y(v) + 3} textAnchor="end" className="fill-[var(--ink-3)]" style={{ fontSize: '8px', fontFamily: 'var(--font-dm-mono, monospace)' }}>
              {compact(v)}
            </text>
          )}
        </g>
      ))}
      {xLabels.map((a) => (
        <text key={a} x={x(a)} y={H - 6} textAnchor="middle" className="fill-[var(--ink-3)]" style={{ fontSize: '8px', fontFamily: 'var(--font-dm-mono, monospace)' }}>
          {a}
        </text>
      ))}
      {markers.map((m, i) => (
        <g key={i}>
          <line x1={x(m.leeftijd)} y1={PT} x2={x(m.leeftijd)} y2={H - PB} stroke="var(--ink-3)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.6" />
          <text x={x(m.leeftijd)} y={PT - 4} textAnchor="middle" className="fill-[var(--ink-3)]" style={{ fontSize: '7px' }}>
            {m.naam}
          </text>
        </g>
      ))}
      {volgorde.map((p) =>
        rijen[p].length === 0 ? null : (
          <path
            key={p}
            d={pad(rijen[p])}
            fill="none"
            stroke={PROFIEL_INFO[p].stroke}
            strokeWidth={p === gekozen ? 2.5 : 1.5}
            opacity={p === gekozen ? 1 : 0.35}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ),
      )}
    </svg>
  )
}

function CorridorGrafiek({
  corridor,
  grenzen,
}: {
  corridor: { age: number; floor: number; target: number; ceiling: number }[]
  grenzen: Grenzen
}) {
  const h = 160
  const plotW = W - PL - PR
  const plotH = h - PT - PB
  const yMax = Math.max(...corridor.map((c) => c.ceiling)) * 1.15 || 1
  const x = (a: number) => PL + ((a - grenzen.min) / (grenzen.max - grenzen.min || 1)) * plotW
  const y = (v: number) => PT + plotH - (v / yMax) * plotH
  const lijn = (k: 'floor' | 'target' | 'ceiling') =>
    corridor.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.age).toFixed(1)},${y(c[k]).toFixed(1)}`).join(' ')
  const vlak = `M${corridor.map((c) => `${x(c.age).toFixed(1)},${y(c.ceiling).toFixed(1)}`).join(' L')} L${[...corridor]
    .reverse()
    .map((c) => `${x(c.age).toFixed(1)},${y(c.floor).toFixed(1)}`)
    .join(' L')} Z`
  const stroke = PROFIEL_INFO.guardrails.stroke
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role="img" aria-label="Bandbreedte van je onttrekking met guardrails">
      <path d={vlak} fill={stroke} opacity="0.12" />
      <path d={lijn('ceiling')} fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="4,3" opacity="0.5" />
      <path d={lijn('floor')} fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="4,3" opacity="0.5" />
      <path d={lijn('target')} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
