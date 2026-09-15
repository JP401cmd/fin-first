'use client'

import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { VermogenKassabon, type VermogenOpbouw } from './vermogen-kassabon'
import { NetWorthHistorySheet, type HistoryPoint } from './networth-history-sheet'

/**
 * NettoVermogenVenster — het ÉNE venster achter de verleden-kaart op /overzicht.
 *
 * Tot de tweedeling van de vermogenskaart waren dit twee vensters: de kassabon
 * (klik op het kopgetal) en het verloop (klik links van Vandaag in de grafiek).
 * Twee klikdoelen in één kaart, waarvan één genest in de ander, voor twee
 * antwoorden op dezelfde vraag — "hoe zit mijn netto vermogen in elkaar?".
 * Nu: eerst de opbouw (bezittingen − schulden = netto vermogen), daaronder het
 * verloop mét de bewerk-modi.
 *
 * HERGEBRUIK, GEEN KOPIE: de opbouw is `VermogenKassabon`, het verloop is de
 * body van `NetWorthHistorySheet` via zijn `render`-prop. Die levert ook de
 * sticky footer van de bewerk-modi aan; tijdens bewerken valt de kassabon weg
 * zodat de invoer de volle hoogte houdt.
 *
 * euro-view: exempt (D12) — beide delen tonen uitsluitend GEREALISEERD vermogen.
 */
export function NettoVermogenVenster({
  open,
  onClose,
  currentNetWorth,
  history,
  dailyExpense,
  opbouw = null,
  netWorthExclHome = null,
  showExclHome = false,
  eigenHuisValue = null,
  mortgageBalance = null,
}: {
  open: boolean
  onClose: () => void
  currentNetWorth: number
  /** Chronologisch oplopend (oudste eerst), inclusief geschatte punten. */
  history: HistoryPoint[]
  /** Canoniek dagtarief (EUR/dag) uit de bundel. Nooit lokaal herrekenen. */
  dailyExpense?: number
  /** De twee termen achter het netto vermogen. `null` → geen opbouw-deel. */
  opbouw?: VermogenOpbouw | null
  netWorthExclHome?: number | null
  showExclHome?: boolean
  eigenHuisValue?: number | null
  mortgageBalance?: number | null
}) {
  const bezittingen = opbouw?.bezittingen ?? null
  const schulden = opbouw?.schulden ?? null
  const kanKassabon = bezittingen != null && schulden != null

  return (
    <NetWorthHistorySheet
      open={open}
      onClose={onClose}
      history={history}
      currentNetWorth={currentNetWorth}
      dailyExpense={dailyExpense}
      // De kassabon noemt het netto vermogen al als totaal; het verloop toont
      // dan alleen nog zijn periode-delta.
      hideHeadlineAmount={kanKassabon}
      render={({ content, footer, editing }) => (
        <ShellOverlay
          kind="sheet"
          size="lg"
          open={open}
          onClose={onClose}
          title="Netto vermogen"
          footer={footer}
        >
          {!editing && kanKassabon && (
            <section className="px-5 pt-5" data-testid="netto-vermogen-venster-opbouw">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                Opbouw
              </h4>
              <VermogenKassabon
                currentNetWorth={currentNetWorth}
                bezittingen={bezittingen}
                schulden={schulden}
                netWorthExclHome={showExclHome ? netWorthExclHome : null}
                eigenHuisValue={showExclHome ? eigenHuisValue : null}
                mortgageBalance={showExclHome ? mortgageBalance : null}
                dailyExpense={dailyExpense}
              />
            </section>
          )}
          {!editing && (
            <h4 className="px-5 pt-6 -mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              Verloop
            </h4>
          )}
          {content}
        </ShellOverlay>
      )}
    />
  )
}
