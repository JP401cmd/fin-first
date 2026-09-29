'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { PageOpening } from '@/components/editorial/page-opening'
import { PageInfoButton } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'
import { Button } from '@/components/editorial/button'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { KrantBezwaar } from '@/components/berichten/krant-bezwaar'
import { safeHttpUrl } from '@/lib/safe-url'
// Alleen TYPES: tijdlijn-lezen.ts gebruikt Buffer en hoort niet in de clientbundel.
import type { TijdlijnBericht, TijdlijnBlok, TijdlijnOverzicht, TijdlijnPagina } from '@/lib/krant/tijdlijn-lezen'

/**
 * De Krant zonder AI op /nieuws — de persoonlijke tijdlijn (Krant 1C fase 2,
 * B31/B32/B37/U13, ADR 0183).
 *
 * Alles wat hier staat komt uit de server-loader (`laadTijdlijn`) of uit de
 * eigen-rij-routes onder /api/krant/**. Dit bestand rekent niets en maakt geen
 * bedragen op: de regel voor jou (`tekst`) is het sjabloon zoals de matcher het
 * vulde. B2 (ADR 0172): de Krant rekent alleen in euro's — dus ook hier geen
 * vrijheidstijd of dagen.
 *
 * KRANT 1E (ADR 0190): de Krant MET AI is dezelfde tijdlijn met een laag erop
 * (`bron = 'ai'`). Onder de regel voor jou staat dan de toelichting van het
 * model met het label "met AI"; een bericht dat het model zelf koos draagt
 * "door AI toegevoegd". Geen naam of avatar van een assistent (K9). De keuze
 * wist niets: "Liever de Krant met AI" en "Liever zonder AI" wisselen alleen
 * de laag voor de volgende verversing.
 */

const DATUM_TIJD = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})
const DATUM = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Amsterdam',
})

function formatDatumTijd(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : DATUM_TIJD.format(d)
}

function formatDatum(tekst: string | null): string | null {
  if (!tekst) return null
  const d = new Date(tekst)
  return Number.isNaN(d.getTime()) ? tekst : DATUM.format(d)
}

/** "2026-W40" → "Week 40 · 2026". */
function weekLabel(weekKey: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey)
  return m ? `Week ${Number(m[2])} · ${m[1]}` : weekKey
}

function berichtenLabel(n: number): string {
  return n === 1 ? '1 bericht' : `${n} berichten`
}

function isNieuw(b: TijdlijnBericht, gelezenTot: string | null): boolean {
  if (!gelezenTot) return false
  const a = new Date(b.createdAt).getTime()
  const g = new Date(gelezenTot).getTime()
  return Number.isFinite(a) && Number.isFinite(g) && a > g
}

async function leesFout(res: Response, standaard: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null
  return typeof data?.error === 'string' ? data.error : standaard
}

async function haalPagina(params: URLSearchParams): Promise<TijdlijnPagina> {
  const res = await fetch(`/api/krant/tijdlijn?${params.toString()}`)
  if (!res.ok) throw new Error(await leesFout(res, 'Ophalen is niet gelukt. Probeer het later opnieuw.'))
  const data = (await res.json()) as { pagina?: TijdlijnPagina }
  return data.pagina ?? { berichten: [], volgende: null }
}

/** Voegt berichten toe zonder dubbelen (een verversing tussendoor kan overlappen). */
function voegToe(bestaand: TijdlijnBericht[], nieuw: TijdlijnBericht[]): TijdlijnBericht[] {
  const ids = new Set(bestaand.map((b) => b.id))
  return [...bestaand, ...nieuw.filter((b) => !ids.has(b.id))]
}

// ── Bericht ──────────────────────────────────────────────────────────────────

