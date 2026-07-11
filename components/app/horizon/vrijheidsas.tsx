'use client'

/**
 * Vrijheidsas — de "wanneer ben je vrij, en hoe stevig is dat?"-as (mockup-blok ⑤
 * van de wat-als-scenariolaag op /toekomst). Presentational, props-only; alle
 * cijfers komen berekend binnen (consume, niet herrekenen — de FIRE-leeftijden en
 * marge worden in horizon-client uit de scenario-run/`computeStopMarge` afgeleid).
 *
 * Bouwtrant = `GuardrailKompas`: relatieve `posOf`-percentages, labels boven/onder de
 * baan. Eigen JAAR-schaal, lineair 0–100% ZONDER edge-padding zodat de zichtbare native
 * `<input type="range">` er pixel-precies onder uitlijnt.
 *
 * Kleur-conventie:
 *   - module-identiteit (FIRE-marker, stop-slider, accentwaarden) via horizon-tokens;
 *   - de wat-als-FIRE-marker + connector in INKT (`--ink-*`), gestippeld — zoals de
 *     wat-als-lijn in de grafiek (nooit een tweede module-kleur);
 *   - de driezone-marge-band (tekort · krap · stevig) in STOPLICHT-status (red/amber/
 *     emerald), nooit het module-accent.
 */

import type { StopMargeZone } from '@/lib/horizon/stop-marge'
import { InlineInfoDisclosure } from '@/components/editorial'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

// ── Pure koppel-helper (getest) ──────────────────────────────────────────────

/**
 * Nieuwe stopleeftijd wanneer de "schuift mee"-koppeling aan staat: de stop volgt de
 * verwacht-FIRE zó dat de vastgehouden marge (`lockedMarge`) constant blijft. Afgerond
 * op de slider-stap (0,5). `verwacht === null` (onbereikbaar) ⇒ null (koppel inert).
 */
export function computeCoupledStopAge(
  verwacht: number | null,
  lockedMarge: number,
  step = 0.5,
): number | null {
  if (verwacht === null) return null
  const raw = verwacht + lockedMarge
  return Math.round(raw / step) * step
}

// ── deltaLabel-conventie (spiegelt whatif-beslishulp.tsx:388-396) ────────────

type DeltaTone = 'earlier' | 'later' | 'flat' | 'none'

/** Maandelijkse FIRE-delta → editorial vrijheidstijd-label + toon. */
export function fireDeltaLabel(
  deltaMonths: number | null,
  reachable: boolean,
): { text: string; tone: DeltaTone } {
  if (!reachable || deltaMonths === null) return { text: 'onbereikbaar', tone: 'none' }
  if (Math.abs(deltaMonths) < 1) return { text: 'vrijheidsdatum gelijk', tone: 'flat' }
  if (deltaMonths < 0) return { text: `${Math.abs(deltaMonths)} mnd eerder vrij`, tone: 'earlier' }
  return { text: `${deltaMonths} mnd later vrij`, tone: 'later' }
}

const DELTA_TONE_CLASS: Record<DeltaTone, string> = {
  earlier: 'text-horizon-700',
  later: 'text-kern-700',
  flat: 'text-[var(--ink-3)]',
  none: 'text-[var(--ink-3)]',
}

const ZONE_TEXT: Record<StopMargeZone, string> = {
  tekort: 'text-red-700',
  krap: 'text-amber-700',
  stevig: 'text-emerald-700',
}

/** Eén korte duidende zin per zone (mockup-toon), getoond onder het zone-woord. */
const ZONE_NOTE: Record<StopMargeZone, string> = {
  tekort: 'je stopt vóór de streep — dit plan komt geld tekort',
  krap: 'net na de streep — houdbaar, maar dun',
  stevig: 'ruim voorbij de voorzichtige rand — robuust',
}

// ── Marge-eenheid-helper (getest) ─────────────────────────────────────────────

