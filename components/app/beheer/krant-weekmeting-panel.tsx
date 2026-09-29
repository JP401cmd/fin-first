'use client'

import { Fragment, useEffect, useState } from 'react'
import { CalendarCheck, ChevronDown, ChevronUp } from 'lucide-react'
import { WEEKMETING_BRONSOORTEN, type WeekmetingReeksRegel } from '@/lib/krant/weekmeting'

/**
 * Weekmeting van de Krant op `/beheer/nieuws` (B41): één regel per afgesloten
 * week, zoals de weekcron hem zelf vastlegde in `job_runs` (taak
 * `krant-weekmeting`). Uitklappen toont dekking per brontype, artikelpagina's,
 * lege verversingen per profieltype en tokens per AI-feature.
 *
 * Alleen weergave: elk getal komt uit `GET /api/admin/krant-weekmeting`. Hier
 * wordt niets herberekend behalve de opmaak van een aandeel als percentage, en
 * niets opnieuw onderdrukt.
 */

function pct(aandeel: number | null): string {
  return aandeel === null ? '—' : `${Math.round(aandeel * 100)}%`
}

function getal(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('nl-NL')
}

const BRONSOORT_LABEL: Record<(typeof WEEKMETING_BRONSOORTEN)[number] | 'onbekend', string> = {
  rss: 'RSS',
  web_lijst: 'Lijstpagina',
  web_pagina: 'Regelpagina',
  onbekend: 'Onbekend',
}

