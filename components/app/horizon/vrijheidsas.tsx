'use client'

/**
 * Vrijheidsas — de "wanneer kun je stoppen, en hoe stevig is dat?"-blok (mockup-blok ⑤
 * van de wat-als-scenariolaag op /toekomst). Presentational, props-only; alle cijfers
 * komen berekend binnen (consume, niet herrekenen — de FIRE-leeftijden en marge worden
 * in horizon-client uit de scenario-run/`computeStopMarge` afgeleid).
 *
 * Opzet (twee vragen, netjes gescheiden — grid-cols-1 sm:grid-cols-2, mobiel gestapeld):
 *   LINKS  "Wanneer kun je stoppen? — de streep": de draaiknoppen + rendement-per-groep
 *          (via de `draaiknoppen`-slot uit horizon-client) + de verwacht-FIRE-uitkomst
 *          met vroegst–laatst-band.
 *   RECHTS "Hoe stevig is dat? — de marge": de gewenste-stopleeftijd-slider + driezone-
 *          marge-band + stopkeuze-checkbox + de marge/zone-uitkomst.
 *   ONDER  volle-breedte cijferrij (Basis-vrijheid / Wat-als-vrijheid / Stopleeftijd).
 *
 * Kleur-conventie:
 *   - module-identiteit (paneel-badges, stop-slider, accentwaarden) via horizon-tokens;
 *   - de driezone-marge-band (tekort · krap · stevig) in STOPLICHT-status (red/amber/
 *     emerald), nooit het module-accent.
 */

import type { ReactNode } from 'react'
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

// ── Driezone-marge-band-breedtes (getest) ─────────────────────────────────────

/**
 * Minimale amber-buffer-breedte (percentpunten van de as-span). De marge-band (rood ·
 * amber · groen) krijgt een strakke, vaste amber-zone rond de verwacht-streep zodat de
 * VERWACHT- en LAATST-labels nóóit samenvallen — óók niet wanneer de scenario-randen
 * (bijna) op elkaar liggen (bv. vroegst≈laatst≈verwacht). Puur visueel: de zone-
 * classificatie én de marge komen onveranderd uit `computeStopMarge`.
 */
export const MARGE_BAND_MIN_AMBER_PCT = 6

/**
 * Rood/amber/groen-grenzen (in % van de as-span) voor de driezone-marge-band.
 * - rood loopt tot de verwacht-streep;
 * - amber (de buffer) van verwacht tot de voorzichtige rand (laatst), maar minstens
 *   `minAmberPct` breed zodat de labels op de rand van amber altijd van elkaar liggen;
 * - groen vult de rest.
 * `verwachtPct`/`laatstPct` zijn al posities (0–100) — hier wordt niets aan de FIRE-
 * leeftijden of marge herrekend.
 */