/**
 * Signed marge-weergave met adaptieve eenheid: |marge| < 1 jaar → maanden
 * ("+8 mnd" / "−4 mnd"), anders 1-decimaal jaren ("+2,5 jr" / "−1,0 jr").
 * Gebruikt overal waar het marge-getal staat (cijferrij + aria-valuetext), zodat
 * kleine marges niet als "+0,1 jr" verdwijnen. `−` = U+2212 (typografische min).
 */
export function formatMargeShort(margeJaren: number): string {
  const sign = margeJaren < 0 ? '−' : '+'
  const abs = Math.abs(margeJaren)
  if (abs < 1) return `${sign}${Math.round(abs * 12)} mnd`
  return `${sign}${abs.toFixed(1).replace('.', ',')} jr`
}

/** 1-decimaal jaartal met NL-komma (voor de vroegst–laatst-bandregel). */
function formatAge1(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1).replace('.', ',')
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface VrijheidsasProps {
  /** Huidige leeftijd (as-start). */
  currentAge: number
  /** AOW-leeftijd (verticale hairline). Null = niet getekend. */
  aowAge: number | null
  /** FIRE-uitkomst van de BASISLIJN (fractioneel); null = onbereikbaar. */
  baseFireAge: number | null
  /** FIRE-uitkomst van het ACTIEVE pad (scenario indien actief, anders basis). */
  verwachtFireAge: number | null
  /** FIRE-uitkomst van de VOORZICHTIGE variant van het actieve pad; null = nooit bereikt.
   *  Vormt samen met `vroegstFireAgeFractional` de "band" van de verwachting (laatst = rand). */
  laatstFireAge: number | null
  /** FIRE-uitkomst van de OPTIMISTISCHE variant (+2 pp-rendement) — de vroegste rand van de
   *  verwachtingsband. Samen met `laatstFireAge` toont dit "band X – Y jr" onder Wat-als-vrijheid.
   *  Optioneel: null/undefined → geen bandregel. */
  vroegstFireAgeFractional?: number | null
  /** Actief scenario aanwezig? Zonder scenario geen wat-als-marker/connector. */
  hasScenario: boolean
  /** Gekozen (effectieve) stopleeftijd — altijd een concreet getal (parent levert default). */
  stopAge: number
  onStopAgeChange: (v: number) => void
  /** Koppelmodus: stopkeuze schuift mee met de verwacht-streep (marge blijft gelijk). */
  stopKoppel: boolean
  onStopKoppelChange: (v: boolean) => void
  /** Driezone-status van de marge (uit `computeStopMarge`). */
  zone: StopMargeZone | null
  /** stopAge − verwacht (jaren); null = verwacht onbereikbaar. */
  margeJaren: number | null
}

