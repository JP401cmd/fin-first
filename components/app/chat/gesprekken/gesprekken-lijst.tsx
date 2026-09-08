'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Cpu, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ChatConversationMeta } from '@/lib/chat/history/types'
import type { ChatHistoryFacade } from '@/lib/chat/history/facade'

/**
 * De gesprekkenlijst — de vierde modus van het chatvenster (W-004, B7).
 *
 * ÉÉN LIJST, TWEE RUGGEN. De facade voegt de servergesprekken en de gesprekken
 * op dit toestel samen en sorteert op recentheid; hier is alleen nog zichtbaar
 * wáár iets staat, via de "lokaal"-markering. Dat is precies waarom het
 * wisselen van opslagkeuze niets hoeft te verplaatsen: er raakt niets uit zicht.
 *
 * KOPPEN: dit is een weergave BINNEN het chatpaneel, geen pagina. De lijstkop
 * is een `h2` en elke gesprekstitel een `h3` (ADR 0110 — de shell draagt de
 * enige `h1`, en die staat hier ver boven ons). Bewust géén `h3`/`h4`: dit
 * paneel draagt geen eigen `h2`, dus dan begon de kopvolgorde bij niveau 3 en
 * sloeg hij er één over. De zusters in ditzelfde paneel (WftDisclaimer,
 * LocalBlockedNotice) zijn om dezelfde reden `h2`.
 *
 * GEEN GENESTE OVERLAY. De verwijderbevestiging is een tweestap ín de regel,
 * geen tweede venster: het chatpaneel is zelf al de gedocumenteerde
 * overlay-uitzondering, en een overlay daarbovenop zou de sluitroutes (Escape,
 * terug-knop, swipe) tegen elkaar in laten werken.
 */

