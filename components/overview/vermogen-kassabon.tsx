'use client'

import { useState } from 'react'
import { calculateFreedomTime, formatFreedomTimeString, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { SubtotalLine } from '@/components/editorial/subtotal-line'

/**
 * VermogenOpbouw — de bouwstenen achter het netto-vermogen-kopgetal, zoals
 * blok 1 van /overzicht ze al heeft (`healthScoreInput.totalAssets` /
 * `.totalDebts`, perspectief-correct).
 *
 * CONSUME, DON'T RECOMPUTE: deze kassabon telt niets op. `bezittingen` en
 * `schulden` zijn de twee termen waaruit de pagina `currentNetWorth` al heeft
 * afgeleid; het TOTAAL onderaan de bon is die `currentNetWorth` zelf en niet
 * `bezittingen − schulden`. Zouden die twee ooit uiteenlopen, dan is dat
 * zichtbaar in plaats van weggemiddeld — precies zoals de geldstroom-bonnen
 * hun totaal uit de samenvatting halen en niet uit de opsomming.
 */
export type VermogenOpbouw = {
  /** Totale waarde bezittingen (EUR) — `healthScoreInput.totalAssets`. */
  bezittingen: number | null
  /** Totale openstaande schulden (EUR) — `healthScoreInput.totalDebts`. */
  schulden: number | null
}

/**
 * NettoVermogenKopgetal — het kopgetal van de vermogensgrafiek op /overzicht,
 * maar dan klikbaar: tikken opent de kassabon met de opbouw (UR3-14 deel D,
 * lichte variant — eigenaarsbesluit 5 sep 2026).
 *
 * "Elk getal is klikbaar" is canoniek in de design-taal; dit was één van de
 * drie kerngetallen die dat nog niet waren. De VOLLE bon (per bezitting en per
 * schuld, gewogen naar inclusiepercentage) blijft waar hij staat: op de legacy
 * `/core`-landing, achter de doorklik naar /overzicht/bezittingen. Hier staat
 * bewust alleen wat blok 1 al geladen heeft — geen extra query, en geen
 * partnerrijen uit de huishoud-gedeelde `assets`-SELECT.
 *
 * Zonder `opbouw` (mock-/oudere bundels, tests) rendert dit component exact het
 * platte kopgetal dat er altijd stond: geen knop, geen sheet, byte-identiek.
 *
 * euro-view: exempt (D12) — beide bedragen zijn GEREALISEERD vermogen van
 * vandaag; er is hier geen projectierij en dus geen kernelfactor. Ze staan per
 * definitie al in euro's van vandaag en deflateren nooit.
 */
export function NettoVermogenKopgetal({
  currentNetWorth,
  netWorthExclHome = null,
  showExclHome = false,
  opbouw = null,
  eigenHuisValue = null,
  mortgageBalance = null,
  dailyExpense,
}: {
  /** Netto vermogen (perspectief-correct, blok 1) — het kopgetal zelf. */
  currentNetWorth: number
  /** Nettovermogen excl. eigen woning (perspectief-correct) — losse subregel. */
  netWorthExclHome?: number | null
  /** Gate voor de excl.-regel ⇔ `showDualHousingBasis`. Default false. */
  showExclHome?: boolean
  /** De twee termen achter het kopgetal. `null` → geen kassabon, plat getal. */
  opbouw?: VermogenOpbouw | null
  /** `housingSplit.eigenHuisValue` — alleen getoond wanneer `showExclHome`. */
  eigenHuisValue?: number | null
  /** `housingSplit.mortgageBalance` — alleen getoond wanneer `showExclHome`. */
  mortgageBalance?: number | null
  /**
   * Canoniek dagtarief (EUR/dag) uit de dashboard-bundel — voedt de
   * vrijheidstijd-slotregel van de bon. Afwezig/0 → alleen het €-bedrag.
   * Nooit lokaal herrekenen.
   */
  dailyExpense?: number
}) {
  const { masked } = useMaskedAmounts()
  const [open, setOpen] = useState(false)

  const bezittingen = opbouw?.bezittingen ?? null
  const schulden = opbouw?.schulden ?? null
  const kanKassabon = bezittingen != null && schulden != null

  const bedrag = (
    <div className="font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
      {formatMaskedCurrency(currentNetWorth, masked)}
    </div>
  )

  const exclRegel =
    showExclHome && netWorthExclHome != null ? (
      <SubtotalLine
        label="excl. eigen woning"
        amount={netWorthExclHome}
        className="!mt-1 !mb-0"
      />
    ) : null

  if (!kanKassabon) {
    return (
      <>
        {bedrag}
        {exclRegel}
      </>
    )
  }

  return (
    <>
      {/* Bewust GEEN aria-label op de knop: die vervángt de naamberekening en
          dan verliest een schermlezer juist het bedrag — de reden dat deze knop
          bestaat. De zichtbare inhoud blijft de naam; wat de knop dóét komt er
          als sr-only staart achteraan. Zelfde keuze als de geldstroom-cellen. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="netto-vermogen-kopgetal"
        className="-mx-1 w-fit cursor-pointer rounded px-1 text-left transition-colors duration-150 hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        {bedrag}
        <span className="sr-only">, toon de opbouw van je netto vermogen</span>
      </button>
      {exclRegel}

      <ShellOverlay
        kind="sheet"
        open={open}
        onClose={() => setOpen(false)}
        title="Netto vermogen"
      >
        <VermogenKassabon
          currentNetWorth={currentNetWorth}
          bezittingen={bezittingen}
          schulden={schulden}
          netWorthExclHome={showExclHome ? netWorthExclHome : null}
          eigenHuisValue={showExclHome ? eigenHuisValue : null}
          mortgageBalance={showExclHome ? mortgageBalance : null}
          dailyExpense={dailyExpense}
        />
      </ShellOverlay>
    </>
  )
}

/**
 * De bon zelf. Geëxporteerd voor de component-test die de gerenderde regels
 * tegen de bundelwaarden pint.
 */
export function VermogenKassabon({
  currentNetWorth,
  bezittingen,
  schulden,
  netWorthExclHome = null,
  eigenHuisValue = null,
  mortgageBalance = null,
  dailyExpense,
}: {
  currentNetWorth: number
  bezittingen: number
  schulden: number
  netWorthExclHome?: number | null
  eigenHuisValue?: number | null
  mortgageBalance?: number | null
  dailyExpense?: number
}) {
  // Vrijheidstijd-equivalent van het netto vermogen — "geld is opgeslagen
  // tijd". Uitsluitend via het canonieke dagtarief uit de bundel; ontbreekt
  // dat, dan zwijgt de regel liever dan een tarief te verzinnen.
  const vrijheid =
    dailyExpense != null && Number.isFinite(dailyExpense) && dailyExpense > 0 && currentNetWorth > 0
      ? calculateFreedomTime(currentNetWorth, dailyExpense)
      : null
  const vrijheidStr = vrijheid ? formatFreedomTimeString(vrijheid, 'long') : null

  const toonWoning =
    netWorthExclHome != null && (eigenHuisValue != null || mortgageBalance != null)

  return (
    <KassabonShell>
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Netto vermogen
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          Wat je bezit, min wat je nog terugbetaalt
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-2)]">Bezittingen</span>
          <span className="font-bold tabular-nums">
            <MaskedAmount value={bezittingen} tone="kern" />
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-2)]">Schulden</span>
          <span className="font-bold tabular-nums">
            <MaskedAmount value={-schulden} tone="kern" />
          </span>
        </div>

        <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
          <div className="flex items-center justify-between font-bold">
            <span>Netto vermogen</span>
            <span className="tabular-nums" data-testid="vermogen-kassabon-totaal">
              <MaskedAmount value={currentNetWorth} tone="kern" />
            </span>
          </div>
          {vrijheidStr && (
            <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Dat is ≈ {vrijheidStr} vrijheid — zoveel tijd heb je al opgeslagen.
            </p>
          )}
        </div>

        {/* Tweede grondslag: wat er overblijft zonder de eigen woning. De
            waarde komt uit `horizonData.netWorthExclHome` (perspectief-correct)
            — hier wordt niets afgetrokken; huiswaarde en hypotheek staan er
            alleen bij zodat de lezer ziet wát eruit gaat. */}
        {toonWoning && (
          <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Zonder de eigen woning
            </p>
            {eigenHuisValue != null && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-2)]">Waarde eigen woning</span>
                <span className="tabular-nums">
                  <MaskedAmount value={eigenHuisValue} tone="kern" />
                </span>
              </div>
            )}
            {mortgageBalance != null && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-2)]">Hypotheek</span>
                <span className="tabular-nums">
                  <MaskedAmount value={-mortgageBalance} tone="kern" />
                </span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between font-bold">
              <span>Netto vermogen excl. eigen woning</span>
              <span className="tabular-nums" data-testid="vermogen-kassabon-excl-woning">
                <MaskedAmount value={netWorthExclHome} tone="kern" />
              </span>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 text-center font-sans text-[10px] leading-relaxed text-[var(--ink-4)]">
        Per bezitting en per schuld uitgesplitst? Dat staat op je bezittingen- en
        schuldenpagina.
      </p>
    </KassabonShell>
  )
}
