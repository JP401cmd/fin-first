'use client'

import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { MaskedAmount } from '@/components/app/masked-amount'

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
 * De bon zelf — de opbouw van het netto vermogen (UR3-14 deel D, lichte
 * variant). Staat sinds de tweedeling van de vermogenskaart bovenaan het
 * samengevoegde "Netto vermogen"-venster (`NettoVermogenVenster`), dat opent
 * vanuit de verleden-kaart op /overzicht. Het kopgetal zelf is daar geen eigen
 * knop meer: de hele kaart is het klikdoel.
 *
 * De VOLLE bon (per bezitting en per schuld) blijft waar hij staat; hier staat
 * bewust alleen wat blok 1 al geladen heeft — geen extra query, en geen
 * partnerrijen uit de huishoud-gedeelde `assets`-SELECT.
 *
 * euro-view: exempt (D12) — alle bedragen zijn GEREALISEERD vermogen van
 * vandaag; er is hier geen projectierij en dus geen kernelfactor.
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
