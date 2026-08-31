'use client'

/**
 * DeelKaartSheet — "Deelkaart 2.0": het keuzemoment vóór het delen.
 *
 * Waar de Deel-knop op /overzicht eerder meteen de `ShareDialog` opende met een
 * kaart die de gebruiker nog niet had gezien, draagt deze sheet de hele flow:
 * kiezen hoeveel je laat zien → live zien wat dat oplevert → pas dan delen.
 *
 * ── Drie inzichts-standen ────────────────────────────────────────────────────
 * De standen zijn de bestaande privacy-niveaus van `/api/share/freedom-card`
 * onder een begrijpelijker naam. De server bepaalt per niveau wát er meekomt —
 * deze sheet vraagt alleen om het niveau en toont het resultaat:
 *   Weinig    → 'anonymous' : alleen vrijheidstijd (geen naam, geen cijfers)
 *   Gemiddeld → 'named'     : naam + percentage/dagen/spaarquote, geen bedragen
 *   Veel      → 'full'      : ook het netto vermogen, alleen na bevestiging
 *
 * De keuze wordt onthouden in `PRIVACY_STORAGE_KEY` — dezelfde sleutel die de
 * `FreedomCardGenerator` al gebruikte, zodat de twee ingangen niet uit elkaar
 * lopen. Bewust localStorage en géén server-pref: dit is een "hoe deel ik op
 * dit apparaat"-keuze, geen account-instelling.
 *
 * ── Deel-tekst volgt de stand (geest van ADR 0067) ───────────────────────────
 * In de stand Weinig bevat de deel-tekst uitsluitend vrijheidstijd: geen
 * percentage, geen vrijheidsdagen, geen spaarquote. De gedeelde link wijst
 * altijd naar `<origin>/check` (`CHECK_SHARE_PATH`) — de publieke
 * Vrijheidscheck — en niet naar de kale origin, want die landt op een loginmuur.
 *
 * ── Overlay-conventie ────────────────────────────────────────────────────────
 * `<ShellOverlay kind="sheet">` (z-[70]) met de primaire acties in de sticky
 * `footer`-prop. De `ShareDialog` (z-[90], gedocumenteerde uitzondering) wordt
 * als SIBLING gerenderd — nooit als child, want een teruggetreden BottomSheet
 * zet `display:none` op zijn hele portal. Zolang de dialoog open staat, staat de
 * sheet op `suspended`: hij blijft gemonteerd (met stand + gecachete data) maar
 * geeft scherm, Escape en focus-trap af aan het venster erbovenop (ADR 0039).
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { Button } from '@/components/editorial'
import { ShareDialog, type ShareContent } from '@/components/app/share-dialog'
import {
  FreedomCardVisual,
  deriveCardStats,
  renderFreedomCardToCanvas,
  PRIVACY_STORAGE_KEY,
  type FreedomCardData,
} from '@/components/app/freedom-card'
import { CHECK_SHARE_PATH } from '@/lib/check/share-freedom'

export type DeelStand = 'anonymous' | 'named' | 'full'

type StandOptie = {
  stand: DeelStand
  label: string
  omschrijving: string
}

/** Volgorde = oplopend inzicht. Copy in je/jij, feitelijk, zonder oordeel. */
const STANDEN: StandOptie[] = [
  {
    stand: 'anonymous',
    label: 'Weinig',
    omschrijving: 'Alleen je vrijheidstijd. Geen naam, geen cijfers.',
  },
  {
    stand: 'named',
    label: 'Gemiddeld',
    omschrijving:
      'Met je naam, vrijheidspercentage, vrijheidsdagen en spaarquote. Geen bedragen.',
  },
  {
    stand: 'full',
    label: 'Veel',
    omschrijving: 'Ook je netto vermogen. Alleen na bevestiging.',
  },
]

function leesOpgeslagenStand(): DeelStand {
  try {
    if (typeof window !== 'undefined') {
      const opgeslagen = localStorage.getItem(PRIVACY_STORAGE_KEY)
      if (opgeslagen === 'anonymous' || opgeslagen === 'named' || opgeslagen === 'full') {
        return opgeslagen
      }
    }
  } catch {
    /* localStorage niet beschikbaar */
  }
  return 'anonymous'
}

function bewaarStand(stand: DeelStand): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PRIVACY_STORAGE_KEY, stand)
    }
  } catch {
    /* localStorage niet beschikbaar */
  }
}

