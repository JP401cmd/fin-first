'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RotateCcw, Clock } from 'lucide-react'
import {
  formatCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
import {
  computeJaarruimte,
  JAARRUIMTE_OPBOUW_PCT,
  JAARRUIMTE_FACTOR_A_IMPUTATIE,
  type JaarruimteJaar,
} from '@/lib/jaarruimte'
import { TaxGauge } from '@/components/overview/belasting/tax-gauge'
import { Kicker } from '@/components/editorial'
import { AandachtspuntActieButton } from '@/components/overview/belasting/aandachtspunt-actie-button'

const BOX1_COLOR = 'var(--color-kern-700)'
const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * JaarruimteCard — toont onbenutte pensioen-aftrekruimte (Box 1) plus een
 * SIMULATOR waarmee de gebruiker live ziet wat een lijfrente-inleg oplevert.
 *
 * Plan-context: Box 1-surface inzicht 1.5. Upgrade van de statische kaart:
 *  - pensioenaangroei-input (bestaand) → bepaalt de onbenutte jaarruimte
 *  - lijfrente-inleg-slider (nieuw) → 0 … jaarruimte, toont live de
 *    belastingbesparing (inleg × marginaal tarief) + vrijheidstijd
 *  - TaxGauge (nieuw) → benutting (benut vs onbenut)
 *
 * Berekening via `lib/jaarruimte.ts`:
 *   onbenut = 30% × min(grondslag, max-premiegrondslag) − 6,27 × factor A
 *
 * Defaults 2026:
 *   OPBOUW = 30% · FRANCHISE = €19.172 · MAX = €35.589 · factor-A-imputatie 6,27
 *
 * Vormgeving: editorial — papier + ink-hiërarchie, scherpe hoeken, Playfair
 * voor het onbenut-bedrag + de live besparing, mono labels, amber slider-accent
 * en vrijheidstijd-subregel. Alle simulator-functionaliteit + prop-signaturen
 * blijven ongewijzigd.
 */
export function JaarruimteCard({
  grossYearlyIncome,
  pensioenAangroei = 0,
  marginaalTarief,
  year = 2026,
  /** Dagelijkse uitgaven voor de vrijheidstijd-vertaling; 0 → geen regel. */
  dailyExpenses = 0,
}: {
  /** Bruto-jaarinkomen voor Box 1 (loon + winst + eigen-woning-forfait). */
  grossYearlyIncome: number
  /** Factor A: jaarlijkse pensioenaangroei in € uit het UPO (toename jaarlijkse
   *  pensioenuitkering). De motor trekt dit × 6,27 af. Default 0 (geen
   *  werkgeverspensioen). Prop-naam blijft `pensioenAangroei` voor compat. */
  pensioenAangroei?: number
  /** Marginaal Box 1-tarief (0.3697 of 0.495). Voor besparings-schatting. */
  marginaalTarief?: number
  /** Belastingjaar voor franchise + cap. Default 2026 (actief jaar). */
  year?: JaarruimteJaar
  dailyExpenses?: number
}) {
  // Interactieve factor A: user vult zijn UPO-factor-A in (jaarlijkse
  // pensioenaangroei in €) zodat de berekening accuraat wordt. De motor trekt
  // dit × 6,27 af. Default = prop-waarde (0 als niets bekend).
  const [factorA, setFactorA] = useState(pensioenAangroei)
  const result = computeJaarruimte(grossYearlyIncome, factorA, year)

  // Lijfrente-inleg-simulator: hoeveel stort je dit jaar? Default = volledige
  // onbenutte ruimte (de optimale benutting). Slider clampt op [0, jaarruimte].
  const [inleg, setInleg] = useState<number>(result.jaarruimte)
  // Houd de inleg geclampt wanneer de jaarruimte verandert (aangroei-input).
  const clampedInleg = Math.min(Math.max(inleg, 0), result.jaarruimte)

  const marginaal = marginaalTarief && marginaalTarief > 0 ? marginaalTarief : null
  const besparing = marginaal != null ? Math.round(clampedInleg * marginaal) : null

  const freedom =
    dailyExpenses > 0 && besparing != null && besparing > 0
      ? formatFreedomTimeString(calculateFreedomTime(besparing, dailyExpenses))
      : null

  if (!result.hasData) {
    return (
      <article className="bg-[var(--paper)] border border-[var(--border-ed)] border-dashed p-5 sm:p-6">
        <Kicker>Jaarruimte {year}</Kicker>
        <p
          className="mt-2 text-sm text-[var(--ink-3)] italic leading-relaxed max-w-[52ch]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Vul je bruto-jaarinkomen aan in je profiel om je pensioen-
          aftrekruimte te berekenen.
        </p>
      </article>
    )
  }

  return (
    <article className="bg-[var(--paper)] border border-[var(--border-ed)] border-l-[3px] border-l-kern-700 p-5 sm:p-6">
      <Kicker>Jaarruimte {year} · pensioen-aftrekruimte</Kicker>

      {result.jaarruimte > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span
              className="text-[32px] sm:text-[40px] font-black leading-[0.9] tracking-[-0.03em] tabular-nums text-[var(--ink)]"
              style={{ fontFamily: PLAYFAIR }}
            >
              {formatCurrency(result.jaarruimte)}
            </span>
            <span className="text-xs uppercase tracking-[0.12em] font-mono text-[var(--ink-3)] pb-1">
              onbenut
            </span>
          </div>
          <p
            className="mt-2 mb-5 text-sm italic text-[var(--ink-2)] leading-snug max-w-[52ch]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            Door dit bedrag te storten in een lijfrente of bankspaar-product mag
            je het in {year} aftrekken van je Box 1-inkomen.
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span
              className="text-[32px] font-black leading-[0.9] tracking-[-0.03em] tabular-nums text-[var(--ink-3)]"
              style={{ fontFamily: PLAYFAIR }}
            >
              € 0
            </span>
            <span className="text-xs uppercase tracking-[0.12em] font-mono text-[var(--ink-3)] pb-1">
              onbenut
            </span>
          </div>
          <p
            className="mt-2 mb-5 text-sm italic text-[var(--ink-2)] leading-snug max-w-[52ch]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            Je werkgever vult je pensioenaangroei volledig — er is geen extra
            ruimte voor lijfrente-aftrek dit jaar.
          </p>
        </>
      )}

      {/* SIMULATOR: lijfrente-inleg-slider + benutting-gauge + besparing.
          Alleen tonen wanneer er ruimte te benutten valt. */}
      {result.jaarruimte > 0 && (
        <div className="mb-4 grid gap-5 border border-[var(--border-ed)] bg-[var(--subtle)] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <label
              htmlFor="jaarruimte-inleg"
              className="block text-[10px] uppercase tracking-[0.12em] font-mono font-semibold text-[var(--ink-3)] mb-1.5"
            >
              Lijfrente-inleg dit jaar
            </label>
            <div className="flex items-baseline gap-2 mb-3">
              <span
                className="text-[24px] font-black tabular-nums tracking-[-0.02em] leading-none text-[var(--ink)]"
                style={{ fontFamily: PLAYFAIR }}
              >
                {formatCurrency(clampedInleg)}
              </span>
              <span className="text-[11px] text-[var(--ink-3)]">
                van {formatCurrency(result.jaarruimte)}
              </span>
            </div>
            <input
              id="jaarruimte-inleg"
              type="range"
              min={0}
              max={result.jaarruimte}
              step={Math.max(50, Math.round(result.jaarruimte / 100))}
              value={clampedInleg}
              onChange={(e) => setInleg(Number(e.target.value) || 0)}
              className="w-full accent-[#b45309]"
              aria-label="Lijfrente-inleg dit jaar"
            />
            {besparing != null && (
              <div className="mt-3 text-sm text-[var(--ink-2)] leading-snug">
                Belastingbesparing ≈{' '}
                <span
                  className="font-black tabular-nums text-[var(--positive)]"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  {formatCurrency(besparing)}
                </span>{' '}
                <span className="text-[var(--ink-3)] text-xs">
                  (inleg × marginaal {(marginaal! * 100).toFixed(1)}%)
                </span>
              </div>
            )}
            {freedom && (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-[var(--ink-2)]">
                <Clock
                  className="h-4 w-4 shrink-0"
                  style={{ color: BOX1_COLOR }}
                  aria-hidden="true"
                />
                ≈ <span className="font-medium text-[var(--ink)]">{freedom}</span> aan vrijheid teruggekocht
              </div>
            )}

            {/* "Voeg toe als actie" — alleen wanneer er een concrete besparing is.
                Stuurt de marginaal-besparing + vrijheidsdagen door naar het
                acties-systeem (deterministisch, los van Will). */}
            {besparing != null && besparing > 0 && (
              <div className="mt-3">
                <AandachtspuntActieButton
                  id="tax:box1-jaarruimte"
                  domain="tax"
                  title="Benut je jaarruimte (lijfrente-inleg)"
                  description={`Stort ${formatCurrency(clampedInleg)} in een lijfrente om in ${year} af te trekken van Box 1.`}
                  savings={besparing}
                  euroImpactMonthly={Math.round((besparing / 12) * 100) / 100}
                  freedomDays={
                    dailyExpenses > 0
                      ? Math.round(besparing / dailyExpenses)
                      : 0
                  }
                  href="/overzicht/belasting/box1"
                />
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <TaxGauge
              value={clampedInleg}
              max={result.jaarruimte}
              label="benut"
              sublabel={formatCurrency(clampedInleg)}
              thresholdLabel="jaarruimte"
              colorVar={BOX1_COLOR}
            />
          </div>
        </div>
      )}

      {/* Interactieve factor A input — user vult zijn factor A (jaarlijkse
          pensioenaangroei uit UPO, in €) in voor accurate jaarruimte. De motor
          trekt dit × 6,27 af. Default 0. */}
      <div className="mb-4 border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
        <label
          htmlFor="jaarruimte-factor-a"
          className="block text-[10px] uppercase tracking-[0.12em] font-mono font-semibold text-[var(--ink-3)] mb-1.5"
        >
          Factor A (jaarlijkse pensioenaangroei UPO)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--ink-3)]">€</span>
          <input
            id="jaarruimte-factor-a"
            type="number"
            inputMode="decimal"
            min={0}
            step={50}
            value={factorA}
            onChange={(e) => setFactorA(Number(e.target.value) || 0)}
            className="flex-1 border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:border-[var(--ink-3)]"
            aria-label="Factor A — jaarlijkse pensioenaangroei UPO per jaar"
          />
          {factorA > 0 && (
            <button
              type="button"
              onClick={() => setFactorA(0)}
              aria-label="Reset naar 0"
              title="Reset"
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-[var(--ink-3)] hover:bg-[var(--paper)] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <p
          className="mt-2 text-[11px] italic text-[var(--ink-3)] leading-snug"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Factor A staat op je UPO (Mijnpensioenoverzicht.nl): de toename van je
          jaarlijkse pensioenuitkering. Telt × {JAARRUIMTE_FACTOR_A_IMPUTATIE}{' '}
          mee in de aftrek. Geen werkgeverspensioen? Vul 0 in.
        </p>
        <p className="mt-2 text-[11px] leading-snug text-[var(--ink-3)]">
          Dit is een lokale simulatie — sla je factor A blijvend op via je{' '}
          <Link
            href="/toekomst/gebeurtenissen?strategie=pensioen"
            className="font-medium text-[var(--ink-2)] underline underline-offset-2 hover:text-[var(--ink)]"
          >
            pensioen-strategie
          </Link>
          .
        </p>
      </div>

      <p
        className="mt-3 text-[12px] italic text-[var(--ink-3)] leading-snug max-w-[60ch]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Indicatie, geen advies — berekening {year}:{' '}
        {(JAARRUIMTE_OPBOUW_PCT * 100).toFixed(0)}% × (inkomen −{' '}
        {formatCurrency(result.franchise)}) − {JAARRUIMTE_FACTOR_A_IMPUTATIE} ×
        factor A. Max {formatCurrency(result.max)} per persoon.
      </p>
    </article>
  )
}
