'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { WithdrawalProfiel, WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { EXCEL_FASE_CURVE } from '@/lib/horizon-kernel/adapter/defaults'
import { runRegelProjection, type RegelProjection } from '@/lib/future/regel-sim'
import { SubsectionLabel } from '@/components/editorial'
import {
  RegelIntro,
  RegelOptionCard,
  LiveSimImpact,
  FireDeltaFooter,
  fireDeltaMonths,
} from './shared'
import type { RegelBodyProps } from './types'

const EMPTY_PROJ: RegelProjection = { rows: [], fireAgeFractional: null }

/**
 * V4 (F4) — onttrekkingsPROFIEL. De keuze leeft in `withdrawal_profile_config`
 * (profiel + 3-fasen-curve); de OUDE enum (`withdrawal_strategy`) wordt consistent
 * meegeschreven omdat de kernel-adapter er de guardrail-parameters uit leest en
 * hem als terugval voor het profiel gebruikt:
 *   vast / afnemend / oplopend → 'static' · guardrails → 'guardrails'.
 * De horizon-kernel is sinds FASE 6 stap 5A de enige engine en leest profiel +
 * curve rechtstreeks; de enum-kolom opruimen vergt nog een DB-migratie.
 * vpw/bucket zijn geen keuze meer (bestaande waarden tonen 'Vast').
 */
const PROFIEL_INFO: Record<WithdrawalProfiel, { label: string; description: string }> = {
  vast: {
    label: 'Vast',
    description:
      'Elk jaar hetzelfde bedrag, inflatie-geïndexeerd (de klassieke 4%-regel). Voorspelbaar; reageert niet op de markt.',
  },
  afnemend: {
    label: 'Afnemend',
    description:
      'Je geeft in je actieve jaren méér uit en bouwt af: go-go (fit, veel reizen) → slow-go (rustiger aan) → no-go (vooral thuis, lagere uitgaven).',
  },
  oplopend: {
    label: 'Oplopend',
    description:
      'Je begint bescheiden en geeft later méér uit — denk aan zorgkosten op hoge leeftijd. Het spiegelbeeld van afnemend.',
  },
  guardrails: {
    label: 'Guardrails',
    description:
      'Dynamische bandbreedte: verlaagt je opname na een slecht beursjaar, verhoogt na een goed jaar. Robuust tegen sequence-risk.',
  },
}

const PROFIEL_ORDER: WithdrawalProfiel[] = ['vast', 'afnemend', 'oplopend', 'guardrails']

interface Curve {
  gogoTotLeeftijd: number
  gogoPct: number
  slowgoTotLeeftijd: number
  slowgoPct: number
  nogoPct: number
}

/**
 * Excel-defaults P!B71-B75 (go-go/slow-go/no-go) — startwaarde, per-veld-terugval bij
 * het inlezen, en reset-waarde. AFGELEID uit `EXCEL_FASE_CURVE` (adapter/defaults.ts),
 * de single source: de kernel-adapter vult élk ontbrekend curve-veld met exact díe
 * getallen. Sinds de live-sim de volledige curve meestuurt is die gelijkheid
 * load-bearing — een eigen kopie hier zou stil een preview opleveren die van de
 * baseline afwijkt zonder dat de gebruiker iets verschoof.
 */
const EXCEL_CURVE: Curve = {
  gogoTotLeeftijd: EXCEL_FASE_CURVE.fase1TotLeeftijd,
  gogoPct: EXCEL_FASE_CURVE.factor1Pct,
  slowgoTotLeeftijd: EXCEL_FASE_CURVE.fase2TotLeeftijd,
  slowgoPct: EXCEL_FASE_CURVE.factor2Pct,
  nogoPct: EXCEL_FASE_CURVE.factor3Pct,
}

/** Profiel → oude enum (F6: verdwijnt zodra de kernel de enige engine is). */
function profielToEnum(p: WithdrawalProfiel): WithdrawalStrategyConfig['strategy'] {
  return p === 'guardrails' ? 'guardrails' : 'static'
}

/** Enum → profiel (voor bestaande gebruikers; vpw/bucket/static → 'vast'). */
function enumToProfiel(strategy: string): WithdrawalProfiel {
  return strategy === 'guardrails' ? 'guardrails' : 'vast'
}

/** Profielen met een instelbare 3-fasen-curve (go-go / slow-go / no-go). */
function heeftCurve(p: WithdrawalProfiel): boolean {
  return p === 'afnemend' || p === 'oplopend'
}