function formatAge(v: number | null): string {
  if (v === null) return '—'
  const rounded = Math.round(v * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}

export function Vrijheidsas({
  currentAge,
  aowAge,
  baseFireAge,
  verwachtFireAge,
  laatstFireAge,
  vroegstFireAgeFractional = null,
  hasScenario,
  stopAge,
  onStopAgeChange,
  stopKoppel,
  onStopKoppelChange,
  zone,
  margeJaren,
}: VrijheidsasProps) {
  // ── As-schaal (jaren, lineair, min-span 20 jr) ──
  const minAge = Math.floor(currentAge)
  const candidates = [aowAge, baseFireAge, verwachtFireAge, stopAge].filter(
    (v): v is number => v != null && Number.isFinite(v),
  )
  const rawMax = (candidates.length ? Math.max(...candidates) : minAge + 20) + 3
  const maxAge = Math.max(rawMax, minAge + 20)
  const span = maxAge - minAge || 1
  const posOf = (v: number) => Math.max(0, Math.min(100, ((v - minAge) / span) * 100))

  // 5-jaars-ticks (decade-ticks krijgen een klasse zodat mobiel alleen 10-jaars toont).
  const ticks: { age: number; decade: boolean }[] = []
  const firstTick = Math.ceil(minAge / 5) * 5
  for (let a = firstTick; a <= maxAge; a += 5) {
    ticks.push({ age: a, decade: a % 10 === 0 })
  }

  const reachable = verwachtFireAge !== null
  const deltaMonths =
    verwachtFireAge !== null && baseFireAge !== null
      ? Math.round((verwachtFireAge - baseFireAge) * 12)
      : null
  const delta = fireDeltaLabel(deltaMonths, reachable)

  // Marge-band-grenzen.
  const bandVerwachtPct = verwachtFireAge !== null ? posOf(verwachtFireAge) : null
  const bandLaatstPct = laatstFireAge !== null ? posOf(Math.max(laatstFireAge, verwachtFireAge ?? laatstFireAge)) : null

  const margeText =
    margeJaren === null ? 'marge onbekend' : `marge ${formatMargeShort(margeJaren)}`

  // Vroegst–laatst-band: de optimistische én voorzichtige rand van de verwachting.
  // Alleen wanneer beide randen bekend zijn.
  const bandNote =
    vroegstFireAgeFractional != null &&
    Number.isFinite(vroegstFireAgeFractional) &&
    laatstFireAge !== null
      ? `band ${formatAge1(vroegstFireAgeFractional)} – ${formatAge1(laatstFireAge)} jr`
      : undefined

  return (
    <div>
      {/* i-uitleg (patroon LevensinkomenStrook/GuardrailKompas) */}
      <InlineInfoDisclosure label="Uitleg vrijheidsas">
        <div className="mb-1.5 font-semibold text-[var(--ink)]" style={{ fontFamily: PLAYFAIR }}>
          Wanneer ben je vrij — en hoe stevig?
        </div>
        <p className="m-0">
          De bovenste stip is je <b className="text-[var(--ink)]">verwachte vrijheidsleeftijd</b>. Verschuif je scenario,
          dan verschijnt een gestippelde wat-als-stip ernaast. Daaronder kies je je{' '}
          <b className="text-[var(--ink)]">gewenste stopleeftijd</b>: de afstand tot je vrijheidsleeftijd is je{' '}
          <b className="text-[var(--ink)]">marge</b>. <b className="text-red-700">Rood</b> — je wilt stoppen vóór je vrij
          bent. <b className="text-amber-700">Amber</b> — haalbaar op de verwachting, maar niet in een voorzichtig
          scenario. <b className="text-emerald-700">Groen</b> — ook voorzichtig gerekend gedekt.
        </p>
        <p className="m-0 mt-2">
          De <b className="text-[var(--ink)]">band</b> onder Wat-als-vrijheid toont de breedte van de verwachting:{' '}
          <b className="text-[var(--ink)]">vroegst</b> = +2 pp-variant · <b className="text-[var(--ink)]">laatst</b> = −2
          pp-variant — de aannames bepalen de breedte.
        </p>
        <p className="m-0 mt-2">
          De <b className="text-[var(--ink)]">streep</b> is de uitkomst van je aannames; je{' '}
          <b className="text-[var(--ink)]">stopkeuze</b> is jouw keuze. De blokken hieronder rekenen met je stopkeuze zodra
          je die zet.
        </p>
      </InlineInfoDisclosure>

      {/* ── Track 1 — FIRE-uitkomst ── */}
      <div className="relative mb-1 mt-10">
        {/* deltaLabel boven de connector */}
        {hasScenario && reachable && baseFireAge !== null && verwachtFireAge !== null && (
          <div
            className={`absolute -top-6 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tabular-nums ${DELTA_TONE_CLASS[delta.tone]}`}
            style={{ left: `${(posOf(baseFireAge) + posOf(verwachtFireAge)) / 2}%` }}
          >
            {delta.text}
          </div>
        )}

        {/* dunne baan */}
        <div className="h-px w-full bg-[var(--border-ed)]" />

        {/* connector (inkt) tussen basis- en wat-als-marker */}
        {hasScenario && baseFireAge !== null && verwachtFireAge !== null && (
          <div
            aria-hidden
            className="absolute top-1/2 h-px -translate-y-1/2 bg-[var(--ink-2)]"
            style={{
              left: `${Math.min(posOf(baseFireAge), posOf(verwachtFireAge))}%`,
              width: `${Math.abs(posOf(verwachtFireAge) - posOf(baseFireAge))}%`,
            }}
          />
        )}

        {/* basis-FIRE-marker ("Jij"-stijl) */}
        {baseFireAge !== null && (
          <div
            className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-[var(--paper)]"
            style={{ left: `${posOf(baseFireAge)}%`, borderColor: 'var(--color-horizon-600)' }}
            title="Verwachte vrijheidsleeftijd (basis)"
            aria-label={`Basis-vrijheidsleeftijd: ${formatAge(baseFireAge)} jaar`}
          />
        )}

        {/* wat-als-FIRE-marker (gestippelde ink-ring) */}
        {hasScenario && verwachtFireAge !== null && (
          <div
            className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2px] border-dashed bg-[var(--paper)]"
            style={{ left: `${posOf(verwachtFireAge)}%`, borderColor: 'var(--ink-2)' }}
            title="Wat-als-vrijheidsleeftijd"
            aria-label={`Wat-als-vrijheidsleeftijd: ${formatAge(verwachtFireAge)} jaar`}
          />
        )}

        {/* AOW-hairline */}
        {aowAge !== null && (
          <div
            aria-hidden
            className="absolute -top-2 h-4 w-px bg-[var(--ink-4)]"
            style={{ left: `${posOf(aowAge)}%` }}
          />
        )}
      </div>

      {/* 5-jaars-ticks + AOW-label */}
      <div className="relative mb-6 h-4">
        {ticks.map(t => (
          <div
            key={t.age}
            className={`absolute top-0 -translate-x-1/2 font-mono text-[9px] tabular-nums text-[var(--ink-4)] ${
              t.decade ? '' : 'hidden sm:block'
            }`}
            style={{ left: `${posOf(t.age)}%` }}
          >
            {t.age}
          </div>
        ))}
        {aowAge !== null && (
          <div
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]"
            style={{ left: `${posOf(aowAge)}%` }}
          >
            AOW {Math.round(aowAge)}
          </div>
        )}
      </div>

      {/* ── Track 2 — Gewenste stopleeftijd ── */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Gewenste stopleeftijd
        </span>
        <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
          {formatAge(stopAge)}
        </span>
      </div>
      <input
        type="range"
        min={minAge}
        max={maxAge}
        step={0.5}
        value={stopAge}
        onChange={e => onStopAgeChange(Number(e.target.value))}
        className="slider-module w-full"
        aria-label="Gewenste stopleeftijd"
        aria-valuetext={`${formatAge(stopAge)} jaar${
          margeJaren !== null
            ? `, marge ${formatMargeShort(margeJaren)}${zone ? ` (${zone})` : ''}`
            : ''
        }`}
      />

      {/* driezone-band (stoplicht) + stop-marker */}
      <div className="relative mt-1">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {reachable && bandVerwachtPct !== null ? (
            <>
              <div className="bg-red-500" style={{ width: `${bandVerwachtPct}%` }} />
              <div
                className="bg-amber-500"
                style={{ width: `${Math.max(0, (bandLaatstPct ?? 100) - bandVerwachtPct)}%` }}
              />
              <div
                className="bg-emerald-500"
                style={{ width: `${Math.max(0, 100 - (bandLaatstPct ?? 100))}%` }}
              />
            </>
          ) : (
            <div className="w-full bg-[var(--border-ed)]" />
          )}
        </div>

        {/* stop-marker */}
        <div
          className="absolute -top-1 h-[18px] w-px -translate-x-1/2 bg-[var(--ink)]"
          style={{ left: `${posOf(stopAge)}%` }}
          aria-hidden
        />
        <div
          className="absolute top-3 hidden -translate-x-1/2 whitespace-nowrap font-mono text-[9px] tabular-nums text-[var(--ink)] sm:block"
          style={{ left: `${posOf(stopAge)}%` }}
        >
          stop {formatAge(stopAge)}
        </div>

        {/* tick-labels verwacht / laatst */}
        {reachable && bandVerwachtPct !== null && (
          <div
            className="absolute top-3 hidden -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)] sm:block"
            style={{ left: `${bandVerwachtPct}%` }}
          >
            verwacht
          </div>
        )}
        {laatstFireAge !== null && bandLaatstPct !== null && (
          <div
            className="absolute top-3 hidden -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)] sm:block"
            style={{ left: `${bandLaatstPct}%` }}
          >
            laatst
          </div>
        )}
      </div>

      {/* checkbox: stopkeuze schuift mee */}
      <label className="mt-8 flex min-h-11 cursor-pointer items-center gap-2 font-sans text-[12px] leading-snug text-[var(--ink-2)]">
        <input
          type="checkbox"
          checked={stopKoppel}
          onChange={e => onStopKoppelChange(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-horizon-600"
        />
        <span>
          stopkeuze schuift mee met de streep{' '}
          <span className="text-[var(--ink-4)]">(dan blijft je marge gelijk)</span>
        </span>
      </label>

      {/* ── Cijferrij ── */}
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--border-ed)] pt-4">
        <Figure kicker="Basis-vrijheid" value={formatAge(baseFireAge)} unit="jr" />
        <Figure
          kicker="Wat-als-vrijheid"
          value={formatAge(hasScenario ? verwachtFireAge : baseFireAge)}
          unit="jr"
          highlight={hasScenario}
          sub={hasScenario ? delta.text : undefined}
          subClass={hasScenario ? DELTA_TONE_CLASS[delta.tone] : undefined}
          // Vroegst–laatst-band: de optimistische én voorzichtige rand van de verwachting.
          band={bandNote}
        />
        <Figure
          kicker="Stopleeftijd"
          value={formatAge(stopAge)}
          unit="jr"
          sub={margeText}
          subClass={zone ? ZONE_TEXT[zone] : 'text-[var(--ink-3)]'}
          // Zone als woord (tekort/krap/stevig) — op mobiel de enige zone-duiding
          // (de gekleurde band-labels zijn dan verborgen). Zelfde kleurtoon als de marge.
          zoneWord={zone ?? undefined}
          zoneWordClass={zone ? ZONE_TEXT[zone] : undefined}
          // Eén duidende zin onder het zone-woord, zelfde kleurtoon.
          zoneNote={zone ? ZONE_NOTE[zone] : undefined}
        />
      </div>
    </div>
  )
}