function relatieveDatum(iso: string): string {
  const datum = new Date(iso)
  if (Number.isNaN(datum.getTime())) return ''
  const nu = new Date()
  const dagStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dagen = Math.round((dagStart(nu) - dagStart(datum)) / 86_400_000)
  if (dagen <= 0) {
    return datum.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  }
  if (dagen === 1) return 'gisteren'
  // Binnen de week de WEEKDAG, geen "3 dagen geleden": de huisregel verbiedt
  // relatieve timestamps in gebruikerstekst (krant-stijl, bewaakt door
  // `typo-no-relative-timestamps` in de design-system-suite). "dinsdag" is
  // bovendien concreter — je weet meteen wélke dag het was.
  if (dagen < 7) return datum.toLocaleDateString('nl-NL', { weekday: 'long' })
  return datum.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

type Status =
  | { fase: 'laden' }
  | { fase: 'klaar'; gesprekken: ChatConversationMeta[] }
  | { fase: 'mislukt' }

export function GesprekkenLijst({
  facade,
  actieveConversationId,
  foutmelding = null,
  onNieuw,
  onHervat,
  onActiefVerwijderd,
}: {
  facade: ChatHistoryFacade
  /** Het gesprek dat nu in het venster staat — krijgt een markering. */
  actieveConversationId: string | null
  /**
   * Een fout van het PANEEL, niet van deze lijst: een gesprek dat niet
   * opgehaald kon worden. Hij hoort hier omdat de gebruiker hier blijft staan —
   * half hervatten zou de volgende beurt op bezette volgnummers laten schrijven.
   */
  foutmelding?: string | null
  onNieuw: () => void
  onHervat: (meta: ChatConversationMeta) => void
  /** Het actieve gesprek is verwijderd → het paneel start een leeg nieuw gesprek. */
  onActiefVerwijderd: () => void
}) {
  const [status, setStatus] = useState<Status>({ fase: 'laden' })
  const [apparaatBeschikbaar, setApparaatBeschikbaar] = useState(true)
  const [hernoemtId, setHernoemtId] = useState<string | null>(null)
  const [hernoemTekst, setHernoemTekst] = useState('')
  const [bevestigtId, setBevestigtId] = useState<string | null>(null)
  const [bezigId, setBezigId] = useState<string | null>(null)

  const laad = useCallback(async () => {
    setStatus({ fase: 'laden' })
    try {
      const [gesprekken, beschikbaar] = await Promise.all([
        facade.list({ limit: 50 }),
        facade.deviceBeschikbaar(),
      ])
      setApparaatBeschikbaar(beschikbaar)
      setStatus({ fase: 'klaar', gesprekken })
    } catch {
      setStatus({ fase: 'mislukt' })
    }
  }, [facade])

  useEffect(() => {
    void laad()
  }, [laad])

  const gesprekken = useMemo(
    () => (status.fase === 'klaar' ? status.gesprekken : []),
    [status],
  )

  const startHernoemen = (meta: ChatConversationMeta) => {
    setBevestigtId(null)
    setHernoemtId(meta.id)
    setHernoemTekst(meta.title)
  }

  const bevestigHernoemen = async (meta: ChatConversationMeta) => {
    const titel = hernoemTekst.trim().slice(0, 120)
    setHernoemtId(null)
    if (!titel || titel === meta.title) return
    setBezigId(meta.id)
    try {
      await facade.rename({ id: meta.id, backend: meta.backend }, titel)
      setStatus((s) =>
        s.fase === 'klaar'
          ? {
              fase: 'klaar',
              gesprekken: s.gesprekken.map((g) => (g.id === meta.id ? { ...g, title: titel } : g)),
            }
          : s,
      )
    } catch {
      await laad()
    } finally {
      setBezigId(null)
    }
  }

  const verwijder = async (meta: ChatConversationMeta) => {
    setBevestigtId(null)
    setBezigId(meta.id)
    try {
      await facade.remove({ id: meta.id, backend: meta.backend })
      setStatus((s) =>
        s.fase === 'klaar'
          ? { fase: 'klaar', gesprekken: s.gesprekken.filter((g) => g.id !== meta.id) }
          : s,
      )
      if (meta.id === actieveConversationId) onActiefVerwijderd()
    } catch {
      await laad()
    } finally {
      setBezigId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Je gesprekken</h2>
        <button
          type="button"
          onClick={onNieuw}
          className="inline-flex items-center gap-1 rounded-full border border-fin-200 bg-fin-50 px-3 py-1 text-xs font-medium text-fin-700 transition-colors hover:bg-fin-100"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Nieuw gesprek
        </button>
      </div>

      {foutmelding && (
        <p
          role="alert"
          className="mt-3 border border-negative/30 bg-negative/5 px-3 py-2 text-[11px] leading-relaxed text-negative"
        >
          {foutmelding}
        </p>
      )}

      {!apparaatBeschikbaar && (
        <p className="mt-3 border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
          Op dit apparaat kan niets bewaard worden — je browser staat opslag hier niet toe.
          Gesprekken op je account zie je wel.
        </p>
      )}

      {status.fase === 'laden' && (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--ink-3)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Je gesprekken worden opgehaald…
        </div>
      )}

      {status.fase === 'mislukt' && (
        <div className="mt-6 text-center text-xs text-[var(--ink-3)]">
          <p>Je gesprekken konden niet worden opgehaald.</p>
          <button
            type="button"
            onClick={() => void laad()}
            className="mt-2 rounded-full border border-[var(--border-ed)] px-3 py-1 text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            Opnieuw proberen
          </button>
        </div>
      )}

      {status.fase === 'klaar' && gesprekken.length === 0 && (
        <p className="mt-6 text-center text-xs leading-relaxed text-[var(--ink-3)]">
          Zodra je met Fin praat, verschijnt het gesprek hier.
        </p>
      )}

      {status.fase === 'klaar' && gesprekken.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {gesprekken.map((meta) => {
            const actief = meta.id === actieveConversationId
            const bezig = bezigId === meta.id
            return (
              <li
                key={meta.id}
                className={`border px-3 py-2 transition-colors ${
                  actief
                    ? 'border-fin-300 bg-fin-50/60'
                    : 'border-[var(--border-ed)] bg-[var(--paper)]'
                }`}
              >
                {hernoemtId === meta.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={hernoemTekst}
                      maxLength={120}
                      onChange={(e) => setHernoemTekst(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void bevestigHernoemen(meta)
                        if (e.key === 'Escape') {
                          // Escape hoort hier het hernoemen af te breken, niet het
                          // hele chatvenster te sluiten. De document-listener van
                          // ChatPanel trekt zich alleen terug voor de bewerkmodal
                          // en het instellingenmenu, dus deze inline bewerking moet
                          // het gebaar zélf tegenhouden.
                          e.stopPropagation()
                          setHernoemtId(null)
                        }
                      }}
                      aria-label="Nieuwe titel voor dit gesprek"
                      className="min-w-0 flex-1 border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-xs outline-none focus:border-[var(--border-md)]"
                    />
                    <button
                      type="button"
                      onClick={() => void bevestigHernoemen(meta)}
                      aria-label="Titel opslaan"
                      className="touch-target flex items-center justify-center rounded-lg text-fin-700 hover:bg-fin-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setHernoemtId(null)}
                      aria-label="Hernoemen annuleren"
                      className="touch-target flex items-center justify-center rounded-lg text-[var(--ink-3)] hover:bg-zinc-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    {/* De kop draagt de knop, niet andersom: een <h3> ín een
                        <button> is geen geldige phrasing content. */}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-medium text-[var(--ink)]">
                        <button
                          type="button"
                          onClick={() => onHervat(meta)}
                          disabled={bezig}
                          className="block w-full truncate text-left disabled:opacity-50"
                        >
                          {meta.title}
                        </button>
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
                        <span>{relatieveDatum(meta.lastMessageAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {meta.messageCount} {meta.messageCount === 1 ? 'bericht' : 'berichten'}
                        </span>
                        {meta.origin === 'lokaal' && (
                          <span className="inline-flex items-center gap-1 border border-amber-500/40 bg-amber-50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                            <Cpu className="h-2.5 w-2.5" aria-hidden="true" />
                            lokaal
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      {bezig ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin text-[var(--ink-3)]"
                          aria-hidden="true"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startHernoemen(meta)}
                            aria-label={`Gesprek "${meta.title}" hernoemen`}
                            className="touch-target flex items-center justify-center rounded-lg text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setBevestigtId(meta.id)}
                            aria-label={`Gesprek "${meta.title}" verwijderen`}
                            className="touch-target flex items-center justify-center rounded-lg text-[var(--ink-3)] hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {bevestigtId === meta.id && (
                  <div className="mt-2 border-t border-[var(--border-ed)] pt-2">
                    <p className="text-[11px] text-[var(--ink-2)]">
                      Dit gesprek definitief verwijderen? Je andere gesprekken blijven staan.
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void verwijder(meta)}
                        className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-200"
                      >
                        Ja, verwijderen
                      </button>
                      <button
                        type="button"
                        onClick={() => setBevestigtId(null)}
                        className="rounded-full px-2.5 py-1 text-[11px] text-[var(--ink-3)] transition-colors hover:bg-zinc-100"
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
