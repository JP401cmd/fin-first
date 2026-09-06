import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * De archief-regel: bevestigt dat de boekingen van verwijderde rekeningen er
 * nog zijn, en linkt ernaartoe.
 *
 * Bewust een eigen regel en géén rekening-kaart: het archief ÍS geen rekening.
 * Het heeft per definitie saldo 0, geen bezitting en geen detailscherm, en het
 * mag nooit in een saldototaal of in het app-brede "losse rekening"-predicaat
 * belanden (ADR 0082). Een kaart zou precies die dingen suggereren — en klikken
 * zou op een scherm landen dat alleen actieve rekeningen kent. Als regel doet
 * hij één ding, en dat is het ding dat ontbrak.
 *
 * Presentational: de rij en de telling komen als props binnen, zodat zowel een
 * server-pagina als een client-oppervlak hem kan voeden. Hij rendert niets
 * zolang er geen archief is of het leeg is — een archiefregel zonder boekingen
 * voegt geen zekerheid toe, en dat is juist waarvoor hij bestaat.
 */
export function CashArchiefRegel({
  accountId,
  txCount,
  className = '',
}: {
  accountId: string | null
  txCount: number | null
  className?: string
}) {
  if (!accountId || txCount === null || txCount <= 0) return null

  return (
    <Link
      href={`/overzicht/cashflow/transacties?rekening=${accountId}`}
      className={`group flex items-center justify-between gap-3 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-4 py-3 transition-colors hover:border-[var(--ink-3)] ${className}`}
      data-testid="cashflow-archief"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--ink-2)]">
          Archief — verwijderde rekeningen
        </p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          Blijft meetellen in je historie en budgetten, niet in je saldo.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
          {txCount.toLocaleString('nl-NL')} {txCount === 1 ? 'boeking' : 'boekingen'}
        </span>
        <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-[var(--ink-2)]" />
      </div>
    </Link>
  )
}
