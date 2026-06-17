import type { CheckReportData } from '@/lib/check/types'
import { formatCurrency } from '@/lib/format'

/**
 * Sticky-loze sectie-index (6 ankers). De preview-getallen rechts komen uit de
 * DTO — geen hardcoded €87.400/72/2044.
 */
export function NavIndex({ report }: { report: CheckReportData }) {
  const { snapshot, health, twoFutures, lifeGrid, lifePath, will } = report

  const fireYear =
    twoFutures.fireYear != null ? String(twoFutures.fireYear) : '—'
  const fireAge =
    lifeGrid.fireAge != null ? `${lifeGrid.fireAge} jr` : 'n.v.t.'

  return (
    <nav className="index" aria-label="Inhoudsopgave">
      <a href="#s1">
        01 — Foto van nu<b>{formatCurrency(snapshot.netWorth)}</b>
      </a>
      <a href="#s2">
        02 — Gezondheid<b>{health.score}/100</b>
      </a>
      <a href="#s3">
        03 — De kruising<b>{fireYear}</b>
      </a>
      <a href="#s4">
        04 — Twee toekomsten<b>{fireAge}</b>
      </a>
      <a href="#s5">
        05 — Blik vooruit<b>tot {lifePath.endAge} jr</b>
      </a>
      <a href="#s6">
        06 — Will&apos;s zetten<b>{will.moves.length} stuks</b>
      </a>
    </nav>
  )
}