/**
 * De deel-tekst per stand.
 *
 * Weinig draagt uitsluitend vrijheidstijd — geen percentage, geen dagen, geen
 * spaarquote, geen bedrag. Dat is dezelfde grens die `lib/check/share-freedom.ts`
 * voor de publieke check structureel maakt (ADR 0067); hier houden we 'm in de
 * geest aan voor het ingelogde deelpad.
 *
 * De URL is in álle standen `<origin>/check`: dat is de plek waar een ontvanger
 * zonder account daadwerkelijk iets kan doen.
 */
export function buildDeelTekst(data: FreedomCardData, origin: string): ShareContent {
  const url = `${origin.replace(/\/+$/, '')}${CHECK_SHARE_PATH}`

  if (data.privacyLevel === 'anonymous') {
    // Vrijheidstijd via dezelfde afgeleide als de kaart zelf — nooit een tweede
    // omrekening van euro's naar tijd. Expliciet op jaren/maanden toetsen:
    // `freedomTimeLong` is bij een vers account de truthy string '0 dagen', en
    // "Ik kocht al 0 dagen vrijheid" is geen zin om te delen.
    const fY = data.freedomTime?.years ?? 0
    const fM = data.freedomTime?.months ?? 0
    const vrijheidstijd = fY > 0 || fM > 0 ? deriveCardStats(data).freedomTimeLong : null
    const text = vrijheidstijd
      ? `Ik kocht al ${vrijheidstijd} vrijheid — geld is opgeslagen tijd. Bereken de jouwe:`
      : 'Geld is opgeslagen tijd. Bereken hoeveel vrijheid je al hebt:'
    return {
      title: 'Mijn vrijheid',
      text,
      url,
      contentType: 'freedom_card',
      privacyLevel: data.privacyLevel,
    }
  }

  const pct = data.freedomPercentage != null ? `${data.freedomPercentage}%` : 'N/B'
  // Het maandgetal draagt zijn herkomst in de zin: het kale "371 vrijheidsdagen"
  // las als totale vrijheid en sprak zowel de vrijheidstijd op de kaart als de
  // week-hero tegen (compliance-toets 31 aug 2026). Bij 0 valt het segment weg —
  // "+0 vrijheidsdagen gewonnen" is geen zin om te delen.
  const dagenDezeMaand = data.freedomDaysWonThisMonth ?? 0
  const dagenDeel =
    dagenDezeMaand > 0
      ? ` · +${dagenDezeMaand} vrijheidsdagen gewonnen met acties deze maand`
      : ''
  return {
    title: 'Mijn TriFinity vrijheidskaart',
    text: `Mijn financiële vrijheid: ${pct}${dagenDeel} · FIRE: ${data.fireCountdown?.label ?? 'N/B'} #TriFinity`,
    url,
    contentType: 'freedom_card',
    privacyLevel: data.privacyLevel,
  }
}