export function computeMargeBandPct(
  verwachtPct: number,
  laatstPct: number | null,
  minAmberPct = MARGE_BAND_MIN_AMBER_PCT,
): { amberStartPct: number; amberEndPct: number } {
  const clamp = (n: number) => Math.max(0, Math.min(100, n))
  const start = clamp(verwachtPct)
  const rawLaatst = laatstPct == null ? start : clamp(laatstPct)
  const end = clamp(Math.max(rawLaatst, start + minAmberPct))
  return { amberStartPct: start, amberEndPct: end }
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface VrijheidsasProps {
  /** Huidige leeftijd (as-start). */
  currentAge: number
  /** FIRE-uitkomst van de BASISLIJN (fractioneel); null = onbereikbaar. */
  baseFireAge: number | null
  /** FIRE-uitkomst van het ACTIEVE pad (scenario indien actief, anders basis). */
  verwachtFireAge: number | null
  /** FIRE-uitkomst van de VOORZICHTIGE variant van het actieve pad; null = nooit bereikt.
   *  Vormt samen met `vroegstFireAgeFractional` de "band" van de verwachting (laatst = rand). */
  laatstFireAge: number | null
  /** FIRE-uitkomst van de OPTIMISTISCHE variant (+2 pp-rendement) — de vroegste rand van de
   *  verwachtingsband. Samen met `laatstFireAge` toont dit "band X – Y jr" onder de verwacht-
   *  uitkomst. Optioneel: null/undefined → geen bandregel. */
  vroegstFireAgeFractional?: number | null
  /** Actief scenario aanwezig? Zonder scenario geen wat-als-accent/delta. */
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
  /** Er is een doel vastgelegd — de i-uitleg krijgt één extra doel-zin. */
  doelActief?: boolean
  /** Linker-vlak-inhoud (draaiknoppen + rendement-per-groep) uit horizon-client. */
  draaiknoppen?: ReactNode
}

function formatAge(v: number | null): string {
  if (v === null) return '—'
  const rounded = Math.round(v * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}

export function Vrijheidsas({
  currentAge,
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
  doelActief = false,
  draaiknoppen,
}: VrijheidsasProps) {
  // ── As-schaal (jaren, lineair, min-span 20 jr) — enkel voor de marge-band-posities ──
  const minAge = Math.floor(currentAge)
  const candidates = [baseFireAge, verwachtFireAge, laatstFireAge, stopAge].filter(
    (v): v is number => v != null && Number.isFinite(v),
  )
  const rawMax = (candidates.length ? Math.max(...candidates) : minAge + 20) + 3
  const maxAge = Math.max(rawMax, minAge + 20)
  const span = maxAge - minAge || 1
  const posOf = (v: number) => Math.max(0, Math.min(100, ((v - minAge) / span) * 100))

  const reachable = verwachtFireAge !== null
  const deltaMonths =
    verwachtFireAge !== null && baseFireAge !== null
      ? Math.round((verwachtFireAge - baseFireAge) * 12)
      : null
  const delta = fireDeltaLabel(deltaMonths, reachable)

  // Marge-band-grenzen (rood/amber/groen), met strakke amber-buffer rond de verwacht-streep.
  const bandVerwachtPct = verwachtFireAge !== null ? posOf(verwachtFireAge) : null
  const bandLaatstPct =
    laatstFireAge !== null && verwachtFireAge !== null
      ? posOf(Math.max(laatstFireAge, verwachtFireAge))
      : null
  const band =
    reachable && bandVerwachtPct !== null
      ? computeMargeBandPct(bandVerwachtPct, bandLaatstPct)
      : null

  const margeText =
    margeJaren === null ? 'marge onbekend' : `marge ${formatMargeShort(margeJaren)}`

  // Vroegst–laatst-band: de optimistische én voorzichtige rand van de verwachting.
  const bandNote =
    vroegstFireAgeFractional != null &&
    Number.isFinite(vroegstFireAgeFractional) &&
    laatstFireAge !== null
      ? `band ${formatAge1(vroegstFireAgeFractional)} – ${formatAge1(laatstFireAge)} jr`
      : undefined

  // Gewone-taal-onzekerheidszin (zichtbaar zodra de band-randen bekend zijn). Consumeert
  // exact dezelfde vroegst/laatst-waarden als de band — niets herrekend.
  const onzekerheid =
    vroegstFireAgeFractional != null &&
    Number.isFinite(vroegstFireAgeFractional) &&
    laatstFireAge !== null
      ? {
          vroegst: formatAge(Math.round(vroegstFireAgeFractional * 2) / 2),
          laatst: formatAge(Math.round(laatstFireAge * 2) / 2),
        }
      : null

  return (
    <div>
      {/* i-uitleg (patroon LevensinkomenStrook/GuardrailKompas) */}
      <InlineInfoDisclosure label="Uitleg vrijheidsas">
        <div className="mb-1.5 font-semibold text-[var(--ink)]" style={{ fontFamily: PLAYFAIR }}>
          Zo lees je deze twee vragen
        </div>
        <p className="m-0">
          <b className="text-[var(--ink)]">Links</b> bepaal je wanneer je vrij kúnt zijn — de{' '}
          <b className="text-[var(--ink)]">streep</b>, een uitkomst van je aannames en gedrag.{' '}
          <b className="text-[var(--ink)]">Rechts</b> kies je wanneer je zélf wilt stoppen; de afstand
          tot je streep is je <b className="text-[var(--ink)]">marge</b>.{' '}
          <b className="text-red-700">Rood</b> — je wilt stoppen vóór je vrij bent.{' '}
          <b className="text-amber-700">Amber</b> — haalbaar op de verwachting, maar niet in een
          voorzichtig scenario. <b className="text-emerald-700">Groen</b> — ook voorzichtig gerekend
          gedekt.
        </p>
        <p className="m-0 mt-2">
          De <b className="text-[var(--ink)]">band</b> onder de verwacht-uitkomst toont de breedte van
          de verwachting: <b className="text-[var(--ink)]">vroegst</b> = +2 pp-variant ·{' '}
          <b className="text-[var(--ink)]">laatst</b> = −2 pp-variant — de aannames bepalen de breedte.
        </p>
        {doelActief && (
          <p className="m-0 mt-2">
            Dit is je <b className="text-[var(--ink)]">vastgelegde doel</b>.
          </p>
        )}
      </InlineInfoDisclosure>

      {/* Intro — de twee vragen, netjes gescheiden */}
      <p className="mt-3 font-sans text-[12px] leading-snug text-[var(--ink-3)]">
        Links bepaal je <b className="font-semibold text-[var(--ink-2)]">wanneer je vrij kúnt zijn</b> —
        de streep. Rechts kies je <b className="font-semibold text-[var(--ink-2)]">wanneer je stopt</b>;
        het verschil is je marge.
      </p>

      {/* ── Twee vlakken naast elkaar (mobiel gestapeld) ── */}
      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-5">
        {/* LINKS — Wanneer kun je stoppen? (de streep) */}
        <section className="min-w-0 sm:border-r sm:border-[var(--border-ed)] sm:pr-5">
          <PanelHeader num="1" title="Wanneer kun je stoppen?" tag="de streep" />

          {draaiknoppen && <div className="mt-4 space-y-5">{draaiknoppen}</div>}

          <div className="mt-5 border-t border-[var(--border-ed)] pt-4">
            <Figure
              kicker="FIRE-leeftijd · verwacht"
              value={formatAge(hasScenario ? verwachtFireAge : baseFireAge)}
              unit="jr"
              highlight={hasScenario}
              // Vroegst–laatst-band: de optimistische én voorzichtige rand van de verwachting.
              band={bandNote}
            />
          </div>
        </section>

        {/* RECHTS — Hoe stevig is dat? (de marge) */}
        <section className="min-w-0">
          <PanelHeader num="2" title="Hoe stevig is dat?" tag="de marge" />

          {/* Gewenste stopleeftijd + afwijking + leeftijd op één regel */}
          <div className="mt-4 mb-1.5 flex items-center justify-between gap-2">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Gewenste stopleeftijd
            </span>
            <span className="flex items-baseline gap-2">
              {hasScenario && reachable && delta.tone !== 'none' && (
                <span className={`font-mono text-[10px] tabular-nums ${DELTA_TONE_CLASS[delta.tone]}`}>
                  {delta.text}
                </span>
              )}
              <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatAge(stopAge)}
              </span>
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
          <div className="relative mt-4">
            {/* stop-label boven de band */}
            <div
              className="absolute -top-4 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums text-horizon-700"
              style={{ left: `${posOf(stopAge)}%` }}
            >
              stop {formatAge(stopAge)}
            </div>

            <div className="flex h-2.5 overflow-hidden rounded-full">
              {reachable && band ? (
                <>
                  <div className="bg-red-500" style={{ width: `${band.amberStartPct}%` }} />
                  <div
                    className="bg-amber-500"
                    style={{ width: `${Math.max(0, band.amberEndPct - band.amberStartPct)}%` }}
                  />
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${Math.max(0, 100 - band.amberEndPct)}%` }}
                  />
                </>
              ) : (
                <div className="w-full bg-[var(--border-ed)]" />
              )}
            </div>

            {/* stop-marker (verticaal) */}
            <div
              className="absolute -top-1 h-[18px] w-px -translate-x-1/2 bg-[var(--ink)]"
              style={{ left: `${posOf(stopAge)}%` }}
              aria-hidden
            />

            {/* verwacht/laatst-labels onder de band — naar buiten uitgelijnd zodat ze,
                dankzij de strakke amber-buffer, nooit botsen. */}
            {reachable && band && (
              <div className="relative mt-1 h-3">
                <span
                  className="absolute -translate-x-full whitespace-nowrap pr-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]"
                  style={{ left: `${band.amberStartPct}%` }}
                >
                  verwacht
                </span>
                {laatstFireAge !== null && (
                  <span
                    className="absolute whitespace-nowrap pl-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]"
                    style={{ left: `${band.amberEndPct}%` }}
                  >
                    laatst
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Onzekerheidszin (gewone taal) */}
          {onzekerheid && (
            <p className="mt-3 font-sans text-[12px] leading-snug text-[var(--ink-3)]">
              Waarschijnlijk ben je vrij tussen <b className="text-[var(--ink-2)]">{onzekerheid.vroegst}</b> en{' '}
              <b className="text-[var(--ink-2)]">{onzekerheid.laatst}</b> — afhankelijk van hoe de markten lopen.
            </p>
          )}

          {/* checkbox: stopkeuze schuift mee */}
          <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-2 font-sans text-[12px] leading-snug text-[var(--ink-2)]">
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

          {/* marge/zone-uitkomst */}
          <div className="mt-5 border-t border-[var(--border-ed)] pt-4">
            <Figure
              kicker="Marge · buffer"
              value={margeJaren === null ? '—' : formatMargeShort(margeJaren)}
              unit=""
              valueClass={zone ? ZONE_TEXT[zone] : undefined}
              // Zone als woord (tekort/krap/stevig) + één duidende zin, zelfde kleurtoon.
              zoneWord={zone ?? undefined}
              zoneWordClass={zone ? ZONE_TEXT[zone] : undefined}
              zoneNote={zone ? ZONE_NOTE[zone] : undefined}
            />
          </div>
        </section>
      </div>

      {/* ── Cijferrij (volle breedte, onder de twee vlakken) ── */}
      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[var(--border-ed)] pt-4">
        <Figure kicker="Basis-vrijheid" value={formatAge(baseFireAge)} unit="jr" />
        <Figure
          kicker="Wat-als-vrijheid"
          value={formatAge(hasScenario ? verwachtFireAge : baseFireAge)}
          unit="jr"
          highlight={hasScenario}
          sub={hasScenario ? delta.text : undefined}
          subClass={hasScenario ? DELTA_TONE_CLASS[delta.tone] : undefined}
        />
        <Figure
          kicker="Stopleeftijd"
          value={formatAge(stopAge)}
          unit="jr"
          sub={margeText}
          subClass={zone ? ZONE_TEXT[zone] : 'text-[var(--ink-3)]'}
        />
      </div>
    </div>
  )
}

// ── Sub-componenten ────────────────────────────────────────────────────────────

function PanelHeader({ num, title, tag }: { num: string; title: string; tag: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-horizon-600 font-mono text-[10px] font-bold leading-none text-[var(--paper)]">
        {num}
      </span>
      <h3
        className="font-display text-[13px] font-semibold leading-snug text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {title}{' '}
        <span className="font-serif text-[12px] font-normal italic text-[var(--ink-3)]">— {tag}</span>
      </h3>
    </div>
  )
}

function Figure({
  kicker,
  value,
  unit,
  highlight = false,
  valueClass,
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
  /** Kleurtoon voor de hoofdwaarde (bv. zone-kleur voor de marge). */
  valueClass?: string
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
        className={`flex items-baseline gap-1 text-[22px] font-black leading-none tracking-[-0.02em] tabular-nums ${valueClass ?? 'text-[var(--ink)]'}`}
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
        {unit && <span className="text-[11px] font-normal text-[var(--ink-3)]">{unit}</span>}
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
