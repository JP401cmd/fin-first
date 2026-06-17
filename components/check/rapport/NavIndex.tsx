'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  HeartPulse,
  GitBranch,
  LineChart,
  Newspaper,
  Target,
} from 'lucide-react'
import type { CheckReportData } from '@/lib/check/types'
import { formatCurrency } from '@/lib/format'

/**
 * Sticky sectie-index (6 ankers). Pint onder de leesvoortgang-balk en krijgt
 * een schaduw zodra de pagina eronder doorscrolt (sentinel + IntersectionObserver).
 * Op mobiel tonen we alleen de iconen (label + getal verborgen via CSS).
 * De preview-getallen rechts komen uit de DTO — geen hardcoded €87.400/72/2044.
 */
export function NavIndex({ report }: { report: CheckReportData }) {
  const { snapshot, health, twoFutures, lifeGrid, lifePath, will, news } = report

  const fireYear =
    twoFutures.fireYear != null ? String(twoFutures.fireYear) : '—'
  const fireAge =
    lifeGrid.fireAge != null ? `${lifeGrid.fireAge} jr` : 'n.v.t.'
  const newsCount = news?.items?.length ?? 0

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinelRef} className="index-sentinel" aria-hidden="true" />
      <nav
        className={`index${stuck ? ' is-stuck' : ''}`}
        aria-label="Inhoudsopgave"
      >
        <a href="#s1">
          <span className="index-top">
            <span className="index-icon" aria-hidden="true">
              <Camera />
            </span>
            <span className="index-label">01 — Foto van nu</span>
          </span>
          <b>{formatCurrency(snapshot.netWorth)}</b>
        </a>
        <a href="#s2">
          <span className="index-top">
            <span className="index-icon" aria-hidden="true">
              <HeartPulse />
            </span>
            <span className="index-label">02 — Gezondheid</span>
          </span>
          <b>{health.score}/100</b>
        </a>
        <a href="#s3">
          <span className="index-top">
            <span className="index-icon" aria-hidden="true">
              <GitBranch />
            </span>
            <span className="index-label">03 — Twee toekomsten</span>
          </span>
          <b>{fireAge}</b>
        </a>
        <a href="#s4">
          <span className="index-top">
            <span className="index-icon" aria-hidden="true">
              <LineChart />
            </span>
            <span className="index-label">04 — De toekomst</span>
          </span>
          <b>
            {fireYear} · tot {lifePath.endAge} jr
          </b>
        </a>
        <a href="#s5">
          <span className="index-top">
            <span className="index-icon" aria-hidden="true">
              <Newspaper />
            </span>
            <span className="index-label">05 — Uit het nieuws</span>
          </span>
          <b>{newsCount > 0 ? `${newsCount} items` : 'actueel'}</b>
        </a>
        <a href="#s6">
          <span className="index-top">
            <span className="index-icon" aria-hidden="true">
              <Target />
            </span>
            <span className="index-label">06 — Will&apos;s zetten</span>
          </span>
          <b>{will.moves.length} stuks</b>
        </a>
      </nav>
    </>
  )
}