export function KrantWeekmetingPanel({ ververs }: { ververs: number }) {
  const [reeks, setReeks] = useState<WeekmetingReeksRegel[] | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let actief = true
    fetch('/api/admin/krant-weekmeting')
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!actief) return
        if (!res.ok) {
          setFout(typeof body?.error === 'string' ? body.error : 'Ophalen mislukt')
          return
        }
        setFout(null)
        setReeks(Array.isArray(body?.weken) ? (body.weken as WeekmetingReeksRegel[]) : [])
      })
      .catch(() => {
        if (actief) setFout('Ophalen mislukt')
      })
    return () => {
      actief = false
    }
  }, [ververs])

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-[var(--ink-3)]" />
        <h3 className="text-lg font-bold text-[var(--ink)]">Weekmeting Krant</h3>
      </div>
      <p className="mb-2 text-sm text-[var(--ink-3)]">
        Elke maandag legt de weekcron de meting van de afgelopen week vast (B41). Alleen tellingen, herleid uit de
        tabellen op het meetmoment; per week telt de laatste run. Een week met een waarschuwing staat op{' '}
        <span className="font-mono">partial</span> op /beheer/jobs.
      </p>

      {fout ? (
        <p role="alert" className="text-sm text-[var(--negative)]">
          {fout}
        </p>
      ) : reeks === null ? (
        <p className="text-sm text-[var(--ink-4)]">Laden...</p>
      ) : reeks.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-6 py-8 text-center text-sm text-[var(--ink-4)]">
          Nog geen weekmeting. De eerste draait maandag 06:00 UTC, na de weekeditie.
        </div>
      ) : (
        <div className="overflow-x-auto border border-[var(--border-ed)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)] text-left text-[var(--ink-3)]">
                <th className="px-3 py-2.5 font-medium">Week</th>
                <th className="px-3 py-2.5 text-right font-medium">Binnen</th>
                <th className="px-3 py-2.5 text-right font-medium">Geduid</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Samenv.</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Thema</th>
                <th className="px-3 py-2.5 text-right font-medium">Rekenend</th>
                <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">G1–G6</th>
                <th className="px-3 py-2.5 text-right font-medium">Let op</th>
                <th className="w-8 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-ed)] font-mono tabular-nums">
              {reeks.map(({ record: r, status }) => {
                const isOpen = open === r.week
                const p = r.poort
                return (
                  <Fragment key={r.week}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-[var(--subtle)]"
                      onClick={() => setOpen(isOpen ? null : r.week)}
                    >
                      <td className="px-3 py-2 text-[var(--ink)]">{r.week}</td>
                      <td className="px-3 py-2 text-right text-[var(--ink-3)]">{r.artikelen.binnen}</td>
                      <td className="px-3 py-2 text-right text-[var(--ink-2)]">{r.artikelen.geduid}</td>
                      <td className="hidden px-3 py-2 text-right text-[var(--ink-2)] sm:table-cell">
                        {pct(r.artikelen.aandeelSamenvatting)}
                      </td>
                      <td className="hidden px-3 py-2 text-right text-[var(--ink-2)] sm:table-cell">
                        {pct(r.artikelen.aandeelThema)}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--ink-2)]">{r.artikelen.rekenend}</td>
                      <td className="hidden px-3 py-2 text-right text-[var(--ink-3)] lg:table-cell">
                        {[p.g1, p.g2, p.g3, p.g4, p.g5, p.g6].join(' · ')}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          r.waarschuwingen.length > 0 ? 'text-[var(--warning)]' : 'text-[var(--ink-3)]'
                        }`}
                      >
                        {r.waarschuwingen.length}
                      </td>
                      <td className="px-2 py-2 text-[var(--ink-4)]">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={`Details week ${r.week}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen(isOpen ? null : r.week)
                          }}
                          className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center"
                        >
                          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} className="bg-[var(--paper)] px-3 py-4 font-sans">
                          <WeekDetail regel={{ record: r, status, startedAt: null }} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function WeekDetail({ regel }: { regel: WeekmetingReeksRegel }) {
  const r = regel.record
  const soorten = [...WEEKMETING_BRONSOORTEN, 'onbekend'] as const
  const features = Object.entries(r.tokens.perFeature).sort((a, b) => b[1].input + b[1].output - (a[1].input + a[1].output))
  const test = Object.entries(r.verversingen.testaccounts).sort((a, b) => a[0].localeCompare(b[0]))
  return (
    <div className="space-y-4 text-xs text-[var(--ink-3)]">
      {r.waarschuwingen.length > 0 && (
        <div>
          <h4 className="mb-1 font-semibold text-[var(--ink-2)]">Waarschuwingen</h4>
          <ul className="list-disc pl-5">
            {r.waarschuwingen.map((w) => (
              <li key={w.code}>{w.tekst}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="mb-1 font-semibold text-[var(--ink-2)]">Dekking per brontype</h4>
        <table className="w-full font-mono tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Soort</th>
              <th className="py-1 text-right font-medium">Artikelen</th>
              <th className="py-1 text-right font-medium">Geduid</th>
              <th className="py-1 text-right font-medium">Samenv.</th>
              <th className="py-1 text-right font-medium">Mechanisme</th>
              <th className="py-1 text-right font-medium">Rekenend</th>
              <th className="py-1 text-right font-medium">Thema</th>
            </tr>
          </thead>
          <tbody>
            {soorten
              .filter((s) => s !== 'onbekend' || r.perBronsoort.onbekend.artikelen > 0)
              .map((s) => {
                const d = r.perBronsoort[s]
                return (
                  <tr key={s}>
                    <td className="py-0.5 font-sans">{BRONSOORT_LABEL[s]}</td>
                    <td className="py-0.5 text-right">{d.artikelen}</td>
                    <td className="py-0.5 text-right">{d.geduid}</td>
                    <td className="py-0.5 text-right">{d.metSamenvatting}</td>
                    <td className="py-0.5 text-right">{d.metMechanisme}</td>
                    <td className="py-0.5 text-right">{d.rekenend}</td>
                    <td className="py-0.5 text-right">{d.metThema}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      <p>
        Artikelpagina&apos;s: {r.artikelpaginas.gelezen} gelezen · {r.artikelpaginas.terugval} terugval ·{' '}
        {r.artikelpaginas.geenHtml} geen HTML · backfill resterend {getal(r.artikelpaginas.backfillResterend)} (stand op
        het meetmoment, hele tabel)
      </p>
      <p>
        Tekstpoort: G1 {r.poort.g1} · G2 {r.poort.g2} · G3 {r.poort.g3} · G4 {r.poort.g4} · G5 {r.poort.g5} · G6{' '}
        {r.poort.g6} ({r.poort.groen} groen, {r.poort.gedegradeerd} gedegradeerd)
      </p>
      <div>
        <h4 className="mb-1 font-semibold text-[var(--ink-2)]">
          Lege edities {r.editieWeek}: {r.verversingen.leeg} van {r.verversingen.edities}
          {r.verversingen.onvolledig && ' (ondergrens: de editierun liep niet volledig)'}
        </h4>
        <p className="mb-1">
          De verdeling per profieltype van echte lezers staat in het paneel Meting schaduweditie (k-onderdrukt);
          hier alleen het totaal, zodat twee tabellen samen niets prijsgeven.
        </p>
        <ul>
          <li className="font-medium">Testaccounts</li>
          {test.length === 0 ? <li>—</li> : test.map(([t, c]) => (
            <li key={t} className="font-mono">
              {t}: {c.leeg} / {c.edities}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="mb-1 font-semibold text-[var(--ink-2)]">
          Tokens per AI-feature ({getal(r.tokens.totaal.aanroepen)} aanroepen)
        </h4>
        {features.length === 0 ? (
          <p>—</p>
        ) : (
          <ul className="font-mono">
            {features.map(([f, t]) => (
              <li key={f}>
                {f}: {getal(t.aanroepen)}× · in {getal(t.input)} · uit {getal(t.output)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {r.afgekapt && <p className="text-[var(--negative)]">Een lezing stopte op het plafond: tellingen zijn een ondergrens.</p>}
    </div>
  )
}
