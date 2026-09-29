import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { OnderdeelRij } from '@/lib/beheer/dashboard/onderdelen'
import { MEET_STATUS_META } from '@/lib/beheer/dashboard/status'
import { momentTekst } from './opmaak'
import { StatusTeken } from './status-teken'

/**
 * De statustabel. Eén regel per onderdeel: toestand, meting, hoe vers die is,
 * en de doorklik. De norm en de kanttekeningen staan op aanvraag onder de
 * regel.
 *
 * Een lijst van blokken en geen `<table>`: op een telefoon staan de velden
 * onder elkaar, op een breed scherm naast elkaar, zonder horizontaal schuiven.
 * Elk veld draagt zijn eigen label, zodat de regel ook los leesbaar is.
 */

const KOLOMMEN = 'lg:grid lg:grid-cols-[11rem_10rem_minmax(0,1fr)_9rem_auto] lg:items-start lg:gap-x-4'

function VeldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-meta)] lg:sr-only">
      {children}
    </span>
  )
}

export function OnderdelenTabel({ rijen, nu }: { rijen: readonly OnderdeelRij[]; nu: Date }) {
  return (
    <div>
      <div
        aria-hidden
        className={`hidden border-b border-[var(--border-ed)] pb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-meta)] ${KOLOMMEN}`}
      >
        <span>Onderdeel</span>
        <span>Toestand</span>
        <span>Meting</span>
        <span>Actueel per</span>
        <span className="sr-only">Doorklik</span>
      </div>

      <ul>
        {rijen.map((rij) => (
          <li
            key={rij.id}
            className="border-b border-dotted border-[var(--border-ed)] py-3"
            data-testid={`onderdeel-${rij.id}`}
            data-status={rij.status}
          >
            <div className={`space-y-2 lg:space-y-0 ${KOLOMMEN}`}>
              <h4 className="text-sm font-semibold text-[var(--ink)]">{rij.naam}</h4>

              <div>
                <VeldLabel>Toestand </VeldLabel>
                <StatusTeken status={rij.status} ernst={rij.ernst} />
              </div>

              <div className="min-w-0">
                <VeldLabel>Meting </VeldLabel>
                <p className="text-sm leading-relaxed text-[var(--ink-2)]">{rij.meting}</p>
              </div>

              <div>
                <VeldLabel>{rij.actueelLabel} </VeldLabel>
                {rij.actueelOp ? (
                  <p className="font-mono text-xs tabular-nums text-[var(--ink-2)]">
                    {momentTekst(rij.actueelOp, nu)}
                    <span className="hidden font-sans text-[11px] text-[var(--ink-3)] lg:block">{rij.actueelLabel}</span>
                  </p>
                ) : rij.geteldBijLaden ? (
                  <p className="text-xs italic text-[var(--ink-3)]">geteld bij het laden van dit scherm</p>
                ) : (
                  // Geen tijdstip in de bron: het is nooit gebeurd of niet gelezen.
                  // "Bij het laden" zou hier een meting suggereren die er niet is.
                  <p className="text-xs italic text-[var(--ink-3)]" data-testid={`geen-moment-${rij.id}`}>
                    {rij.status === 'meting-mislukt' ? 'niet gelezen' : 'geen tijdstip vastgelegd'}
                  </p>
                )}
              </div>

              <Link
                href={rij.href}
                className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-sm text-[var(--ink-2)] underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:min-h-9"
              >
                {rij.linkLabel}
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </div>

            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:min-h-9">
                Norm en kanttekeningen
              </summary>
              <div className="max-w-[80ch] space-y-1 pb-1 text-xs leading-relaxed text-[var(--ink-3)]">
                <p>
                  <span className="font-medium text-[var(--ink-2)]">{MEET_STATUS_META[rij.status].label}:</span>{' '}
                  {MEET_STATUS_META[rij.status].betekenis}
                </p>
                <p>
                  <span className="font-medium text-[var(--ink-2)]">Norm:</span> {rij.norm}
                </p>
                {rij.details.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4">
                    {rij.details.map((d) => (
                      <li key={d} className="break-words">
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}
