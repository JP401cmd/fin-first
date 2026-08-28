'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Wallet } from 'lucide-react'
import { useEuroView } from '@/lib/hooks/use-euro-view'
import { euroViewLabel } from '@/lib/euro-display'

/**
 * Euro-weergave-status: staat de app in *toekomstige* euro's (nominaal, de
 * default) of in *huidige* euro's (koopkracht van vandaag)?
 *
 * WAAROM ALTIJD ZICHTBAAR. Dit is de enige app-brede instelling die de
 * BETEKENIS van elk bedrag verandert zonder dat het bedrag zelf zegt welke
 * meetlat geldt — "€ 1,65M" is een ander getal in beide standen. De knop zelf
 * woont ook in het zoekscherm (⌘K → "Toon huidige/toekomstige euro's"); dit is
 * de status die daarbij hoort, permanent in beeld. Dat is precies de splitsing
 * die ProjectionLab en Boldin ook maken: de schakelaar in een weergave-/
 * aannames-menu, niet als knop op elke grafiek. Vandaar dat de losse badge van
 * de Toekomst-grafiek af is (gebruiker, aug 2026) — één status-plek, niet één
 * per grafiek.
 *
 * NOMINAAL BLIJFT RUSTIG. In `'nominal'` (de default, exact het beeld van
 * vandaag) staat de pill in neutrale ink zonder accent; in `'real'` krijgt hij
 * het horizon-accent. Zo is de indicator altijd afleesbaar, maar springt alleen
 * de afwijkende stand eruit. Dat houdt de geest van ADR 0090 §8 overeind
 * (nominaal = geen ruis) zonder de status te verzwijgen.
 *
 * ZICHTBAAR VOORVOEGSEL (bevinding M13). De pill toonde alleen zijn stand
 * ("Toekomstige euro's"). Een knop die zijn eigen stand als label draagt leest
 * als een ACTIE ("klik voor toekomstige euro's") in plaats van als status —
 * precies wat de testers rapporteerden. Het woord "Weergave:" stond wél in het
 * `title`-attribuut, maar dat is hover-only en dus onzichtbaar voor touch. Het
 * staat nu ín de pill.
 *
 * WOONT HIER, NIET IN DE SIDEBAR. Deze badge hing eerder als lokale component
 * in `sidebar.tsx` en bestond daardoor niet op mobiel: de TopBar had géén
 * euro-weergave, terwijl dat juist het scherm is waar de meeste sessies
 * plaatsvinden. Eén gedeelde component voorkomt dat de twee oppervlakken weer
 * uit elkaar lopen.
 *
 * Icoonkeuze volgt de command-palette (`lib/command-palette/actions.ts`):
 * Wallet = huidige euro's, CalendarClock = toekomstige.
 */

export type EuroViewBadgeVariant = 'full' | 'compact'

interface EuroViewBadgeProps {
  /**
   * `full` = pill met voorvoegsel en stand (uitgeklapte zijbalk).
   * `compact` = vierkant icoon-only (ingeklapte zijbalk en de mobiele TopBar,
   * waar geen ruimte is voor tekst). In `compact` draagt alleen het
   * `aria-label`/`title` de tekst — dáárom is de coachmark daar extra nodig.
   */
  variant?: EuroViewBadgeVariant
  /**
   * Toon de eenmalige uitleg-popover bij dit exemplaar. De sidebar en de
   * TopBar staan allebei in de DOM (het breakpoint verbergt er één met CSS),
   * dus beide mogen 'm aanvragen: de popover erft de zichtbaarheid van zijn
   * host, en de staat wordt gedeeld zodat wegklikken op één plek overal telt.
   */
  showCoachmark?: boolean
  /** Uitlijning van de coachmark-popover t.o.v. de badge. */
  coachmarkAlign?: 'left' | 'right'
}

// ── Eenmalige uitleg (coachmark) ──────────────────────────────────────────
//
// Server-persisted en cross-device: de staat leeft in de eigen profielrij
// (`profiles.module_guide_state`, sleutel `coachmark:euro-view`) via
// /api/coachmark. Bewust GEEN localStorage — wie de uitleg op zijn laptop
// wegklikt hoort 'm niet opnieuw op zijn telefoon te krijgen.
//
// De staat wordt NIET server-side in de layout geseed maar hier opgehaald.
// Dat scheelt een prop door de hele shell-boom, en de vertraging is
// onschadelijk: tot de fetch klaar is toont dit component niets, en een
// uitleg die een fractie later verschijnt is geen defect. De belofte "precies
// één keer" wordt bewaakt door de server, niet door het rendermoment.

