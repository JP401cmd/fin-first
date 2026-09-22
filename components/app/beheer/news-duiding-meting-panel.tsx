'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Gauge } from 'lucide-react'
import type { WeekMeting } from '@/lib/krant/duiding-beheer'
import { TERUGTREK_REDEN_LABEL } from '@/lib/krant/duiding-beheer'
import { TERUGTREK_REDENEN } from '@/lib/krant/duiding-schema'

/**
 * Meting van de duiding op `/beheer/nieuws` — de K1-poort van kaart 1A:
 * per week hoeveel artikelen geduid zijn, de dekking (aandeel met een
 * mechanisme, ook per categorie), de teruggetrokken duidingen per reden, en
 * het aantal foute getallen bij rekenende mechanismen. Dat laatste moet twee
 * weken achter elkaar nul zijn.
 *
 * Alleen weergave: elk getal komt uit `GET /api/admin/news-duiding/meting`
 * (`bouwDuidingMeting`, tellingen over `news_articles`, totalen inbegrepen).
 * Hier wordt niets herberekend behalve de opmaak van een aandeel als
 * percentage.
 */

function pct(aandeel: number | null): string {
  return aandeel === null ? '—' : `${Math.round(aandeel * 100)}%`
}

export function NewsDuidingMetingPanel({ ververs }: { ververs: number }) {
  const [weken, setWeken] = useState<WeekMeting[] | null>(null)
  const [afgekapt, setAfgekapt] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let actief = true
    // De state wordt pas ná de fetch gezet (asynchroon), niet synchroon in het effect.
    fetch('/api/admin/news-duiding/meting')
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!actief) return
        if (!res.ok) {
          setFout(typeof body?.error === 'string' ? body.error : 'Ophalen mislukt')
          return
        }
        setFout(null)
        setWeken(Array.isArray(body?.weken) ? (body.weken as WeekMeting[]) : [])
        setAfgekapt(Boolean(body?.afgekapt))
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
        <Gauge className="h-5 w-5 text-[var(--ink-3)]" />
        <h3 className="text-lg font-bold text-[var(--ink)]">Meting duiding</h3>
      </div>
      <p className="mb-4 text-sm text-[var(--ink-3)]">
        Per week (op de dag dat het artikel binnenkwam). De poort: twee weken achter elkaar nul foute getallen bij
        rekenende mechanismen. Loop daarvoor de geduide artikelen met een rekenend mechanisme na (filter hieronder) en
        trek een duiding met een fout getal terug met reden &quot;Fout getal&quot;. Artikelen ouder dan 120 dagen worden
        opgeruimd en vallen uit de meting. De categorie is die van de ingest (een indeling, geen controle-uitkomst).
      </p>

      {fout ? (
        <p role="alert" className="text-sm text-[var(--negative)]">
          {fout}
        </p>
      ) : weken === null ? (
        <p className="text-sm text-[var(--ink-4)]">Laden...</p>
      ) : weken.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-6 py-8 text-center text-sm text-[var(--ink-4)]">
          Nog geen artikelen in deze periode.
        </div>
      ) : (
        <>
          {afgekapt && (
            <p role="alert" className="mb-2 text-xs text-[var(--warning)]">
              Niet alle rijen konden worden gelezen — de oudste weken zijn onvolledig.
            </p>
          )}
          <div className="overflow-x-auto border border-[var(--border-ed)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)] text-left text-[var(--ink-3)]">
                  <th className="px-3 py-2.5 font-medium">Week</th>
                  <th className="px-3 py-2.5 text-right font-medium">Binnen</th>
                  <th className="px-3 py-2.5 text-right font-medium">Geduid</th>
                  <th className="px-3 py-2.5 text-right font-medium">Dekking</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Rekenend</th>
                  <th className="px-3 py-2.5 text-right font-medium">Teruggetr.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Fout getal</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Afgewezen</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Wacht / mislukt</th>
                  <th className="w-8 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-ed)] font-mono tabular-nums">
                {weken.map((w) => {
                  const isOpen = open === w.week
                  return (
                    <Fragment key={w.week}>
                      <tr
                        className="cursor-pointer transition-colors hover:bg-[var(--subtle)]"
                        onClick={() => setOpen(isOpen ? null : w.week)}
                      >
                        <td className="px-3 py-2 text-[var(--ink)]">{w.week}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-3)]">{w.binnen}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-2)]">{w.geduid}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-2)]">{pct(w.dekking)}</td>
                        <td className="hidden px-3 py-2 text-right text-[var(--ink-3)] sm:table-cell">{w.rekenend}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-3)]">{w.teruggetrokkenTotaal}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            w.foutGetalRekenend > 0 ? 'text-[var(--negative)]' : 'text-[var(--ink-2)]'
                          }`}
                        >
                          {w.foutGetalRekenend}
                        </td>
                        <td className="hidden px-3 py-2 text-right text-[var(--ink-3)] sm:table-cell">{w.afgewezenTotaal}</td>
                        <td className="hidden px-3 py-2 text-right text-[var(--ink-3)] lg:table-cell">
                          {w.wacht} / {w.mislukt}
                        </td>
                        <td className="px-2 py-2 text-[var(--ink-4)]">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={`Details week ${w.week}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpen(isOpen ? null : w.week)
                            }}
                          >
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={10} className="bg-[var(--subtle)]/50 px-4 py-3 font-sans">
                            <WeekDetail w={w} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function WeekDetail({ w }: { w: WeekMeting }) {
  const categorieen = Object.entries(w.perCategorie).sort((a, b) => b[1].geduid - a[1].geduid)
  const codes = Object.entries(w.afgewezenPerCode).sort((a, b) => b[1] - a[1])
  return (
    <div className="grid gap-4 text-xs sm:grid-cols-2">
      <div>
        <h4 className="mb-1 font-medium text-[var(--ink-3)]">Dekking per categorie</h4>
        {categorieen.length === 0 ? (
          <p className="text-[var(--ink-4)]">Niets geduid.</p>
        ) : (
          <ul className="space-y-0.5">
            {categorieen.map(([cat, t]) => (
              <li key={cat} className="flex justify-between gap-3">
                <span className="text-[var(--ink-2)]">{cat}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">
                  {t.metMechanisme}/{t.geduid} · {pct(t.dekking)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[var(--ink-4)]">
          Brontekst: <span className="font-mono tabular-nums">{w.perBrontekst.teaser}</span> teaser ·{' '}
          <span className="font-mono tabular-nums">{w.perBrontekst.volledig}</span> volledig · mechanisme vervallen
          op een controle: <span className="font-mono tabular-nums">{w.mechanismeVervallen}</span>
        </p>
      </div>
      <div className="space-y-3">
        <div>
          <h4 className="mb-1 font-medium text-[var(--ink-3)]">Teruggetrokken per reden</h4>
          <ul className="space-y-0.5">
            {TERUGTREK_REDENEN.map((r) => (
              <li key={r} className="flex justify-between gap-3">
                <span className="text-[var(--ink-2)]">{TERUGTREK_REDEN_LABEL[r]}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">{w.teruggetrokken[r]}</span>
              </li>
            ))}
          </ul>
        </div>
        {codes.length > 0 && (
          <div>
            <h4 className="mb-1 font-medium text-[var(--ink-3)]">Afgewezen per foutcode</h4>
            <ul className="space-y-0.5">
              {codes.map(([code, n]) => (
                <li key={code} className="flex justify-between gap-3">
                  <span className="font-mono text-[var(--ink-2)]">{code}</span>
                  <span className="font-mono tabular-nums text-[var(--ink-3)]">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="sm:col-span-2">
        <h4 className="mb-1 font-medium text-[var(--ink-3)]">
          Geduid zonder mechanisme (<span className="font-mono tabular-nums">{w.zonderMechanismeTotaal}</span>
          {w.zonderMechanismeTotaal > w.zonderMechanisme.length ? `, eerste ${w.zonderMechanisme.length} getoond` : ''}) —
          stuurt de groei van de catalogus
        </h4>
        {w.zonderMechanisme.length === 0 ? (
          <p className="text-[var(--ink-4)]">Geen.</p>
        ) : (
          <ul className="max-h-60 space-y-0.5 overflow-auto">
            {w.zonderMechanisme.map((a) => (
              <li key={a.id} className="text-[var(--ink-2)]">
                {a.title} <span className="text-[var(--ink-4)]">· {a.category ?? 'zonder categorie'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
