'use client'

import { useState, useCallback, useEffect } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button, FiguresStrip, Kicker, type FigureProps } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { formatCurrency } from '@/lib/format'
import { BASIS_LABEL, savingsRateBasisLabel } from '@/lib/budget-basis'
import { GRONDSLAG_ONBEKEND_LABEL } from '@/lib/grondslag-guard'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'
import {
  CashflowGrondslagBody,
  basisSubLabel,
  useCashflowGrondslag,
  type CashflowBlockId,
} from './cashflow-grondslag-body'

/**
 * Menselijk label per grondslag. Woont sinds 31 aug 2026 in
 * `lib/budget-basis.ts` — de forecast-kaart en de spaarquote-widget benoemen
 * dezelfde grondslag en moeten letterlijk dezelfde woorden gebruiken. Hier
 * alleen nog her-geëxporteerd voor de bestaande call-sites.
 */
export { BASIS_LABEL }

/**
 * Instellingenblok onderaan /overzicht/budget/transacties — inkomen, uitgaven
 * en spaarquote.
 *
 * ÉÉN VENSTER, DRIE KAARTEN (ADR 0103). De drie kaarten blijven staan: het zijn
 * drie getallen die je apart wilt kunnen scannen. Ze openen alle drie hetzelfde
 * gecombineerde venster, want het is één samenhangend systeem — de spaarquote
 * ís de uitkomst van de twee grondslagen erboven en heeft daarom géén eigen
 * bronkeuze meer. Welke kaart je aanklikt, bepaalt naar welk blok het venster
 * scrolt.
 *
 * HOST, GEEN INHOUD (W-009). Sinds de voorkeuren-wizard op /toekomst dezelfde
 * keuze toont, wonen de staat, de schrijfweg en de drie blokken in
 * `cashflow-grondslag-body.tsx` — één body, twee hosts. Dit bestand is de host
 * op /overzicht: de cijferstrook, het venster eromheen en de sprong naar het
 * aangeklikte blok. Verandert de keuze hier, dan verandert ze in de wizard mee.
 */