const COACHMARK_ID = 'euro-view'

type CoachmarkState = 'loading' | 'show' | 'hidden'

/** Eén gedeelde fetch voor alle badge-exemplaren op de pagina. */
let dismissedPromise: Promise<boolean> | null = null

function fetchDismissed(): Promise<boolean> {
  if (!dismissedPromise) {
    dismissedPromise = fetch('/api/coachmark')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json?.dismissed?.[COACHMARK_ID] !== false)
      // Bij een fout: behandel als "al gezien". Een uitleg die per ongeluk
      // wegblijft is een kleiner kwaad dan een popover die bij elke
      // netwerkhapering terugkomt.
      .catch(() => true)
  }
  return dismissedPromise
}

/** Alleen voor tests — gooit de gedeelde fetch-cache weg. */
export function __resetCoachmarkCache() {
  dismissedPromise = null
}

function useEuroViewCoachmark(enabled: boolean) {
  const [state, setState] = useState<CoachmarkState>('loading')

  useEffect(() => {
    if (!enabled) return
    let alive = true
    void fetchDismissed().then((dismissed) => {
      if (alive) setState(dismissed ? 'hidden' : 'show')
    })
    return () => {
      alive = false
    }
  }, [enabled])

  const dismiss = useCallback(() => {
    setState('hidden')
    // Andere exemplaren op dezelfde pagina laten meteen meeschakelen.
    dismissedPromise = Promise.resolve(true)
    void fetch('/api/coachmark', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: COACHMARK_ID }),
      keepalive: true,
    }).catch(() => {
      // Stil falen: de uitleg is deze sessie hoe dan ook weg. Komt hij door
      // een mislukte schrijfactie één keer terug, dan is dat hinderlijk maar
      // niet schadelijk — een blokkerende foutmelding zou dat wél zijn.
    })
  }, [])

  return { visible: state === 'show', dismiss }
}

export function EuroViewBadge({
  variant = 'full',
  showCoachmark = false,
  coachmarkAlign = 'left',
}: EuroViewBadgeProps) {
  const { view, toggle } = useEuroView()
  const { visible: coachmarkVisible, dismiss } = useEuroViewCoachmark(showCoachmark)

  const isReal = view === 'real'
  const Icon = isReal ? Wallet : CalendarClock
  const label = euroViewLabel(view)
  const hint = isReal
    ? "Bedragen staan in koopkracht van vandaag. Klik voor toekomstige euro's."
    : "Bedragen staan in de euro's van dat jaar. Klik voor huidige euro's."

  const tint = isReal
    ? 'border-horizon-300 bg-horizon-50 text-horizon-800'
    : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)]/50'

  const compact = variant === 'compact'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isReal}
        aria-label={`Weergave: ${label}. ${hint}`}
        title={`Weergave: ${label} — ${hint}`}
        data-testid="sidebar-euro-view-badge"
        className={`inline-flex items-center gap-1.5 rounded-full border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ink)] ${tint} ${
          compact ? 'h-8 w-8 justify-center' : 'px-2.5 py-1 text-xs font-medium'
        }`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {!compact && (
          <span className="truncate">
            {/* `aria-hidden` op het voorvoegsel: het aria-label hierboven zegt
                "Weergave: …" al, dus zonder dit zou een schermlezer het woord
                twee keer horen. Visueel is het juist de hele fix. */}
            <span aria-hidden className="opacity-60">Weergave: </span>
            {label}
          </span>
        )}
      </button>

      {coachmarkVisible && (
        <div
          role="note"
          aria-label="Uitleg bij de euro-weergave"
          className={`absolute top-full z-[70] mt-2 w-64 border border-[var(--border-ed)] bg-[var(--paper)] p-3 shadow-[var(--s2)] ${
            coachmarkAlign === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <p className="font-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
            Deze knop zegt in welke euro&apos;s je kijkt.{' '}
            <strong className="text-[var(--ink)]">Toekomstige euro&apos;s</strong> zijn de
            bedragen van dát jaar; <strong className="text-[var(--ink)]">huidige euro&apos;s</strong>{' '}
            rekenen ze terug naar de koopkracht van vandaag. Dezelfde grafiek betekent
            per stand iets anders.
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2.5 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
          >
            Duidelijk
          </button>
        </div>
      )}
    </div>
  )
}
