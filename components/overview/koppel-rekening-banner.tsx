import Link from 'next/link'
import { Link2, Plus, Settings, CheckCircle2 } from 'lucide-react'

/**
 * KoppelRekeningBanner — toont op /overzicht/cashflow boven de
 * TransactiesFeed twee mogelijke states:
 *
 *  - 0 actieve bank-accounts: invite-banner "Koppel je bank in 2 min"
 *    met grote CTA naar /core/cash/connect (PSD2 TrueLayer flow).
 *  - ≥ 1 account: compact statusje "X rekeningen gekoppeld" met
 *    secundair link naar /core/cash om te beheren + import-link voor
 *    handmatige MT940/CSV/OFX-upload.
 *
 * Plan-context: T-6 + R-4. PSD2-bank-koppeling bestaat al in de codebase
 * (zie components/app/bank-connect/, app/api/bank-connect/) — dit
 * component maakt de hub zichtbaar vanaf /overzicht/cashflow zodat de
 * gebruiker niet hoeft te zoeken.
 */
export function KoppelRekeningBanner({
  accountCount,
}: {
  accountCount: number
}) {
  if (accountCount === 0) {
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

  return (
    <section
      className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2"
      aria-label="Bank-koppelingen status"
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
        <span className="text-xs text-emerald-800">
          {accountCount === 1
            ? '1 rekening gekoppeld'
            : `${accountCount} rekeningen gekoppeld`}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] font-semibold">
        <Link
          href="/core/cash/connect"
          className="inline-flex items-center gap-1 text-violet-700 hover:underline"
        >
          <Plus className="w-3 h-3" aria-hidden="true" />
          Extra bank koppelen
        </Link>
        <Link
          href="/overzicht/cashflow"
          className="inline-flex items-center gap-1 text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          <Settings className="w-3 h-3" aria-hidden="true" />
          Beheer rekeningen
        </Link>
      </div>
    </section>
  )
}