export function CashflowInstellingenBlok({
  data: initialData,
  hideHeading = false,
}: {
  data: CashflowSettingsData
  /**
   * Onderdrukt de eigen kop (kicker + h2) én de sectie-marge. Gezet wanneer het
   * blok in een disclosure hangt die de titel al draagt (CF-4, Eenvoudige
   * weergave — zie cashflow-instellingen-lazy.tsx); zonder dit staat de kop er twee keer.
   */
  hideHeading?: boolean
}) {
  const ctrl = useCashflowGrondslag(initialData)
  const [open, setOpen] = useState<CashflowBlockId | null>(null)

  // ── Scroll naar het aangeklikte blok ──────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const target =
      open === 'income' ? ctrl.refs.income : open === 'expenses' ? ctrl.refs.expenses : ctrl.refs.savings
    // Eén frame wachten: de overlay mount z'n content in dezelfde commit, maar
    // de scroll-container heeft z'n hoogte pas na de eerste paint.
    const raf = requestAnimationFrame(() => {
      const el = target.current
      // jsdom (en oude browsers) kennen scrollIntoView niet — de guard houdt de
      // component testbaar zonder een polyfill af te dwingen.
      if (typeof el?.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'start', behavior: 'auto' })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [open, ctrl.refs])

  // Sluiten ruimt de mislukt-melding op: hij hoort bij de handeling die de
  // gebruiker zojuist deed, niet bij het venster als toestand.
  const closeVenster = useCallback(() => {
    setOpen(null)
    ctrl.resetSaveError()
  }, [ctrl])

  // ── De drie cellen van de samenvatting ────────────────────────────────────
  // De grondslag staat als eigen subregel op ELKE cel (ADR 0103: een grondslag
  // die kan schuiven moet zich bekendmaken). Onbekend is geen nul (ADR 0131).
  const { data, incomeUnknown, expensesUnknown } = ctrl
  const incomeFigure: FigureProps = incomeUnknown
    ? {
        kicker: 'Geschat jaarinkomen',
        amount: GRONDSLAG_ONBEKEND_LABEL,
        sub: 'vul hieronder je eigen bedrag in',
      }
    : {
        kicker: 'Geschat jaarinkomen',
        amount: <MaskedAmount value={ctrl.annualIncome} tone="kern" monoWhenVisible={false} />,
        sub: basisSubLabel(ctrl.incomeBasis, data.budgetIncome.truncationSuspected),
        sub2: `€${Math.round(ctrl.monthlyIncome).toLocaleString('nl-NL')} per maand`,
      }
  const expensesFigure: FigureProps = expensesUnknown
    ? {
        kicker: 'Geschatte uitgaven',
        amount: GRONDSLAG_ONBEKEND_LABEL,
        sub: 'vul hieronder je eigen bedrag in',
      }
    : {
        kicker: 'Geschatte uitgaven',
        amount: <MaskedAmount value={ctrl.monthlyExpenses} tone="kern" monoWhenVisible={false} />,
        sub: basisSubLabel(ctrl.expensesBasis, data.budgetExpenses.truncationSuspected),
        sub2: 'per maand',
      }
  const savingsFigure: FigureProps =
    incomeUnknown || expensesUnknown
      ? {
          kicker: 'Spaarquote',
          amount: GRONDSLAG_ONBEKEND_LABEL,
          sub: savingsRateBasisLabel(ctrl.incomeBasis, ctrl.expensesBasis),
        }
      : {
          kicker: 'Spaarquote',
          amount: `${ctrl.savingsRate}%`,
          variant: 'winner',
          sub: ctrl.savingsBasisLabel,
          sub2: ctrl.savingsSub,
        }

  return (
    <section className={hideHeading ? undefined : 'mt-5 sm:mt-8'}>
      {!hideHeading && (
        <header className="mb-4 space-y-1.5">
          <Kicker>Je instellingen</Kicker>
          <h2 className="font-display text-[17px] font-semibold leading-snug text-[var(--ink)]">
            Waar je <em className="font-normal italic text-[var(--module-active-700)]">cijfers</em>{' '}
            op rusten
          </h2>
        </header>
      )}

      {/* Cijferstrook via de canonieke `FiguresStrip` (patroon-kaart
          *Figures-strip*) — niet met de hand nagebouwd: alleen de component
          brengt de Eenvoudig-reductie (naar 2 cellen, zoals élke andere strip op
          deze pagina) en de `data-figures-strip` print-hook mee.
          `simpleFigures` is expliciet, want de uitkomst-cel staat achteraan: in
          Eenvoudig blijven inkomen en spaarquote staan.
          De spaarquote is `variant: 'winner'` en krijgt daarmee als enige de
          highlight-marker — hij ís de uitkomst van de twee cellen ervoor. */}
      <div aria-busy={ctrl.syncing || undefined}>
        <FiguresStrip
          cols={3}
          className={ctrl.syncing ? 'opacity-60 transition-opacity' : 'transition-opacity'}
          figures={[incomeFigure, expensesFigure, savingsFigure]}
          simpleFigures={[incomeFigure, savingsFigure]}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[52ch] font-serif text-[13px] italic leading-relaxed text-[var(--ink-2)]">
          {ctrl.showRate ? (
            <>
              Deze drie horen bij elkaar: wat binnenkomt, wat weggaat, en wat je daarmee
              aan vrijheid opbouwt. Eén dag vrijheid kost je nu{' '}
              <strong className="not-italic">{formatCurrency(ctrl.dailyRate)}</strong> — je
              uitgaven over de afgelopen 12 maanden, hetzelfde tarief als op de rest van
              je schermen.
            </>
          ) : (
            <>
              Deze drie horen bij elkaar: wat binnenkomt, wat weggaat, en wat je daarmee
              aan vrijheid opbouwt.
            </>
          )}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen('income')}
          className="shrink-0 self-start sm:self-auto"
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden />
          Instellingen aanpassen
        </Button>
      </div>

      <ShellOverlay
        open={open !== null}
        onClose={closeVenster}
        kind="pane" mobileBackCloses
        title="Inkomen, uitgaven en spaarquote"
        primaryAction={{ label: 'Klaar', onClick: closeVenster }}
      >
        <CashflowGrondslagBody ctrl={ctrl} kop="h2" actief={open} onJump={setOpen} />
      </ShellOverlay>
    </section>
  )
}