export function DeelKaartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stand, setStand] = useState<DeelStand>('anonymous')
  /** Veel-stand is opt-in: pas actief ná een expliciete bevestiging. */
  const [vraagBevestiging, setVraagBevestiging] = useState(false)
  /** Kaart-data per stand — wisselen kost daarna geen tweede fetch. */
  const [kaarten, setKaarten] = useState<Partial<Record<DeelStand, FreedomCardData>>>({})
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  /** Los van `fout`: die rendert alleen zónder kaart, en downloaden kán alleen mét kaart. */
  const [downloadFout, setDownloadFout] = useState<string | null>(null)
  const [pogingen, setPogingen] = useState(0)
  const [deelDialoog, setDeelDialoog] = useState(false)
  const [downloaden, setDownloaden] = useState(false)

  // Opgeslagen voorkeur pas ná mount lezen (localStorage bestaat niet op de server).
  // "Alleen na bevestiging" geldt élke sessie: een onthouden Veel-stand opent op
  // Gemiddeld mét de bevestigingsvraag al open — bedragen verschijnen pas na de
  // expliciete ja. De opgeslagen voorkeur blijft staan; bij bevestigen is Veel
  // weer actief, bij annuleren vraagt een volgende sessie het gewoon opnieuw.
  useEffect(() => {
    const opgeslagen = leesOpgeslagenStand()
    if (opgeslagen === 'full') {
      setStand('named')
      setVraagBevestiging(true)
    } else {
      setStand(opgeslagen)
    }
  }, [])

  const kaart = kaarten[stand] ?? null

  // Per stand één fetch; het resultaat blijft in de cache zolang de sheet leeft.
  useEffect(() => {
    if (!open) return
    if (kaarten[stand]) {
      // Terug naar een al opgehaalde stand: geen tweede fetch, en de foutmelding
      // van een ándere stand mag niet blijven hangen. De laadvlag moet hier óók
      // expliciet uit: een nog hangende fetch van de vórige stand is bij de
      // wissel afgebroken, en diens `finally` zet 'm dan bewust niet meer terug —
      // zonder deze regel blijven Delen/Download disabled bij een zichtbare kaart.
      setLaden(false)
      setFout(null)
      return
    }
    let afgebroken = false
    setLaden(true)
    setFout(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/share/freedom-card?privacy=${stand}`)
        if (!res.ok) {
          // De envelope is plat: `{ error: string }` (ADR 0044). 401/403 krijgen
          // een eigen, nette melding — die zeggen iets anders dan "er ging iets
          // mis": je mag hier (nu) niet bij.
          const payload: { error?: string } | null = await res.json().catch(() => null)
          if (res.status === 401 || res.status === 403) {
            throw new Error(
              payload?.error ?? 'Je hebt hier nu geen toegang toe. Log opnieuw in en probeer het dan.',
            )
          }
          throw new Error(payload?.error ?? 'Kon je vrijheidskaart niet maken.')
        }
        const data: FreedomCardData = await res.json()
        if (afgebroken) return
        setKaarten((vorige) => ({ ...vorige, [stand]: data }))
      } catch (e) {
        if (afgebroken) return
        setFout(e instanceof Error ? e.message : 'Kon je vrijheidskaart niet maken.')
      } finally {
        if (!afgebroken) setLaden(false)
      }
    })()
    return () => {
      afgebroken = true
    }
    // `pogingen` zit er bewust in: "Opnieuw proberen" moet dezelfde stand
    // opnieuw ophalen zonder dat de gebruiker eerst hoeft te wisselen.
  }, [open, stand, kaarten, pogingen])

  const kiesStand = useCallback((nieuw: DeelStand) => {
    if (nieuw === 'full') {
      // Bedragen tonen is een aparte, bewuste stap — niet een klik weg.
      setVraagBevestiging(true)
      return
    }
    setVraagBevestiging(false)
    setDownloadFout(null)
    setStand(nieuw)
    bewaarStand(nieuw)
  }, [])

  const bevestigVeel = useCallback(() => {
    setVraagBevestiging(false)
    setStand('full')
    bewaarStand('full')
  }, [])

  const download = useCallback(async () => {
    if (!kaart) return
    setDownloaden(true)
    setDownloadFout(null)
    try {
      const canvas = await renderFreedomCardToCanvas(kaart)
      const link = document.createElement('a')
      link.download = `trifinity-vrijheidskaart-${new Date().toISOString().split('T')[0]}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      setDownloadFout('Downloaden lukte niet. Probeer het opnieuw.')
    } finally {
      setDownloaden(false)
    }
  }, [kaart])

  const bezig = laden || downloaden

  return (
    <>
      <ShellOverlay
        open={open}
        onClose={onClose}
        kind="sheet"
        size="lg"
        title="Deel je vrijheid"
        // Zolang de deel-dialoog openstaat treedt de sheet terug: één venster
        // tegelijk, zonder de gekozen stand en de gecachete kaarten te verliezen.
        suspended={deelDialoog}
        footer={
          <ModalFooter
            primary={{
              label: 'Delen',
              onClick: () => setDeelDialoog(true),
              disabled: !kaart || bezig,
            }}
            secondary={{
              label: downloaden ? 'Downloaden …' : 'Download PNG',
              onClick: () => void download(),
              disabled: !kaart || bezig,
            }}
          />
        }
      >
        <div className="space-y-6 p-5">
          <p className="font-serif text-sm leading-relaxed text-[var(--ink-2)]">
            Jij bepaalt hoeveel je laat zien. Hieronder zie je meteen wat je deelt.
          </p>

          {/* ── Inzichts-standen ─────────────────────────────────────────── */}
          <fieldset className="m-0 border-0 p-0">
            <legend className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
              Hoeveel laat je zien
            </legend>
            <div className="mt-3 space-y-2">
              {STANDEN.map((optie) => {
                const actief = stand === optie.stand
                return (
                  <label
                    key={optie.stand}
                    data-testid={`deel-stand-${optie.stand}`}
                    className={`flex min-h-11 cursor-pointer items-start gap-3 border border-l-[3px] px-4 py-3 transition-colors ${
                      // Per zijde gezet: een `border-{kleur}`-shorthand naast een
                      // `border-l-{kleur}`-longhand laat de winnaar afhangen van
                      // Tailwinds sorteervolgorde, niet van deze string.
                      actief
                        ? 'border-y-[var(--ink)] border-r-[var(--ink)] border-l-horizon-500 bg-[var(--subtle)]'
                        : 'border-y-[var(--border-ed)] border-r-[var(--border-ed)] border-l-[var(--rule-soft)] bg-[var(--paper)] hover:border-y-[var(--ink-4)] hover:border-r-[var(--ink-4)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deel-stand"
                      value={optie.stand}
                      checked={actief}
                      onChange={() => kiesStand(optie.stand)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-horizon-600)]"
                    />
                    <span className="min-w-0">
                      <span className="block font-display text-[15px] font-bold text-[var(--ink)]">
                        {optie.label}
                      </span>
                      <span className="mt-0.5 block font-serif text-[13px] italic leading-snug text-[var(--ink-3)]">
                        {optie.omschrijving}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          {/* ── Opt-in op bedragen ───────────────────────────────────────── */}
          {vraagBevestiging && (
            <div
              data-testid="deel-veel-optin"
              className="border border-warning bg-warning-bg p-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-display text-[15px] font-bold text-[var(--ink)]">
                    Bedragen op je kaart?
                  </p>
                  <p className="mt-1 font-serif text-[13px] leading-snug text-[var(--ink-2)]">
                    In de stand Veel staat je netto vermogen op de kaart. Iedereen aan wie je
                    'm stuurt, ziet dat bedrag.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={bevestigVeel}>
                      Ja, bedragen tonen
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setVraagBevestiging(false)}
                    >
                      Annuleren
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Live voorbeeld ───────────────────────────────────────────── */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
              Dit deel je
            </p>
            {/* Korte sr-only statusregel als live-regio — de kaart zelf staat er
                bewust buiten, anders leest een schermlezer bij elke standwissel
                de complete kaart (kop, alle cijfers, colofon) opnieuw voor. */}
            <p aria-live="polite" className="sr-only">
              {laden && !kaart
                ? 'Voorbeeld wordt geladen'
                : kaart
                  ? `Voorbeeld voor stand ${STANDEN.find((o) => o.stand === stand)?.label ?? stand} geladen`
                  : ''}
            </p>
            <div className="mt-3">
              {laden && !kaart && (
                <div
                  data-testid="deel-kaart-skeleton"
                  aria-hidden="true"
                  className="mx-auto aspect-[4/5] w-full max-w-[440px] animate-pulse border border-[var(--border-ed)] bg-[var(--subtle)]"
                />
              )}
              {!laden && fout && !kaart && (
                <div
                  role="alert"
                  className="border border-[var(--border-ed)] bg-[var(--paper)] p-4"
                >
                  <p className="font-serif text-sm leading-snug text-[var(--ink-2)]">{fout}</p>
                  <button
                    type="button"
                    onClick={() => setPogingen((n) => n + 1)}
                    className="mt-3 inline-flex min-h-9 items-center gap-1.5 border border-[var(--ink)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Opnieuw proberen
                  </button>
                </div>
              )}
              {kaart && <FreedomCardVisual data={kaart} />}
              {downloadFout && (
                <p
                  role="alert"
                  data-testid="deel-download-fout"
                  className="mt-3 border border-[var(--border-ed)] bg-[var(--paper)] p-3 font-serif text-sm leading-snug text-[var(--ink-2)]"
                >
                  {downloadFout}
                </p>
              )}
            </div>
          </div>
        </div>
      </ShellOverlay>

      {/* Sibling, nooit child: een teruggetreden BottomSheet verbergt zijn hele
          portal, inclusief alles wat erin leeft. */}
      {deelDialoog && kaart && (
        <ShareDialog
          open
          onClose={() => setDeelDialoog(false)}
          content={buildDeelTekst(
            kaart,
            typeof window !== 'undefined' ? window.location.origin : '',
          )}
          renderCanvas={() => renderFreedomCardToCanvas(kaart)}
        />
      )}
    </>
  )
}
