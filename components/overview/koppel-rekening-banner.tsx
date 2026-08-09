import Link from 'next/link'
import { Link2, Plus } from 'lucide-react'

/**
 * KoppelRekeningBanner — de uitnodiging om je bank te koppelen, bovenaan
 * /overzicht/cashflow/transacties.
 *
 * ÉÉN toestand, bewust (TXN-1, faseplan "Eenvoudige weergave" §7): de banner
 * verschijnt zolang er GEEN zichtbare bankrekening is. Zodra er één of meer
 * rekeningen zijn, rendert dit component niets meer.
 *
 * Hier stond eerder een tweede toestand: een bevestigingsstrip "X rekeningen
 * gekoppeld" met links naar "Extra bank koppelen" en "Beheer rekeningen". Die
 * stond permanent bovenaan de pagina — óók (en juist) als alles al gekoppeld
 * was — en meldde daarmee elke keer opnieuw iets wat de gebruiker al weet. De
 * twee links zijn niet verdwenen maar leven op hun eigen plek: koppelen via de
 * actie-rij van de transactie-analyse (in Eenvoudig het "…"-menu) en beheren op
 * /overzicht/cashflow zelf.
 *
 * Geldt in BEIDE weergavemodi: dit is geen diepte-reductie maar een conditie
 * die altijd al zo hoorde te zijn. Vandaar geen `HideInSimple` maar een gewone
 * vroege terugval.
 *
 * PSD2-bank-koppeling bestaat al in de codebase (zie components/app/bank-connect/,
 * app/api/bank-connect/) — dit component maakt die ingang zichtbaar voor wie er
 * nog geen enkele rekening heeft staan.
 */
export function KoppelRekeningBanner({
  accountCount,
}: {
  accountCount: number
}) {
  if (accountCount > 0) return null

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-stone-50 p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <span className="inline-flex w-10 h-10 rounded-xl bg-violet-100 text-violet-700 items-center justify-center shrink-0">
          <Link2 className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
            Geen bankrekeningen gekoppeld
          </div>
          <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5 leading-snug">
            Koppel je bank in 2 minuten
          </h2>
          <p className="text-xs text-[var(--ink-2)] mt-1 leading-snug">
            Met PSD2 worden transacties automatisch geïmporteerd en
            gecategoriseerd. Veilig via TrueLayer — geen
            inloggegevens bij TriFinity.
          </p>
        </div>
      </header>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <Link
          href="/core/cash/connect"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
        >
          <Link2 className="w-4 h-4" aria-hidden="true" />
          Koppel bankrekening
        </Link>
        <Link
          href="/core/cash/import"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Of: handmatig CSV/MT940-import
        </Link>
      </div>
    </section>
  )
}
