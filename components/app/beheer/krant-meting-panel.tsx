'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Newspaper } from 'lucide-react'
import { GEBRUIK_K } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import { metingCelTekst, type KrantMeting, type KrantMetingRun } from '@/lib/krant/meting-beheer'

/**
 * Meting van de schaduweditie op `/beheer/nieuws` — de K1-poort van kaart 1B:
 * per run hoeveel edities er zijn gebouwd en hoeveel daarvan leeg bleven, per
 * profieltype, plus de overlap met de LLM-editie op de testaccounts.
 *
 * Alleen weergave. Elk getal komt uit `GET /api/admin/krant-meting`, dat de
 * summary van de weekcron uit `job_runs` teruglees. Hier wordt niets
 * herberekend behalve de opmaak van een aandeel als percentage — en niets
 * opnieuw onderdrukt: wat de cron als "< 5" of "verborgen" schreef, blijft dat.
 */

function pct(aandeel: number | null): string {
  return aandeel === null ? '—' : `${Math.round(aandeel * 100)}%`
}

function tijdstip(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function KrantMetingPanel({ ververs }: { ververs: number }) {
  const [meting, setMeting] = useState<KrantMeting | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let actief = true
    fetch('/api/admin/krant-meting')
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!actief) return
        if (!res.ok) {
          setFout(typeof body?.error === 'string' ? body.error : 'Ophalen mislukt')
          return
        }
        setFout(null)
        setMeting(
          body && Array.isArray(body.runs) && body.totalen ? ({ runs: body.runs, totalen: body.totalen } as KrantMeting) : null,
        )
      })
      .catch(() => {
        if (actief) setFout('Ophalen mislukt')
      })
    return () => {
      actief = false
    }
  }, [ververs])

  const totalen = meting?.totalen ?? null
  const testTypes = totalen ? Object.entries(totalen.testaccounts.perProfieltype).sort((a, b) => a[0].localeCompare(b[0])) : []

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-2">
        <Newspaper className="h-5 w-5 text-[var(--ink-3)]" />
        <h3 className="text-lg font-bold text-[var(--ink)]">Meting schaduweditie</h3>
      </div>
      <p className="mb-2 text-sm text-[var(--ink-3)]">
        Eén regel per run van de weekcron (maandag 06:00). De poort: per profieltype weten hoe vaak een editie leeg
        blijft, en op de testaccounts de overlap met de LLM-editie. Niemand ziet deze edities — bron{' '}
        <span className="font-mono">schaduw</span>, tot 1C.
      </p>
      <p className="mb-4 text-xs text-[var(--ink-4)]">
        Eerlijke grens: de verdeling van <strong>echte gebruikers</strong> is bij het schrijven van de run al
        k-onderdrukt (k = {GEBRUIK_K}, ADR 0146/0153) en wordt hier niet opnieuw berekend. Met de huidige orde van
        grootte — enkele tientallen lezers — valt vrijwel elke cel onder &quot;&lt; {GEBRUIK_K}&quot; of
        &quot;verborgen&quot;; dat is geen storing maar de bescherming zelf. Lees de poort daarom op de{' '}
        <strong>testaccounts</strong> (vijf fictieve persona&apos;s, ongedrukt) en op de totalen. Ze zijn bewust niet
        over runs opgeteld: dezelfde lezers komen elke week terug, dus optellen zou user-weken tellen, geen personen.
      </p>
      <p className="mb-4 text-xs text-[var(--ink-4)]">
        <span className="font-mono">Edities*</span>/<span className="font-mono">Leeg*</span> in de tabel tellen
        echte gebruikers <strong>en</strong> testaccounts samen (de cron schrijft geen aparte teller); de tabel
        rechtsonder splitst de testaccounts er apart uit.
      </p>

      {fout ? (
        <p role="alert" className="text-sm text-[var(--negative)]">
          {fout}
        </p>
      ) : meting === null ? (
        <p className="text-sm text-[var(--ink-4)]">Laden...</p>
      ) : meting.runs.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-6 py-8 text-center text-sm text-[var(--ink-4)]">
          Nog geen run van de editie-cron. De eerste draait maandag 06:00.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-[var(--border-ed)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)] text-left text-[var(--ink-3)]">
                  <th className="px-3 py-2.5 font-medium">Week</th>
                  <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Gedraaid</th>
                  <th className="px-3 py-2.5 text-right font-medium">Lezers</th>
                  <th className="px-3 py-2.5 text-right font-medium">Edities*</th>
                  <th className="px-3 py-2.5 text-right font-medium">Leeg*</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Overgesl.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Fouten</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Kandidaten</th>
                  <th className="w-8 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-ed)] font-mono tabular-nums">
                {meting.runs.map((r, i) => {
                  const sleutel = `${r.week}-${r.startedAt ?? i}`
                  const isOpen = open === sleutel
                  return (
                    <Fragment key={sleutel}>
                      <tr
                        className="cursor-pointer transition-colors hover:bg-[var(--subtle)]"
                        onClick={() => setOpen(isOpen ? null : sleutel)}
                      >
                        <td className="px-3 py-2 text-[var(--ink)]">
                          {r.week}
                          {r.status === 'error' && <span className="ml-1 text-[var(--negative)]">!</span>}
                        </td>
                        <td className="hidden px-3 py-2 text-[var(--ink-4)] sm:table-cell">{tijdstip(r.startedAt)}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-3)]">{r.gebruikers}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-2)]">{r.edities}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-2)]">
                          {r.leeg}
                          <span className="ml-1 text-[var(--ink-4)]">
                            ({pct(r.edities > 0 ? r.leeg / r.edities : null)})
                          </span>
                        </td>
                        <td className="hidden px-3 py-2 text-right text-[var(--ink-3)] sm:table-cell">{r.overgeslagen}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            r.fouten > 0 ? 'text-[var(--negative)]' : 'text-[var(--ink-2)]'
                          }`}
                        >
                          {r.fouten}
                        </td>
                        <td className="hidden px-3 py-2 text-right text-[var(--ink-3)] lg:table-cell">{r.kandidaten}</td>
                        <td className="px-2 py-2 text-[var(--ink-4)]">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={`Details run ${r.week}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpen(isOpen ? null : sleutel)
                            }}
                          >
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={9} className="bg-[var(--subtle)]/50 px-4 py-3 font-sans">
                            <RunDetail r={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalen && (
            <div className="mt-3 grid gap-4 border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-4 py-3 text-xs sm:grid-cols-2">
              <div>
                <h4 className="mb-1 font-medium text-[var(--ink-3)]">
                  Over {totalen.runs} run{totalen.runs === 1 ? '' : 's'}
                </h4>
                <p className="text-[var(--ink-2)]">
                  <span className="font-mono tabular-nums">{totalen.edities}</span> edities* ·{' '}
                  <span className="font-mono tabular-nums">{totalen.leeg}</span> leeg* (
                  <span className="font-mono tabular-nums">{pct(totalen.leegAandeel)}</span>) ·{' '}
                  <span className="font-mono tabular-nums">{totalen.fouten}</span> fouten
                </p>
                {totalen.zonderSummary > 0 && (
                  <p className="mt-1 text-[var(--warning)]">
                    <span className="font-mono tabular-nums">{totalen.zonderSummary}</span> run(s) zonder leesbare
                    meting — niet in de tabel.
                  </p>
                )}
              </div>
              <div>
                <h4 className="mb-1 font-medium text-[var(--ink-3)]">Testaccounts, opgeteld</h4>
                <p className="text-[var(--ink-2)]">
                  overlap met de LLM-editie:{' '}
                  <span className="font-mono tabular-nums">{totalen.testaccounts.overlapBeide}</span> beide ·{' '}
                  <span className="font-mono tabular-nums">{totalen.testaccounts.alleenMatcher}</span> alleen matcher ·{' '}
                  <span className="font-mono tabular-nums">{totalen.testaccounts.alleenModel}</span> alleen model (
                  <span className="font-mono tabular-nums">{totalen.testaccounts.gemeten}</span> gemeten)
                </p>
                {testTypes.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {testTypes.map(([type, t]) => (
                      <li key={type} className="flex justify-between gap-3">
                        <span className="text-[var(--ink-2)]">{type}</span>
                        <span className="font-mono tabular-nums text-[var(--ink-3)]">
                          {t.leeg}/{t.edities} leeg
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RunDetail({ r }: { r: KrantMetingRun }) {
  const echt = Object.entries(r.perProfieltype).sort((a, b) => a[0].localeCompare(b[0]))
  const test = Object.entries(r.testaccounts.perProfieltype).sort((a, b) => a[0].localeCompare(b[0]))
  return (
    <div className="grid gap-4 text-xs sm:grid-cols-2">
      <div>
        <h4 className="mb-1 font-medium text-[var(--ink-3)]">
          Echte gebruikers per profieltype <span className="font-normal text-[var(--ink-4)]">(k = {GEBRUIK_K})</span>
        </h4>
        {echt.length === 0 ? (
          <p className="text-[var(--ink-4)]">Geen editie voor een echte gebruiker in deze run.</p>
        ) : (
          <ul className="space-y-0.5">
            {echt.map(([type, t]) => (
              <li key={type} className="flex justify-between gap-3">
                <span className="text-[var(--ink-2)]">{type}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">
                  {metingCelTekst(t.leeg)} van {metingCelTekst(t.edities)} leeg
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="mb-1 font-medium text-[var(--ink-3)]">
          Testaccounts per profieltype <span className="font-normal text-[var(--ink-4)]">(ongedrukt)</span>
        </h4>
        {test.length === 0 ? (
          <p className="text-[var(--ink-4)]">Geen testaccount in deze run.</p>
        ) : (
          <ul className="space-y-0.5">
            {test.map(([type, t]) => (
              <li key={type} className="flex justify-between gap-3">
                <span className="text-[var(--ink-2)]">{type}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">
                  {t.leeg} van {t.edities} leeg
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[var(--ink-4)]">
          overlap: <span className="font-mono tabular-nums">{r.testaccounts.overlapBeide}</span> beide ·{' '}
          <span className="font-mono tabular-nums">{r.testaccounts.alleenMatcher}</span> alleen matcher ·{' '}
          <span className="font-mono tabular-nums">{r.testaccounts.alleenModel}</span> alleen model
        </p>
      </div>
      <div className="sm:col-span-2 text-[var(--ink-4)]">
        Kandidaten: <span className="font-mono tabular-nums">{r.kandidaten}</span> geduid ·{' '}
        <span className="font-mono tabular-nums">{r.kandidatenOngeldig}</span> ongeldige duiding · opgeruimd:{' '}
        <span className="font-mono tabular-nums">{r.opgeruimd}</span>
        {r.tijdBudgetOp && <span className="ml-2 text-[var(--warning)]">tijdbudget op — rest bij de volgende run</span>}
        {r.fout && <span className="ml-2 text-[var(--negative)]">{r.fout}</span>}
      </div>
    </div>
  )
}
