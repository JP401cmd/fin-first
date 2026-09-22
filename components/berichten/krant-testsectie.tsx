'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, FlaskConical } from 'lucide-react'
import type { Testeditie, TesteditieItem } from '@/lib/krant/testeditie'

/**
 * Testsectie op /nieuws — de schaduweditie naast de LLM-editie (keuze 12 op
 * kaart 1B). Alleen zichtbaar voor superadmin (22 sep: versmald van
 * testaccounts+superadmin, zie lib/krant/testeditie-toegang.ts); de
 * server-page beslist dat (magTesteditieZien) en de route bewaakt het nog een
 * keer.
 *
 * Doel: per regel nalopen of een getal klopt. Daarom staat er naast de
 * gerenderde zin ook waar hij vandaan komt — het mechanisme, het sjabloon met
 * zijn variant, de gevulde slots, het ruwe impactbereik en wat er aan het
 * profiel ontbrak. Alles komt uit `GET /api/krant/testeditie` (de eigen rij);
 * hier wordt niets herberekend en niets opgemaakt tot een bedrag dat de matcher
 * niet zelf heeft gezet.
 *
 * B2 (ADR 0172): alleen euro's. Geen omrekening naar dagen of vrijheidstijd —
 * de bedragen worden getoond zoals ze in de rij staan.
 */

const VORM_LABEL: Record<string, string> = {
  direct: 'Direct',
  gevoeligheid: 'Gevoeligheid',
  relevant: 'Relevant',
}

function jsonRegel(waarde: unknown): string | null {
  if (waarde === null || waarde === undefined) return null
  try {
    const tekst = JSON.stringify(waarde)
    return tekst === '{}' || tekst === 'null' ? null : tekst
  } catch {
    return null
  }
}

export function KrantTestsectie() {
  const [editie, setEditie] = useState<Testeditie | null>(null)
  const [geladen, setGeladen] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let actief = true
    fetch('/api/krant/testeditie')
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!actief) return
        setGeladen(true)
        if (!res.ok) {
          setFout(typeof body?.error === 'string' ? body.error : 'Ophalen mislukt')
          return
        }
        setFout(null)
        setEditie((body?.editie as Testeditie | null) ?? null)
      })
      .catch(() => {
        if (!actief) return
        setGeladen(true)
        setFout('Ophalen mislukt')
      })
    return () => {
      actief = false
    }
  }, [])

  return (
    <section className="mt-10 border-t border-dashed border-[var(--border-ed)] pt-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <FlaskConical className="h-4 w-4 text-[var(--ink-3)]" />
        <h2 className="font-inter text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Testsectie · editie zonder AI
        </h2>
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
        <span className="font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
          {!geladen ? '…' : fout ? '—' : editie ? `${editie.weekKey} · ${editie.itemCount}` : 'geen'}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--ink-4)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--ink-4)]" />
        )}
      </button>

      {open && (
        <div className="mt-4">
          <p className="mb-4 font-source-serif text-[13px] italic leading-relaxed text-[var(--ink-4)]">
            De schaduweditie van de Krant: samengesteld zonder AI, uit je eigen profiel en de geduide artikelen. Geen
            enkele gewone lezer ziet dit. Loop per regel na of het getal klopt — mechanisme, sjabloon, slots en het ruwe
            bereik staan erbij.
          </p>

          {fout ? (
            <p role="alert" className="text-sm text-[var(--negative)]">
              {fout}
            </p>
          ) : !geladen ? (
            <p className="text-sm text-[var(--ink-4)]">Laden&hellip;</p>
          ) : !editie ? (
            <p className="text-sm text-[var(--ink-4)]">
              Nog geen schaduweditie voor dit account. De weekcron draait maandag 06:00.
            </p>
          ) : (
            <>
              <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-4 py-3 text-xs sm:grid-cols-4">
                <Feit label="Week" waarde={editie.weekKey} />
                <Feit label="Profieltype" waarde={editie.profielType} />
                <Feit label="Regels" waarde={String(editie.itemCount)} />
                <Feit
                  label="Versies"
                  waarde={`m${editie.matcherVersie} · s${editie.sjabloonVersie} · p${editie.profielVersie}`}
                />
              </dl>

              {editie.leeg ? (
                <p className="border border-dashed border-[var(--border-ed)] px-4 py-6 text-center text-sm text-[var(--ink-4)]">
                  Lege editie. {editie.legeTekst ?? 'Geen artikel haalde de drempel.'}
                </p>
              ) : (
                <ol className="space-y-4">
                  {editie.items.map((item) => (
                    <li key={`${item.positie}-${item.sjabloonId}`}>
                      <TestItem item={item} />
                    </li>
                  ))}
                </ol>
              )}

              <details className="mt-4 text-xs text-[var(--ink-4)]">
                <summary className="cursor-pointer text-[var(--ink-3)]">Profiel-momentopname van deze editie</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-3 font-mono text-[11px]">
                  {JSON.stringify(editie.profielSnapshot, null, 2)}
                </pre>
              </details>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function Feit({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div>
      <dt className="text-[var(--ink-4)]">{label}</dt>
      <dd className="font-mono tabular-nums text-[var(--ink-2)]">{waarde || '—'}</dd>
    </div>
  )
}

function TestItem({ item }: { item: TesteditieItem }) {
  const slots = jsonRegel(item.slots)
  const impact = jsonRegel(item.impact)
  const deadline = jsonRegel(item.deadline)
  return (
    <article className="border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
      <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
        <span className="rounded-[var(--r-sm)] bg-[var(--subtle)] px-1.5 py-0.5 text-[var(--ink-3)]">
          {VORM_LABEL[item.vorm] ?? item.vorm}
        </span>
        <span>score {item.score}</span>
        <span>· {item.sjabloonId}</span>
        <span>· variant {item.variant}</span>
        {item.mechanisme && <span>· {item.mechanisme}</span>}
        {item.artikelId === null && <span className="text-[var(--warning)]">· bronartikel opgeruimd</span>}
      </div>

      <h3 className="font-source-serif text-[15px] font-semibold leading-snug text-[var(--ink)]">
        {item.titel ?? 'Zonder kop'}
      </h3>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-2)]">{item.tekst}</p>

      {item.samenvatting && (
        <p className="mt-2 font-source-serif text-[13px] italic leading-relaxed text-[var(--ink-3)]">
          {item.samenvatting}
        </p>
      )}

      <dl className="mt-2 space-y-0.5 font-mono text-[11px] text-[var(--ink-4)]">
        {impact && <Regel label="bereik" waarde={impact} />}
        {slots && <Regel label="slots" waarde={slots} />}
        {deadline && <Regel label="deadline" waarde={deadline} />}
        {item.waarom.length > 0 && <Regel label="waarom" waarde={item.waarom.join(' · ')} />}
        {item.watMist.length > 0 && <Regel label="wat mist" waarde={item.watMist.join(', ')} />}
      </dl>

      <p className="mt-2 text-[11px] text-[var(--ink-4)]">
        {item.bronnaam ?? 'onbekende bron'}
        {item.rubriek ? ` · ${item.rubriek}` : ''}
        {item.gepubliceerd ? ` · ${item.gepubliceerd.slice(0, 10)}` : ''}
        {item.url && (
          <>
            {' · '}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-[var(--ink-2)]"
            >
              bronartikel
            </a>
          </>
        )}
      </p>
    </article>
  )
}

function Regel({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-[var(--ink-4)]">{label}</dt>
      <dd className="break-all text-[var(--ink-3)]">{waarde}</dd>
    </div>
  )
}