/**
 * Bouw de `withdrawal_profile_config`-payload uit de editor-staat. ÉÉN bron voor
 * zowel de live-sim-draft als de PUT bij Opslaan, zodat de grafiek exact toont wat
 * je opslaat (geen preview-vs-opslag-drift). De kernel-adapter leest deze JSONB —
 * `buildOnttrekkingsprofiel` (profiel + fase-curve) en `buildInkomenUitgaven`
 * (flex-spending) — en vult elk ontbrekend veld dáár met de Excel-default.
 */
function buildProfileConfig(state: {
  profiel: WithdrawalProfiel
  curve: Curve
  flexNiceOnly: boolean
  flexNicePct: number
  flexCutPct: number
}): Record<string, string | number | boolean> {
  // profiel altijd; curve alleen bij afnemend/oplopend; flex alleen bij guardrails.
  const cfg: Record<string, string | number | boolean> = { profiel: state.profiel }
  if (heeftCurve(state.profiel)) {
    cfg.gogo_tot_leeftijd = state.curve.gogoTotLeeftijd
    cfg.gogo_pct = state.curve.gogoPct
    cfg.slowgo_tot_leeftijd = state.curve.slowgoTotLeeftijd
    cfg.slowgo_pct = state.curve.slowgoPct
    cfg.nogo_pct = state.curve.nogoPct
  }
  if (state.profiel === 'guardrails') {
    // Roadmap M — must/nice. Vlag altijd meeschrijven (ook 'uit' expliciet wissen);
    // fractie/cut-step alleen als de vlag aan staat.
    cfg.flex_nice_only = state.flexNiceOnly
    if (state.flexNiceOnly) {
      cfg.flex_nice_fractie = state.flexNicePct / 100
      cfg.flex_cut_step = state.flexCutPct / 100
    }
  }
  return cfg
}

function GuardrailSlider({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-[var(--ink-2)]">{label}</span>
        <span className="font-mono tabular-nums text-sm text-[var(--ink)]">
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--module-active-700)]"
      />
      {hint && <p className="text-[10px] text-[var(--ink-3)] italic leading-snug">{hint}</p>}
    </label>
  )
}

function CurveNumber({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.1em] font-mono text-[var(--ink-3)] mb-1">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 px-2.5 py-2 border border-[var(--border-md)] rounded-lg bg-[var(--paper)] font-mono tabular-nums text-sm focus:border-[var(--module-active-700)] focus:outline-none"
        />
        <span className="text-[11px] text-[var(--ink-3)]">{unit}</span>
      </div>
    </label>
  )
}

/**
 * Regel 2 — Onttrekkingsprofiel. Kiest een van de vier profielen; Afnemend/Oplopend
 * tonen de instelbare 3-fasen-curve, Guardrails de floor/ceiling/cut/raise-velden.
 */
