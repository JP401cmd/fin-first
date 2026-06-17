import type { ReportMasthead } from '@/lib/check/types'

/** Sectie 0 — krantenkop met byline. Statische server-render. */
export function Masthead({ masthead }: { masthead: ReportMasthead }) {
  return (
    <header className="masthead">
      <div className="wrap">
        <div className="masthead-top">
          <span className="logo">
            trifinity<span className="logo-dot">.</span>
          </span>
          <span>Vrijheidscheck · Editie 2026</span>
        </div>
        <div className="kicker">Het Vrijheidsrapport</div>
        <h1>
          Hoeveel van je leven heb je <em>al teruggekocht?</em>
        </h1>
        <p className="dek">
          Vijf minuten invoer, één eerlijk dossier. Elke euro die je opbouwt is
          geen saldo — het is tijd waarin je niet hoeft te werken.
        </p>
        <div className="byline">
          <span>
            Voor — <b>{masthead.displayName}</b>, {masthead.age} jaar
          </span>
          <span>
            Opgesteld — <b>{masthead.dateLabel}</b>
          </span>
          <span>
            Op basis van — <b>jouw intake</b>
          </span>
        </div>
      </div>
    </header>
  )
}