function Bron({ bron, datum, url }: { bron: string | null; datum: string | null; url: string | null }) {
  const href = safeHttpUrl(url)
  const datumTekst = formatDatum(datum)
  if (!bron && !datumTekst && !href) return null
  return (
    <p className="mt-3 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
      {bron ?? 'Onbekende bron'}
      {datumTekst ? ` · ${datumTekst}` : ''}
      {href && (
        <>
          {' · '}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-[var(--ink-2)]"
          >
            Lees bij de bron
          </a>
        </>
      )}
    </p>
  )
}

function Bericht({ bericht, nieuw }: { bericht: TijdlijnBericht; nieuw: boolean }) {
  const heeftUitleg = bericht.waarom.length > 0 || bericht.watMist.length > 0
  return (
    <article className="border-b border-[var(--border-ed)] py-5">
      {(nieuw || bericht.rubriek) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]">
          {nieuw && (
            <span className="bg-[var(--module-active-100)] px-1.5 py-0.5 font-semibold text-[var(--module-active-800)]">
              Nieuw
            </span>
          )}
          {bericht.rubriek && <span className="text-[var(--ink-4)]">{bericht.rubriek}</span>}
        </div>
      )}

      <h3
        className="text-[19px] font-bold leading-snug text-[var(--ink)] sm:text-[21px]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        {bericht.titel ?? 'Zonder kop'}
      </h3>

      {bericht.samenvatting && (
        <p
          className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {bericht.samenvatting}
        </p>
      )}

      {/* De regel voor jou — persoonlijk, gemarkeerd met de accentlijn. Bij
          vorm 'raakt' levert de loader de kop uit de catalogus ("Over jouw
          situatie", sjabloon raakt-kop, B37); anders het label "Voor jou".
          Een bericht dat het model toevoegde (vorm 'ai') heeft geen regel. */}
      {bericht.tekst.length > 0 && (
        <div
          data-testid="regel-voor-jou"
          className="mt-3 border-l-2 border-[var(--module-active-500)] bg-[var(--module-active-50)] px-3 py-2"
        >
          <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--module-active-700)]">
            {bericht.kop ?? 'Voor jou'}
          </p>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-[var(--ink)]">{bericht.tekst}</p>
        </div>
      )}

      {/* Krant 1E: de toelichting van het model — altijd als AI gelabeld, met
          een gestippelde lijn zodat hij nooit voor de geattesteerde regel
          doorgaat. */}
      {bericht.aiTekst && (
        <div
          data-testid="ai-toelichting"
          className="mt-2 border-l-2 border-dashed border-[var(--module-active-400)] px-3 py-2"
        >
          <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--module-active-700)]">
            {bericht.aiToegevoegd ? 'Door AI toegevoegd · met AI' : 'Met AI'}
          </p>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-[var(--ink-2)]">{bericht.aiTekst}</p>
        </div>
      )}

      {heeftUitleg && (
        <details className="group mt-3 text-[13px] text-[var(--ink-3)]">
          <summary className="inline-flex min-h-9 cursor-pointer items-center gap-1 font-medium text-[var(--ink-2)] underline decoration-dotted underline-offset-2 hover:text-[var(--ink)]">
            Waarom zie ik dit?
          </summary>
          <div className="mt-1 space-y-2 border-l border-[var(--border-ed)] pl-3">
            {bericht.waarom.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4">
                {bericht.waarom.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            {bericht.watMist.length > 0 && (
              <div>
                <p className="text-[var(--ink-3)]">Wat we nog niet van je weten:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {bericht.watMist.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <Bron bron={bericht.bron} datum={bericht.gepubliceerd} url={bericht.url} />
    </article>
  )
}

function BerichtenLijst({ berichten, gelezenTot }: { berichten: TijdlijnBericht[]; gelezenTot: string | null }) {
  return (
    <ol className="list-none">
      {berichten.map((b) => (
        <li key={b.id}>
          <Bericht bericht={b} nieuw={isNieuw(b, gelezenTot)} />
        </li>
      ))}
    </ol>
  )
}

// ── Sectie-kop (h2) ──────────────────────────────────────────────────────────

function SectieKop({ children, label }: { children: string; label?: string | null }) {
  return (
    <div className="mb-2 flex items-baseline gap-3 border-b-2 border-[var(--ink)] pb-1.5">
      <h2
        className="text-[20px] font-bold leading-tight text-[var(--ink)]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        {children}
      </h2>
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-4)]">{label}</span>
      )}
    </div>
  )
}

function BlokSectie({ blok }: { blok: TijdlijnBlok }) {
  if (blok.items.length === 0) return null
  return (
    <section className="mt-10">
      <SectieKop label={blok.label}>{blok.kop}</SectieKop>
      <ul className="list-none">
        {blok.items.map((item) => (
          <li key={item.artikelId} className="border-b border-[var(--border-ed)] py-4">
            <h3
              className="text-[17px] font-bold leading-snug text-[var(--ink)]"
              style={{ fontFamily: 'var(--font-playfair, serif)' }}
            >
              {item.titel}
            </h3>
            {item.samenvatting && (
              <p
                className="mt-1.5 text-[14px] leading-relaxed text-[var(--ink-2)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {item.samenvatting}
              </p>
            )}
            <Bron bron={item.bron} datum={item.gepubliceerd} url={item.url} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Archief per week ─────────────────────────────────────────────────────────

interface WeekStaat {
  open: boolean
  laden: boolean
  fout: string | null
  berichten: TijdlijnBericht[] | null
  volgende: string | null
}

const LEGE_WEEK: WeekStaat = { open: false, laden: false, fout: null, berichten: null, volgende: null }

function ArchiefWeek({
  weekKey,
  aantal,
  gelezenTot,
}: {
  weekKey: string
  aantal: number
  gelezenTot: string | null
}) {
  const [staat, setStaat] = useState<WeekStaat>(LEGE_WEEK)
  const panelId = `archief-${weekKey}`

  async function laad(cursor: string | null) {
    setStaat((s) => ({ ...s, laden: true, fout: null }))
    const params = new URLSearchParams({ week: weekKey })
    if (cursor) params.set('cursor', cursor)
    try {
      const pagina = await haalPagina(params)
      setStaat((s) => ({
        ...s,
        laden: false,
        berichten: voegToe(s.berichten ?? [], pagina.berichten),
        volgende: pagina.volgende,
      }))
    } catch (err) {
      setStaat((s) => ({ ...s, laden: false, fout: err instanceof Error ? err.message : 'Ophalen is niet gelukt.' }))
    }
  }

  function wissel() {
    const open = !staat.open
    setStaat((s) => ({ ...s, open }))
    if (open && staat.berichten === null && !staat.laden) void laad(null)
  }

  return (
    <li className="border-b border-[var(--border-ed)]">
      <button
        type="button"
        onClick={wissel}
        aria-expanded={staat.open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center gap-2 py-2 text-left text-[14px] text-[var(--ink-2)] hover:text-[var(--ink)]"
      >
        <span className="flex-1">
          {weekLabel(weekKey)} <span className="text-[var(--ink-4)]">— {berichtenLabel(aantal)}</span>
        </span>
        {staat.open ? (
          <ChevronUp aria-hidden className="h-4 w-4 text-[var(--ink-4)]" />
        ) : (
          <ChevronDown aria-hidden className="h-4 w-4 text-[var(--ink-4)]" />
        )}
      </button>
      {staat.open && (
        <div id={panelId} className="pb-4">
          {staat.berichten && staat.berichten.length > 0 && (
            <BerichtenLijst berichten={staat.berichten} gelezenTot={gelezenTot} />
          )}
          {staat.berichten && staat.berichten.length === 0 && !staat.laden && (
            <p className="py-2 text-[13px] text-[var(--ink-4)]">Deze week is leeg.</p>
          )}
          {staat.laden && <p className="py-2 text-[13px] text-[var(--ink-4)]">Laden&hellip;</p>}
          {staat.fout && (
            <p role="alert" className="py-2 text-[13px] text-[var(--negative)]">
              {staat.fout}
            </p>
          )}
          {staat.volgende && !staat.laden && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void laad(staat.volgende)}>
              Meer uit deze week
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

// ── Bevestigingen ────────────────────────────────────────────────────────────

type Bevestiging = 'ai' | 'zonder-ai' | null

/** De regel onder de kop als de laatste verversing zonder AI was (K5). */
function zonderAiTekst(reden: 'quotum' | 'anders'): string {
  return reden === 'quotum'
    ? 'Deze keer zonder AI: de vijf verversingen met AI van deze week zijn gebruikt. De regel voor jou staat er wel.'
    : 'Deze keer zonder AI. De regel voor jou staat er wel.'
}

// ── Hoofdcomponent ───────────────────────────────────────────────────────────

export function TijdlijnClient({
  overzicht,
  bron = 'tijdlijn',
  kanAiKiezen,
  bezwaar,
}: {
  overzicht: TijdlijnOverzicht
  /** 'ai' = de lezer koos de Krant met AI (Krant 1E); 'tijdlijn' = zonder AI. */
  bron?: 'tijdlijn' | 'ai'
  kanAiKiezen: boolean
  bezwaar: boolean
}) {
  const metAi = bron === 'ai'
  const router = useRouter()
  const { pagina, gelezenTot } = overzicht

  // "Meer laden" hoort bij één server-pagina: na een router.refresh() komt er
  // een nieuwe `pagina` binnen en vervalt wat er eerder was bijgeladen.
  const [meer, setMeer] = useState<{ basis: TijdlijnPagina; berichten: TijdlijnBericht[]; volgende: string | null }>({
    basis: pagina,
    berichten: [],
    volgende: pagina.volgende,
  })
  const bijgeladen = meer.basis === pagina ? meer : { basis: pagina, berichten: [], volgende: pagina.volgende }
  const berichten = voegToe(pagina.berichten, bijgeladen.berichten)

  const [meerLaden, setMeerLaden] = useState(false)
  const [meerFout, setMeerFout] = useState<string | null>(null)

  const [vernieuwen, setVernieuwen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [statusFout, setStatusFout] = useState(false)

  const [bevestiging, setBevestiging] = useState<Bevestiging>(null)
  const [bezig, setBezig] = useState(false)
  const [bevestigFout, setBevestigFout] = useState<string | null>(null)

  // Eén keer per bezoek: alles tot nu toe telt als gelezen. Fire-and-forget —
  // het "Nieuw"-label van dít bezoek komt uit de server-render en blijft staan.
  const gelezenGemeld = useRef(false)
  useEffect(() => {
    if (gelezenGemeld.current) return
    gelezenGemeld.current = true
    fetch('/api/krant/tijdlijn/gelezen', { method: 'PUT' }).catch(() => {})
  }, [])

  async function doeVernieuwen() {
    setVernieuwen(true)
    setStatus(null)
    setStatusFout(false)
    try {
      const res = await fetch('/api/krant/tijdlijn/vernieuwen', { method: 'POST' })
      if (res.status === 429) {
        setStatus(await leesFout(res, 'Je hebt net vernieuwd. Probeer het over een paar minuten opnieuw.'))
        setStatusFout(true)
        return
      }
      if (!res.ok) {
        setStatus('Vernieuwen is niet gelukt. Probeer het later opnieuw.')
        setStatusFout(true)
        return
      }
      const data = (await res.json().catch(() => null)) as { status?: string; items?: number; leeg?: boolean; ai?: string } | null
      const zonderAi =
        metAi && (data?.ai === 'quotum' || data?.ai === 'teruggevallen' || data?.ai === 'geweigerd') ? ' Deze keer zonder AI.' : ''
      if (data?.status === 'ververst' && !data.leeg && typeof data.items === 'number' && data.items > 0) {
        setStatus((data.items === 1 ? '1 nieuw bericht.' : `${data.items} nieuwe berichten.`) + zonderAi)
      } else {
        setStatus('Er is niets nieuws sinds de vorige keer.')
      }
      router.refresh()
    } catch {
      setStatus('Vernieuwen is niet gelukt. Probeer het later opnieuw.')
      setStatusFout(true)
    } finally {
      setVernieuwen(false)
    }
  }

  async function laadMeer() {
    if (!bijgeladen.volgende) return
    setMeerLaden(true)
    setMeerFout(null)
    try {
      const volgende = await haalPagina(new URLSearchParams({ cursor: bijgeladen.volgende }))
      setMeer({
        basis: pagina,
        berichten: voegToe(bijgeladen.berichten, volgende.berichten),
        volgende: volgende.volgende,
      })
    } catch (err) {
      setMeerFout(err instanceof Error ? err.message : 'Ophalen is niet gelukt.')
    } finally {
      setMeerLaden(false)
    }
  }

  function openBevestiging(soort: Exclude<Bevestiging, null>) {
    setBevestigFout(null)
    setBevestiging(soort)
  }

  async function bevestig() {
    if (!bevestiging) return
    setBezig(true)
    setBevestigFout(null)
    try {
      const res = await fetch('/api/krant/variant', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant: bevestiging === 'ai' ? 'ai' : 'tijdlijn' }),
      })
      if (!res.ok) {
        setBevestigFout(await leesFout(res, 'Opslaan is niet gelukt. Probeer het later opnieuw.'))
        return
      }
      setBevestiging(null)
      router.refresh()
    } catch {
      setBevestigFout('Opslaan is niet gelukt. Probeer het later opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  const leeg = overzicht.totaal === 0
  const toonArchief = overzicht.archief.length > 0 && overzicht.totaal > pagina.berichten.length

  const vernieuwKnop = (
    <Button variant="secondary" size="sm" onClick={() => void doeVernieuwen()} disabled={vernieuwen}>
      <RefreshCw aria-hidden className={`mr-1.5 h-3.5 w-3.5 ${vernieuwen ? 'animate-spin' : ''}`} />
      {vernieuwen ? 'Vernieuwen…' : 'Vernieuwen'}
    </Button>
  )

  return (
    <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <PageInfoButton content={getPageInfo('/nieuws/tijdlijn', '/nieuws')} className="absolute right-4 top-6 sm:right-6 sm:top-8" />
      <PageOpening
        kicker={metAi ? 'Persoonlijke tijdlijn · met AI' : 'Persoonlijke tijdlijn'}
        titleBefore=""
        emphasis="Krant"
        titleAfter=""
        deck={
          metAi
            ? 'Het nieuws dat jouw situatie raakt, met bij elk bericht wat het voor jou betekent en een toelichting van een AI-model.'
            : 'Het nieuws dat jouw situatie raakt, met bij elk bericht wat het voor jou betekent.'
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-ed)] pt-3">
          <p className="flex-1 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
            {overzicht.laatstVernieuwd
              ? `Laatst vernieuwd ${formatDatumTijd(overzicht.laatstVernieuwd)}`
              : 'Nog niet vernieuwd'}
          </p>
          {vernieuwKnop}
        </div>
      </PageOpening>

      {metAi && overzicht.laatsteZonderAi && (
        <p data-testid="zonder-ai" className="mt-3 text-[13px] text-[var(--ink-3)]">
          {zonderAiTekst(overzicht.laatsteZonderAi)}
        </p>
      )}

      <p
        role="status"
        aria-live="polite"
        className={`mt-3 min-h-5 text-[13px] ${statusFout ? 'text-[var(--negative)]' : 'text-[var(--ink-3)]'}`}
      >
        {status}
      </p>

      {leeg ? (
        <p
          className="mt-6 border border-dashed border-[var(--border-ed)] px-4 py-8 text-center text-[14px] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {overzicht.legeTekst ?? 'Er staat nog niets in je tijdlijn.'}
        </p>
      ) : (
        <section aria-label="Tijdlijn" className="mt-4">
          <BerichtenLijst berichten={berichten} gelezenTot={gelezenTot} />
          {meerFout && (
            <p role="alert" className="mt-3 text-[13px] text-[var(--negative)]">
              {meerFout}
            </p>
          )}
          {bijgeladen.volgende && (
            <div className="mt-5">
              <Button variant="secondary" size="sm" onClick={() => void laadMeer()} disabled={meerLaden}>
                {meerLaden ? 'Laden…' : 'Meer laden'}
              </Button>
            </div>
          )}
        </section>
      )}

      {overzicht.achtergrond && <BlokSectie blok={overzicht.achtergrond} />}

      {toonArchief && (
        <section className="mt-10">
          <SectieKop>Archief</SectieKop>
          <p className="mb-2 text-[13px] text-[var(--ink-3)]">Berichten blijven 120 dagen in je tijdlijn bewaard.</p>
          <ul className="list-none">
            {overzicht.archief.map((w) => (
              <ArchiefWeek key={w.weekKey} weekKey={w.weekKey} aantal={w.aantal} gelezenTot={gelezenTot} />
            ))}
          </ul>
        </section>
      )}

      {overzicht.katern && <BlokSectie blok={overzicht.katern} />}

      <section className="mt-14 border-t border-[var(--border-ed)] pt-5 text-[13px] leading-relaxed text-[var(--ink-3)]">
        <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Over je Krant
        </h2>
        <div className="space-y-4">
          <p>
            Hoe we je nieuwsprofiel gebruiken staat in de{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-[var(--ink)]">
              privacyverklaring
            </Link>
            .
          </p>

          <KrantBezwaar bezwaar={bezwaar} context="tijdlijn" />

          {!metAi && kanAiKiezen && (
            <div>
              <Button variant="secondary" size="sm" onClick={() => openBevestiging('ai')}>
                Liever de Krant met AI
              </Button>
            </div>
          )}
          {metAi && (
            <div>
              <Button variant="secondary" size="sm" onClick={() => openBevestiging('zonder-ai')}>
                Liever zonder AI
              </Button>
            </div>
          )}
        </div>
      </section>

      <ShellOverlay
        kind="confirm"
        open={bevestiging !== null}
        onClose={() => {
          if (!bezig) setBevestiging(null)
        }}
        title={bevestiging === 'zonder-ai' ? 'Verder zonder AI?' : 'De Krant met AI?'}
        footer={
          <ModalFooter
            primary={{
              label: bevestiging === 'zonder-ai' ? 'Zonder AI verder' : 'Met AI verder',
              onClick: () => void bevestig(),
              loading: bezig,
            }}
            secondary={{ label: 'Annuleren', onClick: () => setBevestiging(null), disabled: bezig }}
          />
        }
      >
        <div className="space-y-3 px-5 py-4 text-[14px] leading-relaxed text-[var(--ink-2)]">
          {bevestiging === 'zonder-ai' ? (
            <p>
              Vanaf de volgende verversing staat er geen AI-toelichting meer onder je berichten. Wat er al staat, blijft staan.
              Je tijdlijn blijft zoals hij is.
            </p>
          ) : (
            <>
              <p>
                Je tijdlijn blijft zoals hij is. Vanaf de volgende verversing schrijft een AI-model onder elk bericht een korte
                toelichting, en het mag hoogstens drie berichten toevoegen. Die herken je aan het label &lsquo;met AI&rsquo;.
              </p>
              <p>
                Daarvoor gaan de berichten en je nieuwsprofiel in banden naar de AI-aanbieder, zonder je naam. Met AI kan
                hoogstens vijf keer per week; daarna gewoon zonder AI. Terug naar zonder AI kan altijd.
              </p>
            </>
          )}
          {bevestigFout && (
            <p role="alert" className="text-[13px] text-[var(--negative)]">
              {bevestigFout}
            </p>
          )}
        </div>
      </ShellOverlay>
    </div>
  )
}
