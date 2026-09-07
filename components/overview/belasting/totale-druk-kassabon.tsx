'use client'

import { useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { TaxOverviewResult } from '@/lib/tax-overview'

/**
 * TotaleDrukKassabon — de bon achter het hero-bedrag van `HubTotaleDruk`
 * (UR3-14 deel D). Het hero-cijfer was het laatste van de drie kerngetallen
 * dat nergens heen ging: het stond er, maar de opbouw over de boxen was alleen
 * verderop op de pagina te vinden.
 *
 * ── WAAROM EEN LOSSE CLIENT-COMPONENT ───────────────────────────────────────
 * `HubTotaleDruk` is bewust een SERVER-component (de hub rekent het overzicht
 * server-side uit met `buildTaxOverview`). Deze wrapper is de client-child die
 * de knop en de sheet draagt zónder de kaart client te maken — dezelfde route
 * die `MaskedAmount` daar al neemt.
 *
 * ── CONSUME, DON'T RECOMPUTE ────────────────────────────────────────────────
 * Elke regel is een veld van `TaxOverviewResult`; het TOTAAL onderaan is
 * `overview.total` en niet de som van de regels erboven. Zouden die twee ooit
 * uiteenlopen (een box die de aggregator wél meetelt maar deze bon niet toont),
 * dan is dat zichtbaar in plaats van weggemiddeld. De twee percentages zijn
 * pass-through uit `computeBox1Tax` — hier wordt niets afgeleid behalve de
 * weergave-afronding die de kaart zelf ook doet.
 *
 * ── DE WEGLATING REIST MEE (H22) ────────────────────────────────────────────
 * `exclBox2` betekent dat er een aanmerkelijk belang is dat NIET in `total`
 * zit. Dan zegt de bon dat op de plek waar de lezer de rekening natelt, met de
 * weg naar de Box 2-pagina — anders leest de bon als een volledige rekening.
 */
export function TotaleDrukKassabonTrigger({
  overview,
  dailyExpenses,
  exclBox2 = false,
  children,
}: {
  overview: TaxOverviewResult
  /** Dag-uitgaven voor de vrijheidstijd-regel. 0 → geen tijdregel. */
  dailyExpenses: number
  exclBox2?: boolean
  /** Het hero-bedrag zoals de kaart het rendert. */
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Bewust GEEN aria-label: die vervángt de naamberekening en dan verliest
          een schermlezer juist het bedrag — de reden dat deze knop bestaat.
          Zelfde keuze als de geldstroom-cellen en het vermogens-kopgetal. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="totale-druk-hero"
        /* De knop neemt de plek in van de HighlightMark-span als flex-item van
           de hero-rij (`flex items-baseline flex-wrap`). Geen eigen display of
           align: de `items-baseline` van die rij lijnt het hero-cijfer dan uit
           met de "per jaar"-staart en de excl.-Box 2-tag ernaast, precies zoals
           vóór de knop. `sr-only` is absoluut gepositioneerd en telt niet mee
           in die basislijn. */
        className="-mx-1 cursor-pointer rounded px-1 text-left transition-colors duration-150 hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        {children}
        <span className="sr-only">, toon de opbouw van je belastingrekening</span>
      </button>

      <ShellOverlay
        kind="sheet"
        open={open}
        onClose={() => setOpen(false)}
        title="Totale belastingdruk"
      >
        <TotaleDrukKassabon
          overview={overview}
          dailyExpenses={dailyExpenses}
          exclBox2={exclBox2}
        />
      </ShellOverlay>
    </>
  )
}

/** De bon zelf. Geëxporteerd voor de component-test. */
export function TotaleDrukKassabon({
  overview,
  dailyExpenses,
  exclBox2 = false,
}: {
  overview: TaxOverviewResult
  dailyExpenses: number
  exclBox2?: boolean
}) {
  const { box1Tax, box2Tax, box3Tax, total, effectiveRate, marginalRate } = overview

  const vrijheid =
    dailyExpenses > 0 && total > 100 ? calculateFreedomTime(total, dailyExpenses) : null
  const vrijheidStr = vrijheid
    ? vrijheid.isInfinite
      ? '∞ vrijheid'
      : `${formatFreedomTimeString(vrijheid, 'long')} vrijheid`
    : null

  const effPct = effectiveRate != null ? Math.round(effectiveRate * 1000) / 10 : null
  const margPct = marginalRate != null ? Math.round(marginalRate * 1000) / 10 : null

  return (
    <KassabonShell>
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Totale druk · {new Date().getFullYear()}
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          Wat je dit jaar aan belasting betaalt, per box
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-2)]">Box 1 · werk en woning</span>
          <span className="font-bold tabular-nums">
            <MaskedAmount value={box1Tax} tone="kern" />
          </span>
        </div>
        {/* Box 2 alleen als bestánddeel tonen wanneer hij ook in `total` zit —
            anders zou een €0-regel suggereren dat er niets is, terwijl de
            weglating-regel hieronder juist zegt dat er wél iets is. */}
        {!exclBox2 && box2Tax > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--ink-2)]">Box 2 · aanmerkelijk belang</span>
            <span className="font-bold tabular-nums">
              <MaskedAmount value={box2Tax} tone="kern" />
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-2)]">Box 3 · sparen en beleggen</span>
          <span className="font-bold tabular-nums">
            <MaskedAmount value={box3Tax} tone="kern" />
          </span>
        </div>

        {exclBox2 && (
          <p className="font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            Box 2 (aanmerkelijk belang) telt hier niet mee — die rekening staat
            apart, op de Box 2-pagina.
          </p>
        )}

        <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
          <div className="flex items-center justify-between font-bold">
            <span>Totaal per jaar</span>
            <span className="tabular-nums" data-testid="druk-kassabon-totaal">
              <MaskedAmount value={Math.round(total)} tone="kern" />
            </span>
          </div>
          {vrijheidStr && (
            <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Kost je ≈ {vrijheidStr} per jaar.
            </p>
          )}
        </div>

        {/* De twee tarieven als voetregels — met hun eigen grondslag erbij.
            Ze gaan over INKOMEN (Box 1-heffing / bruto Box 1-inkomen resp. de
            volgende euro) en niet over de hele rekening hierboven; zonder die
            regel leest "Effectief" als totaal gedeeld door inkomen, en dat was
            precies bevinding C9. */}
        {(effPct != null || margPct != null) && (
          <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 space-y-1">
            {effPct != null && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-3)]">Effectief tarief</span>
                <span className="tabular-nums text-[var(--ink)]">{effPct}%</span>
              </div>
            )}
            {margPct != null && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-3)]">Marginaal tarief</span>
                <span className="tabular-nums text-[var(--ink)]">{margPct}%</span>
              </div>
            )}
            <p className="font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Beide tarieven gaan over je inkomen in Box 1 — niet over de hele
              rekening hierboven.
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 text-center font-sans text-[10px] leading-relaxed text-[var(--ink-4)]">
        Een indicatie op basis van je eigen gegevens, geen aanslag en geen
        advies.
      </p>
    </KassabonShell>
  )
}