function Figure({
  kicker,
  value,
  unit,
  highlight = false,
  sub,
  subClass,
  band,
  zoneWord,
  zoneWordClass,
  zoneNote,
}: {
  kicker: string
  value: string
  unit: string
  highlight?: boolean
  sub?: string
  subClass?: string
  /** Vroegst–laatst-bandregel (ink-3, mono), onder de sub. */
  band?: string
  zoneWord?: string
  zoneWordClass?: string
  /** Duidende zin onder het zone-woord (zelfde kleurtoon). */
  zoneNote?: string
}) {
  return (
    <div>
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
        {kicker}
      </div>
      <div
        className="flex items-baseline gap-1 text-[22px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {highlight ? (
          <span
            className="inline px-1"
            style={{ backgroundImage: 'linear-gradient(transparent 60%, var(--module-active-200) 60%)' }}
          >
            {value}
          </span>
        ) : (
          <span>{value}</span>
        )}
        <span className="text-[11px] font-normal text-[var(--ink-3)]">{unit}</span>
      </div>
      {sub && (
        <div className={`mt-1 font-mono text-[10px] tabular-nums ${subClass ?? 'text-[var(--ink-3)]'}`}>
          {sub}
        </div>
      )}
      {band && (
        <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
          {band}
        </div>
      )}
      {zoneWord && (
        <div className={`mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${zoneWordClass ?? 'text-[var(--ink-3)]'}`}>
          {zoneWord}
        </div>
      )}
      {zoneNote && (
        <div className={`mt-0.5 font-mono text-[10px] leading-snug ${zoneWordClass ?? 'text-[var(--ink-3)]'}`}>
          {zoneNote}
        </div>
      )}
    </div>
  )
}