export function OnttrekkingsstrategieBody({
  simSnapshot,
  withdrawalStrategy,
  onActionsChange,
  onClose,
  onSaved,
}: RegelBodyProps) {
  const ws = withdrawalStrategy ?? WITHDRAWAL_DEFAULTS

  const [profiel, setProfiel] = useState<WithdrawalProfiel>(() => enumToProfiel(ws.strategy))
  const [savedProfiel, setSavedProfiel] = useState<WithdrawalProfiel>(() => enumToProfiel(ws.strategy))

  // Guardrail-parameters (fracties). Blijven de app-config voeden.
  const [grFloor, setGrFloor] = useState(ws.guardrailFloor)
  const [grCeiling, setGrCeiling] = useState(ws.guardrailCeiling)
  const [grCut, setGrCut] = useState(ws.guardrailCutStep)
  const [grRaise, setGrRaise] = useState(ws.guardrailRaiseStep)

  // Roadmap M — flex-spending (must/nice) als verfijning ván het guardrails-profiel:
  // laat de guardrail alléén op je flexibele (nice) uitgaven grijpen; essentiële
  // (must) uitgaven blijven vast. `flexNicePct` = welk deel van je uitgaven flexibel is;
  // `flexCutPct` = hoeveel dieper je op dat deel snijdt bij een dip.
  const [flexNiceOnly, setFlexNiceOnly] = useState(false)
  const [flexNicePct, setFlexNicePct] = useState(40)
  const [flexCutPct, setFlexCutPct] = useState(50)
  const [savedFlex, setSavedFlex] = useState({ on: false, nicePct: 40, cutPct: 50 })

  // 3-fasen-curve (Afnemend/Oplopend). Excel-defaults als startwaarde/reset.
  const [curve, setCurve] = useState<Curve>({ ...EXCEL_CURVE })
  const [savedCurve, setSavedCurve] = useState<Curve>({ ...EXCEL_CURVE })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // False tot de zelf-GET klaar is: de sectie fade't dan van lichte opacity naar
  // vol, i.p.v. dat profiel/curve/guardrails na de fetch in beeld springen.
  const [loaded, setLoaded] = useState(false)

  // Preselectie uit de opgeslagen profiel-config (de pane levert alleen de enum).
  useEffect(() => {
    let cancelled = false
    fetch('/api/withdrawal-strategy')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const cfg = d.withdrawal_profile_config as Record<string, unknown> | null
        const rawProfiel = cfg?.profiel
        const p: WithdrawalProfiel =
          rawProfiel === 'vast' ||
          rawProfiel === 'afnemend' ||
          rawProfiel === 'oplopend' ||
          rawProfiel === 'guardrails'
            ? rawProfiel
            : enumToProfiel(String(d.withdrawal_strategy ?? ws.strategy))
        setProfiel(p)
        setSavedProfiel(p)
        if (cfg) {
          const next: Curve = {
            gogoTotLeeftijd: num(cfg.gogo_tot_leeftijd, EXCEL_CURVE.gogoTotLeeftijd),
            gogoPct: num(cfg.gogo_pct, EXCEL_CURVE.gogoPct),
            slowgoTotLeeftijd: num(cfg.slowgo_tot_leeftijd, EXCEL_CURVE.slowgoTotLeeftijd),
            slowgoPct: num(cfg.slowgo_pct, EXCEL_CURVE.slowgoPct),
            nogoPct: num(cfg.nogo_pct, EXCEL_CURVE.nogoPct),
          }
          setCurve(next)
          setSavedCurve(next)
          // Roadmap M — flex-spending (must/nice).
          const flexOn = cfg.flex_nice_only === true
          const nicePct = Math.round(num(cfg.flex_nice_fractie, 0.4) * 100)
          const cutPct = Math.round(num(cfg.flex_cut_step, 0.5) * 100)
          setFlexNiceOnly(flexOn)
          setFlexNicePct(nicePct)
          setFlexCutPct(cutPct)
          setSavedFlex({ on: flexOn, nicePct, cutPct })
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isGuardrails = profiel === 'guardrails'
  const showsCurve = heeftCurve(profiel)
  const floorCeilingValid = !isGuardrails || grFloor < grCeiling

  // De enum-kolom blijft meelopen (guardrail-parameters + de oude `withdrawal_strategy`).
  const simConfig: WithdrawalStrategyConfig = useMemo(
    () => ({
      strategy: profielToEnum(profiel),
      guardrailFloor: grFloor,
      guardrailCeiling: grCeiling,
      guardrailCutStep: grCut,
      guardrailRaiseStep: grRaise,
    }),
    [profiel, grFloor, grCeiling, grCut, grRaise],
  )
  const debounced = useDebouncedValue(simConfig, 200)

  // Live-sim-draft = de VOLLEDIGE kandidaat-`withdrawal_profile_config` (profiel +
  // 3-fasen-curve + flex-spending), identiek aan wat Opslaan wegschrijft. De
  // kernel-adapter leest die kolom, dus schuiven aan een fase-grens/factor verandert
  // de projectie — en dus de FIRE-delta-footer — meteen mee. De baseline draait
  // bewust ZONDER override en blijft dus de opgeslagen waarheid.
  const draftProfileConfig = useMemo(
    () => buildProfileConfig({ profiel, curve, flexNiceOnly, flexNicePct, flexCutPct }),
    [profiel, curve, flexNiceOnly, flexNicePct, flexCutPct],
  )
  const debouncedProfileConfig = useDebouncedValue(draftProfileConfig, 200)

  const { baseline, draftProj } = useMemo(() => {
    if (!simSnapshot) return { baseline: EMPTY_PROJ, draftProj: EMPTY_PROJ }
    const baseline = runRegelProjection(simSnapshot)
    const draftProj = runRegelProjection(simSnapshot, {
      withdrawalStrategy: { ...debounced },
      withdrawalProfileConfig: debouncedProfileConfig,
    })
    return { baseline, draftProj }
  }, [simSnapshot, debounced, debouncedProfileConfig])

  const curveChanged =
    showsCurve && JSON.stringify(curve) !== JSON.stringify(savedCurve)
  const guardrailChanged =
    isGuardrails &&
    (grFloor !== ws.guardrailFloor ||
      grCeiling !== ws.guardrailCeiling ||
      grCut !== ws.guardrailCutStep ||
      grRaise !== ws.guardrailRaiseStep)
  const flexChanged =
    isGuardrails &&
    (flexNiceOnly !== savedFlex.on ||
      (flexNiceOnly && (flexNicePct !== savedFlex.nicePct || flexCutPct !== savedFlex.cutPct)))
  const changed = profiel !== savedProfiel || curveChanged || guardrailChanged || flexChanged
  const canSave = !saving && floorCeilingValid && changed

  const saveRef = useRef(async () => {})
  useEffect(() => {
    saveRef.current = async () => {
      setSaving(true)
      setError(null)
      try {
        // Zelfde payload als de live-sim-preview draaide (één bron: buildProfileConfig).
        const profileConfig = buildProfileConfig({
          profiel,
          curve,
          flexNiceOnly,
          flexNicePct,
          flexCutPct,
        })
        const res = await fetch('/api/withdrawal-strategy', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            withdrawal_strategy: profielToEnum(profiel),
            guardrail_floor: grFloor,
            guardrail_ceiling: grCeiling,
            guardrail_cut_step: grCut,
            guardrail_raise_step: grRaise,
            withdrawal_profile_config: profileConfig,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data?.error ?? 'Opslaan mislukt')
          setSaving(false)
          return
        }
        setSaving(false)
        onClose()
        onSaved()
      } catch {
        setError('Opslaan mislukt — netwerkfout')
        setSaving(false)
      }
    }
  }, [
    profiel,
    curve,
    grFloor,
    grCeiling,
    grCut,
    grRaise,
    flexNiceOnly,
    flexNicePct,
    flexCutPct,
    onClose,
    onSaved,
  ])

  const deltaMonths = fireDeltaMonths(baseline, draftProj)
  useEffect(() => {
    onActionsChange({
      canSave,
      saving,
      save: () => saveRef.current(),
      footerInfo: <FireDeltaFooter baseline={baseline} draft={draftProj} />,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, saving, deltaMonths])

  return (
    <div
      aria-busy={!loaded}
      className={`pb-6 transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-60'}`}
    >
      <RegelIntro regelId="onttrekkingsstrategie" />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <SubsectionLabel>Kies je onttrekkingsprofiel</SubsectionLabel>
      <div className="space-y-2">
        {PROFIEL_ORDER.map((key) => {
          const info = PROFIEL_INFO[key]
          // Onttrekkingsprofiel-keuze combineert met elke eindstrategie; de oude
          // VPW×eindstrategie-restrictie is met het schrappen van VPW vervallen.
          return (
            <RegelOptionCard
              key={key}
              active={profiel === key}
              title={info.label}
              description={info.description}
              onSelect={() => setProfiel(key)}
            />
          )
        })}
      </div>

      {/* 3-fasen-curve — Afnemend/Oplopend */}
      {showsCurve && (
        <div className="mt-5 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <SubsectionLabel>Verdeel je uitgaven over drie fasen</SubsectionLabel>
            <button
              type="button"
              onClick={() => setCurve({ ...EXCEL_CURVE })}
              className="text-[11px] font-semibold text-[var(--ink-2)] hover:underline"
            >
              Herstel standaard
            </button>
          </div>
          <p className="mb-3 text-[11px] text-[var(--ink-3)] leading-snug">
            Elke fase heeft een uitgaven-factor t.o.v. je basisbudget (100% = volledig). Go-go
            hoog, no-go lager — of andersom bij Oplopend.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <CurveNumber
              label="Go-go t/m"
              unit="jaar"
              value={curve.gogoTotLeeftijd}
              min={50}
              max={110}
              step={1}
              onChange={(v) => setCurve((c) => ({ ...c, gogoTotLeeftijd: v }))}
            />
            <CurveNumber
              label="Go-go factor"
              unit="%"
              value={curve.gogoPct}
              min={0}
              max={200}
              step={5}
              onChange={(v) => setCurve((c) => ({ ...c, gogoPct: v }))}
            />
            <span className="hidden sm:block" aria-hidden />
            <CurveNumber
              label="Slow-go t/m"
              unit="jaar"
              value={curve.slowgoTotLeeftijd}
              min={50}
              max={110}
              step={1}
              onChange={(v) => setCurve((c) => ({ ...c, slowgoTotLeeftijd: v }))}
            />
            <CurveNumber
              label="Slow-go factor"
              unit="%"
              value={curve.slowgoPct}
              min={0}
              max={200}
              step={5}
              onChange={(v) => setCurve((c) => ({ ...c, slowgoPct: v }))}
            />
            <CurveNumber
              label="No-go factor"
              unit="%"
              value={curve.nogoPct}
              min={0}
              max={200}
              step={5}
              onChange={(v) => setCurve((c) => ({ ...c, nogoPct: v }))}
            />
          </div>
          <p className="mt-3 text-[10px] text-[var(--ink-3)] italic leading-snug">
            De vrijheidsgrafiek hieronder rekent je fasen meteen mee: verschuif een grens of
            factor en je ziet je vrijheidsdatum live meebewegen.
          </p>
        </div>
      )}

      {/* Guardrail-verfijning */}
      {isGuardrails && (
        <div className="mt-5 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-4 space-y-4">
          <SubsectionLabel>Verfijn je guardrails</SubsectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GuardrailSlider
              label="Ondergrens (floor)"
              value={grFloor}
              min={0.5}
              max={1.0}
              onChange={setGrFloor}
              hint="Minimale opname als % van je basisbudget."
            />
            <GuardrailSlider
              label="Bovengrens (ceiling)"
              value={grCeiling}
              min={1.0}
              max={2.0}
              onChange={setGrCeiling}
              hint="Maximale opname als % van je basisbudget."
            />
            <GuardrailSlider
              label="Verlaging bij dip"
              value={grCut}
              min={0.05}
              max={0.5}
              onChange={setGrCut}
              hint="Stap waarmee je opname daalt na een slecht beursjaar."
            />
            <GuardrailSlider
              label="Verhoging bij top"
              value={grRaise}
              min={0.05}
              max={0.5}
              onChange={setGrRaise}
              hint="Stap waarmee je opname stijgt na een goed beursjaar."
            />
          </div>
          {!floorCeilingValid && (
            <p className="text-[11px] text-amber-700">Ondergrens moet lager zijn dan de bovengrens.</p>
          )}

          {/* Roadmap M — flex-spending (must/nice) */}
          <div className="border-t border-[var(--border-ed)] pt-4">
            <button
              type="button"
              role="switch"
              aria-checked={flexNiceOnly}
              onClick={() => setFlexNiceOnly((v) => !v)}
              className="flex w-full items-start gap-3 text-left"
            >
              <span
                className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                  flexNiceOnly
                    ? 'border-[var(--module-active-700)] bg-[var(--module-active-700)]'
                    : 'border-[var(--border-md)] bg-[var(--paper)]'
                }`}
                aria-hidden="true"
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] shadow transition-transform ${
                    flexNiceOnly ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--ink)]">
                  Pas alleen op mijn flexibele uitgaven toe
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-2)]">
                  Bij een dip knijpt de guardrail dan alléén je <span className="font-semibold">nice</span>-uitgaven
                  (reizen, extra&apos;s) — je <span className="font-semibold">must</span>-lasten (huur, boodschappen,
                  verzekeringen) blijven vast. Zo koop je veerkracht zonder je bestaanszekerheid te raken.
                </span>
              </span>
            </button>

            {flexNiceOnly && (
              <div className="mt-4 space-y-4">
                <GuardrailSlider
                  label="Flexibel (nice) deel van je uitgaven"
                  value={flexNicePct / 100}
                  min={0}
                  max={1}
                  onChange={(v) => setFlexNicePct(Math.round(v * 100))}
                  hint="Welk deel van je pensioenuitgaven discretionair is. De rest is must en blijft altijd vast."
                />
                <GuardrailSlider
                  label="Extra korting op nice bij een dip"
                  value={flexCutPct / 100}
                  min={0}
                  max={1}
                  onChange={(v) => setFlexCutPct(Math.round(v * 100))}
                  hint="Hoeveel je je nice-uitgaven terugschroeft zodra je vermogen onder de ondergrens zakt."
                />
                <p className="text-[10px] leading-snug text-[var(--ink-3)] italic">
                  Let op: de regel reageert op je vermogen t.o.v. het ijkpunt op je vrijheidsdatum
                  (anker-ratio), niet op een daling vanaf de hoogste stand ooit. Zakt je vermogen onder de
                  ondergrens, dan gaat je nice-deel omlaag; herstelt het, dan komt het weer terug.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live impact */}
      <div className="mt-6">
        <SubsectionLabel>Impact op je vrijheidspad</SubsectionLabel>
        <LiveSimImpact baseline={baseline} draft={draftProj} />
      </div>
    </div>
  )
}

function num(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : fallback
}
